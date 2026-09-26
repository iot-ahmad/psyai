require('dotenv').config();
const express = require('express');
const path = require('path');

// Middlewares
const { helmetConfig, corsConfig, otpRateLimiter, loginRateLimiter, passwordResetLimiter, apiLimiter } = require('./middlewares/security');
const { protect } = require('./middlewares/auth');
const {
  validate,
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyOtpSchema,
  sendOtpSchema,
  bookingSchema,
  visaPaymentSchema,
  updateProfileSchema,
  updatePhoneSchema,
  changePasswordSchema,
  deleteAccountSchema
} = require('./middlewares/validate');

// Controllers
const authController = require('./controllers/authController');
const specialistsController = require('./controllers/specialistsController');
const bookingsController = require('./controllers/bookingsController');
const paymentsController = require('./controllers/paymentsController');
const adminController = require('./controllers/adminController');
const specialistPortalController = require('./controllers/specialistPortalController');

const app = express();
const PORT = process.env.PORT || 5000;

// Apply Global Middlewares
app.use(helmetConfig);
app.use(corsConfig);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/api/', apiLimiter);

// Serve static frontend files (index.html, login.html, etc.)
const frontendDir = path.join(__dirname, '../..');
app.use(express.static(frontendDir));

// Route aliases
app.get('/login', (req, res) => res.sendFile(path.join(frontendDir, 'login.html')));
app.get('/profile', (req, res) => res.sendFile(path.join(frontendDir, 'profile.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(frontendDir, 'admin.html')));
app.get('/specialist', (req, res) => res.sendFile(path.join(frontendDir, 'specialist.html')));
app.get('/session', (req, res) => res.sendFile(path.join(frontendDir, 'session.html')));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'online',
    platform: 'PsyAI API',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

/* ==========================================================================
   1. AUTH & WHATSAPP OTP ROUTES (/api/auth)
   ========================================================================== */
const authRouter = express.Router();
authRouter.post('/send-otp', otpRateLimiter, validate(sendOtpSchema), authController.sendOtp);
authRouter.post('/verify-otp', validate(verifyOtpSchema), authController.verifyOtp);
authRouter.post('/register', validate(registerSchema), authController.register);
authRouter.post('/login', loginRateLimiter, validate(loginSchema), authController.login);
authRouter.post('/forgot-password', passwordResetLimiter, validate(forgotPasswordSchema), authController.forgotPassword);
authRouter.post('/reset-password', passwordResetLimiter, validate(resetPasswordSchema), authController.resetPassword);
authRouter.post('/google', authController.googleAuth);
authRouter.get('/me', protect, authController.getMe);
app.use('/api/auth', authRouter);

/* ==========================================================================
   1.1 USER PROFILE & ACCOUNT MANAGEMENT ROUTES (/api/user)
   ========================================================================== */
const userRouter = express.Router();
userRouter.get('/profile', protect, authController.getMe);
userRouter.put('/profile', protect, validate(updateProfileSchema), authController.updateProfile);
userRouter.post('/send-phone-otp', protect, otpRateLimiter, authController.sendPhoneUpdateOtp);
userRouter.post('/update-phone', protect, validate(updatePhoneSchema), authController.verifyAndUpdatePhone);
userRouter.put('/change-password', protect, validate(changePasswordSchema), authController.changePassword);
userRouter.delete('/account', protect, validate(deleteAccountSchema), authController.deleteAccount);
app.use('/api/user', userRouter);

/* ==========================================================================
   2. SPECIALISTS ROUTES (/api/specialists)
   ========================================================================== */
const specialistsRouter = express.Router();
specialistsRouter.get('/', specialistsController.getSpecialists);
specialistsRouter.get('/:id', specialistsController.getSpecialistById);
app.use('/api/specialists', specialistsRouter);

/* ==========================================================================
   3. BOOKINGS / APPOINTMENTS ROUTES (/api/bookings)
   ========================================================================== */
const bookingsRouter = express.Router();
bookingsRouter.post('/', protect, validate(bookingSchema), bookingsController.createBooking);
bookingsRouter.get('/my', protect, bookingsController.getMyBookings);
bookingsRouter.patch('/:id/cancel', protect, bookingsController.cancelBooking);
app.use('/api/bookings', bookingsRouter);

/* ==========================================================================
   4. VISA & CARD PAYMENTS ROUTES (/api/payments)
   ========================================================================== */
const paymentsRouter = express.Router();
paymentsRouter.post('/pay-visa', protect, validate(visaPaymentSchema), paymentsController.payWithVisa);
paymentsRouter.get('/booking/:bookingId', protect, paymentsController.getPaymentByBooking);
app.use('/api/payments', paymentsRouter);

/* ==========================================================================
   5. ADMIN PANEL ROUTES (/api/admin) - 100% Compatible with admin.html
   ========================================================================== */
const adminRouter = express.Router();
adminRouter.get('/dashboard', adminController.getDashboard);
adminRouter.get('/users', adminController.getUsers);
adminRouter.post('/users', adminController.createUser);
adminRouter.patch('/users/:id/status', adminController.updateUserStatus);
adminRouter.delete('/users/:id', adminController.deleteUser);

adminRouter.get('/specialists', adminController.getSpecialists);
adminRouter.post('/specialists', adminController.createSpecialist);
adminRouter.delete('/specialists/:id', adminController.deleteSpecialist);

adminRouter.get('/bookings', adminController.getBookings);
adminRouter.patch('/bookings/:id/status', adminController.updateBookingStatus);

adminRouter.get('/services', adminController.getServices);
adminRouter.post('/services', adminController.createService);

adminRouter.get('/companies', adminController.getCompanies);
adminRouter.post('/companies', adminController.createCompany);
app.use('/api/admin', adminRouter);

/* ==========================================================================
   6. SPECIALIST PORTAL ROUTES (/api/specialist)
   ========================================================================== */
const specialistRouter = express.Router();
specialistRouter.get('/profile', protect, specialistPortalController.getProfile);
specialistRouter.get('/bookings', protect, specialistPortalController.getMyBookings);
specialistRouter.patch('/bookings/:id/confirm', protect, specialistPortalController.confirmBooking);
specialistRouter.post('/bookings/:id/send-link', protect, specialistPortalController.sendMeetingLink);
specialistRouter.get('/session/:id', specialistPortalController.getSessionDetails);
specialistRouter.get('/articles', protect, specialistPortalController.getMyArticles);
specialistRouter.get('/my-articles', protect, specialistPortalController.getMyArticles);
specialistRouter.post('/articles', protect, specialistPortalController.publishArticle);
specialistRouter.delete('/articles/:id', protect, specialistPortalController.deleteArticle);
app.use('/api/specialist', specialistRouter);

/* ==========================================================================
   7. PUBLIC ARTICLES ROUTES (/api/articles)
   ========================================================================== */
const articlesRouter = express.Router();
articlesRouter.get('/', specialistPortalController.getArticles);
articlesRouter.get('/:id', specialistPortalController.getArticleById);
app.use('/api/articles', articlesRouter);

/* ==========================================================================
   ERROR HANDLING MIDDLEWARE
   ========================================================================== */
app.use((err, req, res, next) => {
  console.error('Unhandled Error:', err);
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    success: false,
    message: err.message || 'حدث خطأ داخلي في الخادم',
    ...(process.env.NODE_ENV === 'development' ? { stack: err.stack } : {})
  });
});

// Start Server
app.listen(PORT, () => {
  console.log('\n' + '='.repeat(60));
  console.log(`[PsyAI] Backend Server running on port http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
  console.log(`WhatsApp OTP: Active (${process.env.WHATSAPP_PROVIDER || 'simulator'})`);
  console.log(`Visa Payments: Active (${process.env.PAYMENT_GATEWAY || 'simulator'})`);
  console.log(`Security: Helmet, CORS, Rate Limiters, Bcrypt, JWT enabled`);
  console.log('='.repeat(60) + '\n');
});

module.exports = app;
