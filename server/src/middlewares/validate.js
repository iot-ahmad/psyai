const { z } = require('zod');

function validate(schema) {
  return (req, res, next) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (err) {
      if (err instanceof z.ZodError) {
        const errorMessages = err.errors.map((e) => e.message).join('، ');
        return res.status(400).json({
          success: false,
          message: errorMessages || 'البيانات المدخلة غير صحيحة',
          errors: err.errors
        });
      }
      next(err);
    }
  };
}

// Schemas
const registerSchema = z.object({
  firstName: z.string().min(2, 'الاسم الأول يجب أن يتكون من حرفين على الأقل').trim(),
  lastName: z.string().min(2, 'اسم العائلة يجب أن يتكون من حرفين على الأقل').trim(),
  email: z.string().email('صيغة البريد الإلكتروني غير صحيحة').toLowerCase().trim(),
  phone: z.string()
    .trim()
    .regex(/^\+9627[789]\d{7}$/, 'يجب أن يبدأ رقم الهاتف بـ +9627 ويتكون من 11 رقم (مثال: +962791234567)'),
  gender: z.enum(['male', 'female'], { errorMap: () => ({ message: 'يرجى تحديد الجنس بشكل صحيح' }) }),
  password: z.string().min(6, 'كلمة المرور يجب أن لا تقل عن 6 أحرف أو أرقام'),
  condition: z.string().optional(),
  specGenderPref: z.enum(['any', 'male', 'female']).optional()
});

const loginSchema = z.object({
  identifier: z.string().min(3, 'يرجى إدخال اسم المستخدم أو البريد الإلكتروني').trim(),
  password: z.string().min(1, 'يرجى إدخال كلمة المرور')
});

const forgotPasswordSchema = z.object({
  email: z.string().email('صيغة البريد الإلكتروني غير صحيحة').toLowerCase().trim()
});

const resetPasswordSchema = z.object({
  token: z.string().min(10, 'رمز استعادة كلمة المرور غير صالح').trim(),
  newPassword: z.string().min(10, 'كلمة المرور الجديدة يجب أن لا تقل عن 10 خانات')
});

const verifyOtpSchema = z.object({
  phone: z.string()
    .trim()
    .regex(/^\+9627[789]\d{7}$/, 'يجب أن يبدأ رقم الهاتف بـ +9627 ويتكون من 11 رقم (مثال: +962791234567)'),
  code: z.string().length(6, 'رمز التحقق يجب أن يتكون من 6 أرقام').regex(/^\d+$/, 'رمز التحقق يجب أن يحتوي على أرقام فقط')
});

const sendOtpSchema = z.object({
  phone: z.string()
    .trim()
    .regex(/^\+9627[789]\d{7}$/, 'يجب أن يبدأ رقم الهاتف بـ +9627 ويتكون من 11 رقم (مثال: +962791234567)')
});

const bookingSchema = z.object({
  specialistId: z.string().uuid('معرّف الأخصائي غير صالح'),
  sessionTime: z.string().min(3, 'يرجى تحديد موعد الجلسة'),
  condition: z.string().optional(),
  notes: z.string().optional()
});

const visaPaymentSchema = z.object({
  bookingId: z.string().uuid('معرّف الحجز غير صالح'),
  cardNumber: z.string().min(12, 'رقم بطاقة الفيزا غير صالح').max(19).trim(),
  cardHolder: z.string().min(3, 'اسم حامل البطاقة مطلوب').trim(),
  expiry: z.string().regex(/^(0[1-9]|1[0-2])\/?([0-9]{2})$/, 'صيغة تاريخ الانتهاء MM/YY غير صحيحة'),
  cvv: z.string().regex(/^[0-9]{3,4}$/, 'رمز الأمان CVV غير صالح')
});

const updateProfileSchema = z.object({
  firstName: z.string().min(2, 'الاسم الأول يجب أن يتكون من حرفين على الأقل').trim().optional(),
  lastName: z.string().min(2, 'اسم العائلة يجب أن يتكون من حرفين على الأقل').trim().optional(),
  email: z.string().email('صيغة البريد الإلكتروني غير صحيحة').toLowerCase().trim().optional(),
  condition: z.string().optional().nullable(),
  specGenderPref: z.enum(['any', 'male', 'female']).optional()
});

const updatePhoneSchema = z.object({
  newPhone: z.string()
    .trim()
    .regex(/^\+9627[789]\d{7}$/, 'يجب أن يبدأ رقم الهاتف بـ +9627 ويتكون من 11 رقم (مثال: +962791234567)'),
  otpCode: z.string().length(6, 'رمز التحقق يجب أن يتكون من 6 أرقام').regex(/^\d+$/, 'رمز التحقق يجب أن يحتوي على أرقام فقط')
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'يرجى إدخال كلمة المرور الحالية'),
  newPassword: z.string().min(6, 'كلمة المرور الجديدة يجب أن لا تقل عن 6 أحرف أو أرقام')
});

const deleteAccountSchema = z.object({
  password: z.string().min(1, 'يرجى إدخال كلمة المرور لتأكيد حذف الحساب')
});

const createPaymentSessionSchema = z.object({
  bookingId: z.string().uuid('معرّف الحجز غير صالح').optional(),
  orderId: z.string().optional(),
  amount: z.number().positive('المبلغ يجب أن يكون أكبر من صفر').optional(),
  currency: z.string().min(3).max(4).default('SAR').optional()
}).refine((data) => data.bookingId || data.orderId, {
  message: 'يرجى تقديم معرّف الحجز bookingId أو معرّف الطلب orderId'
});

const paymentWebhookSchema = z.object({
  visaSessionId: z.string().min(1, 'معرّف جلسة فيزا مطلوب').optional(),
  sessionId: z.string().optional(),
  status: z.string().min(1, 'حالة العملية مطلوبة'),
  transactionId: z.string().optional(),
  amount: z.number().optional(),
  currency: z.string().optional()
});

const createB2bRequestSchema = z.object({
  companyName: z.string().min(2, 'اسم الشركة يجب أن يتكون من حرفين على الأقل').max(200).trim(),
  companyPhone: z.string().min(7, 'رقم هاتف الشركة غير صالح').max(30).trim(),
  companyEmail: z.string().email('صيغة البريد الإلكتروني للشركة غير صحيحة').toLowerCase().trim(),
  employeesCount: z.string().min(1, 'يرجى تحديد عدد الموظفين التقريبي').max(50).trim()
});

const reviewB2bRequestSchema = z.object({
  status: z.enum(['approved', 'rejected'], {
    errorMap: () => ({ message: 'الحالة يجب أن تكون إما approved أو rejected' })
  }),
  reviewNote: z.string().max(1000).optional()
});

module.exports = {
  validate,
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyOtpSchema,
  sendOtpSchema,
  bookingSchema,
  visaPaymentSchema,
  createPaymentSessionSchema,
  paymentWebhookSchema,
  createB2bRequestSchema,
  reviewB2bRequestSchema,
  updateProfileSchema,
  updatePhoneSchema,
  changePasswordSchema,
  deleteAccountSchema
};
