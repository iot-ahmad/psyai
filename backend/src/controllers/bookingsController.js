const prisma = require('../config/db');
const EncryptionService = require('../services/encryptionService');

/**
 * POST /api/bookings
 * Create a new consultation booking with field-level encryption for condition & notes
 */
async function createBooking(req, res, next) {
  try {
    const userId = req.user.id;
    const { specialistId, sessionTime, condition, notes } = req.body;

    // Verify specialist exists
    const specialist = await prisma.specialist.findUnique({
      where: { id: specialistId }
    });

    if (!specialist) {
      return res.status(404).json({ success: false, message: 'الأخصائي غير موجود' });
    }

    const rawCondition = condition || req.user.condition || null;
    const rawNotes = notes || null;

    const encryptedCondition = EncryptionService.encryptField(rawCondition);
    const encryptedNotes = EncryptionService.encryptField(rawNotes);

    const booking = await prisma.booking.create({
      data: {
        userId,
        specialistId,
        sessionTime,
        condition: encryptedCondition,
        notes: encryptedNotes,
        status: 'pending' // pending until paid or confirmed
      },
      include: {
        specialist: {
          select: { id: true, name: true, title: true, price: true, avatar: true }
        }
      }
    });

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
