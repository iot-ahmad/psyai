const crypto = require('crypto');
const prisma = require('../config/db');
const AuditService = require('./auditService');
const WhatsAppService = require('./whatsappService');
const EncryptionService = require('./encryptionService');
const { scheduleBookingReminders } = require('./reminderWorker');

class PaymentService {
  /**
   * Generates a cryptographically strong idempotency key
   */
  static generateIdempotencyKey(seed = '') {
    const raw = `${seed}_${Date.now()}_${crypto.randomBytes(16).toString('hex')}`;
    return crypto.createHash('sha256').update(raw).digest('hex');
  }

  /**
   * 1. Create a Visa Hosted Checkout Session
   * POST /api/payments/create-session
   *
   * @param {object} params
   * @param {string} [params.bookingId]
   * @param {string} [params.orderId]
   * @param {number} [params.amount]
   * @param {string} [params.currency]
   * @param {object} [params.user]
   * @param {string} [params.ip]
   */
  static async createPaymentSession({ bookingId, orderId, amount, currency = 'SAR', user, ip }) {
    const targetBookingId = bookingId || orderId;

    const booking = await prisma.booking.findUnique({
      where: { id: targetBookingId },
      include: { specialist: true, user: true }
    });

    if (!booking) {
      throw new Error('جلسة الحجز غير موجودة');
    }

    if (user && booking.userId !== user.id && user.role !== 'admin') {
      throw new Error('غير مصرح لك بإنشاء جلسة دفع لهذا الحجز');
    }

    // Check if there is already a successful payment for this booking
    const existingPayment = await prisma.payment.findUnique({
      where: { bookingId: targetBookingId }
    });

    if (existingPayment && existingPayment.status === 'SUCCEEDED') {
      return {
        success: true,
        message: 'تم سداد هذا الحجز مسبقًا بنجاح',
        alreadyPaid: true,
        paymentId: existingPayment.id,
        status: existingPayment.status
      };
    }

    // Determine finalized amount
    const sessionAmount = amount ? parseFloat(amount) : (booking.specialist?.price || 250.0);
    const sessionCurrency = currency || 'SAR';
    const idempotencyKey = this.generateIdempotencyKey(targetBookingId);

    // Call Visa Hosted Checkout Gateway (Simulator / Real Visa API)
    const gateway = process.env.PAYMENT_GATEWAY || 'simulator';
    const visaSessionId = `visa_sess_${crypto.randomUUID()}`;
    const baseUrl = process.env.VISA_HOSTED_CHECKOUT_URL || 'https://secure.checkout.visa.com/pay';
    const redirectUrl = `${baseUrl}/${visaSessionId}?amount=${sessionAmount}&currency=${sessionCurrency}&ref=${targetBookingId}`;

    // Upsert or create Payment record in DB with PENDING status
    let payment;
    if (existingPayment) {
      payment = await prisma.payment.update({
        where: { id: existingPayment.id },
        data: {
          amount: sessionAmount,
          currency: sessionCurrency,
          status: 'PENDING',
          visaSessionId,
          idempotencyKey
        }
      });
    } else {
      payment = await prisma.payment.create({
        data: {
          bookingId: targetBookingId,
          userId: user?.id || booking.userId,
          amount: sessionAmount,
          currency: sessionCurrency,
          status: 'PENDING',
          visaSessionId,
          idempotencyKey
        }
      });
    }

    // Audit Logging: Record payment session creation attempt (Zero sensitive card data)
    await AuditService.log({
      actorId: user?.id || booking.userId,
      actorRole: user?.role || 'user',
      action: 'PAYMENT_SESSION_CREATED',
      resourceId: payment.id,
      result: 'SUCCESS',
      metadata: {
        paymentId: payment.id,
        bookingId: targetBookingId,
        amount: sessionAmount,
        currency: sessionCurrency,
        visaSessionId
      }
    });

    return {
      success: true,
      redirectUrl,
      paymentId: payment.id,
      visaSessionId
    };
  }

  /**
   * Verify Visa Webhook Signature using HMAC-SHA256
   *
   * @param {string|object} payload
   * @param {string} signature
   * @returns {boolean}
   */
  static verifyWebhookSignature(payload, signature) {
    if (!signature) {
      return false;
    }

    const secret = process.env.VISA_WEBHOOK_SECRET || process.env.PAYMENT_WEBHOOK_SECRET || 'whsec_psyai_demo';
    const rawPayload = typeof payload === 'string' ? payload : JSON.stringify(payload);

    try {
      const expectedHmac = crypto.createHmac('sha256', secret).update(rawPayload).digest('hex');
      const cleanSignature = signature.replace(/^sha256=/, '').trim();

      const expectedBuf = Buffer.from(expectedHmac, 'utf8');
      const sigBuf = Buffer.from(cleanSignature, 'utf8');

      if (expectedBuf.length !== sigBuf.length) {
        return false;
      }

      return crypto.timingSafeEqual(expectedBuf, sigBuf);
    } catch (err) {
      console.error('[SECURITY] Webhook signature verification error:', err.message);
      return false;
    }
  }

  /**
   * 2. Handle incoming Visa Webhook
   * POST /api/payments/webhook
   *
   * @param {object} params
   * @param {object|string} params.payload
   * @param {string} [params.rawBody]
   * @param {string} params.signature
   * @param {string} [params.ip]
   */
  static async handleWebhook({ payload, rawBody, signature, ip }) {
    // Step 1: Signature Verification (Strict rejection on mismatch)
    const payloadForVerification = rawBody || (typeof payload === 'string' ? payload : JSON.stringify(payload));
    const isSignatureValid = this.verifyWebhookSignature(payloadForVerification, signature);

    if (!isSignatureValid) {
      await AuditService.log({
        actorId: 'visa_webhook',
        actorRole: 'gateway',
        action: 'PAYMENT_WEBHOOK_INVALID_SIGNATURE',
        result: 'DENIED',
        metadata: {
          ip,
          receivedSignature: signature ? '[SIGNATURE_MISMATCH]' : '[SIGNATURE_MISSING]'
        }
      });

      const error = new Error('Invalid webhook signature');
      error.statusCode = 401;
      throw error;
    }

    // Step 2: Read payload data
    const data = typeof payload === 'string' ? JSON.parse(payload) : payload;
    const visaSessionId = data.visaSessionId || data.sessionId || data.data?.visaSessionId || data.data?.sessionId;
    const rawStatus = (data.status || data.event || data.data?.status || '').toString().toLowerCase();
    const transactionId = data.transactionId || data.data?.transactionId || `txn_visa_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    if (!visaSessionId) {
      const error = new Error('Missing visaSessionId in webhook payload');
      error.statusCode = 400;
      throw error;
    }

    // Step 3: Find local Payment record
    const payment = await prisma.payment.findUnique({
      where: { visaSessionId },
      include: {
        booking: {
          include: {
            user: true,
            specialist: true
          }
        }
      }
    });

    if (!payment) {
      await AuditService.log({
        actorId: 'visa_webhook',
        actorRole: 'gateway',
        action: 'PAYMENT_WEBHOOK_ORPHAN_SESSION',
        result: 'FAILED',
        metadata: { visaSessionId, ip }
      });

      const error = new Error(`Payment session not found: ${visaSessionId}`);
      error.statusCode = 404;
      throw error;
    }

    // Step 4: Idempotency check - if status is already SUCCEEDED or FAILED, return 200 without reprocessing
    if (payment.status !== 'PENDING') {
      await AuditService.log({
        actorId: 'visa_webhook',
        actorRole: 'gateway',
        action: 'PAYMENT_WEBHOOK_DUPLICATE_IGNORED',
        resourceId: payment.id,
        result: 'SUCCESS',
        metadata: {
          paymentId: payment.id,
          currentStatus: payment.status,
          visaSessionId
        }
      });

      return {
        success: true,
        message: 'Webhook received and already processed (idempotent)',
        paymentId: payment.id,
        status: payment.status
      };
    }

    // Step 5: Update status in DB
    const isSuccess = rawStatus.includes('succeed') || rawStatus.includes('paid') || rawStatus === 'success';
    const newStatus = isSuccess ? 'SUCCEEDED' : 'FAILED';

    const updatedPayment = await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: newStatus,
        transactionId
      }
    });

    // Step 6: Trigger downstream actions if succeeded
    if (isSuccess && payment.bookingId) {
      const updatedBooking = await prisma.booking.update({
        where: { id: payment.bookingId },
        data: {
          status: 'confirmed',
          confirmedAt: new Date()
        }
      });

      // Schedule reminders for the confirmed session
      const sessionTime = updatedBooking.sessionTime || payment.booking?.sessionTime;
      if (sessionTime) {
        scheduleBookingReminders(payment.bookingId, sessionTime).catch((err) =>
          console.error('[REMINDER] Error scheduling reminders after payment:', err.message)
        );
      }

      // Async WhatsApp notification (non-blocking)
      const rawPhone = EncryptionService.decryptField(payment.booking?.user?.phoneEncrypted) || payment.booking?.user?.phone;
      const patientFirstName = EncryptionService.decryptField(payment.booking?.user?.firstName) || payment.booking?.user?.firstName || '';
      const patientLastName = EncryptionService.decryptField(payment.booking?.user?.lastName) || payment.booking?.user?.lastName || '';
      const patientName = `${patientFirstName} ${patientLastName}`.trim() || 'العميل';
      const specName = payment.booking?.specialist?.name || 'الأخصائي';

      if (rawPhone) {
        WhatsAppService.sendSessionStartNotification(
          rawPhone,
          patientName,
          specName,
          `https://psyai.app/session/${payment.bookingId}`
        ).catch((err) => console.error('[WHATSAPP NOTIFICATION ERROR]:', err.message));
      }
    }

    // Audit Logging
    await AuditService.log({
      actorId: 'visa_webhook',
      actorRole: 'gateway',
      action: 'PAYMENT_WEBHOOK_PROCESSED',
      resourceId: updatedPayment.id,
      result: isSuccess ? 'SUCCESS' : 'FAILED',
      metadata: {
        paymentId: updatedPayment.id,
        bookingId: payment.bookingId,
        amount: updatedPayment.amount,
        status: newStatus,
        transactionId
      }
    });

    return {
      success: true,
      message: isSuccess ? 'Payment completed successfully' : 'Payment marked as failed',
      paymentId: updatedPayment.id,
      status: newStatus,
      transactionId
    };
  }

  /**
   * 3. Get payment status by paymentId
   * GET /api/payments/:paymentId/status
   *
   * @param {string} paymentId
   */
  static async getPaymentStatus(paymentId) {
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        booking: {
          select: { userId: true }
        }
      }
    });

    if (!payment) {
      return null;
    }

    return {
      id: payment.id,
      userId: payment.userId || payment.booking?.userId,
      bookingId: payment.bookingId,
      status: payment.status,
      amount: payment.amount,
      currency: payment.currency,
      transactionId: payment.transactionId,
      visaSessionId: payment.visaSessionId,
      updatedAt: payment.updatedAt
    };
  }

  /**
   * Get payment details by bookingId
   *
   * @param {string} bookingId
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
