const crypto = require('crypto');
const { createPrismaMock, createRes, createReq } = require('./helpers/mockPrisma');

const mockPrisma = createPrismaMock();
jest.mock('../src/config/db', () => mockPrisma);

// Silence logs
jest.spyOn(console, 'log').mockImplementation(() => { });
jest.spyOn(console, 'error').mockImplementation(() => { });

const paymentsController = require('../src/controllers/paymentsController');
const PaymentService = require('../src/services/paymentService');

describe('paymentsController', () => {
  let res, next;

  beforeEach(() => {
    jest.clearAllMocks();
    res = createRes();
    next = jest.fn();
    process.env.VISA_WEBHOOK_SECRET = 'whsec_test_secret_123';
  });

  describe('createSession', () => {
    it('returns 200 and redirectUrl on successful session creation', async () => {
      const mockResult = {
        success: true,
        redirectUrl: 'https://secure.checkout.visa.com/pay/visa_sess_123',
        paymentId: 'pay-123',
        visaSessionId: 'visa_sess_123'
      };
      jest.spyOn(PaymentService, 'createPaymentSession').mockResolvedValue(mockResult);

      const req = createReq({
        body: { bookingId: '123e4567-e89b-12d3-a456-426614174000', amount: 250 },
        user: { id: 'user-1', role: 'user' }
      });

      await paymentsController.createSession(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.body).toMatchObject({
        success: true,
        redirectUrl: 'https://secure.checkout.visa.com/pay/visa_sess_123',
        paymentId: 'pay-123',
        visaSessionId: 'visa_sess_123'
      });
    });

    it('returns 400 when session creation fails', async () => {
      jest.spyOn(PaymentService, 'createPaymentSession').mockRejectedValue(new Error('Booking not found'));

      const req = createReq({
        body: { bookingId: '123e4567-e89b-12d3-a456-426614174000' },
        user: { id: 'user-1' }
      });

      await paymentsController.createSession(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Booking not found');
    });
  });

  describe('handleWebhook', () => {
    it('returns 200 on successful webhook processing', async () => {
      const mockResult = {
        success: true,
        message: 'Payment completed successfully',
        paymentId: 'pay-123',
        status: 'SUCCEEDED'
      };
      jest.spyOn(PaymentService, 'handleWebhook').mockResolvedValue(mockResult);

      const req = createReq({
        body: { visaSessionId: 'visa_sess_123', status: 'succeeded' },
        headers: { 'x-visa-signature': 'sig_123' }
      });

      await paymentsController.handleWebhook(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.body.success).toBe(true);
      expect(res.body.status).toBe('SUCCEEDED');
    });

    it('returns 401 when webhook signature is rejected', async () => {
      const authError = new Error('Invalid webhook signature');
      authError.statusCode = 401;
      jest.spyOn(PaymentService, 'handleWebhook').mockRejectedValue(authError);

      const req = createReq({
        body: { visaSessionId: 'visa_sess_123', status: 'succeeded' },
        headers: { 'x-visa-signature': 'bad_sig' }
      });

      await paymentsController.handleWebhook(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Invalid webhook signature');
    });
  });

  describe('getPaymentStatus', () => {
    it('returns 200 with payment status from DB', async () => {
      const mockStatus = {
        id: 'pay-123',
        bookingId: 'booking-1',
        status: 'SUCCEEDED',
        amount: 250,
        currency: 'SAR'
      };
      jest.spyOn(PaymentService, 'getPaymentStatus').mockResolvedValue(mockStatus);

      const req = createReq({
        params: { paymentId: 'pay-123' }
      });

      await paymentsController.getPaymentStatus(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.body.success).toBe(true);
      expect(res.body.payment.status).toBe('SUCCEEDED');
    });

    it('returns 404 when payment does not exist in DB', async () => {
      jest.spyOn(PaymentService, 'getPaymentStatus').mockResolvedValue(null);

      const req = createReq({
        params: { paymentId: 'missing-pay' }
      });

      await paymentsController.getPaymentStatus(req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.body.success).toBe(false);
    });
  });

  describe('getPaymentByBooking', () => {
    it('returns 200 with payment details when found', async () => {
      const payment = { id: 'pay-1', bookingId: 'booking-1', status: 'SUCCEEDED' };
      jest.spyOn(PaymentService, 'getPaymentByBooking').mockResolvedValue(payment);

      const req = createReq({ params: { bookingId: 'booking-1' } });
      await paymentsController.getPaymentByBooking(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.body.success).toBe(true);
      expect(res.body.payment).toBe(payment);
    });

    it('returns 404 when booking has no payment record', async () => {
      jest.spyOn(PaymentService, 'getPaymentByBooking').mockResolvedValue(null);

      const req = createReq({ params: { bookingId: 'booking-1' } });
      await paymentsController.getPaymentByBooking(req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.body.success).toBe(false);
    });
  });
});
