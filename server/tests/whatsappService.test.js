const bcrypt = require('bcryptjs');
const { createPrismaMock } = require('./helpers/mockPrisma');

const mockPrisma = createPrismaMock();
jest.mock('../src/config/db', () => mockPrisma);

// The service logs on the simulator path; keep test output readable.
jest.spyOn(console, 'log').mockImplementation(() => { });
jest.spyOn(console, 'error').mockImplementation(() => { });

const WhatsAppService = require('../src/services/whatsappService');

describe('WhatsAppService.cleanPhone', () => {
  it('removes spaces, dashes and parentheses', () => {
    expect(WhatsAppService.cleanPhone(' +962 79-123 (4567) ')).toBe('+962791234567');
  });

  it('is a no-op for an already-clean number', () => {
    expect(WhatsAppService.cleanPhone('+962791234567')).toBe('+962791234567');
  });

  it('returns an empty string for an empty input', () => {
    expect(WhatsAppService.cleanPhone('')).toBe('');
  });
});

describe('WhatsAppService.generateOtp', () => {
  it('always produces exactly 6 numeric digits', () => {
    for (let i = 0; i < 50; i++) {
      const code = WhatsAppService.generateOtp();
      expect(code).toMatch(/^\d{6}$/);
    }
  });

  it('never returns a value below 100000 (no leading-zero ambiguity)', () => {
    for (let i = 0; i < 50; i++) {
      expect(Number(WhatsAppService.generateOtp())).toBeGreaterThanOrEqual(100000);
    }
  });
});

describe('WhatsAppService.createAndSendOtp', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    // Default: simulator provider -> devCode is echoed back.
    process.env.WHATSAPP_PROVIDER = 'simulator';
    process.env.NODE_ENV = 'test';
    mockPrisma.otpToken.upsert.mockResolvedValue({});
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('persists a hashed OTP and returns a 6-digit devCode in simulator mode', async () => {
    const result = await WhatsAppService.createAndSendOtp('+962 79 123 4567');

    expect(result.success).toBe(true);
    expect(result.phone).toBe('+962791234567');
    expect(result.expiresInMinutes).toBe(5);
    expect(result.provider).toBe('simulator');
    expect(result.devCode).toMatch(/^\d{6}$/);

    const upsertArg = mockPrisma.otpToken.upsert.mock.calls[0][0];
    expect(upsertArg.where).toEqual({ phone: '+962791234567' });
    // The stored value must be a hash, never the plaintext code.
    expect(upsertArg.create.codeHash).not.toBe(result.devCode);
    expect(upsertArg.create.attempts).toBe(0);
    // The stored hash must verify against the returned plaintext code.
    await expect(bcrypt.compare(result.devCode, upsertArg.create.codeHash))
      .resolves.toBe(true);
  });

  it('sets an expiry roughly 5 minutes in the future', async () => {
    const before = Date.now();
    await WhatsAppService.createAndSendOtp('+962791234567');
    const after = Date.now();

    const { expiresAt } = mockPrisma.otpToken.upsert.mock.calls[0][0].create;
    expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + 5 * 60 * 1000 - 1000);
    expect(expiresAt.getTime()).toBeLessThanOrEqual(after + 5 * 60 * 1000 + 1000);
  });

  it('resets attempts to 0 on re-request (upsert update branch)', async () => {
    await WhatsAppService.createAndSendOtp('+962791234567');
    expect(mockPrisma.otpToken.upsert.mock.calls[0][0].update.attempts).toBe(0);
  });

  it('hides the devCode in production with a real provider', async () => {
    process.env.NODE_ENV = 'production';
    process.env.WHATSAPP_PROVIDER = 'meta';
    process.env.WHATSAPP_API_TOKEN = 'token-abc';
    process.env.WHATSAPP_PHONE_NUMBER_ID = '123456';

    global.fetch = jest.fn().mockResolvedValue({
      json: async () => ({ messages: [{ id: 'wamid.TEST' }] })
    });

    const result = await WhatsAppService.createAndSendOtp('+962791234567');

    expect(result.devCode).toBeUndefined();
    expect(result.provider).toBe('meta');
    delete global.fetch;
  });

  it('propagates a database upsert failure', async () => {
    mockPrisma.otpToken.upsert.mockRejectedValue(new Error('upsert failed'));
    await expect(WhatsAppService.createAndSendOtp('+962791234567'))
      .rejects.toThrow('upsert failed');
  });
});

describe('WhatsAppService.verifyOtp', () => {
  const phone = '+962791234567';
  let codeHash;

  beforeAll(async () => {
    codeHash = await bcrypt.hash('123456', 8);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function record(overrides = {}) {
    return {
      phone,
      codeHash,
      attempts: 0,
      expiresAt: new Date(Date.now() + 60 * 1000),
      ...overrides
    };
  }

  describe('positive cases', () => {
    it('validates a correct, unexpired code and deletes the token (anti-replay)', async () => {
      mockPrisma.otpToken.findUnique.mockResolvedValue(record());

      const result = await WhatsAppService.verifyOtp(phone, '123456');

      expect(result).toEqual({
        success: true,
        message: 'تم التحقق من رقم الهاتف بنجاح'
      });
      expect(mockPrisma.otpToken.delete).toHaveBeenCalledWith({ where: { phone } });
    });

    it('normalizes the phone number before lookup', async () => {
      mockPrisma.otpToken.findUnique.mockResolvedValue(record());

      await WhatsAppService.verifyOtp('+962 79 123 4567', '123456');

      expect(mockPrisma.otpToken.findUnique).toHaveBeenCalledWith({ where: { phone } });
    });
  });

  describe('negative cases', () => {
    it('fails when no token exists for the phone', async () => {
      mockPrisma.otpToken.findUnique.mockResolvedValue(null);

      const result = await WhatsAppService.verifyOtp(phone, '123456');

      expect(result.success).toBe(false);
      expect(result.message).toContain('لم يتم طلب رمز تحقق');
      expect(mockPrisma.otpToken.delete).not.toHaveBeenCalled();
    });

    it('rejects an expired code and deletes the token', async () => {
      mockPrisma.otpToken.findUnique.mockResolvedValue(
        record({ expiresAt: new Date(Date.now() - 1000) })
      );

      const result = await WhatsAppService.verifyOtp(phone, '123456');

      expect(result.success).toBe(false);
      expect(result.message).toContain('انتهت صلاحية رمز التحقق');
      expect(mockPrisma.otpToken.delete).toHaveBeenCalledWith({ where: { phone } });
    });

    it('blocks further attempts once 3 attempts are exhausted and deletes the token', async () => {
      mockPrisma.otpToken.findUnique.mockResolvedValue(record({ attempts: 3 }));

      const result = await WhatsAppService.verifyOtp(phone, '123456');

      expect(result.success).toBe(false);
      expect(result.message).toContain('تم استنفاد المحاولات المسموحة');
      expect(mockPrisma.otpToken.delete).toHaveBeenCalledWith({ where: { phone } });
    });

    it('increments attempts and reports remaining tries on a wrong code', async () => {
      mockPrisma.otpToken.findUnique.mockResolvedValue(record({ attempts: 0 }));
      mockPrisma.otpToken.update.mockResolvedValue({});

      const result = await WhatsAppService.verifyOtp(phone, '000');

      expect(result.success).toBe(false);
      expect(result.message).toContain('متبقي 2 محاولات');
      expect(mockPrisma.otpToken.update).toHaveBeenCalledWith({
        where: { phone },
        data: { attempts: { increment: 1 } }
      });
      expect(mockPrisma.otpToken.delete).not.toHaveBeenCalled();
    });

    it('reports the correct remaining count on the second wrong attempt', async () => {
      mockPrisma.otpToken.findUnique.mockResolvedValue(record({ attempts: 1 }));
      mockPrisma.otpToken.update.mockResolvedValue({});

      const result = await WhatsAppService.verifyOtp(phone, '000');

      expect(result.message).toContain('متبقي 1 محاولات');
    });

    it('never reports a negative remaining count', async () => {
      mockPrisma.otpToken.findUnique.mockResolvedValue(record({ attempts: 2 }));
      mockPrisma.otpToken.update.mockResolvedValue({});

      const result = await WhatsAppService.verifyOtp(phone, '000');

      expect(result.message).toContain('متبقي 0 محاولات');
    });
  });

  describe('edge cases', () => {
    it('treats a code valid until the last millisecond before expiry', async () => {
      mockPrisma.otpToken.findUnique.mockResolvedValue(
        record({ expiresAt: new Date(Date.now() + 2000) })
      );

      const result = await WhatsAppService.verifyOtp(phone, '123456');
      expect(result.success).toBe(true);
    });

    it('does not increment attempts when the code is correct', async () => {
      mockPrisma.otpToken.findUnique.mockResolvedValue(record());
      await WhatsAppService.verifyOtp(phone, '123456');
      expect(mockPrisma.otpToken.update).not.toHaveBeenCalled();
    });

    it('checks expiry before attempts (expired wins over exhausted)', async () => {
      mockPrisma.otpToken.findUnique.mockResolvedValue(
        record({ expiresAt: new Date(Date.now() - 1), attempts: 5 })
      );

      const result = await WhatsAppService.verifyOtp(phone, '123456');
      expect(result.message).toContain('انتهت صلاحية');
    });
  });
});

describe('WhatsAppService.sendSessionStartNotification', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv, WHATSAPP_PROVIDER: 'simulator' };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('interpolates patient, specialist and URL into the message', async () => {
    const result = await WhatsAppService.sendSessionStartNotification(
      '+962791234567',
      'أحمد',
      'د. سارة',
      'https://psyai.app/session/abc'
    );

    expect(result.success).toBe(true);
    expect(result.messageText).toContain('أحمد');
    expect(result.messageText).toContain('د. سارة');
    expect(result.messageText).toContain('https://psyai.app/session/abc');
  });
});
