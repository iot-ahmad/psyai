const crypto = require('crypto');
const { createPrismaMock } = require('./helpers/mockPrisma');

const mockPrisma = createPrismaMock();
jest.mock('../src/config/db', () => mockPrisma);

// Silence the noisy gateway/service console output during tests
jest.spyOn(console, 'log').mockImplementation(() => { });
jest.spyOn(console, 'error').mockImplementation(() => { });

const PaymentService = require('../src/services/paymentService');
const AuditService = require('../src/services/auditService');
const WhatsAppService = require('../src/services/whatsappService');

describe('PaymentService - Visa Hosted Checkout Integration', () => {
  const baseBooking = {
    id: 'booking-1',
    userId: 'user-1',
    status: 'pending',
    specialist: { id: 'spec-1', price: 250, name: 'د. سارة' },
    user: { id: 'user-1', firstName: 'أحمد', lastName: 'علي', phone: '+962791234567' }
  };

  const mockUser = {
    id: 'user-1',
    role: 'user'
  };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.VISA_WEBHOOK_SECRET = 'whsec_test_secret_123';
    process.env.PAYMENT_WEBHOOK_SECRET = 'whsec_test_secret_123';
    process.env.VISA_HOSTED_CHECKOUT_URL = 'https://secure.checkout.visa.com/pay';

    mockPrisma.booking.findUnique.mockResolvedValue(baseBooking);
    mockPrisma.booking.update.mockResolvedValue({ ...baseBooking, status: 'confirmed' });
    mockPrisma.payment.findUnique.mockResolvedValue(null);
    mockPrisma.payment.create.mockImplementation(async ({ data }) => ({
      id: 'payment-123',
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
      ...data
    }));
    mockPrisma.payment.update.mockImplementation(async ({ where, data }) => ({
      id: where.id || 'payment-123',
      bookingId: 'booking-1',
      amount: 250,
      currency: 'SAR',
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date(),
      ...data
    }));
    mockPrisma.auditLog.create.mockResolvedValue({ id: 'audit-1' });
  });

  /* ==========================================================================
     1. CREATE PAYMENT SESSION (POST /api/payments/create-session)
     ========================================================================== */
  describe('PaymentService.createPaymentSession', () => {
    it('creates a PENDING payment record with unique idempotencyKey and returns redirectUrl', async () => {
      const result = await PaymentService.createPaymentSession({
        bookingId: 'booking-1',
        user: mockUser
      });

      expect(result.success).toBe(true);
      expect(result.redirectUrl).toContain('https://secure.checkout.visa.com/pay/visa_sess_');
      expect(result.paymentId).toBe('payment-123');
      expect(result.visaSessionId).toMatch(/^visa_sess_/);

      expect(mockPrisma.payment.create).toHaveBeenCalledTimes(1);
      const createData = mockPrisma.payment.create.mock.calls[0][0].data;
      expect(createData).toMatchObject({
        bookingId: 'booking-1',
        userId: 'user-1',
        amount: 250,
        currency: 'SAR',
        status: 'PENDING'
      });
      expect(createData.idempotencyKey).toBeDefined();
      expect(typeof createData.idempotencyKey).toBe('string');
      expect(createData.idempotencyKey.length).toBe(64); // SHA-256 hash
    });

    it('allows custom amount and currency when specified', async () => {
      const result = await PaymentService.createPaymentSession({
        bookingId: 'booking-1',
        amount: 350,
        currency: 'USD',
        user: mockUser
      });

      expect(result.success).toBe(true);
      const createData = mockPrisma.payment.create.mock.calls[0][0].data;
      expect(createData.amount).toBe(350);
      expect(createData.currency).toBe('USD');
    });

    it('returns alreadyPaid if booking payment is already SUCCEEDED', async () => {
      mockPrisma.payment.findUnique.mockResolvedValue({
        id: 'existing-pay-1',
        bookingId: 'booking-1',
        status: 'SUCCEEDED',
        amount: 250
      });

      const result = await PaymentService.createPaymentSession({
        bookingId: 'booking-1',
        user: mockUser
      });

      expect(result.success).toBe(true);
      expect(result.alreadyPaid).toBe(true);
      expect(result.paymentId).toBe('existing-pay-1');
      expect(mockPrisma.payment.create).not.toHaveBeenCalled();
    });

    it('throws when booking does not exist', async () => {
      mockPrisma.booking.findUnique.mockResolvedValue(null);

      await expect(
        PaymentService.createPaymentSession({
          bookingId: 'non-existent',
          user: mockUser
        })
      ).rejects.toThrow('جلسة الحجز غير موجودة');
    });

    it('throws when user does not own the booking and is not admin', async () => {
      await expect(
        PaymentService.createPaymentSession({
          bookingId: 'booking-1',
          user: { id: 'other-user', role: 'user' }
        })
      ).rejects.toThrow('غير مصرح لك بإنشاء جلسة دفع لهذا الحجز');
    });

    it('allows admin to create payment session for any booking', async () => {
      const result = await PaymentService.createPaymentSession({
        bookingId: 'booking-1',
        user: { id: 'admin-user', role: 'admin' }
      });

      expect(result.success).toBe(true);
      expect(mockPrisma.payment.create).toHaveBeenCalledTimes(1);
    });

    it('records an audit log entry on session creation without sensitive data', async () => {
      const logSpy = jest.spyOn(AuditService, 'log');

      await PaymentService.createPaymentSession({
        bookingId: 'booking-1',
        user: mockUser
      });

      expect(logSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PAYMENT_SESSION_CREATED',
          resourceId: 'payment-123',
          result: 'SUCCESS',
          metadata: expect.objectContaining({
            paymentId: 'payment-123',
            bookingId: 'booking-1',
            amount: 250
          })
        })
      );
    });
  });

  /* ==========================================================================
     2. WEBHOOK SIGNATURE VERIFICATION
     ========================================================================== */
  describe('PaymentService.verifyWebhookSignature', () => {
    const payload = JSON.stringify({ visaSessionId: 'visa_sess_123', status: 'succeeded' });
    const secret = 'whsec_test_secret_123';

    it('validates a genuine HMAC-SHA256 signature', () => {
      const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
      const isValid = PaymentService.verifyWebhookSignature(payload, signature);
      expect(isValid).toBe(true);
    });

    it('validates signature with sha256= prefix', () => {
      const signature = 'sha256=' + crypto.createHmac('sha256', secret).update(payload).digest('hex');
      const isValid = PaymentService.verifyWebhookSignature(payload, signature);
      expect(isValid).toBe(true);
    });

    it('rejects tampered payload', () => {
      const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
      const tamperedPayload = JSON.stringify({ visaSessionId: 'visa_sess_123', status: 'failed' });
      const isValid = PaymentService.verifyWebhookSignature(tamperedPayload, signature);
      expect(isValid).toBe(false);
    });

    it('rejects signature created with wrong secret', () => {
      const signature = crypto.createHmac('sha256', 'wrong_secret').update(payload).digest('hex');
      const isValid = PaymentService.verifyWebhookSignature(payload, signature);
      expect(isValid).toBe(false);
    });

    it('rejects missing or empty signature', () => {
      expect(PaymentService.verifyWebhookSignature(payload, '')).toBe(false);
      expect(PaymentService.verifyWebhookSignature(payload, null)).toBe(false);
    });
  });

  /* ==========================================================================
     3. WEBHOOK RECEIVER & IDEMPOTENCY (POST /api/payments/webhook)
     ========================================================================== */
  describe('PaymentService.handleWebhook', () => {
    const secret = 'whsec_test_secret_123';
    const visaSessionId = 'visa_sess_999';

    function sign(payloadObj) {
      const str = typeof payloadObj === 'string' ? payloadObj : JSON.stringify(payloadObj);
      return crypto.createHmac('sha256', secret).update(str).digest('hex');
    }

    it('rejects webhook with 401 when signature is invalid and logs audit denied', async () => {
      const logSpy = jest.spyOn(AuditService, 'log');
      const payload = { visaSessionId, status: 'succeeded' };

      await expect(
        PaymentService.handleWebhook({
          payload,
          signature: 'invalid_sig_hex_12345',
          ip: '192.168.1.1'
        })
      ).rejects.toMatchObject({
        message: 'Invalid webhook signature',
        statusCode: 401
      });

      expect(logSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PAYMENT_WEBHOOK_INVALID_SIGNATURE',
          result: 'DENIED'
        })
      );
    });

    it('processes successful payment, confirms booking and triggers WhatsApp notification', async () => {
      const sendNotifSpy = jest.spyOn(WhatsAppService, 'sendSessionStartNotification').mockResolvedValue({ success: true });

      const pendingPayment = {
        id: 'pay-db-1',
        bookingId: 'booking-1',
        status: 'PENDING',
        amount: 250,
        currency: 'SAR',
        visaSessionId,
        booking: baseBooking
      };

      mockPrisma.payment.findUnique.mockResolvedValue(pendingPayment);

      const payload = {
        visaSessionId,
        status: 'succeeded',
        transactionId: 'txn_visa_success_1'
      };
      const signature = sign(payload);

      const result = await PaymentService.handleWebhook({
        payload,
        signature,
        ip: '1.2.3.4'
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe('SUCCEEDED');
      expect(result.transactionId).toBe('txn_visa_success_1');

      // Update payment record in DB
      expect(mockPrisma.payment.update).toHaveBeenCalledWith({
        where: { id: 'pay-db-1' },
        data: {
          status: 'SUCCEEDED',
          transactionId: 'txn_visa_success_1'
        }
      });

      // Update booking to confirmed
      expect(mockPrisma.booking.update).toHaveBeenCalledWith({
        where: { id: 'booking-1' },
        data: expect.objectContaining({
          status: 'confirmed'
        })
      });

      // WhatsApp notification triggered
      expect(sendNotifSpy).toHaveBeenCalledWith(
        '+962791234567',
        'أحمد علي',
        'د. سارة',
        'https://psyai.app/session/booking-1'
      );
    });

    it('is idempotent: returns 200 without reprocessing when status is already SUCCEEDED', async () => {
      const alreadyPaidPayment = {
        id: 'pay-db-1',
        bookingId: 'booking-1',
        status: 'SUCCEEDED',
        amount: 250,
        currency: 'SAR',
        visaSessionId,
        transactionId: 'txn_original_1'
      };

      mockPrisma.payment.findUnique.mockResolvedValue(alreadyPaidPayment);

      const payload = { visaSessionId, status: 'succeeded' };
      const signature = sign(payload);

      const result = await PaymentService.handleWebhook({
        payload,
        signature,
        ip: '1.2.3.4'
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('already processed');
      expect(mockPrisma.payment.update).not.toHaveBeenCalled();
      expect(mockPrisma.booking.update).not.toHaveBeenCalled();
    });

    it('marks payment as FAILED and does not confirm booking when status is failed', async () => {
      const pendingPayment = {
        id: 'pay-db-1',
        bookingId: 'booking-1',
        status: 'PENDING',
        amount: 250,
        currency: 'SAR',
        visaSessionId,
        booking: baseBooking
      };

      mockPrisma.payment.findUnique.mockResolvedValue(pendingPayment);

      const payload = {
        visaSessionId,
        status: 'failed',
        transactionId: 'txn_visa_fail_1'
      };
      const signature = sign(payload);

      const result = await PaymentService.handleWebhook({
        payload,
        signature,
        ip: '1.2.3.4'
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe('FAILED');

      expect(mockPrisma.payment.update).toHaveBeenCalledWith({
        where: { id: 'pay-db-1' },
        data: {
          status: 'FAILED',
          transactionId: 'txn_visa_fail_1'
        }
      });

      expect(mockPrisma.booking.update).not.toHaveBeenCalled();
    });

    it('returns 404 error when visaSessionId is not found in database', async () => {
      mockPrisma.payment.findUnique.mockResolvedValue(null);

      const payload = { visaSessionId: 'unknown_session', status: 'succeeded' };
      const signature = sign(payload);

      await expect(
        PaymentService.handleWebhook({
          payload,
          signature,
          ip: '1.2.3.4'
        })
      ).rejects.toMatchObject({
        statusCode: 404
      });
    });
  });

  /* ==========================================================================
     4. PAYMENT STATUS CHECK (GET /api/payments/:paymentId/status)
     ========================================================================== */
  describe('PaymentService.getPaymentStatus', () => {
    it('returns payment status details from DB', async () => {
      const mockPaymentRecord = {
        id: 'pay-123',
        bookingId: 'booking-1',
        status: 'SUCCEEDED',
        amount: 250,
        currency: 'SAR',
        transactionId: 'txn_123',
        visaSessionId: 'visa_sess_123',
        updatedAt: new Date()
      };

      mockPrisma.payment.findUnique.mockResolvedValue(mockPaymentRecord);

      const result = await PaymentService.getPaymentStatus('pay-123');
      expect(result).toMatchObject({
        id: 'pay-123',
        bookingId: 'booking-1',
        status: 'SUCCEEDED',
        amount: 250,
        currency: 'SAR',
        transactionId: 'txn_123'
      });
    });

    it('returns null when payment is not found', async () => {
      mockPrisma.payment.findUnique.mockResolvedValue(null);
      const result = await PaymentService.getPaymentStatus('non-existent');
      expect(result).toBeNull();
    });
  });
});
