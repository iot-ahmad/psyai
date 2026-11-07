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
 * Sliding Window In-Memory Store with Redis-ready Interface (AUTH-202)
 * Supports compound keys: IP + identifier hash
 */
function createCompoundKeyGenerator(prefix = 'rl') {
  return (req) => {
    const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || req.ip || '127.0.0.1';
    const cleanIp = Array.isArray(ip) ? ip[0] : ip.split(',')[0].trim();
    const identifier = req.body?.phone || req.body?.email || req.body?.identifier || '';
    const idHash = identifier ? require('crypto').createHash('sha256').update(identifier).digest('hex').slice(0, 16) : 'anon';
    return `${prefix}:${cleanIp}:${idHash}`;
  };
}

/**
 * Rate limiter for OTP generation (AUTH-202: compound key + sliding window)
 */
const otpRateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  keyGenerator: createCompoundKeyGenerator('otp'),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'تم تجاوز الحد المسموح لطلب رموز التحقق. يرجى الانتظار ١٠ دقائق للحماية.'
  }
});

/**
 * Rate limiter for Login attempts (AUTH-202: compound key IP + identifier hash)
 */
const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyGenerator: createCompoundKeyGenerator('login'),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'تم تسجيل محاولات دخول متكررة غير ناجحة. يرجى الانتظار ١٥ دقيقة للحماية.'
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

  // TASK-023 FIX: invoke next() cleanly
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

