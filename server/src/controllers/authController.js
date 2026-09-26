const jwt = require('jsonwebtoken');
const prisma = require('../config/db');
const WhatsAppService = require('../services/whatsappService');
const SecurityService = require('../services/securityService');
const AuditService = require('../services/auditService');

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

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
    { expiresIn }
  );
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

    res.status(200).json({
      success: true,
      message: `تم إرسال رمز التحقق إلى تطبيق WhatsApp للرقم ${phone}`,
      ...result
    });
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

    // Find and verify user if registered
    const cleanPhone = sanitizePhone(phone);
    let user = await prisma.user.findUnique({
      where: { phone: cleanPhone }
    });

    if (user) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { isVerified: true }
      });

      const token = createToken(user, ['full_access']);

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
          id: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          phone: user.phone,
          role: user.role,
          isVerified: user.isVerified
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
 * Complete user registration with Argon2id hashing & session issuance
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

    // Check if user already exists
    const existingEmail = await prisma.user.findUnique({ where: { email: cleanEmail } });
    if (existingEmail) {
      return res.status(400).json({
        success: false,
        message: 'البريد الإلكتروني مسجل بالفعل. يرجى تسجيل الدخول أو استخدام بريد آخر.'
      });
    }

    const existingPhone = await prisma.user.findUnique({ where: { phone: cleanPhone } });
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

    // Create user
    const user = await prisma.user.create({
      data: {
        firstName,
        lastName,
        email: email.trim(),
        phone: cleanPhone,
        gender,
        passwordHash,
        condition: condition || null,
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
        email: true,
        phone: true,
        gender: true,
        condition: true,
        specGenderPref: true,
        role: true,
        isVerified: true,
        tokenVersion: true,
        createdAt: true
      }
    });

    const token = createToken(user);

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
      user
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/login
 * User login via Email or Phone + Password
 */
async function login(req, res, next) {
  try {
    const { identifier, password } = req.body;
    const cleanIdent = identifier.trim();

    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: cleanIdent.toLowerCase() },
          { phone: cleanIdent }
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

    await AuditService.log({
      req,
      actorId: user.id,
      actorRole: user.role,
      action: user.isVerified ? 'AUTH_LOGIN_SUCCESS' : 'AUTH_LOGIN_RESTRICTED_SUCCESS',
      result: 'SUCCESS'
    });

    res.status(200).json({
      success: true,
      message: `أهلاً بك مجدداً يا ${user.firstName}!`,
      token,
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        fullName: `${user.firstName} ${user.lastName}`,
        email: user.email,
        phone: user.phone,
        role: user.role,
        isVerified: user.isVerified
      }
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
async function getMe(req, res, next) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        gender: true,
        condition: true,
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

    res.status(200).json({
      success: true,
      user: {
        ...user,
        fullName: `${user.firstName} ${user.lastName}`
      }
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
 * POST /api/auth/google
 * Google Auth with mandatory phone verification state machine (Section 2)
 */
async function googleAuth(req, res, next) {
  try {
    const { email, firstName, lastName, phone, condition, specGenderPref } = req.body;

    if (!email || !email.includes('@')) {
      return res.status(400).json({ success: false, message: 'البريد الإلكتروني لحساب Google مطلوب' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const formattedPhone = formatJordanPhone(phone);

    // Check if user already exists by email
    let user = await prisma.user.findUnique({
      where: { email: cleanEmail }
    });

    if (user) {
      if (user.phone && user.phone.length > 5) {
        const token = createToken(user, ['full_access']);
        return res.status(200).json({
          success: true,
          token,
          user: {
            id: user.id,
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            phone: user.phone,
            role: user.role,
            isVerified: user.isVerified
          },
          message: `أهلاً بك مجدداً يا ${user.firstName}!`
        });
      }

      if (!formattedPhone) {
        return res.status(200).json({
          success: true,
          needPhone: true,
          email: cleanEmail,
          firstName: user.firstName,
          lastName: user.lastName,
          message: 'يرجى إدخال رقم هاتفك الأردني لإكمال تسجيل الدخول'
        });
      }

      // Update user phone
      user = await prisma.user.update({
        where: { id: user.id },
        data: { phone: formattedPhone, isVerified: true }
      });

      const token = createToken(user, ['full_access']);
      return res.status(200).json({
        success: true,
        token,
        user: {
          id: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          phone: user.phone,
          role: user.role,
          isVerified: user.isVerified
        },
        message: `تم تحديث رقم الهاتف وتسجيل الدخول بنجاح! مرحباً ${user.firstName}`
      });
    }

    // New Google user registration
    if (!formattedPhone) {
      return res.status(200).json({
        success: true,
        needPhone: true,
        email: cleanEmail,
        firstName: firstName || 'مستخدم',
        lastName: lastName || 'Google',
        message: 'يرجى إدخال رقم هاتفك الأردني لإكمال الحساب'
      });
    }

    const phoneExists = await prisma.user.findFirst({
      where: { phone: formattedPhone }
    });
    if (phoneExists) {
      return res.status(400).json({
        success: false,
        message: 'رقم الهاتف هذا مسجل مسبقاً بحساب آخر. يرجى إدخال رقم هاتفك الخاص.'
      });
    }

    const randomPass = SecurityService.generatePasswordResetToken().rawToken + 'Aa1!';
    const passwordHash = await SecurityService.hashPassword(randomPass);

    const fName = (firstName && firstName.trim()) ? firstName.trim() : 'مستخدم';
    const lName = (lastName && lastName.trim()) ? lastName.trim() : 'Google';

    const newUser = await prisma.user.create({
      data: {
        firstName: fName,
        lastName: lName,
        email: cleanEmail,
        phone: formattedPhone,
        gender: 'any',
        passwordHash,
        condition: condition || null,
        specGenderPref: specGenderPref || 'any',
        role: 'user',
        isVerified: true,
        status: 'active',
        tokenVersion: 0
      }
    });

    const token = createToken(newUser, ['full_access']);

    await AuditService.log({
      req,
      actorId: newUser.id,
      actorRole: newUser.role,
      action: 'AUTH_GOOGLE_REGISTER',
      result: 'SUCCESS'
    });

    res.status(201).json({
      success: true,
      token,
      user: {
        id: newUser.id,
        firstName: newUser.firstName,
        lastName: newUser.lastName,
        email: newUser.email,
        phone: newUser.phone,
        role: newUser.role,
        isVerified: newUser.isVerified
      },
      message: 'تم إنشاء حسابك عبر Google وتأكيد رقم هاتفك بنجاح!'
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/user/profile
 * Update user personal details (name, email, condition, specGenderPref)
 */
async function updateProfile(req, res, next) {
  try {
    const userId = req.user.id;
    const { firstName, lastName, email, condition, specGenderPref } = req.body;

    const dataToUpdate = {};
    if (firstName) dataToUpdate.firstName = firstName.trim();
    if (lastName) dataToUpdate.lastName = lastName.trim();
    if (condition !== undefined) dataToUpdate.condition = condition;
    if (specGenderPref) dataToUpdate.specGenderPref = specGenderPref;

    if (email) {
      const cleanEmail = email.toLowerCase().trim();
      const existing = await prisma.user.findUnique({ where: { email: cleanEmail } });
      if (existing && existing.id !== userId) {
        return res.status(400).json({
          success: false,
          message: 'البريد الإلكتروني مستخدم بالفعل من قبل حساب آخر.'
        });
      }
      dataToUpdate.email = cleanEmail;
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: dataToUpdate,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        gender: true,
        condition: true,
        specGenderPref: true,
        role: true,
        isVerified: true
      }
    });

    await AuditService.log({
      req,
      actorId: userId,
      actorRole: updatedUser.role,
      action: 'USER_PROFILE_UPDATE',
      result: 'SUCCESS'
    });

    res.status(200).json({
      success: true,
      message: 'تم تحديث بيانات الملف الشخصي بنجاح.',
      user: {
        ...updatedUser,
        fullName: `${updatedUser.firstName} ${updatedUser.lastName}`
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
    const existing = await prisma.user.findUnique({ where: { phone: cleanPhone } });
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

    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/user/update-phone
 * Verify OTP and update user's phone number
 */
async function verifyAndUpdatePhone(req, res, next) {
  try {
    const userId = req.user.id;
    const { newPhone, otpCode } = req.body;

    const cleanPhone = sanitizePhone(newPhone);
    const verifyRes = await WhatsAppService.verifyOtp(cleanPhone, otpCode);
    if (!verifyRes.success) {
      return res.status(400).json(verifyRes);
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        phone: cleanPhone,
        isVerified: true
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        role: true,
        isVerified: true
      }
    });

    await AuditService.log({
      req,
      actorId: userId,
      actorRole: updatedUser.role,
      action: 'USER_PHONE_UPDATE_SUCCESS',
      result: 'SUCCESS'
    });

    res.status(200).json({
      success: true,
      message: 'تم التحقق من رقم الهاتف الجديد وتحديثه بنجاح!',
      user: updatedUser
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
