# PsyAI Backend — توثيق شامل للمطور

> **المنصة:** PsyAI — منصة الاستشارات النفسية  
> **البيئة:** Node.js + Express + Prisma ORM + PostgreSQL  
> **الإصدار:** 1.0.0 | **آخر مراجعة:** أكتوبر 2026

---

## 📁 هيكل المشروع

```
backend/
├── src/
│   ├── index.js                          # نقطة الدخول — الخادم والروابط
│   ├── config/
│   │   └── db.js                         # Prisma Client
│   ├── controllers/
│   │   ├── authController.js             # مصادقة + إدارة الحسابات
│   │   ├── specialistsController.js      # عرض الأخصائيين (عام)
│   │   ├── bookingsController.js         # الحجوزات
│   │   ├── paymentsController.js         # الدفع عبر Visa
│   │   ├── adminController.js            # لوحة الإدارة
│   │   ├── specialistPortalController.js # بوابة الأخصائي + المقالات
│   │   └── b2bController.js              # طلبات الشراكات المؤسسية
│   ├── services/
│   │   ├── encryptionService.js          # تشفير AES-256-GCM
│   │   ├── whatsappService.js            # OTP واتساب
│   │   ├── paymentService.js             # منطق Visa Hosted Checkout
│   │   ├── reminderWorker.js             # Cron تذكيرات الجلسات
│   │   ├── auditService.js               # سجل التدقيق
│   │   ├── securityService.js            # تشفير كلمات المرور
│   │   └── b2bService.js                 # منطق B2B
│   ├── middlewares/
│   │   ├── auth.js                       # JWT + صلاحيات الأدوار
│   │   ├── security.js                   # Helmet, CORS, Rate Limiters
│   │   └── validate.js                   # Zod Schemas
│   └── routes/                           # ⚠️ فارغ — الروابط كلها في index.js
├── prisma/
│   ├── schema.prisma                     # تعريف قاعدة البيانات
│   └── seed.js                           # بيانات أولية للتطوير
├── tests/                                # اختبارات Jest
├── .env / .env.example
└── package.json
```

---

## 🔐 نظام الأمان

| الطبقة | التقنية | الوصف |
|--------|---------|-------|
| تشفير البيانات | AES-256-GCM | تشفير الإيميل، الهاتف، الاسم، الحالة النفسية في DB |
| البحث الآمن | HMAC-SHA256 Blind Index | البحث دون كشف البيانات الأصلية |
| كلمات المرور | bcryptjs rounds=10 | تشفير لا عكسي |
| المصادقة | JWT HS256 | صلاحية 7 أيام + إلغاء فوري بـ tokenVersion |
| OTP | CSPRNG 6 أرقام + bcrypt | صلاحية 5 دقائق + قفل بعد 3 محاولات |
| Rate Limiting | express-rate-limit | حماية Login, OTP, Payments من Brute-Force |
| HTTP Headers | helmet.js | ترويسات HTTP الأمنية |
| Audit Log | AuditService | تسجيل كل العمليات الحساسة في DB |

---

## 🌐 جميع الـ API Endpoints

**الاستجابة العامة:** `{ "success": true | false, "message": "..." }`

---

## 1. المصادقة `/api/auth`

| Method | Endpoint | حماية | Rate Limit | الوصف |
|--------|----------|-------|------------|-------|
| POST | `/api/auth/send-otp` | عام | 3/ساعة | إرسال OTP عبر WhatsApp |
| POST | `/api/auth/verify-otp` | عام | — | التحقق من OTP |
| POST | `/api/auth/register` | عام | — | إنشاء حساب جديد |
| POST | `/api/auth/login` | عام | 5/10دق | تسجيل الدخول |
| POST | `/api/auth/google` | عام | 5/10دق | دخول عبر Google OAuth |
| POST | `/api/auth/forgot-password` | عام | 3/ساعة | طلب استعادة كلمة المرور |
| POST | `/api/auth/reset-password` | عام | 3/ساعة | إعادة تعيين كلمة المرور |
| GET | `/api/auth/config` | عام | — | جلب Google Client ID |
| GET | `/api/auth/me` | 🔒 JWT | — | بيانات المستخدم الحالي |

### Body المطلوب

**send-otp:**
```json
{ "phone": "+962791234567" }
```

**verify-otp:**
```json
{ "phone": "+962791234567", "code": "123456" }
```

**register:**
```json
{
  "firstName": "أحمد", "lastName": "المطيري",
  "email": "ahmed@example.com", "phone": "+962791234567",
  "gender": "male | female", "password": "Password123",
  "condition": "...",          // اختياري
  "specGenderPref": "any",     // اختياري: any | male | female
  "otpCode": "123456"          // اختياري
}
```

**login:**
```json
{ "identifier": "email أو رقم هاتف", "password": "..." }
```

**google:**
```json
{
  "idToken": "GOOGLE_ID_TOKEN",
  "nonce": "...",              // اختياري
  "phone": "+962791234567",    // مطلوب للحساب الجديد
  "otpCode": "123456"          // مطلوب مع phone
}
```

**forgot-password:** `{ "email": "ahmed@example.com" }`  
**reset-password:** `{ "token": "RESET_TOKEN", "newPassword": "..." }`

### الاستجابات المهمة

**me — Response 200:**
```json
{
  "success": true,
  "user": {
    "id", "firstName", "lastName", "email", "phone",
    "gender", "condition", "specGenderPref",
    "role", "isVerified", "language", "status", "createdAt",
    "bookings": [ { آخر 5 حجوزات } ]
  }
}
```

**google — يحتاج هاتف:**
```json
{ "success": true, "needPhone": true, "email": "...", "firstName": "..." }
```

---

## 2. الملف الشخصي `/api/user`

| Method | Endpoint | حماية | الوصف |
|--------|----------|-------|-------|
| GET | `/api/user/profile` | 🔒 JWT | جلب الملف الشخصي |
| PUT | `/api/user/profile` | 🔒 JWT | تعديل البيانات |
| POST | `/api/user/send-phone-otp` | 🔒 JWT + Rate | طلب OTP لتغيير الهاتف |
| POST | `/api/user/update-phone` | 🔒 JWT | تحديث الهاتف بعد OTP |
| PUT | `/api/user/change-password` | 🔒 JWT | تغيير كلمة المرور |
| DELETE | `/api/user/account` | 🔒 JWT | حذف الحساب |

**PUT /profile body:** `{ firstName, lastName, email, condition, specGenderPref }` (كلها اختيارية)  
**send-phone-otp body:** `{ "newPhone": "+962791234567" }`  
**update-phone body:** `{ "newPhone": "+962791234567", "otpCode": "123456" }`  
**change-password body:** `{ "currentPassword": "...", "newPassword": "..." }`  
**DELETE /account body:** `{ "password": "تأكيد كلمة المرور" }`

---

## 3. الأخصائيون `/api/specialists`

| Method | Endpoint | حماية | الوصف |
|--------|----------|-------|-------|
| GET | `/api/specialists` | عام | قائمة الأخصائيين |
| GET | `/api/specialists/:id` | عام | تفاصيل أخصائي واحد |

**Query params لـ GET /:** `gender=male|female|all`, `search=نص`, `category=...`

**Response:**
```json
{
  "success": true, "count": 10,
  "specialists": [{
    "id", "name", "title", "specialty", "bio",
    "price", "rating", "gender", "expYears", "avatar", "isFeatured",
    "slots": [{ "id", "time", "available" }]
  }]
}
```

---

## 4. الحجوزات `/api/bookings`

| Method | Endpoint | حماية | الوصف |
|--------|----------|-------|-------|
| POST | `/api/bookings` | 🔒 JWT | إنشاء حجز جديد |
| GET | `/api/bookings/my` | 🔒 JWT | حجوزاتي |
| PATCH | `/api/bookings/:id/cancel` | 🔒 JWT | إلغاء حجز |

**POST body:**
```json
{ "specialistId": "UUID", "sessionTime": "2026-11-01T10:00:00Z", "condition": "...", "notes": "..." }
```

**⚠️ ملاحظات مهمة:**
- يستخدم Serializable Transaction لمنع الحجز المزدوج
- الخطأ `409` = الموعد محجوز مسبقاً لدى الأخصائي
- بعد الإنشاء تُجدوَل تذكيرات تلقائية

---

## 5. الدفع `/api/payments`

| Method | Endpoint | حماية | الوصف |
|--------|----------|-------|-------|
| POST | `/api/payments/create-session` | 🔒 JWT + Rate | إنشاء جلسة Visa Checkout |
| POST | `/api/payments/webhook` | IP Whitelist + HMAC | استقبال إشعارات Visa |
| GET | `/api/payments/:paymentId/status` | 🔒 JWT | حالة الدفع |
| GET | `/api/payments/booking/:bookingId` | 🔒 JWT | دفع حجز معين |

**create-session body:** `{ "bookingId": "UUID", "amount": 250, "currency": "SAR" }`

**create-session response:**
```json
{
  "redirectUrl": "https://secure.checkout.visa.com/...",
  "paymentId": "UUID", "visaSessionId": "...", "alreadyPaid": false
}
```

**webhook body:** `{ "visaSessionId": "...", "status": "success|paid|failed", "transactionId": "..." }`

**حالات الدفع في DB:** `PENDING | SUCCEEDED | FAILED | REFUNDED`

---

## 6. بوابة الأخصائي `/api/specialist`

> جميع الروابط تتطلب 🔒 JWT

| Method | Endpoint | الوصف |
|--------|----------|-------|
| GET | `/api/specialist/profile` | ملف الأخصائي |
| GET | `/api/specialist/bookings` | حجوزاته (إيميل وهاتف المريض مخفيَّان) |
| PATCH | `/api/specialist/bookings/:id/confirm` | تأكيد موعد |
| POST | `/api/specialist/bookings/:id/send-link` | إرسال رابط الجلسة + إشعار WhatsApp |
| GET | `/api/specialist/session/:id` | تفاصيل جلسة (يصلها المريض أو الأخصائي أو Admin) |
| GET | `/api/specialist/my-articles` | مقالاته |
| POST | `/api/specialist/articles` | نشر مقال |
| DELETE | `/api/specialist/articles/:id` | حذف مقال |

**send-link body:** `{ "meetingLink": "https://meet.google.com/..." }`

**publish article body:**
```json
{
  "title": "...", "lead": "...", "content": "...",
  "category": "...", "categorySlug": "...",
  "takeaways": ["نقطة 1", "نقطة 2"], "readTime": "5 دقائق"
}
```

---

## 7. المقالات العامة `/api/articles`

| Method | Endpoint | الوصف |
|--------|----------|-------|
| GET | `/api/articles` | كل المقالات المنشورة |
| GET | `/api/articles/:id` | مقال واحد |

**Query params:** `category=slug`, `page=1`, `limit=20`

---

## 8. الشراكات B2B

| Method | Endpoint | حماية | الوصف |
|--------|----------|-------|-------|
| POST | `/api/b2b-requests` | 🔒 JWT | تقديم طلب شراكة مؤسسية |
| GET | `/api/b2b-requests/my` | 🔒 JWT | طلباتي |

**POST body:** `{ "companyName", "companyPhone", "companyEmail", "employeesCount" }`

---

## 9. لوحة الإدارة `/api/admin`

> جميع الروابط تتطلب 🔒 JWT + دور `admin`

| Method | Endpoint | Body |
|--------|----------|------|
| GET | `/api/admin/dashboard` | — |
| GET | `/api/admin/users` | — |
| POST | `/api/admin/users` | `{ first_name, last_name, email, phone, password, role, gender }` |
| PATCH | `/api/admin/users/:id/status` | `{ status: "active|inactive|suspended" }` |
| DELETE | `/api/admin/users/:id` | — |
| GET | `/api/admin/specialists` | — |
| POST | `/api/admin/specialists` | `{ name, title, specialization, years_experience, price, gender }` |
| DELETE | `/api/admin/specialists/:id` | — |
| GET | `/api/admin/bookings` | — |
| PATCH | `/api/admin/bookings/:id/status` | `{ status: "pending|confirmed|completed|cancelled|no_show" }` |
| GET | `/api/admin/services` | — |
| POST | `/api/admin/services` | `{ name, slug, description, icon }` |
| GET | `/api/admin/companies` | — |
| POST | `/api/admin/companies` | `{ name, email, phone, employees_count }` |
| GET | `/api/admin/b2b-requests` | Query: `status`, `page`, `limit` |
| PATCH | `/api/admin/b2b-requests/:id` | `{ status: "approved|rejected", reviewNote: "..." }` |

---

## 10. صحة الخادم

`GET /api/health` → `{ "status": "online", "platform": "PsyAI API", "version": "1.0.0" }`

**صفحات الفرونت إند:**
`/login` → `login.html` | `/profile` → `profile.html` | `/admin` → `admin.html` | `/specialist` → `specialist.html` | `/session` → `session.html`

---

## 🔧 متغيرات البيئة

```env
PORT=5000
NODE_ENV=development | production | test
DATABASE_URL="postgresql://user:pass@localhost:5432/psyai"

# JWT
JWT_SECRET="32-char-min-secret"
JWT_EXPIRES_IN="7d"

# Google OAuth
GOOGLE_CLIENT_ID="xxx.apps.googleusercontent.com"

# تشفير البيانات
DB_ENCRYPTION_KEY="64-hex-chars"
BLIND_INDEX_PEPPER="random-pepper"

# WhatsApp OTP
WHATSAPP_PROVIDER="simulator | meta"
WHATSAPP_API_TOKEN=""
WHATSAPP_PHONE_NUMBER_ID=""
WHATSAPP_TEMPLATE_NAME="psyai_otp_verification"

# نظام الدفع
PAYMENT_GATEWAY="simulator | visa"
VISA_WEBHOOK_SECRET=""
VISA_HOSTED_CHECKOUT_URL=""
VISA_WEBHOOK_ALLOWED_IPS=""
```

---

## ⚙️ خدمات الخلفية

**ReminderWorker** — Cron يعمل كل دقيقة:
- 24h قبل الجلسة → تذكير WhatsApp
- 1h قبل الجلسة → تذكير WhatsApp
- 10 دقائق قبل → رسالة مع رابط الانضمام

**Payment Webhook Flow:**
```
Visa → POST /api/payments/webhook
  → IP Filter → HMAC Signature Verify
  → Update Payment Status
  → إذا SUCCEEDED: تأكيد الحجز + جدولة التذكيرات + إشعار WhatsApp
```

---
---

# 🚨 قائمة التاسكات للمطور

> نفّذ التاسكات بالترتيب — **Schema أولاً ثم الكود**
> بعد كل تعديل على Schema نفّذ: `npx prisma migrate dev` ثم `npx prisma generate`

---

## 🔴 أولوية 1 — حرجة (تسبب crashes عند التشغيل)

| # | التاسك | الملف | السطر | المشكلة |
|---|--------|-------|-------|---------|
| TASK-001 | إضافة نموذج `Company` | `prisma/schema.prisma` | نهاية الملف | `adminController.js` يستدعي `prisma.company` في الـ dashboard والـ companies endpoints لكن النموذج غير موجود في الـ Schema |
| TASK-002 | إضافة نموذج `Service` | `prisma/schema.prisma` | نهاية الملف | `adminController.js` يستدعي `prisma.service.findMany()` و `prisma.service.create()` لكن النموذج غير موجود |
| TASK-003 | إضافة نموذج `PasswordResetToken` | `prisma/schema.prisma` | نهاية الملف | `forgotPassword` و `resetPassword` يستدعيان `prisma.passwordResetToken` لكنه غير موجود — استعادة كلمة المرور معطّلة كلياً |
| TASK-004 | إضافة حقول مفقودة في `Specialist` | `prisma/schema.prisma` | نموذج Specialist | الحقول `status`, `gender`, `expYears`, `avatar` غير موجودة — الكود يستخدمها في `specialistsController.js` و `adminController.js` |
| TASK-005 | إضافة `confirmedAt` في `Booking` | `prisma/schema.prisma` | نموذج Booking | `specialistPortalController.js` سطر 152 و `paymentService.js` سطر 267 يكتبان حقل `confirmedAt` غير موجود |
| TASK-006 | تصحيح نموذج `Article` | `prisma/schema.prisma` | نموذج Article | الـ Schema فيه حقل `body` لكن الكود يستخدم `content` — وكذلك الحقول `lead`, `authorName`, `authorTitle`, `category`, `takeaways`, `readTime` كلها مفقودة |
| TASK-029 | حقل `userId` مفقود عند إنشاء أخصائي | `src/controllers/adminController.js` | 200–213 | دالة `createSpecialist` تستدعي `prisma.specialist.create` بدون `userId` أو كائن `user` المرتبط، وهو حقل إلزامي وفريد في `schema.prisma`. الاستدعاء يفشل حتماً ولا ينشئ حساب مستخدم للأخصائي |
| TASK-030 | خطأ وسيط `where` في `sessionReminder.upsert` | `src/services/reminderWorker.js` | 237–239 | يستعلم بـ `unique_booking_reminder: { bookingId, reminderType: type }` بينما Prisma Client يولّد المفتاح باسم `bookingId_reminderType` لأن الـ Schema استخدمت `map:` وليس `name:`. الاستدعاء يفشل بـ `Unknown argument` |
| TASK-031 | استعلام `avatar: true` غير الموجود في `Specialist` | `src/controllers/bookingsController.js` | 68، 121 | استعلامات `createBooking` و `getMyBookings` تطلب `avatar: true` داخل `select` الخاص بـ `specialist`، وهو حقل غير موجود في `schema.prisma` مما يسبب انهيار الحجز بـ `PrismaClientValidationError` |
| TASK-032 | عدم كفاية حجم `firstName` و `lastName` في Schema | `prisma/schema.prisma` | 125–126 | الكود يشفر الاسمين بـ AES-256-GCM الذي يتجاوز طوله 100 حرف بالأسماء العربية UTF-8. النوع الحالي `@db.VarChar(100)` يسبب خطأ `value too long for type character varying(100)`. يجب تحويلهما إلى `@db.Text` |

> **⚠️ بعد تعديل Schema:** `npx prisma migrate dev --name fix-all-schema-mismatches` ثم `npx prisma generate`

---

## 🟠 أولوية 2 — أخطاء منطقية في الكود

| # | التاسك | الملف | السطر | المشكلة |
|---|--------|-------|-------|---------|
| TASK-007 | توحيد `transactionRef` → `transactionId` | `src/controllers/specialistPortalController.js` | 99 | الكود يطلب حقل `transactionRef` في الـ select لكن نموذج `Payment` فيه `transactionId` |
| TASK-008 | إصلاح `forgotPassword` | `src/controllers/authController.js` | 412–413 | البحث يتم بـ `{ email: cleanEmail }` وحقل `email` غير موجود مباشرة — يجب البحث بـ `emailHash` |
| TASK-009 | إصلاح `verifyOtp` | `src/controllers/authController.js` | 140–147 | البحث يتم بـ `phoneBlindIndex` و `phone` كحقول مباشرة — كلاهما غير موجود — يجب البحث بـ `phoneHash` |
| TASK-010 | إصلاح `auth middleware` | `src/middlewares/auth.js` | 44–57 | الـ `select` يطلب `email` و `phone` مباشرة وهي حقول مشفّرة غير موجودة — يجب استخدام `emailEncrypted` و `phoneEncrypted` ثم فك التشفير |
| TASK-011 | إصلاح `adminController.createUser` | `src/controllers/adminController.js` | 109–131 | يكتب `email`, `phone`, `firstName`, `lastName` مباشرة بدون تشفير وهي حقول مشفرة في Schema — يجب استخدام `EncryptionService` |
| TASK-012 | إصلاح `adminController.getBookings` | `src/controllers/adminController.js` | 248–264 | يقرأ `b.user.email` و `b.user.phone` مباشرة بدون فك تشفير — يجب استخدام `EncryptionService.decryptUserFields()` |
| TASK-013 | إصلاح حالة الدفع في Dashboard | `src/controllers/adminController.js` | 19 | يبحث بـ `status: 'paid'` لكن الـ enum الصحيح هو `'SUCCEEDED'` |
| TASK-014 | إضافة `otpCode` لـ `registerSchema` | `src/middlewares/validate.js` | 23–34 | `register()` يقرأ `otpCode` من `req.body` لكن الـ Zod schema لا يتضمنه فيحذفه تلقائياً قبل وصوله للـ controller |
| TASK-015 | إصلاح `googleAuth` — البحث بـ email | `src/controllers/authController.js` | 693–703 | يبحث بـ `{ emailBlindIndex }` و `{ email: cleanEmail }` كحقول مباشرة — غير موجودة — يجب البحث بـ `{ emailHash: emailBlindIndex }` فقط |
| TASK-016 | إصلاح `googleAuth` — phone collision | `src/controllers/authController.js` | 783–791 | يبحث بـ `{ phoneBlindIndex }` و `{ phone: formattedPhone }` — غير موجودة — يجب البحث بـ `{ phoneHash: phoneBlindIndex }` فقط |
| TASK-017 | إصلاح `AuditLog` Schema — حقول غير متطابقة | `prisma/schema.prisma` | 335–349 | `AuditService.js` يكتب `actorId`, `actorRole`, `resourceId`, `ipHash`, `result`, `metadata` لكن نموذج `AuditLog` يحتوي على `userId`, `entity`, `entityId`, `details` فقط |
| TASK-018 | إصلاح `B2bRequest` Schema — حقول مفقودة | `prisma/schema.prisma` | 298–318 | `b2bService.js` يكتب `companyPhone`, `companyEmail`, `reviewedAt` لكن الـ Schema يحتوي على `phone`, `email` ولا يوجد `reviewedAt` |
| TASK-019 | إصلاح Fallback خطير في `getSpecialistForUser` | `src/controllers/specialistPortalController.js` | 36–44 | في حالة عدم العثور على الأخصائي، يربط المستخدم بأول أخصائي في الـ DB مما يكشف بيانات أخصائي آخر |
| TASK-020 | إصلاح `getMyBookings` — حقل `condition` مشفّر | `src/controllers/specialistPortalController.js` | 91 | الـ select يجلب `condition` من `user` لكن الاسم الحقيقي في الـ Schema هو `conditionEncrypted` |
| TASK-021 | إصلاح `adminController.getDashboard` — select حقول مشفّرة | `src/controllers/adminController.js` | 29–36 | الـ select يطلب `{ email: true, phone: true }` مباشرة وهي غير موجودة — يجب `emailEncrypted` و `phoneEncrypted` ثم فك التشفير |
| TASK-022 | إصلاح `b2bService.getAllRequests` — select حقول مشفّرة | `src/services/b2bService.js` | 127–141 | يطلب `email` و `phone` مباشرة في الـ select من `user` و `reviewer` — الحقول غير موجودة |
| TASK-033 | إرسال رسالة تذكير خاطئة عبر WhatsApp | `src/services/reminderWorker.js` مع `src/services/whatsappService.js` | 137 و 122 | دالة `processReminder` تستدعي `sendWhatsAppMessage(phone, null, message)` بينما الدالة تستقبل وسيطين فقط `(phone, code)`، مما يرسل للمريض رسالة `رمز التحقق الخاص بك هو: null` بدلاً من نص التذكير |
| TASK-034 | قراءة حقل غير موجود `sessionUrl` بدلاً من `meetingLink` | `src/controllers/bookingsController.js` | 131 | يستعلم عن `decrypted.sessionUrl` بينما الحقل في نموذج `Booking` هو `meetingLink`، مما يجعل الرابط دائماً `undefined` ويتجاهل الرابط الفعلي |
| TASK-035 | فشل حذف مستخدم بسبب قيد `onDelete: Restrict` | `src/controllers/adminController.js` | 156–164 | حذف المستخدم المباشر يفشل بـ `Foreign key constraint failed (P2003)` إذا كان للمستخدم أي حجز أو دفعة. يجب معالجة العلاقات أو تطبيق Soft Delete |
| TASK-036 | استعلام حقول مشفرة مباشرة في `reviewRequest` | `src/services/b2bService.js` | 187–188 | الاستعلام يطلب `email: true, phone: true` مباشرة من `user` في `include` عند مراجعة الطلب |

---

## 🟡 أولوية 3 — تحسينات

| # | التاسك | الملف | السطر | الوصف |
|---|--------|-------|-------|-------|
| TASK-023 | إصلاح `webhookIpFilter` | `src/middlewares/security.js` | 101 | `next;` مكتوبة بدون `()` — الطلب لن يُمرَّر وستتعطل جميع الـ Visa webhooks |
| TASK-024 | إزالة `visaPaymentSchema` غير المستخدم | `src/middlewares/validate.js` | 70–76 | Schema معرَّف ومُصدَّر لكن لا يُستخدم في أي Route |
| TASK-025 | إضافة DTO لـ `getProfile` | `src/controllers/specialistPortalController.js` | 60–63 | يُعيد كامل object الأخصائي بما فيه حقول داخلية — يجب تصفية البيانات قبل الإرسال |
| TASK-026 | إضافة Pagination لـ `getUsers` | `src/controllers/adminController.js` | 80–103 | يجلب كل المستخدمين دفعة واحدة بدون حد — مشكلة أداء عند النمو |
| TASK-027 | إضافة Pagination لـ `getSpecialists` | `src/controllers/adminController.js` | 169–191 | نفس مشكلة TASK-026 |
| TASK-028 | تنظيم الروابط في `routes/` | `src/routes/` (فارغ) | — | كل الروابط موضوعة في `index.js` — ينقسم لملفات منفصلة لكل module |
| TASK-037 | البحث في الأخصائيين حساس لحالة الأحرف | `src/controllers/specialistsController.js` | 18–23 | البحث بـ `contains` في PostgreSQL حساس لحالة الأحرف ولا يستخدم `mode: 'insensitive'` |
| TASK-038 | إضافة معالج 404 مخصص لطلبات الـ API | `src/index.js` | 234–237 | غياب Catch-All 404 handler لمسارات `/api/*` غير المعرفة مما يرجع HTML الفرونت إند بدلاً من JSON منظم |

---

## 📌 ترتيب التنفيذ

```
المرحلة 1 — Schema (TASK-001 → 006 + TASK-017 + TASK-018 + TASK-032)
  ↓ npx prisma migrate dev --name fix-all-schema-mismatches
  ↓ npx prisma generate

المرحلة 2 — إصلاح الكود والأمان (TASK-007 → 022 + TASK-029 → 031 + TASK-033 → 036)

المرحلة 3 — تحسينات وتوسعة (TASK-023 → 028 + TASK-037 + TASK-038)
```

---

## 🧪 للتشغيل

```bash
cd backend
npm run dev          # تشغيل في وضع التطوير
npm test             # الاختبارات
npx prisma studio    # فحص قاعدة البيانات
```
