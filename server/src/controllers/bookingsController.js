const prisma = require('../config/db');

/**
 * POST /api/bookings
 * Create a new consultation booking
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

    const booking = await prisma.booking.create({
      data: {
        userId,
        specialistId,
        sessionTime,
        condition: condition || req.user.condition || null,
        notes: notes || null,
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
 * Get current user's bookings
 */
async function getMyBookings(req, res, next) {
  try {
    const userId = req.user.id;

    const bookings = await prisma.booking.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        specialist: {
          select: { id: true, name: true, title: true, avatar: true, price: true }
        },
        payment: true
      }
    });

    const formatted = bookings.map((b) => ({
      ...b,
      sessionLink: b.sessionUrl || `/session.html?id=${b.id}`,
      paymentStatus: b.payment ? b.payment.status : (b.status === 'confirmed' ? 'paid' : 'unpaid')
    }));

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
