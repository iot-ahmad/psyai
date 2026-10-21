// JWT_SECRET must exist before authController is required, otherwise the
// module calls process.exit(1) at import time.
process.env.JWT_SECRET = 'test-secret-key';

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { createPrismaMock, createRes, createReq } = require('./helpers/mockPrisma');

const mockPrisma = createPrismaMock();
const mockWhatsapp = {
  createAndSendOtp: jest.fn(),
  verifyOtp: jest.fn()
};

jest.mock('../src/config/db', () => mockPrisma);
jest.mock('../src/services/whatsappService', () => mockWhatsapp);

const authController = require('../src/controllers/authController');
const EncryptionService = require('../src/services/encryptionService');

describe('authController.sendOtp', () => {
  let res, next;

  beforeEach(() => {
    jest.clearAllMocks();
    res = createRes();
    next = jest.fn();
  });

  it('returns 400 when phone is missing', async () => {
    await authController.sendOtp(createReq({ body: {} }), res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.body.success).toBe(false);
    expect(mockWhatsapp.createAndSendOtp).not.toHaveBeenCalled();
  });

  it('sends a 6-digit code and returns 200 on success', async () => {
    mockWhatsapp.createAndSendOtp.mockResolvedValue({
      success: true,
      phone: '+962791234567',
      expiresInMinutes: 5,
      devCode: '123456',
      provider: 'simulator'
    });

    const req = { body: { phone: '+962791234567' }, params: {}, query: {}, headers: {} };
    await authController.sendOtp(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.body.success).toBe(true);
    expect(res.body.phone).toBe('+962791234567');
    expect(mockWhatsapp.createAndSendOtp).toHaveBeenCalledWith('+962791234567');
  });

  it('delegates errors to next()', async () => {
    const err = new Error('boom');
    mockWhatsapp.createAndSendOtp.mockRejectedValue(err);

    const req = { body: { phone: '+962791234567' }, params: {}, query: {}, headers: {} };
    await authController.sendOtp(req, res, next);

    expect(next).toHaveBeenCalledWith(err);
  });
});

describe('authController.verifyOtp', () => {
  let res, next;

  beforeEach(() => {
    jest.clearAllMocks();
    res = createRes();
    next = jest.fn();
  });

  it('returns 200 when the code is valid', async () => {
    mockWhatsapp.verifyOtp.mockResolvedValue({ success: true, message: 'ok' });

    await authController.verifyOtp(
      createReq({ body: { phone: '+962791234567', code: '123456' } }),
      res,
      next
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.body.success).toBe(true);
  });

  it('returns 400 when the code is invalid', async () => {
    mockWhatsapp.verifyOtp.mockResolvedValue({ success: false, message: 'wrong code' });

    await authController.verifyOtp(
      createReq({ body: { phone: '+962791234567', code: '000' } }),
      res,
      next
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.body).toEqual({ success: false, message: 'wrong code' });
  });
});

describe('authController.register', () => {
  let res, next;
  const validBody = {
    firstName: 'Sara',
    lastName: 'Ahmad',
    email: 'Sara@Example.com',
    phone: '+962791234567',
    gender: 'female',
    password: 'password123',
    condition: 'anxiety'
  };

  beforeEach(() => {
    jest.clearAllMocks();
    res = createRes();
    next = jest.fn();
    mockPrisma.user.findUnique.mockResolvedValue(null); // no duplicates by default
    mockPrisma.user.findFirst.mockResolvedValue(null);  // no phone duplicates by default
    mockWhatsapp.verifyOtp.mockResolvedValue({ success: true });
    mockPrisma.user.create.mockImplementation(async ({ data }) => ({
      id: 'user-1',
      firstName: data.firstName,
      lastName: data.lastName,
      emailEncrypted: data.emailEncrypted,
      phoneEncrypted: data.phoneEncrypted,
      emailHash: data.emailHash,
      phoneHash: data.phoneHash,
      gender: data.gender,
      conditionEncrypted: data.conditionEncrypted,
      specGenderPref: data.specGenderPref,
      role: data.role,
      isVerified: data.isVerified,
      tokenVersion: 0,
      createdAt: new Date('2025-01-01')
    }));
  });

  it('creates a user and returns 201 with a valid JWT on success', async () => {
    await authController.register(createReq({ body: validBody }), res, next);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.body.success).toBe(true);
    expect(res.body.token).toBeDefined();

    const decoded = jwt.verify(res.body.token, 'test-secret-key');
    // Token contains user.id and role; email is not directly stored in new schema's JWT payload
    expect(decoded).toMatchObject({ id: 'user-1', role: 'user' });
  });

  it('hashes the password (never stores plaintext)', async () => {
    await authController.register(createReq({ body: validBody }), res, next);

    const createdData = mockPrisma.user.create.mock.calls[0][0].data;
    expect(createdData.passwordHash).not.toBe(validBody.password);
    await expect(bcrypt.compare(validBody.password, createdData.passwordHash))
      .resolves.toBe(true);
  });

  it('returns 400 when the email is already registered', async () => {
    // The controller now uses emailHash (blind-index) for lookup, not plaintext email
    mockPrisma.user.findUnique.mockImplementation(async ({ where }) => {
      if (where.emailHash) return { id: 'existing' };
      return null;
    });

    await authController.register(createReq({ body: validBody }), res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.body.message).toContain('البريد الإلكتروني مسجل بالفعل');
    expect(mockPrisma.user.create).not.toHaveBeenCalled();
  });

  it('returns 400 when the phone is already registered', async () => {
    // The controller now uses phoneHash (blind-index) for lookup via findFirst
    mockPrisma.user.findFirst.mockImplementation(async ({ where }) => {
      if (where.phoneHash) return { id: 'existing' };
      return null;
    });

    await authController.register(createReq({ body: validBody }), res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.body.message).toContain('رقم الهاتف مسجل بالفعل');
    expect(mockPrisma.user.create).not.toHaveBeenCalled();
  });

  it('verifies OTP when otpCode is supplied and marks the user verified', async () => {
    mockWhatsapp.verifyOtp.mockResolvedValue({ success: true });

    await authController.register(
      createReq({ body: { ...validBody, otpCode: '123456' } }),
      res,
      next
    );

    expect(mockWhatsapp.verifyOtp).toHaveBeenCalledWith('+962791234567', '123456');
    expect(mockPrisma.user.create.mock.calls[0][0].data.isVerified).toBe(true);
  });

  it('aborts registration when the supplied OTP is invalid', async () => {
    mockWhatsapp.verifyOtp.mockResolvedValue({ success: false, message: 'bad otp' });

    await authController.register(
      createReq({ body: { ...validBody, otpCode: '000' } }),
      res,
      next
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.body.message).toContain('bad otp');
    expect(mockPrisma.user.create).not.toHaveBeenCalled();
  });

  it('defaults specGenderPref to "any" and condition to null when omitted', async () => {
    const { condition, ...bodyWithoutCondition } = validBody;
    await authController.register(createReq({ body: bodyWithoutCondition }), res, next);

    const createdData = mockPrisma.user.create.mock.calls[0][0].data;
    // Condition field is stored as conditionEncrypted in the new schema
    expect(createdData.conditionEncrypted).toBeNull();
    expect(createdData.specGenderPref).toBe('any');
    expect(createdData.role).toBe('user');
    expect(createdData.status).toBe('active');
  });

  it('delegates unexpected errors to next()', async () => {
    mockPrisma.user.findUnique.mockRejectedValue(new Error('db error'));

    await authController.register(createReq({ body: validBody }), res, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});

describe('authController.login', () => {
  let res, next;
  let passwordHash;

  beforeAll(async () => {
    passwordHash = await bcrypt.hash('password123', 10);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    res = createRes();
    next = jest.fn();
  });

  function activeUser(overrides = {}) {
    return {
      id: 'user-1',
      firstName: 'Sara',
      lastName: 'Ahmad',
      email: 'sara@example.com',
      phone: '+962791234567',
      passwordHash,
      role: 'user',
      status: 'active',
      isVerified: true,
      ...overrides
    };
  }

  it('logs in with a correct password and returns a token', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(activeUser());

    await authController.login(
      createReq({ body: { identifier: 'sara@example.com', password: 'password123' } }),
      res,
      next
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.body.success).toBe(true);
    expect(res.body.user.fullName).toBe('Sara Ahmad');
    expect(jwt.verify(res.body.token, 'test-secret-key').id).toBe('user-1');
  });

  it('normalizes the email identifier (lowercase + trim) before lookup', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(activeUser());

    await authController.login(
      createReq({ body: { identifier: '  SARA@Example.com  ', password: 'password123' } }),
      res,
      next
    );

    const arg = mockPrisma.user.findFirst.mock.calls[0][0];
    // Login now uses emailHash blind-index instead of plaintext email
    expect(arg.where.OR[0]).toMatchObject({ emailHash: expect.any(String) });
  });

  it('returns 401 when no user matches', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(null);

    await authController.login(
      createReq({ body: { identifier: 'nobody@example.com', password: 'x' } }),
      res,
      next
    );

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.body.success).toBe(false);
  });

  it('returns 403 when the account is not active', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(activeUser({ status: 'suspended' }));

    await authController.login(
      createReq({ body: { identifier: 'sara@example.com', password: 'password123' } }),
      res,
      next
    );

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.body.message).toContain('الحساب موقوف');
  });

  it('returns 401 when the password is wrong', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(activeUser());

    await authController.login(
      createReq({ body: { identifier: 'sara@example.com', password: 'wrong' } }),
      res,
      next
    );

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.body.message).toContain('كلمة المرور غير صحيحة');
  });
});

describe('authController.getMe', () => {
  let res, next;

  beforeEach(() => {
    jest.clearAllMocks();
    res = createRes();
    next = jest.fn();
  });

  it('returns the profile with a computed fullName', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      firstName: 'Sara',
      lastName: 'Ahmad',
      bookings: []
    });
    // Subject under test with an authenticated user attached to the request.
    const req = { user: { id: 'user-1' }, body: {}, params: {}, query: {}, headers: {} };

    await authController.getMe(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.body.user.fullName).toBe('Sara Ahmad');
    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'user-1' } })
    );
  });

  it('delegates errors to next()', async () => {
    mockPrisma.user.findUnique.mockRejectedValue(new Error('db error'));
    const req = { user: { id: 'user-1' }, body: {}, params: {}, query: {}, headers: {} };
    await authController.getMe(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});

describe('authController.googleAuth', () => {
  let res, next;

  beforeEach(() => {
    jest.clearAllMocks();
    res = createRes();
    next = jest.fn();
    mockPrisma.user.findFirst.mockResolvedValue(null);
    mockWhatsapp.verifyOtp.mockResolvedValue({ success: true, message: 'تم التحقق' });
  });

  it('returns 400 when idToken is missing', async () => {
    const req = { body: {}, params: {}, query: {}, headers: {} };
    await authController.googleAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.body.success).toBe(false);
  });

  it('logs in an existing user that already has a phone', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      firstName: 'Sara',
      lastName: 'Ahmad',
      email: 'sara@example.com',
      phone: '+962791234567',
      role: 'user',
      status: 'active'
    });

    await authController.googleAuth(
      createReq({ body: { idToken: 'mock-test-id-token:sub-sara:sara@example.com:Sara:Ahmad' } }),
      res,
      next
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.body.success).toBe(true);
    expect(res.body.token).toBeDefined();
    expect(mockPrisma.user.create).not.toHaveBeenCalled();
  });

  it('asks for a phone number (needPhone) when the existing user has none', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      firstName: 'Sara',
      lastName: 'Ahmad',
      email: 'sara@example.com',
      phone: null,
      role: 'user',
      status: 'active'
    });

    await authController.googleAuth(
      createReq({ body: { idToken: 'mock-test-id-token:sub-sara:sara@example.com:Sara:Ahmad' } }),
      res,
      next
    );

    expect(res.body).toMatchObject({ success: true, needPhone: true });
  });

  it('normalizes a Jordanian local phone (07...) to +962 format and verifies OTP', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      firstName: 'Sara',
      lastName: 'Ahmad',
      email: 'sara@example.com',
      phone: null,
      role: 'user',
      status: 'active'
    });
    mockPrisma.user.update.mockResolvedValue({
      id: 'user-1',
      firstName: 'Sara',
      lastName: 'Ahmad',
      email: 'sara@example.com',
      phone: '+962791234567',
      role: 'user',
      status: 'active'
    });

    await authController.googleAuth(
      createReq({
        body: {
          idToken: 'mock-test-id-token:sub-sara:sara@example.com:Sara:Ahmad',
          phone: '0791234567',
          otpCode: '123456'
        }
      }),
      res,
      next
    );

    expect(mockWhatsapp.verifyOtp).toHaveBeenCalledWith('+962791234567', '123456');
    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-1' },
        data: expect.objectContaining({ isVerified: true, phoneHash: expect.any(String) })
      })
    );
    const updatedData = mockPrisma.user.update.mock.calls[0][0].data;
    // Phone is now stored in phoneEncrypted, not phone
    expect(EncryptionService.decryptField(updatedData.phoneEncrypted)).toBe('+962791234567');
  });

  it('creates a brand-new Google user with a valid Jordanian phone and verified OTP', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.user.findFirst.mockResolvedValue(null); // phone not taken
    mockPrisma.user.create.mockImplementation(async ({ data }) => ({
      id: 'new-user',
      ...data
    }));

    await authController.googleAuth(
      createReq({
        body: {
          idToken: 'mock-test-id-token:sub-omar:omar@example.com:Omar:Ali',
          phone: '0791234567',
          otpCode: '123456'
        }
      }),
      res,
      next
    );

    expect(mockWhatsapp.verifyOtp).toHaveBeenCalledWith('+962791234567', '123456');
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.body.success).toBe(true);
    const createdData = mockPrisma.user.create.mock.calls[0][0].data;
    // Phone is now stored in phoneEncrypted, not phone
    expect(EncryptionService.decryptField(createdData.phoneEncrypted)).toBe('+962791234567');
    expect(createdData.googleId).toBe('sub-omar');
    expect(createdData.isVerified).toBe(true);
    expect(createdData.passwordHash).toBeDefined();
  });

  it('rejects a new signup when the phone is already used by another account', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.user.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'other' });

    await authController.googleAuth(
      createReq({
        body: {
          idToken: 'mock-test-id-token:sub-new:new@example.com:Omar:Ali',
          phone: '0791234567',
          otpCode: '123456'
        }
      }),
      res,
      next
    );

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.body.message).toContain('رقم الهاتف هذا مسجل مسبقاً');
  });

  it('defaults the name to "مستخدم Google" when names are omitted in token', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.user.findFirst.mockResolvedValue(null);
    mockPrisma.user.create.mockImplementation(async ({ data }) => ({ id: 'new-user', ...data }));

    await authController.googleAuth(
      createReq({
        body: {
          idToken: 'mock-test-id-token:sub-new:new@example.com::',
          phone: '0791234567',
          otpCode: '123456'
        }
      }),
      res,
      next
    );

    const createdData = mockPrisma.user.create.mock.calls[0][0].data;
    expect(EncryptionService.decryptField(createdData.firstName)).toBe('مستخدم');
    expect(EncryptionService.decryptField(createdData.lastName)).toBe('Google');
  });

  it('blocks suspended accounts with 403', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-suspended',
      googleId: 'sub-suspended',
      email: 'suspended@example.com',
      phone: '+962791234567',
      role: 'user',
      status: 'suspended'
    });

    await authController.googleAuth(
      createReq({ body: { idToken: 'mock-test-id-token:sub-suspended:suspended@example.com:Sara:Ahmad' } }),
      res,
      next
    );

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.body.message).toContain('موقوف');
  });
});

describe('authController.updateProfile', () => {
  let res, next;

  beforeEach(() => {
    jest.clearAllMocks();
    res = createRes();
    next = jest.fn();
  });

  it('updates profile successfully', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.user.update.mockResolvedValue({
      id: 'u-1',
      firstName: 'Ahmad',
      lastName: 'Ghamdi',
      email: 'ahmad@example.com',
      phone: '+962791112233',
      gender: 'male',
      condition: 'anxiety',
      specGenderPref: 'male',
      role: 'user',
      isVerified: true
    });

    const req = createReq({
      user: { id: 'u-1', role: 'user' },
      body: { firstName: 'Ahmad', lastName: 'Ghamdi', email: 'ahmad@example.com' }
    });

    await authController.updateProfile(req, res, next);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.body.success).toBe(true);
    expect(res.body.user.fullName).toBe('Ahmad Ghamdi');
  });

  it('rejects email if already used by another user', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'u-2', email: 'taken@example.com' });

    const req = createReq({
      user: { id: 'u-1', role: 'user' },
      body: { email: 'taken@example.com' }
    });

    await authController.updateProfile(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.body.message).toContain('البريد الإلكتروني مستخدم بالفعل');
  });
});

describe('authController.changePassword', () => {
  let res, next;

  beforeEach(() => {
    jest.clearAllMocks();
    res = createRes();
    next = jest.fn();
  });

  it('changes password and increments tokenVersion on correct current password', async () => {
    const hash = await bcrypt.hash('old-pass', 8);
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'u-1', passwordHash: hash, role: 'user' });
    mockPrisma.user.update.mockResolvedValue({ id: 'u-1', passwordHash: 'new-hash', tokenVersion: 1, role: 'user', isVerified: true });

    const req = createReq({
      user: { id: 'u-1', role: 'user' },
      body: { currentPassword: 'old-pass', newPassword: 'new-secure-password' }
    });

    await authController.changePassword(req, res, next);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.body.success).toBe(true);
    expect(res.body.token).toBeDefined();
    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'u-1' },
        data: expect.objectContaining({ tokenVersion: { increment: 1 } })
      })
    );
  });

  it('rejects change password on wrong current password', async () => {
    const hash = await bcrypt.hash('correct-pass', 8);
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'u-1', passwordHash: hash, role: 'user' });

    const req = createReq({
      user: { id: 'u-1', role: 'user' },
      body: { currentPassword: 'wrong-pass', newPassword: 'new-secure-password' }
    });

    await authController.changePassword(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.body.message).toContain('كلمة المرور الحالية غير صحيحة');
  });
});

describe('authController.deleteAccount', () => {
  let res, next;

  beforeEach(() => {
    jest.clearAllMocks();
    res = createRes();
    next = jest.fn();
  });

  it('deactivates account on valid password confirmation', async () => {
    const hash = await bcrypt.hash('mypassword', 8);
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'u-1', passwordHash: hash, role: 'user' });
    mockPrisma.user.update.mockResolvedValue({ id: 'u-1', status: 'deleted' });

    const req = createReq({
      user: { id: 'u-1', role: 'user' },
      body: { password: 'mypassword' }
    });

    await authController.deleteAccount(req, res, next);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.body.success).toBe(true);
    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'u-1' },
        data: expect.objectContaining({ status: 'deleted' })
      })
    );
  });
});

