const PaymentService = require('../services/paymentService');

/**
 * POST /api/payments/create-session
 * Create a Visa Hosted Checkout session and get the redirect URL
 */
async function createSession(req, res, next) {
  try {
    const user = req.user;
    const { bookingId, orderId, amount, currency } = req.body || {};
    const ip = req.headers?.['x-forwarded-for'] || req.socket?.remoteAddress || req.ip || '127.0.0.1';

    const result = await PaymentService.createPaymentSession({
      bookingId,
      orderId,
      amount,
      currency,
      user,
      ip
    });

    res.status(200).json({
      success: true,
      redirectUrl: result.redirectUrl,
      paymentId: result.paymentId,
      visaSessionId: result.visaSessionId,
      alreadyPaid: result.alreadyPaid,
      message: result.message
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.message || 'فشل إنشاء جلسة الدفع'
    });
  }
}

/**
 * POST /api/payments/webhook
 * Receive Visa Hosted Checkout asynchronous event notifications
 * (Public endpoint outside normal user auth guard; signature verification enforced)
 */
async function handleWebhook(req, res, next) {
  try {
    const signature =
      req.headers?.['x-visa-signature'] ||
      req.headers?.['x-signature'] ||
      req.headers?.['signature'] ||
      req.headers?.['authorization'];

    const ip = req.headers?.['x-forwarded-for'] || req.socket?.remoteAddress || req.ip || '127.0.0.1';

    const result = await PaymentService.handleWebhook({
      payload: req.body,
      rawBody: req.rawBody,
      signature,
      ip
    });

    res.status(200).json(result);
  } catch (err) {
    const statusCode = err.statusCode || (err.message?.toLowerCase().includes('signature') ? 401 : 400);
    res.status(statusCode).json({
      success: false,
      message: err.message || 'فشلت معالجة إشعار الدفع'
    });
  }
}

/**
 * GET /api/payments/:paymentId/status
 * Get the payment status strictly from the database
 */
async function getPaymentStatus(req, res, next) {
  try {
    const { paymentId } = req.params;
    const payment = await PaymentService.getPaymentStatus(paymentId);

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'سجل الدفع غير موجود'
      });
    }

    res.status(200).json({
      success: true,
      payment
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/payments/booking/:bookingId
 * Get payment record by bookingId
 */
async function getPaymentByBooking(req, res, next) {
  try {
    const { bookingId } = req.params;
    const payment = await PaymentService.getPaymentByBooking(bookingId);

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'لا توجد تفاصيل دفع لهذا الحجز'
      });
    }

    res.status(200).json({
      success: true,
      payment
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createSession,
  handleWebhook,
  getPaymentStatus,
  getPaymentByBooking
};
