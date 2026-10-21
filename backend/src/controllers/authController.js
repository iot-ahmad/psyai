const { OAuth2Client } = require('google-auth-library');
const jwt = require('jsonwebtoken');
const prisma = require('../config/db');
const WhatsAppService = require('../services/whatsappService');
const SecurityService = require('../services/securityService');
const AuditService = require('../services/auditService');
const EncryptionService = require('../services/encryptionService');

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

if (!JWT_SECRET) {
  console.error('[FATAL] JWT_SECRET is not defined in .env — server cannot start safely.');
  process.exit(1);
}

/**
 * Helper to safely sanitize phone strings
 */
function sanitizePhone(raw) {
  if (typeof WhatsAppService.cleanPhone === 'function') {
    return WhatsAppService.cleanPhone(raw);
  }
  return String(raw || '').replace(/[\s\-\(\)]/g, '').trim();
}

/**
 * Generate JWT token:
 * - Scoped Restricted Token (10m, scope: ['verify-otp']) for unverified users
 * - Full Session Token (scope: ['full_access'], tokenVersion check) for verified users
 */
function createToken(user, explicitScope = null) {
  const isVerified = user.isVerified !== false;
  const scope = explicitScope || (isVerified ? ['full_access'] : ['verify-otp']);
  const expiresIn = !isVerified || scope.includes('verify-otp') ? '10m' : JWT_EXPIRES_IN;

  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      scope,
      tokenVersion: user.tokenVersion ?? 0
    },
    JWT_SECRET,
    { expiresIn, algorithm: 'HS256' }
  );
}

/**
 * Safe Response DTO: Project public user attributes, preventing data leakages
 * (never exposes passwordHash, tokenVersion, salts or internal DB keys)
 */
function toPublicUser(rawUser) {
  if (!rawUser || typeof rawUser !== 'object') return null;
  const decrypted = EncryptionService.decryptUserFields(rawUser);
  const fName = decrypted.firstName || decrypted.first_name || '';
  const lName = decrypted.lastName || decrypted.last_name || '';
  return {
    id: decrypted.id,
    firstName: fName,
    lastName: lName,
    fullName: decrypted.fullName || `${fName} ${lName}`.trim(),
    email: decrypted.email || '',
    phone: decrypted.phone || '',
    gender: decrypted.gender || 'any',
    condition: decrypted.condition || null,
    specGenderPref: decrypted.specGenderPref || 'any',
    role: decrypted.role || 'user',
    isVerified: Boolean(decrypted.isVerified),
    language: decrypted.language || 'ar',
    status: decrypted.status || 'active',
    createdAt: decrypted.createdAt,
    ...(decrypted.bookings ? { bookings: decrypted.bookings } : {})
  };
}

/**
 * POST /api/auth/send-otp
 * Request WhatsApp OTP for a phone number
 */
async function sendOtp(req, res, next) {
  try {
    const { phone } = req.body;
    if (!phone) {
      return res.status(400).json({ success: false, message: 'رقم الهاتف مطلوب' });
    }

    const result = await WhatsAppService.createAndSendOtp(phone);
    if (!result.success) {
      return res.status(400).json(result);
    }

    await AuditService.log({
      req,
      action: 'AUTH_OTP_REQUESTED',
      result: 'SUCCESS',
      metadata: { phone: String(phone).replace(/^(\+?\d{4})\d+(\d{2})$/, '$1****$2') }
    });

    const responsePayload = {
      success: true,
      phone: result.phone || phone,
      expiresInMinutes: result.expiresInMinutes,
      message: `تم إرسال رمز التحقق إلى تطبيق WhatsApp للرقم ${phone}`
    };
    if (process.env.NODE_ENV === 'test' && result.devCode) {
      responsePayload.devCode = result.devCode;
    }

    res.status(200).json(responsePayload);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/verify-otp
 * Verify WhatsApp OTP code
 */
async function verifyOtp(req, res, next) {
  try {
    const { phone, code } = req.body;
    const result = await WhatsAppService.verifyOtp(phone, code);

    if (!result.success) {
      await AuditService.log({
        req,
        action: 'AUTH_OTP_VERIFY_FAILED',
        result: 'FAILED'
      });
      return res.status(400).json(result);
    }

    // Find and verify user if registered (lookup by blind index or plaintext phone)
    const cleanPhone = sanitizePhone(phone);
    const phoneBlindIndex = EncryptionService.generateBlindIndex(cleanPhone);
    let user = await prisma.user.findFirst({
      where: {
        OR: [
          { phoneBlindIndex },
          { phone: cleanPhone }
        ]
      }
    });

    if (user) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { isVerified: true }
      });

      const token = createToken(user, ['full_access']);
      const decryptedUser = EncryptionService.decryptUserFields(user);

      await AuditService.log({
        req,
        actorId: user.id,
        actorRole: user.role,
        action: 'AUTH_OTP_VERIFY_SUCCESS',
        result: 'SUCCESS'
      });

      return res.status(200).json({
        success: true,
        message: result.message,
        token,
        user: {
          id: decryptedUser.id,
          firstName: decryptedUser.firstName,
          lastName: decryptedUser.lastName,
          email: decryptedUser.email,
          phone: decryptedUser.phone,
          role: decryptedUser.role,
          isVerified: decryptedUser.isVerified
        }
      });
    }

    await AuditService.log({
      req,
      action: 'AUTH_OTP_VERIFY_ANONYMOUS_SUCCESS',
      result: 'SUCCESS'
    });

    res.status(200).json({
      success: true,
      message: result.message
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/register
 * Complete user registration with Argon2id hashing, field encryption & session issuance
 */
async function register(req, res, next) {
  try {
    const {
      firstName,
      lastName,
      email,
      phone,
      gender,
      password,
      condition,
      specGenderPref,
      otpCode
    } = req.body;

    const cleanEmail = email.toLowerCase().trim();
    const cleanPhone = sanitizePhone(phone);
    const phoneBlindIndex = EncryptionService.generateBlindIndex(cleanPhone);

    // Check if user already exists (by email blind-index — the unique searchable hash)
    const existingEmail = await prisma.user.findUnique({ where: { emailHash: EncryptionService.generateBlindIndex(cleanEmail) } });
    if (existingEmail) {
      return res.status(400).json({
        success: false,
        message: 'البريد الإلكتروني مسجل بالفعل. يرجى تسجيل الدخول أو استخدام بريد آخر.'
      });
    }

    const existingPhone = await prisma.user.findFirst({
      where: { phoneHash: phoneBlindIndex }
    });

    if (existingPhone) {
      return res.status(400).json({
        success: false,
        message: 'رقم الهاتف مسجل بالفعل مسبقاً.'
      });
    }

    // Verify OTP if provided
    let isVerified = false;
    if (otpCode) {
      const verifyRes = await WhatsAppService.verifyOtp(cleanPhone, otpCode);
      if (!verifyRes.success) {
        return res.status(400).json(verifyRes);
      }
      isVerified = true;
    }

    // Argon2id / secure password hashing (Section 3)
    const passwordHash = await SecurityService.hashPassword(password);

    // Encrypt sensitive fields with AES-256-GCM
    const encryptedFirstName = EncryptionService.encryptField(firstName);
    const encryptedLastName = EncryptionService.encryptField(lastName);
    const encryptedPhone = EncryptionService.encryptField(cleanPhone);
    const encryptedCondition = EncryptionService.encryptField(condition || null);

    const emailHash = EncryptionService.generateBlindIndex(cleanEmail);
    const encryptedEmail = EncryptionService.encryptField(cleanEmail);

    // Create user in DB
    const user = await prisma.user.create({
      data: {
        firstName: encryptedFirstName,
        lastName: encryptedLastName,
        emailEncrypted: encryptedEmail,
        emailHash,
        phoneEncrypted: encryptedPhone,
        phoneHash: phoneBlindIndex,
        gender,
        passwordHash,
        conditionEncrypted: encryptedCondition,
        specGenderPref: specGenderPref || 'any',
        role: 'user',
        isVerified,
        status: 'active',
        tokenVersion: 0
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        emailEncrypted: true,
        phoneEncrypted: true,
        gender: true,
        conditionEncrypted: true,
        specGenderPref: true,
        role: true,
        isVerified: true,
        tokenVersion: true,
        createdAt: true
      }
    });

    const token = createToken(user);
    const decryptedUser = EncryptionService.decryptUserFields(user);

    await AuditService.log({
      req,
      actorId: user.id,
      actorRole: user.role,
      action: 'AUTH_REGISTER',
      result: 'SUCCESS',
      metadata: { isVerified }
    });

    res.status(201).json({
      success: true,
      message: 'تم إنشاء الحساب بنجاح! أهلاً بك في منصة PsyAI',
      token,
      user: toPublicUser(user)
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/login
 * User login via Email or Phone + Password (using Blind Index for encrypted phone search)
 */
async function login(req, res, next) {
  try {
    const { identifier, password } = req.body;
    const cleanIdent = identifier.trim();
    const phoneBlindIndex = EncryptionService.generateBlindIndex(cleanIdent);

    const emailSearchHash = EncryptionService.generateBlindIndex(cleanIdent.toLowerCase());
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { emailHash: emailSearchHash },
          { phoneHash: phoneBlindIndex }
        ]
      }
    });

    if (!user) {
      await AuditService.log({
        req,
        action: 'AUTH_LOGIN_FAILED_NOT_FOUND',
        result: 'FAILED'
      });
      return res.status(401).json({
        success: false,
        message: 'بيانات الدخول غير صحيحة. يرجى التحقق من البريد أو رقم الهاتف.'
      });
    }

    if (user.status !== 'active') {
      await AuditService.log({
        req,
        actorId: user.id,
        actorRole: user.role,
        action: 'AUTH_LOGIN_SUSPENDED',
        result: 'DENIED'
      });
      return res.status(403).json({
        success: false,
        message: 'الحساب موقوف حالياً. يرجى التواصل مع الدعم الفني للمنصة.'
      });
    }

    // Verify password with Argon2id / fallback
    const isPasswordValid = await SecurityService.verifyPassword(password, user.passwordHash);
    if (!isPasswordValid) {
      await AuditService.log({
        req,
        actorId: user.id,
        actorRole: user.role,
        action: 'AUTH_LOGIN_WRONG_PASSWORD',
        result: 'FAILED'
      });
      return res.status(401).json({
        success: false,
        message: 'كلمة المرور غير صحيحة.'
      });
    }

    // Issue token based on verification state
    const token = createToken(user);
    const decryptedUser = EncryptionService.decryptUserFields(user);

    await AuditService.log({
      req,
      actorId: user.id,
      actorRole: user.role,
      action: user.isVerified ? 'AUTH_LOGIN_SUCCESS' : 'AUTH_LOGIN_RESTRICTED_SUCCESS',
      result: 'SUCCESS'
    });

    res.status(200).json({
      success: true,
      message: `أهلاً بك مجدداً يا ${decryptedUser.firstName}!`,
      token,
      user: toPublicUser(user)
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/forgot-password
 * Anti-enumeration password reset request (Section 3)
 */
async function forgotPassword(req, res, next) {
  try {
    const { email } = req.body;
    const cleanEmail = email.toLowerCase().trim();

    const user = await prisma.user.findUnique({
      where: { email: cleanEmail }
    });

    if (user) {
      const { rawToken, tokenHash } = SecurityService.generatePasswordResetToken();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes validity

      // Delete previous tokens for this user
      if (prisma.passwordResetToken && prisma.passwordResetToken.deleteMany) {
        await prisma.passwordResetToken.deleteMany({
          where: { userId: user.id }
        });

        await prisma.passwordResetToken.create({
          data: {
            userId: user.id,
            tokenHash,
            expiresAt
          }
        });
      }

      await AuditService.log({
        req,
        actorId: user.id,
        actorRole: user.role,
        action: 'AUTH_FORGOT_PASSWORD_REQUESTED',
        result: 'SUCCESS'
      });

      if (process.env.NODE_ENV !== 'production') {
        console.log(`[PASSWORD RESET DEV TOKEN] User ${user.email}: token=${rawToken}`);
      }
    } else {
      await AuditService.log({
        req,
        action: 'AUTH_FORGOT_PASSWORD_UNKNOWN_EMAIL',
        result: 'FAILED'
      });
    }

    // Generic 200 response to prevent email enumeration (Section 3)
    res.status(200).json({
      success: true,
      message: 'إذا كان البريد الإلكتروني مسجلاً لدينا، فستتلقى تعليمات إعادة تعيين كلمة المرور.'
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/reset-password
 * Complete password reset with session revocation (Section 3 & 5)
 */
async function resetPassword(req, res, next) {
  try {
    const { token, newPassword } = req.body;
    const tokenHash = SecurityService.hashPasswordResetToken(token);

    if (!prisma.passwordResetToken) {
      return res.status(400).json({ success: false, message: 'خدمة استعادة كلمة المرور غير متوفرة' });
    }

    const resetRecord = await prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: { user: true }
    });

    if (!resetRecord || resetRecord.used || new Date() > resetRecord.expiresAt) {
      await AuditService.log({
        req,
        action: 'AUTH_RESET_PASSWORD_INVALID_TOKEN',
        result: 'FAILED'
      });
      return res.status(400).json({
        success: false,
        message: 'رمز استعادة كلمة المرور غير صالح أو منتهي الصلاحية'
      });
    }

    const passwordHash = await SecurityService.hashPassword(newPassword);

    // Update password and increment tokenVersion (revoking all active sessions)
    await prisma.user.update({
      where: { id: resetRecord.userId },
      data: {
        passwordHash,
        tokenVersion: { increment: 1 }
      }
    });

    // Mark token as used
    await prisma.passwordResetToken.update({
      where: { id: resetRecord.id },
      data: { used: true }
    });

    await AuditService.log({
      req,
      actorId: resetRecord.userId,
      actorRole: resetRecord.user?.role,
      action: 'AUTH_RESET_PASSWORD_SUCCESS',
      result: 'SUCCESS'
    });

    res.status(200).json({
      success: true,
      message: 'تم إعادة تعيين كلمة المرور بنجاح. تم إنهاء الجلسات السابقة لحماية حسابك.'
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/auth/me
 * Get current authenticated user profile
 */
/**
 * GET /api/auth/me
 * Get current authenticated user profile (decrypted for owner)
 */
async function getMe(req, res, next) {
  try {
    const rawUser = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        emailEncrypted: true,
        phoneEncrypted: true,
        gender: true,
        conditionEncrypted: true,
        specGenderPref: true,
        role: true,
        isVerified: true,
        createdAt: true,
        bookings: {
          take: 5,
          orderBy: { createdAt: 'desc' },
          include: {
            specialist: {
              select: { name: true, title: true, avatar: true, price: true }
            },
            payment: true
          }
        }
      }
    });

    if (!rawUser) {
      return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });
    }

    const user = EncryptionService.decryptUserFields(rawUser);

    res.status(200).json({
      success: true,
      user: toPublicUser(rawUser)
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Standardize Jordanian phone number
 */
function formatJordanPhone(raw) {
  if (!raw) return '';
  let p = raw.replace(/[\s\-\(\)]/g, '').trim();
  if (p.startsWith('00962')) p = '+962' + p.substring(5);
  else if (p.startsWith('962')) p = '+962' + p.substring(3);
  else if (p.startsWith('07')) p = '+962' + p.substring(1);
  else if (p.startsWith('7') && p.length === 9) p = '+962' + p;
  return p;
}

/**
 * Verify Google ID Token using official Google OAuth2 Client
 * Validates cryptographic signature, audience, expiration, and issuer.
 */
async function verifyGoogleIdToken(idToken) {
  if (!idToken) return null;

  // Support for mock tokens in automated test suite
  if (process.env.NODE_ENV === 'test' && String(idToken).startsWith('mock-test-id-token:')) {
    const parts = idToken.split(':');
    return {
      googleId: parts[1] || 'mock-google-sub-12345',
      email: (parts[2] || 'test.google@gmail.com').toLowerCase().trim(),
      firstName: parts[3] || 'مستخدم',
      lastName: parts[4] || 'Google'
    };
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    console.error('[SECURITY] GOOGLE_CLIENT_ID is not configured in environment.');
    throw new Error('GOOGLE_CLIENT_ID_MISSING');
  }

  const ticket = await googleClient.verifyIdToken({
    idToken,
    audience: clientId
  });

  const payload = ticket.getPayload();
  if (!payload || !payload.sub || !payload.email || payload.email_verified !== true) {
    return null;
  }

  return {
    googleId: payload.sub,
    email: payload.email.toLowerCase().trim(),
    firstName: payload.given_name || 'مستخدم',
    lastName: payload.family_name || 'Google',
    nonce: payload.nonce || null
  };
}

/**
 * POST /api/auth/google
 * Google Auth with strict ID Token validation, anti-pre-hijacking account linking,
 * status checks, and phone verification state machine.
 */
async function googleAuth(req, res, next) {
  try {
    const { idToken, phone, otpCode, condition, specGenderPref, nonce } = req.body;

    if (!idToken) {
      return res.status(400).json({
        success: false,
        message: 'رمز Google (idToken) مطلوب لإتمام المصادقة'
      });
    }

    let gUser;
    try {
      gUser = await verifyGoogleIdToken(idToken);
    } catch (err) {
      if (err.message === 'GOOGLE_CLIENT_ID_MISSING') {
        return res.status(503).json({
          success: false,
          message: 'خدمة تسجيل الدخول عبر Google غير مهيأة حالياً في الخادم'
        });
      }
      return res.status(401).json({
        success: false,
        message: 'تعذّر التحقق من رمز Google أو انتهت صلاحيته'
      });
    }

    if (!gUser || !gUser.googleId || !gUser.email) {
      return res.status(401).json({
        success: false,
        message: 'حساب Google غير موثّق أو تعذّر التحقق من البريد الإلكتروني'
      });
    }

    if (nonce && gUser.nonce && nonce !== gUser.nonce) {
      return res.status(401).json({
        success: false,
        message: 'فشل التحقق من أمان رمز Google (Nonce mismatch)'
      });
    }

    const cleanEmail = gUser.email;
    const emailBlindIndex = EncryptionService.generateBlindIndex(cleanEmail);
    const formattedPhone = phone ? formatJordanPhone(phone) : null;
    const phoneBlindIndex = formattedPhone ? EncryptionService.generateBlindIndex(formattedPhone) : null;

    // 1. Check if user already exists by googleId
    let user = await prisma.user.findUnique({
      where: { googleId: gUser.googleId }
    });

    // 2. If not found by googleId, check by email blind index
    if (!user) {
      user = await prisma.user.findFirst({
        where: {
          OR: [
            { emailHash: emailBlindIndex },
            { emailBlindIndex },
            { email: cleanEmail }
          ]
        }
      });

      // Anti-Pre-hijacking Linking Rules
      if (user) {
        if (user.isVerified) {
          // Case 2a: Existing verified user -> link googleId
          user = await prisma.user.update({
            where: { id: user.id },
            data: { googleId: gUser.googleId }
          });
        } else {
          // Case 2b: Unverified account with victim email -> Google proves ownership! Invalidate old credentials
          const randomPass = SecurityService.generatePasswordResetToken().rawToken + 'Aa1!';
          const revokedPasswordHash = await SecurityService.hashPassword(randomPass);

          user = await prisma.user.update({
            where: { id: user.id },
            data: {
              googleId: gUser.googleId,
              passwordHash: revokedPasswordHash,
              isVerified: true,
              tokenVersion: { increment: 1 }
            }
          });
        }
      }
    }

    // 3. User exists in DB
    if (user) {
      if (user.status !== 'active') {
        return res.status(403).json({
          success: false,
          message: 'هذا الحساب موقوف حالياً. يرجى التواصل مع الدعم الفني.'
        });
      }

      const decryptedExisting = EncryptionService.decryptUserFields(user);

      // If user already has a phone: login directly
      if (decryptedExisting.phone && decryptedExisting.phone.length > 5) {
        const token = createToken(user, ['full_access']);
        return res.status(200).json({
          success: true,
          token,
          user: {
            id: decryptedExisting.id,
            firstName: decryptedExisting.firstName,
            lastName: decryptedExisting.lastName,
            email: decryptedExisting.email,
            phone: decryptedExisting.phone,
            role: decryptedExisting.role,
            isVerified: decryptedExisting.isVerified
          },
          message: `أهلاً بك مجدداً يا ${decryptedExisting.firstName}!`
        });
      }

      // If user has no phone: require phone + OTP verification
      if (!formattedPhone || !otpCode) {
        return res.status(200).json({
          success: true,
          needPhone: true,
          email: cleanEmail,
          firstName: decryptedExisting.firstName,
          lastName: decryptedExisting.lastName,
          message: 'يرجى إدخال وتأكيد رقم هاتفك الأردني لإكمال الحساب'
        });
      }

      // Verify OTP before saving phone
      const otpVerify = await WhatsAppService.verifyOtp(formattedPhone, otpCode);
      if (!otpVerify.success) {
        return res.status(400).json({
          success: false,
          message: otpVerify.message || 'رمز التحقق غير صحيح أو انتهت صلاحيته'
        });
      }

      // Check phone collision
      const phoneTaken = await prisma.user.findFirst({
        where: {
          id: { not: user.id },
          OR: [
            { phoneHash: phoneBlindIndex },
            { phoneBlindIndex },
            { phone: formattedPhone }
          ]
        }
      });
      if (phoneTaken) {
        return res.status(409).json({
          success: false,
          message: 'رقم الهاتف هذا مسجل مسبقاً بحساب آخر.'
        });
      }

      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          phoneEncrypted: EncryptionService.encryptField(formattedPhone),
          phoneHash: phoneBlindIndex,
          isVerified: true
        }
      });

      const token = createToken(user, ['full_access']);
      const decryptedUpdated = EncryptionService.decryptUserFields(user);

      return res.status(200).json({
        success: true,
        token,
        user: {
          id: decryptedUpdated.id,
          firstName: decryptedUpdated.firstName,
          lastName: decryptedUpdated.lastName,
          email: decryptedUpdated.email,
          phone: decryptedUpdated.phone,
          role: decryptedUpdated.role,
          isVerified: decryptedUpdated.isVerified
        },
        message: `تم ربط رقم الهاتف وتسجيل الدخول بنجاح!`
      });
    }

    // 4. Brand new user registration flow
    if (!formattedPhone || !otpCode) {
      return res.status(200).json({
        success: true,
        needPhone: true,
        email: cleanEmail,
        firstName: gUser.firstName,
        lastName: gUser.lastName,
        message: 'يرجى إدخال وتأكيد رقم هاتفك لإكمال إنشاء الحساب'
      });
    }

    // Verify OTP for new registration
    const otpVerify = await WhatsAppService.verifyOtp(formattedPhone, otpCode);
    if (!otpVerify.success) {
      return res.status(400).json({
        success: false,
        message: otpVerify.message || 'رمز التحقق غير صحيح أو انتهت صلاحيته'
      });
    }

    // Check phone collision for brand new registration
    const phoneTaken = await prisma.user.findFirst({
      where: { phoneHash: phoneBlindIndex }
    });
    if (phoneTaken) {
      return res.status(409).json({
        success: false,
        message: 'رقم الهاتف هذا مسجل مسبقاً بحساب آخر.'
      });
    }

    const randomPass = SecurityService.generatePasswordResetToken().rawToken + 'Aa1!';
    const passwordHash = await SecurityService.hashPassword(randomPass);

    const encryptedFirstName = EncryptionService.encryptField(gUser.firstName);
    const encryptedLastName = EncryptionService.encryptField(gUser.lastName);
    const encryptedPhone = EncryptionService.encryptField(formattedPhone);
    const encryptedEmail = EncryptionService.encryptField(cleanEmail);
    const encryptedCondition = condition ? EncryptionService.encryptField(condition) : null;

    let newUser;
    try {
      newUser = await prisma.user.create({
        data: {
          googleId: gUser.googleId,
          firstName: encryptedFirstName,
          lastName: encryptedLastName,
          emailEncrypted: encryptedEmail,
          emailHash: emailBlindIndex,
          phoneEncrypted: encryptedPhone,
          phoneHash: phoneBlindIndex,
          gender: (req.body.gender === 'female' ? 'female' : 'male'),
          passwordHash,
          conditionEncrypted: encryptedCondition,
          specGenderPref: specGenderPref || 'any',
          role: 'user',
          isVerified: true,
          status: 'active',
          tokenVersion: 0
        }
      });
    } catch (createErr) {
      if (createErr.code === 'P2002') {
        return res.status(409).json({
          success: false,
          message: 'الحساب أو رقم الهاتف مسجل مسبقاً.'
        });
      }
      throw createErr;
    }

    const token = createToken(newUser, ['full_access']);
    const decryptedNew = EncryptionService.decryptUserFields(newUser);

    await AuditService.log({
      req,
      actorId: newUser.id,
      actorRole: newUser.role,
      action: 'AUTH_GOOGLE_REGISTER',
      result: 'SUCCESS'
    });

    return res.status(201).json({
      success: true,
      token,
      user: toPublicUser(newUser),
      message: `تم إنشاء حسابك عبر Google وتأكيد رقم هاتفك بنجاح! مرحباً ${decryptedNew.firstName}`
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/user/profile
 * Update user personal details (name, email, condition, specGenderPref) with field encryption
 */
async function updateProfile(req, res, next) {
  try {
    const userId = req.user.id;
    const { firstName, lastName, email, condition, specGenderPref } = req.body;

    const dataToUpdate = {};
    if (firstName) dataToUpdate.firstName = EncryptionService.encryptField(firstName.trim());
    if (lastName) dataToUpdate.lastName = EncryptionService.encryptField(lastName.trim());
    if (condition !== undefined) {
      dataToUpdate.conditionEncrypted = EncryptionService.encryptField(condition);
    }
    if (specGenderPref) dataToUpdate.specGenderPref = specGenderPref;

    if (email) {
      const cleanEmail = email.toLowerCase().trim();
      const newEmailHash = EncryptionService.generateBlindIndex(cleanEmail);
      const existing = await prisma.user.findUnique({ where: { emailHash: newEmailHash } });
      if (existing && existing.id !== userId) {
        return res.status(400).json({
          success: false,
          message: 'البريد الإلكتروني مستخدم بالفعل من قبل حساب آخر.'
        });
      }
      dataToUpdate.emailEncrypted = EncryptionService.encryptField(cleanEmail);
      dataToUpdate.emailHash = newEmailHash;
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: dataToUpdate,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        emailEncrypted: true,
        phoneEncrypted: true,
        gender: true,
        conditionEncrypted: true,
        specGenderPref: true,
        role: true,
        isVerified: true
      }
    });

    const decryptedUser = EncryptionService.decryptUserFields(updatedUser);

    await AuditService.log({
      req,
      actorId: userId,
      actorRole: decryptedUser.role,
      action: 'USER_PROFILE_UPDATE',
      result: 'SUCCESS'
    });

    res.status(200).json({
      success: true,
      message: 'تم تحديث بيانات الملف الشخصي بنجاح.',
      user: {
        ...decryptedUser,
        fullName: decryptedUser.fullName || `${decryptedUser.firstName} ${decryptedUser.lastName}`.trim()
      }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/user/send-phone-otp
 * Send WhatsApp OTP to a new phone number to confirm before updating
 */
async function sendPhoneUpdateOtp(req, res, next) {
  try {
    const userId = req.user.id;
    const phone = req.body.phone || req.body.newPhone;
    if (!phone) {
      return res.status(400).json({ success: false, message: 'رقم الهاتف الجديد مطلوب' });
    }

    const cleanPhone = sanitizePhone(phone);
    const phoneBlindIndex = EncryptionService.generateBlindIndex(cleanPhone);
    const existing = await prisma.user.findFirst({
      where: { phoneHash: phoneBlindIndex }
    });
    if (existing && existing.id !== userId) {
      return res.status(400).json({
        success: false,
        message: 'رقم الهاتف مستخدم بالفعل من قبل حساب آخر.'
      });
    }

    const result = await WhatsAppService.createAndSendOtp(cleanPhone);
    if (!result.success) {
      return res.status(400).json(result);
    }

    await AuditService.log({
      req,
      actorId: userId,
      action: 'USER_PHONE_OTP_REQUEST',
      result: 'SUCCESS'
    });

    const responsePayload = {
      success: true,
      phone: result.phone || cleanPhone,
      expiresInMinutes: result.expiresInMinutes,
      message: `تم إرسال رمز التحقق إلى تطبيق WhatsApp للرقم ${cleanPhone}`
    };
    if (process.env.NODE_ENV === 'test' && result.devCode) {
      responsePayload.devCode = result.devCode;
    }

    res.status(200).json(responsePayload);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/user/update-phone
 * Verify OTP and update user's phone number with encryption and blind index
 */
async function verifyAndUpdatePhone(req, res, next) {
  try {
    const userId = req.user.id;
    const { newPhone, otpCode } = req.body;

    const cleanPhone = sanitizePhone(newPhone);
    const phoneBlindIndex = EncryptionService.generateBlindIndex(cleanPhone);
    const verifyRes = await WhatsAppService.verifyOtp(cleanPhone, otpCode);
    if (!verifyRes.success) {
      return res.status(400).json(verifyRes);
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        phoneEncrypted: EncryptionService.encryptField(cleanPhone),
        phoneHash: phoneBlindIndex,
        isVerified: true
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        emailEncrypted: true,
        phoneEncrypted: true,
        role: true,
        isVerified: true
      }
    });

    const decryptedUser = EncryptionService.decryptUserFields(updatedUser);

    await AuditService.log({
      req,
      actorId: userId,
      actorRole: decryptedUser.role,
      action: 'USER_PHONE_UPDATE_SUCCESS',
      result: 'SUCCESS'
    });

    res.status(200).json({
      success: true,
      message: 'تم التحقق من رقم الهاتف الجديد وتحديثه بنجاح!',
      user: decryptedUser
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/user/change-password
 * Change current user password with Argon2id and session revocation
 */
async function changePassword(req, res, next) {
  try {
    const userId = req.user.id;
    const { currentPassword, newPassword } = req.body;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });
    }

    const isValid = await SecurityService.verifyPassword(currentPassword, user.passwordHash);
    if (!isValid) {
      await AuditService.log({
        req,
        actorId: userId,
        action: 'USER_CHANGE_PASSWORD_WRONG_CURRENT',
        result: 'FAILED'
      });
      return res.status(400).json({
        success: false,
        message: 'كلمة المرور الحالية غير صحيحة.'
      });
    }

    const passwordHash = await SecurityService.hashPassword(newPassword);

    // Increment tokenVersion so older session tokens become invalid
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash,
        tokenVersion: { increment: 1 }
      }
    });

    // Issue a fresh token for the current active browser session
    const newToken = createToken(updatedUser, ['full_access']);

    await AuditService.log({
      req,
      actorId: userId,
      actorRole: updatedUser.role,
      action: 'USER_CHANGE_PASSWORD_SUCCESS',
      result: 'SUCCESS'
    });

    res.status(200).json({
      success: true,
      message: 'تم تغيير كلمة المرور بنجاح! تم تجديد جلستك وإنهاء أي جلسات قديمة.',
      token: newToken
    });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/user/account
 * Delete or deactivate account with double password verification and audit log
 */
async function deleteAccount(req, res, next) {
  try {
    const userId = req.user.id;
    const { password } = req.body;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });
    }

    const isValid = await SecurityService.verifyPassword(password, user.passwordHash);
    if (!isValid) {
      await AuditService.log({
        req,
        actorId: userId,
        action: 'USER_DELETE_ACCOUNT_WRONG_PASSWORD',
        result: 'FAILED'
      });
      return res.status(400).json({
        success: false,
        message: 'كلمة المرور غير صحيحة لتأكيد حذف الحساب.'
      });
    }

    // Invalidate sessions
    await prisma.user.update({
      where: { id: userId },
      data: {
        status: 'deleted',
        tokenVersion: { increment: 10 }
      }
    });

    await AuditService.log({
      req,
      actorId: userId,
      actorRole: user.role,
      action: 'USER_ACCOUNT_DELETED',
      result: 'SUCCESS'
    });

    res.status(200).json({
      success: true,
      message: 'تم حذف حسابك بنجاح. نتمنى لك دوام الصحة والعافية.'
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  sendOtp,
  verifyOtp,
  register,
  login,
  forgotPassword,
  resetPassword,
  getMe,
  googleAuth,
  updateProfile,
  sendPhoneUpdateOtp,
  verifyAndUpdatePhone,
  changePassword,
  deleteAccount
};
