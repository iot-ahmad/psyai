const jwt = require('jsonwebtoken');
const prisma = require('../config/db');

const JWT_SECRET = process.env.JWT_SECRET || 'psyai_super_secret_jwt_key_2025_wellness_platform_987654';

/**
 * Verify JWT Token from Authorization Header, Cookie or custom header
 * Section 2: Enforces Restricted Token isolation (scope: ['verify-otp'] cannot access protected endpoints)
 * Section 5: Enforces immediate session revocation via tokenVersion
 */
async function protect(req, res, next) {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies && req.cookies.psyai_token) {
    token = req.cookies.psyai_token;
  } else if (req.headers['x-auth-token']) {
    token = req.headers['x-auth-token'];
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'يرجى تسجيل الدخول للوصول إلى هذا المحتوى'
    });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    // Section 2: Scoped Restricted Token enforcement
    if (decoded.scope && Array.isArray(decoded.scope)) {
      if (decoded.scope.includes('verify-otp') && !decoded.scope.includes('full_access')) {
        // Restricted Token is strictly forbidden from accessing full endpoints
        return res.status(403).json({
          success: false,
          code: 'RESTRICTED_TOKEN_UNAUTHORIZED',
          message: 'هذا التوكن مخصص لعملية تأكيد الهاتف فقط. يرجى تأكيد رقم الهاتف لإكمال الجلسة.'
        });
      }
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        gender: true,
        role: true,
        status: true,
        isVerified: true,
        tokenVersion: true
      }
    });

    if (!user) {
      return res.status(401).json({ success: false, message: 'المستخدم غير موجود' });
    }

    if (user.status !== 'active') {
      return res.status(403).json({ success: false, message: 'هذا الحساب موقوف حالياً' });
    }

    // Section 5: Check token version to revoke stale sessions immediately
    if (decoded.tokenVersion !== undefined && decoded.tokenVersion !== user.tokenVersion) {
      return res.status(401).json({
        success: false,
        code: 'SESSION_REVOKED',
        message: 'تم إنهاء هذه الجلسة بسبب تعديل بيانات الأمان. يرجى تسجيل الدخول مجدداً.'
      });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      message: 'رمز المصادقة غير صالح أو منتهي الصلاحية'
    });
  }
}

/**
 * Restrict to specific roles (e.g. 'admin', 'specialist')
 */
function restrictTo(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'ليس لديك الصلاحيات الكافية لتنفيذ هذا الإجراء'
      });
    }
    next();
  };
}

module.exports = {
  protect,
  restrictTo
};
