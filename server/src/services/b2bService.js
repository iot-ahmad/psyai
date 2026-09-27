const prisma = require('../config/db');
const AuditService = require('./auditService');

class B2bService {
  /**
   * Submit a new B2B / Corporate partnership request (Application)
   * Enforces 3 layers of anti-abuse:
   * 1. No overlapping active 'pending' requests for the same user.
   * 2. Max 3 requests per 24 hours per user.
   * 3. 1-hour cooldown period after a rejection.
   */
  static async createRequest({ userId, companyName, companyPhone, companyEmail, employeesCount, user, ip }) {
    if (!userId) {
      const err = new Error('يجب تسجيل الدخول لتقديم طلب شركة');
      err.statusCode = 401;
      throw err;
    }

    // Rule 1: Check if user already has an active pending request
    const existingPending = await prisma.b2bRequest.findFirst({
      where: {
        userId,
        status: 'pending'
      }
    });

    if (existingPending) {
      const err = new Error('لديك طلب شراكة قيد المراجعة بالفعل. يرجى انتظار قرار الإدارة قبل تقديم طلب جديد.');
      err.statusCode = 400;
      throw err;
    }

    // Rule 2: Max 3 requests in the last 24 hours (Rate limiting)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const dailyCount = await prisma.b2bRequest.count({
      where: {
        userId,
        createdAt: { gte: oneDayAgo }
      }
    });

    if (dailyCount >= 3) {
      const err = new Error('تم تجاوز الحد الأقصى لتقديم طلبات الشركات (٣ طلبات خلال ٢٤ ساعة). يرجى المحاولة لاحقاً.');
      err.statusCode = 429;
      throw err;
    }

    // Rule 3: 1-hour cooldown period after a previous rejection
    const lastRejected = await prisma.b2bRequest.findFirst({
      where: {
        userId,
        status: 'rejected'
      },
      orderBy: { reviewedAt: 'desc' }
    });

    if (lastRejected && lastRejected.reviewedAt) {
      const hoursSinceRejection = (Date.now() - new Date(lastRejected.reviewedAt).getTime()) / (1000 * 60 * 60);
      if (hoursSinceRejection < 1) {
        const minutesRemaining = Math.max(1, Math.ceil(60 - hoursSinceRejection * 60));
        const err = new Error(`يرجى الانتظار ${minutesRemaining} دقيقة قبل إعادة تقديم الطلب بعد قرار الرفض السابق.`);
        err.statusCode = 400;
        throw err;
      }
    }

    // Create B2B application in DB
    const request = await prisma.b2bRequest.create({
      data: {
        userId,
        companyName,
        companyPhone,
        companyEmail,
        employeesCount: String(employeesCount).trim(),
        status: 'pending'
      }
    });

    // Audit log
    await AuditService.log({
      actorId: userId,
      actorRole: user?.role || 'user',
      action: 'B2B_REQUEST_CREATED',
      resourceId: request.id,
      result: 'SUCCESS',
      metadata: {
        companyName,
        companyEmail,
        employeesCount
      }
    });

    return {
      success: true,
      message: 'تم إرسال طلب اعتماد الشركة بنجاح وهو قيد المراجعة من قبل الإدارة',
      request
    };
  }

  /**
   * Get all B2B requests submitted by the logged-in user
   */
  static async getMyRequests(userId) {
    return prisma.b2bRequest.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' }
    });
  }

  /**
   * Get all B2B requests for Admin review (with status filter and pagination)
   */
  static async getAllRequests({ status, page = 1, limit = 50 } = {}) {
    const where = {};
    if (status && ['pending', 'approved', 'rejected'].includes(status)) {
      where.status = status;
    }

    const skip = (Math.max(1, page) - 1) * limit;

    const [total, requests] = await Promise.all([
      prisma.b2bRequest.count({ where }),
      prisma.b2bRequest.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true
            }
          },
          reviewer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit
      })
    ]);

    return {
      total,
      page: Math.max(1, page),
      limit,
      totalPages: Math.ceil(total / limit) || 1,
      requests
    };
  }

  /**
   * Admin review (approve or reject) a B2B application
   */
  static async reviewRequest({ requestId, adminId, status, reviewNote, adminUser }) {
    const existing = await prisma.b2bRequest.findUnique({
      where: { id: requestId }
    });

    if (!existing) {
      const err = new Error('طلب الشركة غير موجود');
      err.statusCode = 404;
      throw err;
    }

    const updated = await prisma.b2bRequest.update({
      where: { id: requestId },
      data: {
        status,
        reviewedBy: adminId,
        reviewNote: reviewNote ? String(reviewNote).trim() : null,
        reviewedAt: new Date()
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true
          }
        }
      }
    });

    // If approved, automatically register/activate the company record in Company table
    if (status === 'approved') {
      try {
        const numericCount = parseInt(updated.employeesCount, 10);
        const safeCount = isNaN(numericCount) || numericCount <= 0 ? 50 : numericCount;

        await prisma.company.upsert({
          where: { email: updated.companyEmail },
          update: {
            name: updated.companyName,
            phone: updated.companyPhone,
            employeesCount: safeCount,
            status: 'active'
          },
          create: {
            name: updated.companyName,
            email: updated.companyEmail,
            phone: updated.companyPhone,
            employeesCount: safeCount,
            status: 'active'
          }
        });
      } catch (companyErr) {
        console.error('[B2B COMPANY CREATION WARN]:', companyErr.message);
      }
    }

    // Audit log
    await AuditService.log({
      actorId: adminId,
      actorRole: adminUser?.role || 'admin',
      action: 'B2B_REQUEST_REVIEWED',
      resourceId: updated.id,
      result: 'SUCCESS',
      metadata: {
        status,
        companyName: updated.companyName,
        reviewNote
      }
    });

    return {
      success: true,
      message: status === 'approved' ? 'تمت الموافقة على طلب الشركة واعتمادها بنجاح' : 'تم رفض الطلب وتوثيق السبب',
      request: updated
    };
  }
}

module.exports = B2bService;
