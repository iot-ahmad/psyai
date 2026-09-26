const prisma = require('../config/db');
const WhatsappService = require('../services/whatsappService');
const AuditService = require('../services/auditService');

/**
 * Helper: Find specialist record associated with the authenticated user
 */
async function getSpecialistForUser(user) {
  // First attempt: match by userId
  let spec = await prisma.specialist.findFirst({
    where: { userId: user.id }
  });

  // Second attempt: match by email or name if userId wasn't linked yet
  if (!spec && user.email) {
    spec = await prisma.specialist.findFirst({
      where: {
        OR: [
          { name: { contains: user.firstName } },
          { name: `${user.firstName} ${user.lastName}` }
        ]
      }
    });

    if (spec && !spec.userId) {
      await prisma.specialist.update({
        where: { id: spec.id },
        data: { userId: user.id }
      });
    }
  }

  // Fallback for demo/dev: if specialist user exists, link to first available specialist
  if (!spec && user.role === 'specialist') {
    spec = await prisma.specialist.findFirst();
    if (spec) {
      await prisma.specialist.update({
        where: { id: spec.id },
        data: { userId: user.id }
      });
    }
  }

  return spec;
}

/**
 * GET /api/specialist/profile
 * Returns the logged-in specialist's profile
 */
async function getProfile(req, res, next) {
  try {
    const spec = await getSpecialistForUser(req.user);
    if (!spec) {
      return res.status(404).json({ success: false, message: 'ملف الأخصائي غير مسجل بعد' });
    }

    res.status(200).json({
      success: true,
      specialist: spec
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/specialist/bookings
 * Get bookings assigned ONLY to this specialist
 * Section 6: Specialists never receive primary user PII (phone/email redacted)
 */
async function getMyBookings(req, res, next) {
  try {
    const spec = await getSpecialistForUser(req.user);
    if (!spec) {
      return res.status(200).json({ success: true, bookings: [] });
    }

    const bookings = await prisma.booking.findMany({
      where: { specialistId: spec.id },
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            gender: true,
            condition: true
          }
        },
        payment: {
          select: {
            id: true,
            amount: true,
            status: true,
            transactionRef: true
          }
        }
      }
    });

    await AuditService.log({
      req,
      actorId: req.user.id,
      actorRole: req.user.role,
      action: 'SPECIALIST_VIEW_BOOKINGS',
      result: 'SUCCESS',
      metadata: { specialistId: spec.id, count: bookings.length }
    });

    res.status(200).json({
      success: true,
      count: bookings.length,
      bookings
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/specialist/bookings/:id/confirm
 * Specialist confirms a booking
 */
async function confirmBooking(req, res, next) {
  try {
    const { id } = req.params;
    const spec = await getSpecialistForUser(req.user);

    const booking = await prisma.booking.findUnique({
      where: { id },
      include: { user: true }
    });

    if (!booking) {
      return res.status(404).json({ success: false, message: 'الحجز غير موجود' });
    }

    if (spec && booking.specialistId !== spec.id && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'غير مصرح لك بتعديل هذا الحجز' });
    }

    const updated = await prisma.booking.update({
      where: { id },
      data: {
        status: 'scheduled',
        confirmedAt: new Date()
      }
    });

    res.status(200).json({
      success: true,
      message: 'تم تأكيد موعد الجلسة بنجاح',
      booking: updated
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/specialist/bookings/:id/send-link
 * Specialist adds meeting link and sends WhatsApp notification to patient
 */
async function sendMeetingLink(req, res, next) {
  try {
    const { id } = req.params;
    const { meetingLink } = req.body;

    if (!meetingLink || !meetingLink.trim()) {
      return res.status(400).json({ success: false, message: 'يرجى إدخال رابط الاجتماع' });
    }

    const spec = await getSpecialistForUser(req.user);

    const booking = await prisma.booking.findUnique({
      where: { id },
      include: { user: true, specialist: true }
    });

    if (!booking) {
      return res.status(404).json({ success: false, message: 'الحجز غير موجود' });
    }

    if (spec && booking.specialistId !== spec.id && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'غير مصرح لك بإدارة هذا الحجز' });
    }

    const updated = await prisma.booking.update({
      where: { id },
      data: {
        meetingLink: meetingLink.trim(),
        status: 'scheduled'
      }
    });

    // Patient access URL through the platform
    const host = req.get('host') || 'localhost:5000';
    const protocol = req.protocol || 'http';
    const platformSessionUrl = `${protocol}://${host}/session.html?id=${booking.id}`;

    // Send WhatsApp notification
    const patientName = `${booking.user.firstName} ${booking.user.lastName}`.trim();
    const specName = booking.specialist.name;
    const phone = booking.user.phone;

    await WhatsappService.sendSessionStartNotification(phone, patientName, specName, platformSessionUrl);

    res.status(200).json({
      success: true,
      message: 'تم حفظ رابط الاجتماع وإرسال إشعار WhatsApp للمريض بنجاح',
      booking: updated,
      sessionUrl: platformSessionUrl
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/specialist/session/:id
 * Public / Patient endpoint to retrieve session details and access the meeting
 */
async function getSessionDetails(req, res, next) {
  try {
    const { id } = req.params;

    const booking = await prisma.booking.findUnique({
      where: { id },
      include: {
        specialist: {
          select: {
            id: true,
            name: true,
            title: true,
            specialty: true,
            avatar: true
          }
        },
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true
          }
        }
      }
    });

    if (!booking) {
      return res.status(404).json({ success: false, message: 'الجلسة غير موجودة' });
    }

    res.status(200).json({
      success: true,
      session: {
        id: booking.id,
        sessionTime: booking.sessionTime,
        status: booking.status,
        meetingLink: booking.meetingLink,
        specialist: booking.specialist,
        patientName: `${booking.user.firstName} ${booking.user.lastName}`.trim()
      }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/specialist/articles
 * Publish an article to the blog (saves to DB)
 */
async function publishArticle(req, res, next) {
  try {
    const { title, lead, content, category, categorySlug, takeaways, readTime } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, message: 'عنوان المقال مطلوب' });
    }
    if (!content || !content.trim()) {
      return res.status(400).json({ success: false, message: 'محتوى المقال مطلوب' });
    }

    const spec = await getSpecialistForUser(req.user);
    const authorName = spec ? spec.name : `${req.user.firstName} ${req.user.lastName}`;
    const authorTitle = spec ? spec.title : 'أخصائي نفسي معتمد في PsyAI';

    const article = await prisma.article.create({
      data: {
        title: title.trim(),
        lead: lead ? lead.trim() : '',
        content: content.trim(),
        authorName,
        authorTitle,
        category: category || 'الصحة النفسية',
        categorySlug: categorySlug || 'general',
        takeaways: Array.isArray(takeaways) ? JSON.stringify(takeaways) : (takeaways || '[]'),
        readTime: readTime || '5 دقائق قراءة',
        specialistId: spec ? spec.id : null,
        status: 'published'
      }
    });

    res.status(201).json({
      success: true,
      message: 'تم نشر المقال في المدونة بنجاح',
      article
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/articles
 * Public endpoint - get all published articles
 */
async function getArticles(req, res, next) {
  try {
    const { category, limit = 20, page = 1 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = { status: 'published' };
    if (category && category !== 'all') {
      where.categorySlug = category;
    }

    const [articles, total] = await Promise.all([
      prisma.article.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: parseInt(limit),
        skip
      }),
      prisma.article.count({ where })
    ]);

    // Parse takeaways JSON for each article
    const parsed = articles.map(a => ({
      ...a,
      takeaways: (() => { try { return JSON.parse(a.takeaways || '[]'); } catch { return []; } })()
    }));

    res.status(200).json({
      success: true,
      articles: parsed,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit))
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/articles/:id
 * Public endpoint - get single article
 */
async function getArticleById(req, res, next) {
  try {
    const article = await prisma.article.findUnique({ where: { id: req.params.id } });
    if (!article) {
      return res.status(404).json({ success: false, message: 'المقال غير موجود' });
    }
    res.status(200).json({
      success: true,
      article: {
        ...article,
        takeaways: (() => { try { return JSON.parse(article.takeaways || '[]'); } catch { return []; } })()
      }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/specialist/my-articles
 * Get articles published by this specialist
 */
async function getMyArticles(req, res, next) {
  try {
    const spec = await getSpecialistForUser(req.user);
    const where = spec ? { specialistId: spec.id } : { status: 'published' };
    const articles = await prisma.article.findMany({
      where,
      orderBy: { createdAt: 'desc' }
    });
    res.status(200).json({
      success: true,
      articles: articles.map(a => ({
        ...a,
        takeaways: (() => { try { return JSON.parse(a.takeaways || '[]'); } catch { return []; } })()
      }))
    });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/specialist/articles/:id
 * Delete an article
 */
async function deleteArticle(req, res, next) {
  try {
    const spec = await getSpecialistForUser(req.user);
    const article = await prisma.article.findUnique({ where: { id: req.params.id } });
    if (!article) {
      return res.status(404).json({ success: false, message: 'المقال غير موجود' });
    }
    if (spec && article.specialistId && article.specialistId !== spec.id && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'ليس لديك صلاحية لحذف هذا المقال' });
    }
    await prisma.article.delete({ where: { id: req.params.id } });
    res.status(200).json({ success: true, message: 'تم حذف المقال بنجاح' });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getProfile,
  getMyBookings,
  confirmBooking,
  sendMeetingLink,
  getSessionDetails,
  publishArticle,
  getMyArticles,
  deleteArticle,
  getArticles,
  getArticleById
};

