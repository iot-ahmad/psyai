const B2bService = require('../services/b2bService');

/**
 * POST /api/b2b-requests
 * Submit a corporate partnership request by logged-in user
 */
async function submitRequest(req, res, next) {
  try {
    const userId = req.user.id;
    const { companyName, companyPhone, companyEmail, employeesCount } = req.body;
    const ip = req.headers?.['x-forwarded-for'] || req.socket?.remoteAddress || req.ip;

    const result = await B2bService.createRequest({
      userId,
      companyName,
      companyPhone,
      companyEmail,
      employeesCount,
      user: req.user,
      ip
    });

    res.status(201).json(result);
  } catch (err) {
    const statusCode = err.statusCode || 400;
    res.status(statusCode).json({
      success: false,
      message: err.message || 'فشل إرسال طلب الشركة'
    });
  }
}

/**
 * GET /api/b2b-requests/my
 * Get all B2B requests submitted by the current user
 */
async function getMyRequests(req, res, next) {
  try {
    const userId = req.user.id;
    const requests = await B2bService.getMyRequests(userId);
    res.status(200).json({
      success: true,
      requests
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/admin/b2b-requests
 * List all B2B applications for Admin review
 */
async function getAdminRequests(req, res, next) {
  try {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'غير مصرح: هذه العملية مخصصة لمدير النظام فقط'
      });
    }

    const { status, page, limit } = req.query;
    const result = await B2bService.getAllRequests({
      status,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 50
    });

    res.status(200).json({
      success: true,
      ...result
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/admin/b2b-requests/:id
 * Admin approves or rejects a corporate request
 */
async function reviewRequest(req, res, next) {
  try {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'غير مصرح: هذه العملية مخصصة لمدير النظام فقط'
      });
    }

    const requestId = req.params.id;
    const { status, reviewNote } = req.body;

    const result = await B2bService.reviewRequest({
      requestId,
      adminId: req.user.id,
      status,
      reviewNote,
      adminUser: req.user
    });

    res.status(200).json(result);
  } catch (err) {
    const statusCode = err.statusCode || 400;
    res.status(statusCode).json({
      success: false,
      message: err.message || 'فشلت معالجة مراجعة الطلب'
    });
  }
}

module.exports = {
  submitRequest,
  getMyRequests,
  getAdminRequests,
  reviewRequest
};
