const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const cors = require('cors');

/**
 * Helmet configuration
 */
const helmetConfig = helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' }
});

/**
 * CORS configuration allowing frontend from anywhere (or specific origin)
 */
const corsConfig = cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-auth-token']
});

/**
 * Rate limiter for OTP generation (Section 4: Max 3 requests per phone/IP per hour)
 */
const otpRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'تم تجاوز الحد المسموح لطلب رموز التحقق (٣ محاولات في الساعة). يرجى الانتظار للحماية.'
  }
});

/**
 * Rate limiter for Login attempts (Section 3: Max 5 attempts per 10 minutes per IP)
 */
const loginRateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'تم تسجيل محاولات دخول متكررة غير ناجحة. يرجى الانتظار ١٠ دقائق للحماية.'
  }
});

/**
 * Rate limiter for Password Reset requests (Section 3: Max 3 requests per hour per IP)
 */
const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'تم تجاوز الحد المسموح لطلبات استعادة كلمة المرور. يرجى الانتظار ساعة قبل المحاولة.'
  }
});

/**
 * Rate limiter for Payment Session creation (Max 10 requests per 10 minutes per IP/User)
 */
const paymentSessionLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'تم تجاوز الحد المسموح لإنشاء جلسات الدفع. يرجى الانتظار بضع دقائق.'
  }
});

/**
 * Webhook IP filter middleware (if VISA_WEBHOOK_ALLOWED_IPS is configured in env)
 */
function webhookIpFilter(req, res, next) {
  const allowedIpsEnv = process.env.VISA_WEBHOOK_ALLOWED_IPS;
  if (!allowedIpsEnv) {
    return next();
  }

  const allowedIps = allowedIpsEnv.split(',').map((ip) => ip.trim());
  const clientIp = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip || '')
    .toString()
    .split(',')[0]
    .trim();

  if (!allowedIps.includes(clientIp) && !allowedIps.includes('*')) {
    return res.status(403).json({
      success: false,
      message: 'Forbidden: Request origin IP is not in Visa webhook allowlist'
    });
  }

  next;
  return next();
}

/**
 * General API rate limiter
 */
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false
});

module.exports = {
  helmetConfig,
  corsConfig,
  otpRateLimiter,
  loginRateLimiter,
  passwordResetLimiter,
  paymentSessionLimiter,
  webhookIpFilter,
  apiLimiter
};

