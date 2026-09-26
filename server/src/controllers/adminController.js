const bcrypt = require('bcryptjs');
const prisma = require('../config/db');

/**
 * GET /api/admin/dashboard
 * Return overview statistics for admin dashboard
 */
async function getDashboard(req, res, next) {
  try {
    const totalUsers = await prisma.user.count({ where: { role: 'user' } });
    const totalSpecialists = await prisma.specialist.count({ where: { status: 'active' } });
    const activeCompanies = await prisma.company.count({ where: { status: 'active' } });
    const pendingBookings = await prisma.booking.count({ where: { status: 'pending' } });
    const totalBookings = await prisma.booking.count();

    const paymentsSum = await prisma.payment.aggregate({
      where: { status: 'paid' },
      _sum: { amount: true }
    });
    const totalRevenue = paymentsSum._sum.amount || 0;

    // Recent 6 bookings
    const bookings = await prisma.booking.findMany({
      take: 6,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: { firstName: true, lastName: true, email: true, phone: true }
        },
        specialist: {
          select: { name: true, title: true }
        }
      }
    });

    const recentBookings = bookings.map((b) => ({
      id: b.id,
      user: {
        first_name: b.user.firstName,
        last_name: b.user.lastName,
        email: b.user.email
      },
      specialist: {
        user: {
          first_name: b.specialist.name.replace(/^د\.\s*/, ''),
          last_name: ''
        }
      },
      start_time: b.sessionTime,
      created_at: b.createdAt,
      status: b.status
    }));

    res.status(200).json({
      success: true,
      stats: {
        users: totalUsers,
        month: Math.ceil(totalUsers * 0.4),
        specialists: totalSpecialists,
        companies: activeCompanies,
        pending: pendingBookings,
        total: totalBookings,
        revenue: totalRevenue
      },
      recent_bookings: recentBookings
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/admin/users
 */
async function getUsers(req, res, next) {
  try {
    const rawUsers = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' }
    });

    const users = rawUsers.map((u) => ({
      id: u.id,
      first_name: u.firstName,
      last_name: u.lastName,
      email: u.email,
      phone: u.phone,
      role: { name: u.role },
      status: u.status,
      created_at: u.createdAt
    }));

    res.status(200).json({ success: true, users });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/admin/users
 */
async function createUser(req, res, next) {
  try {
    const { first_name, last_name, email, phone, password } = req.body;
    const passwordHash = await bcrypt.hash(password || 'PsyAI@2025', 10);

    const user = await prisma.user.create({
      data: {
        firstName: first_name,
        lastName: last_name,
        email: email.toLowerCase().trim(),
        phone: phone || '',
        gender: 'male',
        passwordHash,
        role: 'user',
        status: 'active',
        isVerified: true
      }
    });

    res.status(201).json({ success: true, user });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/admin/users/:id/status
 */
async function updateUserStatus(req, res, next) {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const user = await prisma.user.update({
      where: { id },
      data: { status }
    });

    res.status(200).json({ success: true, user });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/admin/users/:id
 */
async function deleteUser(req, res, next) {
  try {
    const { id } = req.params;
    await prisma.user.delete({ where: { id } });
    res.status(200).json({ success: true, message: 'تم حذف المستخدم بنجاح' });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/admin/specialists
 */
async function getSpecialists(req, res, next) {
  try {
    const specialists = await prisma.specialist.findMany({
      orderBy: { createdAt: 'desc' }
    });

    const mapped = specialists.map((s) => ({
      id: s.id,
      name: s.name,
      title: s.title,
      specialization: s.specialty,
      years_experience: s.expYears,
      rating: s.rating,
      price: s.price,
      status: s.status,
      created_at: s.createdAt
    }));

    res.status(200).json({ success: true, specialists: mapped });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/admin/specialists
 */
async function createSpecialist(req, res, next) {
  try {
    const { name, title, specialization, years_experience, price, gender } = req.body;

    const spec = await prisma.specialist.create({
      data: {
        name,
        title: title || 'أخصائي معتمد',
        specialty: specialization || 'استشارات نفسية عامة',
        bio: 'أخصائي معتمد لدى منصة PsyAI لدعم الرفاه النفسي والصحة النفسية.',
        expYears: parseInt(years_experience) || 5,
        price: parseFloat(price) || 250,
        rating: 4.9,
        gender: gender || 'male',
        avatar: 'https://images.unsplash.com/photo-1622253692010-333f2da6031d?auto=format&fit=crop&q=80&w=400',
        status: 'active'
      }
    });

    res.status(201).json({ success: true, specialist: spec });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/admin/specialists/:id
 */
async function deleteSpecialist(req, res, next) {
  try {
    const { id } = req.params;
    await prisma.specialist.delete({ where: { id } });
    res.status(200).json({ success: true, message: 'تم حذف الأخصائي' });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/admin/bookings
 */
async function getBookings(req, res, next) {
  try {
    const bookings = await prisma.booking.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        user: true,
        specialist: true,
        payment: true
      }
    });

    const mapped = bookings.map((b) => ({
      id: b.id,
      user: {
        first_name: b.user.firstName,
        last_name: b.user.lastName,
        email: b.user.email,
        phone: b.user.phone
      },
      specialist: {
        name: b.specialist.name,
        title: b.specialist.title
      },
      start_time: b.sessionTime,
      created_at: b.createdAt,
      status: b.status,
      payment_status: b.payment ? b.payment.status : 'unpaid'
    }));

    res.status(200).json({ success: true, bookings: mapped });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/admin/bookings/:id/status
 */
async function updateBookingStatus(req, res, next) {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const booking = await prisma.booking.update({
      where: { id },
      data: { status }
    });

    res.status(200).json({ success: true, booking });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/admin/services
 */
async function getServices(req, res, next) {
  try {
    const services = await prisma.service.findMany();
    res.status(200).json({ success: true, services });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/admin/services
 */
async function createService(req, res, next) {
  try {
    const { name, slug, description, icon } = req.body;
    const service = await prisma.service.create({
      data: {
        name,
        slug: slug || 'svc-' + Date.now(),
        description: description || '',
        icon: icon || 'heart'
      }
    });
    res.status(201).json({ success: true, service });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/admin/companies
 */
async function getCompanies(req, res, next) {
  try {
    const companies = await prisma.company.findMany();
    res.status(200).json({ success: true, companies });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/admin/companies
 */
async function createCompany(req, res, next) {
  try {
    const { name, email, phone, employees_count } = req.body;
    const company = await prisma.company.create({
      data: {
        name,
        email,
        phone: phone || '',
        employeesCount: parseInt(employees_count) || 50
      }
    });
    res.status(201).json({ success: true, company });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getDashboard,
  getUsers,
  createUser,
  updateUserStatus,
  deleteUser,
  getSpecialists,
  createSpecialist,
  deleteSpecialist,
  getBookings,
  updateBookingStatus,
  getServices,
  createService,
  getCompanies,
  createCompany
};
