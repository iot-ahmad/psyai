const prisma = require('../config/db');

/**
 * GET /api/specialists
 * List all specialists with filters
 */
async function getSpecialists(req, res, next) {
  try {
    const { category, gender, search, page: rawPage, limit: rawLimit } = req.query;

    const where = { isAvailable: true };

    if (gender && gender !== 'all' && gender !== 'any' && gender !== 'الجميع') {
      const gNorm = (gender === 'ذكر' || gender === 'male') ? 'male' : (gender === 'أنثى' || gender === 'female') ? 'female' : gender;
      where.gender = gNorm;
    }

    if (category) {
      where.specialty = { contains: category };
    }

    if (search) {
      where.OR = [
        { name: { contains: search } },
        { title: { contains: search } },
        { specialty: { contains: search } }
      ];
    }

    const page = rawPage ? Math.max(1, parseInt(rawPage, 10) || 1) : null;
    const limit = rawLimit ? Math.min(100, Math.max(1, parseInt(rawLimit, 10) || 20)) : null;
    const skip = (page && limit) ? (page - 1) * limit : undefined;
    const take = limit || undefined;

    // Parallel execution for total count and selective column projection
    const [total, specialists] = await Promise.all([
      prisma.specialist.count({ where }),
      prisma.specialist.findMany({
        where,
        select: {
          id: true,
          name: true,
          title: true,
          specialty: true,
          avatar: true,
          avatarUrl: true,
          price: true,
          rating: true,
          isFeatured: true,
          gender: true,
          expYears: true,
          isAvailable: true
        },
        orderBy: { rating: 'desc' },
        skip,
        take
      })
    ]);

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
      total,
      count: mapped.length,
      page: page || 1,
      totalPages: limit ? Math.ceil(total / limit) : 1,
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
