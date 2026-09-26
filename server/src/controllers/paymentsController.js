const PaymentService = require('../services/paymentService');

/**
 * POST /api/payments/pay-visa
 * Process a Visa / Card payment for a session
 */
async function payWithVisa(req, res, next) {
  try {
    const userId = req.user.id;
    const { bookingId, cardNumber, cardHolder, expiry, cvv } = req.body;

    const result = await PaymentService.processCardPayment({
      bookingId,
      userId,
      cardNumber,
      cardHolder,
      expiry,
      cvv
    });

    res.status(200).json(result);
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.message || 'فشلت عملية الدفع بالبطاقة'
    });
  }
}

/**
 * GET /api/payments/booking/:bookingId
 * Get payment status for a specific booking
 */
async function getPaymentByBooking(req, res, next) {
  try {
    const { bookingId } = req.params;
    const payment = await PaymentService.getPaymentByBooking(bookingId);

    if (!payment) {
      return res.status(404).json({ success: false, message: 'لا توجد تفاصيل دفع لهذا الحجز' });
    }

    res.status(200).json({ success: true, payment });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  payWithVisa,
  getPaymentByBooking
};
