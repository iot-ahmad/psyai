const prisma = require('../config/db');
const EncryptionService = require('../services/encryptionService');
const { scheduleBookingReminders, cancelBookingReminders } = require('../services/reminderWorker');

/**
 * POST /api/bookings
 * Create a new consultation booking with double-booking prevention (serializable transaction),
 * and field-level encryption for condition & notes.
 */
async function createBooking(req, res, next) {
  try {
    const userId = req.user.id;
    const { specialistId, sessionTime, condition, notes } = req.body;

    // Validate sessionTime is a valid future datetime
    const parsedTime = new Date(sessionTime);
    if (isNaN(parsedTime.getTime())) {
      return res.status(400).json({ success: false, message: 'وقت الجلسة غير صالح' });
    }
    if (parsedTime <= new Date()) {
      return res.status(400).json({ success: false, message: 'لا يمكن حجز موعد في الماضي' });
    }

    // Verify specialist exists
    const specialist = await prisma.specialist.findUnique({
      where: { id: specialistId }
    });
    if (!specialist) {
      return res.status(404).json({ success: false, message: 'الأخصائي غير موجود' });
    }

    const encryptedCondition = EncryptionService.encryptField(condition || null);
    const encryptedNotes = EncryptionService.encryptField(notes || null);

    let booking;
    try {
      // Use a serializable transaction to atomically check then create,
      // preventing race-condition double bookings even under high concurrency.
      booking = await prisma.$transaction(
        async (tx) => {
          // Check for existing active booking at same (specialistId, sessionTime)
          const conflict = await tx.booking.findFirst({
            where: {
              specialistId,
              sessionTime: parsedTime,
              status: { in: ['pending', 'confirmed'] }
            }
          });

          if (conflict) {
            // Throw a typed error to be caught outside the transaction block
            const err = new Error('DOUBLE_BOOKING');
            err.code = 'DOUBLE_BOOKING';
            throw err;
          }

          return tx.booking.create({
            data: {
              userId,
              specialistId,
              sessionTime: parsedTime,
              conditionEncrypted: encryptedCondition,
              notes: encryptedNotes,
              status: 'pending'
            },
            include: {
              specialist: {
                select: { id: true, name: true, title: true, price: true, avatar: true }
              }
            }
          });
        },
        { isolationLevel: 'Serializable' }
      );
    } catch (txErr) {
      // Unique constraint violation (DB-level guard) or our explicit check
      if (txErr.code === 'DOUBLE_BOOKING' || txErr.code === 'P2002') {
        return res.status(409).json({
          success: false,
          message: 'هذا الموعد محجوز بالفعل لدى الأخصائي. يرجى اختيار وقت آخر.'
        });
      }
      throw txErr;
    }

    // Schedule reminders asynchronously (non-blocking)
    scheduleBookingReminders(booking.id, booking.sessionTime).catch((err) =>
      console.error(`[REMINDER] Failed to schedule reminders for booking ${booking.id}:`, err.message)
    );

    res.status(201).json({
      success: true,
      message: 'تم حجز الموعد بنجاح! يمكنك الآن المتابعة لسداد القيمة وتأكيد الجلسة.',
      booking: {
        id: booking.id,
        sessionTime: booking.sessionTime,
        status: booking.status,
        specialist: booking.specialist,
        price: booking.specialist.price,
        createdAt: booking.createdAt
      }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/bookings/my
 * Get current user's bookings (decrypted for owner)
 */
async function getMyBookings(req, res, next) {
  try {
    const userId = req.user.id;

    const rawBookings = await prisma.booking.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        specialist: {
          select: { id: true, name: true, title: true, avatar: true, price: true }
        },
        payment: true
      }
    });

    const formatted = rawBookings.map((b) => {
      const decrypted = EncryptionService.decryptBookingFields(b);
      return {
        ...decrypted,
        sessionLink: decrypted.sessionUrl || `/session.html?id=${decrypted.id}`,
        paymentStatus: decrypted.payment ? decrypted.payment.status : (decrypted.status === 'confirmed' ? 'paid' : 'unpaid')
      };
    });

    res.status(200).json({
      success: true,
      count: formatted.length,
      bookings: formatted
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/bookings/:id/cancel
 * Cancel a booking
 */
async function cancelBooking(req, res, next) {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const booking = await prisma.booking.findUnique({ where: { id } });
    if (!booking) {
      return res.status(404).json({ success: false, message: 'الحجز غير موجود' });
    }

    if (booking.userId !== userId && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'غير مصرح لك بإلغاء هذا الحجز' });
    }

    const updated = await prisma.booking.update({
      where: { id },
      data: { status: 'cancelled' }
    });

    // Cancel any pending reminders asynchronously (non-blocking)
    cancelBookingReminders(id).catch((err) =>
      console.error(`[REMINDER] Failed to cancel reminders for booking ${id}:`, err.message)
    );

    res.status(200).json({
      success: true,
      message: 'تم إلغاء موعد الجلسة بنجاح',
      booking: updated
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createBooking,
  getMyBookings,
  cancelBooking
};

