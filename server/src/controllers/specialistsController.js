const prisma = require('../config/db');

/**
 * GET /api/specialists
 * List all specialists with filters
 */
async function getSpecialists(req, res, next) {
  try {
    const { category, gender, search } = req.query;

    const where = { status: 'active' };

    if (gender && gender !== 'all' && gender !== 'any') {
      where.gender = gender;
    }

    if (search) {
      where.OR = [
        { name: { contains: search } },
        { title: { contains: search } },
        { specialty: { contains: search } }
      ];
    }

    const specialists = await prisma.specialist.findMany({
      where,
      orderBy: { rating: 'desc' }
    });

    // Provide default time slots for frontend booking
    const defaultSlots = [
      { id: 's1', time: 'اليوم 04:00 م', available: true },
      { id: 's2', time: 'اليوم 05:30 م', available: true },
      { id: 's3', time: 'غداً 11:00 ص', available: true },
      { id: 's4', time: 'غداً 06:00 م', available: true }
    ];

    const mapped = specialists.map((s) => ({
      ...s,
      experience_years: s.expYears,
      slots: defaultSlots
    }));

    res.status(200).json({
      success: true,
      count: mapped.length,
      specialists: mapped
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/specialists/:id
 * Get single specialist by ID
 */
async function getSpecialistById(req, res, next) {
  try {
    const { id } = req.params;
    const specialist = await prisma.specialist.findUnique({
      where: { id }
    });

    if (!specialist) {
      return res.status(404).json({ success: false, message: 'الأخصائي غير موجود' });
    }

    const defaultSlots = [
      { id: 's1', time: 'اليوم 04:00 م', available: true },
      { id: 's2', time: 'اليوم 05:30 م', available: true },
      { id: 's3', time: 'غداً 11:00 ص', available: true },
      { id: 's4', time: 'غداً 06:00 م', available: true }
    ];

    res.status(200).json({
      success: true,
      specialist: {
        ...specialist,
        experience_years: specialist.expYears,
        slots: defaultSlots
      }
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getSpecialists,
  getSpecialistById
};
