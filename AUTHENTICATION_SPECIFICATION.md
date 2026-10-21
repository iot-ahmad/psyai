# PsyAI — المواصفات التقنية الكاملة لنظام المصادقة والأمان (Authentication & Security)

> **المنصة:** PsyAI للاستشارات النفسية  
> **البيئة التقنية:** Node.js + Express.js + Prisma ORM + PostgreSQL  
> **المكونات الأساسية:** `authController.js`, `securityService.js`, `whatsappService.js`, `encryptionService.js`, `middlewares/auth.js`  
> **الإصدار:** 1.0.0 | **تاريخ الاعتماد:** أكتوبر 2026

---

## القسم الأول: الفلسفة الأمنية ومعايير التشفير وحماية البيانات

تعتمد منصة PsyAI معمارية أمنية متعددة الطبقات لحماية البيانات الطبية والصحية للمرضى وفق معايير HIPAA و GDPR:

1. **التشفير الحبيبي (Field-Level Encryption):**
   - تشفير الحقول: `firstName`, `lastName`, `emailEncrypted`, `phoneEncrypted`, `conditionEncrypted`.
   - الخوارزمية: AES-256-GCM مع مفتاح متماثل 32 بايت و IV عشوائي 12 بايت وتوليد Authentication Tag.
   - لا يمكن قراءة أي سجل من قاعدة البيانات مباشرة دون المرور بدالة فك التشفير.

2. **الفهرسة العمياء للبحث (Blind Index HMAC-SHA256):**
   - توليد بصمة تجزئة غير قابلة للعكس لكل من البريد الإلكتروني ورقم الهاتف باستخدام خوارزمية HMAC-SHA256 مع ملح `BLIND_INDEX_PEPPER` معزول على الخادم.
   - الحقول: `emailHash` و `phoneHash`.
   - تتيح البحث الفوري المطابق دون الحاجة لفك تشفير قاعدة البيانات.

3. **تجزئة كلمات المرور (Argon2id Hashing):**
   - تطبيق خوارزمية Argon2id بالمواصفات المعتمدة (ذاكرة 64MB، 3 تكرارات، 4 خيوط متوازية).
   - التحويل التلقائي الآمن إلى Bcrypt (Cost 12) في حال عدم توفر مكتبات التجميع الأصلية.

4. **رموز التحقق المؤقتة (CSPRNG WhatsApp OTP):**
   - توليد رموز عشوائية آمنة بطول 6 خانات رقمية عبر `crypto.randomInt`.
   - تخزين الرمز مجزأً في جدول `OtpToken` مع ملح مخصص `OTP_PEPPER`.
   - مدة الصلاحية: 5 دقائق، مع تبريد 60 ثانية، وقفل مؤقت 15 دقيقة عند 5 محاولات خاطئة.

5. **إدارة الجلسات والإلغاء الفوري (JWT & tokenVersion):**
   - رموز JWT موقّعة بـ HS256 مع فترة صلاحية 7 أيام.
   - تضمين حقل `tokenVersion` لإلغاء كافة الجلسات النشطة فورياً عند تغيير كلمة المرور أو تحديث الأمان.

---

## القسم الثاني: مخطط قاعدة البيانات ونماذج جداول الهوية

### 1. نموذج المستخدم (User Model)
```prisma
model User {
  id                 String              @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  firstName          String              @map("first_name") @db.Text  // بعد معالجة TASK-032
  lastName           String              @map("last_name") @db.Text   // بعد معالجة TASK-032
  
  emailEncrypted     String              @map("email_encrypted") @db.Text
  emailHash          String              @unique @map("email_hash") @db.VarChar(64)
  phoneEncrypted     String              @map("phone_encrypted") @db.Text
  phoneHash          String              @unique @map("phone_hash") @db.VarChar(64)
  
  passwordHash       String              @map("password_hash") @db.VarChar(255)
  gender             GenderEnum
  conditionEncrypted String?             @map("condition_encrypted") @db.Text
  specGenderPref     SpecGenderPrefEnum? @default(any) @map("spec_gender_pref")
  
  role               UserRoleEnum        @default(user)        // user, specialist, admin
  isVerified         Boolean             @default(false) @map("is_verified")
  tokenVersion       Int                 @default(0) @map("token_version")
  status             UserStatusEnum      @default(active)      // active, inactive, suspended
  googleId           String?             @unique @map("google_id") @db.VarChar(64)
  language           LanguageEnum?       @default(ar)
  
  createdAt          DateTime            @default(now()) @map("created_at") @db.Timestamp(6)
  updatedAt          DateTime            @default(now()) @updatedAt @map("updated_at") @db.Timestamp(6)
}
```

### 2. نموذج رمز التحقق المؤقت (OtpToken Model)
```prisma
model OtpToken {
  id             String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  phone          String    @unique @db.VarChar(50)
  codeHash       String    @map("code_hash") @db.VarChar(255)
  attempts       Int       @default(0)
  phoneLockUntil DateTime? @map("phone_lock_until") @db.Timestamp(6)
  expiresAt      DateTime  @map("expires_at") @db.Timestamp(6)
  createdAt      DateTime  @default(now()) @map("created_at") @db.Timestamp(6)

  @@index([phone], map: "idx_otp_tokens_phone")
  @@map("otp_tokens")
}
```

### 3. نموذج استعادة كلمة المرور (PasswordResetToken Model)
```prisma
model PasswordResetToken {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId    String   @map("user_id") @db.Uuid
  tokenHash String   @unique @map("token_hash") @db.VarChar(64)
  expiresAt DateTime @map("expires_at") @db.Timestamp(6)
  used      Boolean  @default(false)
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamp(6)

  @@index([tokenHash], map: "idx_pwd_reset_token")
  @@map("password_reset_tokens")
}
```

---

## القسم الثالث: المواصفات التفصيلية لواجهات برمجة التطبيقات

### 1. إرسال رمز التحقق عبر واتساب (POST /api/auth/send-otp)
- **الحماية والمحددات:** `otpRateLimiter` (3 طلبات / 10 دقائق)، تبريد 60 ثانية بين الرسائل، قفل 15 دقيقة بعد 5 أخطاء.
- **Request Body:**
```json
{
  "phone": "+962791234567"
}
```
- **Response 200 OK:**
```json
{
  "success": true,
  "message": "تم إرسال رمز التحقق بنجاح عبر WhatsApp",
  "expiresInMinutes": 5
}
```

### 2. التحقق من صحة الرمز وتأكيد الهاتف (POST /api/auth/verify-otp)
- **Request Body:**
```json
{
  "phone": "+962791234567",
  "code": "384920"
}
```
- **Response 200 OK (مستخدم جديد):**
```json
{
  "success": true,
  "message": "تم تأكيد رقم الهاتف بنجاح! يمكنك الآن إكمال إنشاء حسابك."
}
```
- **Response 200 OK (مستخدم مسجل - تسجيل دخول فوري):**
```json
{
  "success": true,
  "message": "تم تأكيد رقم الهاتف بنجاح! تم تسجيل دخولك.",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "7f8b9c0d-1234-5678-9abc-def012345678",
    "firstName": "أحمد",
    "lastName": "الخالد",
    "phone": "+962791234567",
    "role": "user",
    "isVerified": true
  }
}
```

### 3. إنشاء حساب مستخدم جديد (POST /api/auth/register)
- **Request Body:**
```json
{
  "firstName": "عبدالله",
  "lastName": "التميمي",
  "email": "user@example.com",
  "phone": "+962791234567",
  "password": "SecureP@ssw0rd!",
  "gender": "male",
  "condition": "أعاني من ضغوط وقلق في العمل",
  "specGenderPref": "any",
  "otpCode": "384920"
}
```
- **Response 201 Created:**
```json
{
  "success": true,
  "message": "تم إنشاء الحساب بنجاح! مرحباً بك في PsyAI.",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "firstName": "عبدالله",
    "lastName": "التميمي",
    "fullName": "عبدالله التميمي",
    "email": "user@example.com",
    "phone": "+962791234567",
    "gender": "male",
    "role": "user",
    "isVerified": true,
    "status": "active"
  }
}
```

### 4. تسجيل الدخول بالبيانات المعتمدة (POST /api/auth/login)
- **المحددات:** `loginRateLimiter` (3 محاولات فاشلة / 15 دقيقة لكل عنوان IP).
- **Request Body:**
```json
{
  "identifier": "user@example.com",
  "password": "SecureP@ssw0rd!"
}
```
- **Response 200 OK:**
```json
{
  "success": true,
  "message": "أهلاً بك مجدداً يا عبدالله!",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "firstName": "عبدالله",
    "lastName": "التميمي",
    "fullName": "عبدالله التميمي",
    "email": "user@example.com",
    "phone": "+962791234567",
    "role": "user"
  }
}
```

### 5. المصادقة عبر Google OAuth (POST /api/auth/google)
- **Request Body:**
```json
{
  "idToken": "eyJhbGciOiJSUzI1NiIsImtpZCI6Ij...",
  "phone": "+962791234567",
  "otpCode": "192837",
  "condition": "قلق وتوتر"
}
```
- **Response 200 (مستخدم يحتاج تأكيد الهاتف):**
```json
{
  "success": true,
  "needsPhone": true,
  "restrictedToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "message": "يرجى إدخال رقم هاتفك وتأكيده لإكمال تفعيل الحساب."
}
```

### 6. استعادة وإعادة تعيين كلمة المرور
- **POST /api/auth/forgot-password:**
```json
{
  "email": "user@example.com"
}
```
- **POST /api/auth/reset-password:**
```json
{
  "token": "a4f89b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a",
  "newPassword": "NewSecurePassword2026!"
}
```

### 7. واجهات إدارة الحساب والملف الشخصي (/api/user)
- `GET /api/auth/me` (محمي بـ JWT)
- `GET /api/user/profile` (محمي بـ JWT)
- `PUT /api/user/profile` (تحديث الاسم، الحالة النفسية، والتفضيلات)
- `POST /api/user/send-phone-otp` (طلب تحديث رقم الهاتف)
- `POST /api/user/update-phone` (تأكيد الرمز واعتماد الهاتف الجديد)
- `PUT /api/user/change-password` (تغيير كلمة المرور وزيادة tokenVersion)
- `DELETE /api/user/account` (حذف أو تعطيل الحساب)

---

## القسم الرابع: مخططات تدفق المصادقة (Authentication Workflows)

### 1. تدفق التسجيل وتأكيد الهاتف عبر واتساب
```
[المستخدم] ── 1. إدخال رقم الهاتف ──► [POST /api/auth/send-otp]
                                              │
                                              ▼
                                 [توليد OTP 6 أرقام CSPRNG]
                                              │
                                              ▼
                             [حفظ codeHash في OtpToken بمدة 5 دقائق]
                                              │
                                              ▼
                               [إرسال الرمز عبر WhatsApp API]
                                              │
[المستخدم] ◄── 2. استلام الرمز عبر الواتساب ───┘
     │
     └── 3. إدخال (الرمز + بيانات التسجيل) ──► [POST /api/auth/register]
                                                          │
                                                          ▼
                                          [مطابقة الرمز مع OtpToken]
                                                          │
                                                          ▼
                                           [Argon2id Hash لكلمة المرور]
                                                          │
                                                          ▼
                                      [تشفير الاسم، الهاتف، والإيميل AES-256]
                                                          │
                                                          ▼
                                            [توليد الفهرس الأعمى Hash]
                                                          │
                                                          ▼
                                             [إنشاء السجل في جدول User]
                                                          │
                                                          ▼
[المستخدم] ◄── 4. استلام الـ JWT Token والبيانات ── [توليد JWT بصلاحية 7 أيام]
```

### 2. تدفق تسجيل الدخول والتحقق من الجلسة
```
[العميل] ── إرسال (المعرّف + كلمة المرور) ──► [POST /api/auth/login]
                                                    │
                                                    ▼
                                  [توليد الفهرس الأعمى للمعرّف المدخل]
                                                    │
                                                    ▼
                             [البحث في جدول User بـ emailHash أو phoneHash]
                                                    │
                                   ┌────────────────┴───────────────┐
                              (غير موجود)                       (موجود)
                                   ▼                                ▼
                           [401 خطأ في البيانات]          [فحص حالة الحساب status]
                                                                    │
                                                        ┌───────────┴──────────┐
                                                    (موقوف)                 (نشط)
                                                        ▼                      ▼
                                               [403 الحساب موقوف]     [فحص كلمة المرور Argon2id]
                                                                               │
                                                                   ┌───────────┴──────────┐
                                                               (غير صحيحة)              (صحيحة)
                                                                   ▼                       ▼
                                                          [401 بيانات خاطئة]     [توليد JWT موقع بـ HS256]
                                                                                           │
[العميل] ◄─────────── استلام Token وحفظه محلياً ──────────────────────────────────────────┘
```

---

## القسم الخامس: مستويات الصلاحيات والتحكم بالوصول (RBAC)

1. **وسيط التحقق المركزي `protect`:**
   - فحص توقيع JWT بصلاحية 7 أيام.
   - التحقق من نطاق التوكن ومنع الـ `restrictedToken` من الوصول للمسارات الكاملة.
   - مطابقة `tokenVersion` في التوكن مع المسجل في قاعدة البيانات لإبطال الجلسات القديمة فورياً.

2. **وسيط تقييد الصلاحيات `restrictTo`:**
   - الأدوار: `user`, `specialist`, `admin`.
   - منع أي مستخدم من تجاوز صلاحياته وإرجاع `403 Forbidden` عند التعارض.

---

## القسم السادس: خارطة المهام البرمجية الشاملة لمطور المصادقة والأمان

> **تنبيه لفريق التطوير:** تم ترتيب هذه المهام استناداً إلى معايير OWASP ASVS 5.0 و NIST SP 800-63B-4 و OWASP API Security Top 10. يجب الالتزام التام بالترتيب المرحلي الوارد أدناه.

---

### المرحلة 0: المهام الإسعافية الفورية (علاج الأعطال البرمجية الحالية في الخادم)

| رمز المهمة | عنوان المهمة المطلوبة | الملف المعني | رقم السطر | الوصف الفني للمشكلة والمتطلبات البرمجية |
|---|---|---|---|---|
| AUTH-001 | إضافة نموذج PasswordResetToken في Prisma | `prisma/schema.prisma` | نهاية الملف | عمليات استعادة كلمة المرور تستدعي prisma.passwordResetToken وهو مفقود بالـ Schema مما يعطل الميزة كلياً. |
| AUTH-002 | تصحيح البحث في forgotPassword بالفهرس الأعمى | `src/controllers/authController.js` | 412–413 | البحث يتم بـ `{ email }` المباشر وهو حقل مشفر؛ يجب استخدام بصمة التجزئة emailHash. |
| AUTH-003 | تصحيح البحث في verifyOtp بالفهرس الأعمى | `src/controllers/authController.js` | 140–147 | البحث يتم بحقول مباشرة غير معرفة في جدول User؛ يجب الاعتماد حصراً على phoneHash. |
| AUTH-004 | تصحيح وسيط المصادقة protect لجلب وتشفير الحقول | `src/middlewares/auth.js` | 44–57 | استعلام المستخدم في الـ select يطلب حقولاً مشفرة بمسميات خاطئة؛ يجب جلب الحقول المشفرة ثم فك تشفيرها. |
| AUTH-005 | إضافة otpCode لمخطط التحقق registerSchema | `src/middlewares/validate.js` | 23–34 | متحكم التسجيل يقرأ otpCode بينما يحذفه Zod تلقائياً قبل الوصول لعدم تضمينه بالمخطط. |
| AUTH-006 | تصحيح استعلام البريد في تسجيل Google | `src/controllers/authController.js` | 693–703 | البحث يتم بحقول خاطئة؛ يجب تصحيحه للبحث عبر `{ emailHash: emailBlindIndex }` فقط. |
| AUTH-007 | تصحيح فحص تعارض الهاتف في تسجيل Google | `src/controllers/authController.js` | 783–791 | التحقق من عدم تكرار الهاتف يجب أن يعتمد حصراً على `{ phoneHash: phoneBlindIndex }`. |
| AUTH-008 | توسيع حجم حقلي الأسماء في Schema للنصوص المشفرة | `prisma/schema.prisma` | 125–126 | الاسمان مشفران بـ AES-256-GCM ويتجاوزان 100 حرف بالأسماء العربية؛ تحويل النوع إلى @db.Text. |

---

### المرحلة 1: الحماية الحرجة وتأمين تدفقات الدخول (Critical Security & Flow Hardening)

| رمز المهمة | عنوان المهمة المطلوبة | الملف المعني | رقم السطر | الوصف الفني للمشكلة والمتطلبات البرمجية |
|---|---|---|---|---|
| AUTH-101 | استبدال JWT بتذكرة تحقق مؤقتة في verify-otp | `src/controllers/authController.js` | 112–180 | الـ OTP يثبت ملكية الرقم فقط ولا يمنح جلسة كاملة؛ إرجاع تذكرة صالحة 10 دقائق (`purpose: phone_verified`) برمز jti لمرة واحدة. |
| AUTH-102 | توحيد ردود المصادقة لمنع تعداد المستخدمين | `src/controllers/authController.js` | 180، 345، 420 | إرجاع رسائل وهيئات استجابة متطابقة للرقم أو البريد سواء كان مسجلاً أو جديداً لحظر ثغرات User Enumeration. |
| AUTH-103 | تحصين مسار Google OAuth ومنع الاستيلاء على الحسابات | `src/controllers/authController.js` | 650–920 | التحقق من `email_verified: true`، الاعتماد على المعرف sub، وحظر الربط التلقائي بحساب موجود دون إثبات ملكية مسبق. |
| AUTH-104 | الإبطال الفوري للجلسات القديمة بعد reset-password | `src/controllers/authController.js` | 472–520 | زيادة عداد tokenVersion، إبطال كافة الجلسات النشطة في قاعدة البيانات، وإرسال بريد إشعار فوري بتغيير كلمة المرور. |
| AUTH-105 | تطبيق ضوابط BOLA/IDOR في وصول الأخصائي للمرضى | `src/controllers/specialistPortalController.js` | عام بكافة المسارات | بناء دالة فحص assertCanAccessPatient للتحقق الصارم من وجود حجز أو علاقة علاجية نشطة قبل كشف ملف أي مريض. |
| AUTH-106 | منع ثغرات Mass Assignment وتفعيل strict بمخططات Zod | `src/middlewares/validate.js` | كافة المخططات | تفعيل `.strict()` وحظر قبول حقول الصلاحيات والحالات (`role`, `status`, `isVerified`) من جسم الطلب بشكل قاطع. |
| AUTH-107 | تنقية السجلات البرمجية وحجب البيانات الحساسة | `src/services/auditService.js` | كافة السجلات | حجب وتشفير الهواتف والبريد الإلكتروني والرموز من ملفات الـ Console، وحظر تسجيل أجسام طلبات المصادقة نهائياً. |

---

### المرحلة 2: إدارة الجلسات المتقدمة والتشفير والسياسات (Session & Cryptography)

| رمز المهمة | عنوان المهمة المطلوبة | الملف المعني | رقم السطر | الوصف الفني للمشكلة والمتطلبات البرمجية |
|---|---|---|---|---|
| AUTH-201 | تطبيق نموذج Access/Refresh مع تدوير الجلسات | `prisma/schema.prisma` + `authController.js` | نموذج Session الجديد | استبدال توكن 7 أيام بـ Access Token (15 دقيقة) و Refresh Token معتم في HttpOnly Secure Cookie مع تدوير كامل وكشف إعادة الاستخدام. |
| AUTH-202 | نقل محددات السرعة إلى Redis بنافذة منزلقة ومفاتيح مركبة | `src/middlewares/security.js` | محددات السرعة | توزيع Rate Limiting على Redis بمفاتيح مركبة (IP + Hash Identifier) وتطبيق تأخير تصاعدي بدلاً من الحظر الصلب. |
| AUTH-203 | تحديث سياسة كلمات المرور وفق معيار NIST 800-63B-4 | `src/middlewares/validate.js` + `securityService.js` | سياسة المرور | إلغاء قيود التركيب واعتماد طول أدنى 15 محرفاً، قبول العربية والمسافات (NFKC)، فحص HIBP، وموازنة التوقيت بتجزئة وهمية. |
| AUTH-204 | إلزام الإقلاع الصارم لـ Argon2id وترقية التجزئة التلقائية | `src/services/securityService.js` | hashPassword | منع الرجوع الصامت لـ Bcrypt في بيئة الإنتاج (Fail-fast)، وتطبيق فحص needsRehash لترقية التجزئات القديمة عند الدخول. |
| AUTH-205 | تطبيق التحقق المعزز الحديث Step-up Authentication | `src/controllers/authController.js` | مسارات الحساب الحساسة | اشتراط إعادة إدخال كلمة المرور أو رمز التحقق خلال آخر 5 دقائق قبل تغيير كلمة المرور، تحديث الهاتف، أو حذف الحساب. |
| AUTH-206 | ترقية تشفير الحقول ببيانات مصادقة AAD وتطهير OtpToken | `src/services/encryptionService.js` + `schema.prisma` | تشفير الحقول | ربط النص المشفر بمعرف السجل ونوعه عبر AAD لمنع نقل النصوص، واستبدال الهاتف الصريح في OtpToken بـ phoneHash. |

---

### المرحلة 3: المعايير الحديثة والامتثال المؤسسي (Modern Standards & Compliance)

| رمز المهمة | عنوان المهمة المطلوبة | الملف المعني | رقم السطر | الوصف الفني للمشكلة والمتطلبات البرمجية |
|---|---|---|---|---|
| AUTH-301 | إضافة دعم مفاتيح المرور البيومترية Passkeys (WebAuthn) | جدول Credential + `authController.js` | مسارات WebAuthn | دمج مكتبة `@simplewebauthn/server` لدعم تسجيل الدخول البيومتري المقاوم للتصيد الاحتيالي دون الاعتماد على رسائل الهاتف. |
| AUTH-302 | حماية واتساب من استنزاف الرسائل (SMS/OTP Pumping) | `src/services/whatsappService.js` | إرسال الرموز | دمج كابتشا غير مرئية (Cloudflare Turnstile) قبل طلب الرمز، تقييد البلدان المصرحة، ووضع سقف استهلاك كلي للساعة. |
| AUTH-303 | تكامل إدارة المفاتيح السحابية KMS وتدوير المفاتيح آلياً | `src/services/encryptionService.js` | إدارة المفاتيح | تطبيق Envelope Encryption عبر AWS KMS أو HashiCorp Vault وإدارة تدوير مفاتيح تشفير البيانات (DEK) دورياً. |
| AUTH-304 | بناء سجل تدقيق غير قابل للتعديل وسياسات الحذف المشفر | `prisma/schema.prisma` + `auditService.js` | AuditLog | بناء سجل إلحاقي حصري (Append-Only) لتعقب الوصول للملفات الطبية وتطبيق الإتلاف المشفر (Crypto-shredding) لبيانات المرضى. |

