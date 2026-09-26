const crypto = require('crypto');
const prisma = require('../config/db');

class PaymentService {
  /**
   * Process a Visa / Card payment for a booking
   */
  static async processCardPayment({ bookingId, userId, cardNumber, cardHolder, expiry, cvv }) {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: { specialist: true, user: true }
    });

    if (!booking) {
      throw new Error('جلسة الحجز غير موجودة');
    }

    if (booking.userId !== userId) {
      throw new Error('غير مصرح لك بسداد قيمة هذا الحجز');
    }

    if (booking.status === 'confirmed' || booking.status === 'completed') {
      const existingPayment = await prisma.payment.findUnique({ where: { bookingId } });
      if (existingPayment && existingPayment.status === 'paid') {
        return {
          success: true,
          message: 'هذا الحجز مسدد ومؤكد بالفعل',
          payment: existingPayment
        };
      }
    }

    const cleanCard = cardNumber.replace(/\D/g, '');
    const last4 = cleanCard.slice(-4);
    const amount = booking.specialist?.price || 250.0;
    const transactionRef = 'TXN_VISA_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex').toUpperCase();

    // Determine card brand
    let cardBrand = 'Visa';
    if (cleanCard.startsWith('5')) cardBrand = 'Mastercard';
    if (cleanCard.startsWith('4')) cardBrand = 'Visa';
    if (cleanCard.startsWith('6')) cardBrand = 'Mada';

    // Simulate card validation check
    if (cleanCard.length < 13 || cleanCard.length > 19) {
      throw new Error('رقم البطاقة غير صحيح أو غير مكتمل');
    }

    // In a production setup, this would call Stripe / Moyasar / Tap API
    console.log('\n' + '='.repeat(60));
    console.log(`[PAYMENT GATEWAY - VISA CARD PROCESSOR]`);
    console.log(`- Card Holder: ${cardHolder}`);
    console.log(`- Brand: ${cardBrand} (Ending in **** ${last4})`);
    console.log(`- Amount: ${amount} SAR`);
    console.log(`- Transaction Ref: ${transactionRef}`);
    console.log(`- Booking ID: ${bookingId}`);
    console.log(`- Status: APPROVED`);
    console.log('='.repeat(60) + '\n');

    // Create payment in DB
    const payment = await prisma.payment.create({
      data: {
        bookingId,
        userId,
        amount,
        currency: 'SAR',
        status: 'paid',
        paymentMethod: cardBrand.toUpperCase() + '_CARD',
        transactionRef,
        cardLast4: last4,
        cardBrand
      }
    });

    // Update booking status to confirmed
    await prisma.booking.update({
      where: { id: bookingId },
      data: { status: 'confirmed' }
    });

    return {
      success: true,
      message: 'تم سداد قيمة الجلسة بنجاح وتأكيد موعد الاستشارة!',
      payment: {
        id: payment.id,
        transactionRef: payment.transactionRef,
        amount: payment.amount,
        currency: payment.currency,
        cardBrand: payment.cardBrand,
        cardLast4: payment.cardLast4,
        createdAt: payment.createdAt
      }
    };
  }

  /**
   * Get payment details by transactionRef or bookingId
   */
  static async getPaymentByBooking(bookingId) {
    return prisma.payment.findUnique({
      where: { bookingId },
      include: {
        booking: {
          include: { specialist: true }
        }
      }
    });
  }
}

module.exports = PaymentService;
