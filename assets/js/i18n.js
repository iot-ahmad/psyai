/**
 * Internationalization (i18n) for the authentication page.
 *
 * Responsibilities are isolated here: this module owns the translation
 * dictionaries and the logic that applies them to the DOM. Any other module
 * that needs to translate a single string can import `t()`.
 */

export const DICTIONARIES = {
  ar: {
    loginWelcomeTitle: 'WELCOME', loginWelcomeSub: 'في منصة PsyAI',
    loginWelcomeDesc: 'بوابتك الموثوقة للرفاه النفسي والاستشارات المعتمدة بخصوصية تامة.',
    btnToRegister: 'إنشاء حساب جديد',
    regWelcomeTitle: 'WELCOME!',
    regWelcomeDesc: 'يسعدنا انضمامك! سجّل بياناتك وابدأ رحلتك نحو الرفاه النفسي.',
    btnToLogin: 'تسجيل الدخول',
    loginHeading: 'تسجيل الدخول', loginSub: 'أدخل بياناتك للوصول إلى حسابك',
    btnGoogleLogin: 'الدخول السريع عبر Google',
    btnGoogleReg: 'التسجيل السريع عبر Google',
    sepOr: 'أو بالبيانات التالية',
    sepOrLogin: 'أو عبر البريد الإلكتروني',
    lblIdent: 'اسم المستخدم أو البريد الإلكتروني', phIdent: 'name@gmail.com أو اسم المستخدم',
    lblPassword: 'كلمة المرور',
    rememberMe: 'تذكرني', forgotPass: 'نسيت كلمة المرور؟',
    btnLogin: 'دخول الحساب',
    noAccount: 'ليس لديك حساب؟', linkRegister: 'إنشاء حساب جديد',
    regHeading: 'إنشاء حساب', regSub: 'أنشئ حسابك وابدأ رحلة الرفاه النفسي',
    lblFirst: 'الاسم الأول', phFirst: 'مثال: أحمد',
    lblLast: 'اسم العائلة', phLast: 'مثال: الغامدي',
    lblEmail: 'البريد الإلكتروني (Gmail)',
    lblPhone: 'رقم الهاتف',
    lblGender: 'الجنس', phGender: 'اختر الجنس', optMale: 'ذكر', optFemale: 'أنثى',
    btnRegister: 'تأكيد وإنشاء الحساب',
    btnNextStep: 'التالي: اختر أخصائيك',
    hasAccount: 'لديك حساب؟', linkLogin: 'تسجيل الدخول',
    backBtn: 'رجوع',
    step2Heading: 'أخبرنا عن حالتك',
    step2Sub: 'لنرشح لك الأخصائي الأنسب',
    lblCondition: 'وصف الحالة / المشكلة',
    phCondition: 'اختر ما يصف حالتك',
    condAnxiety: 'القلق والتوتر المستمر',
    condDepression: 'الحزن وفقدان الشغف والحماس',
    condStress: 'ضغط العمل والإرهاق المهني',
    condBurnout: 'الاحتراق الوظيفي وضعف الإنتاجية',
    condRelationships: 'مشاكل العلاقات الأسرية والاجتماعية',
    condAnger: 'إدارة الغضب والتوازن العاطفي',
    condSelfEsteem: 'تدني الثقة بالنفس وتقدير الذات',
    condSleep: 'اضطرابات وجودة النوم',
    condOverthinking: 'التفكير المفرط والتشوش الذهني',
    condWorkLife: 'الموازنة بين العمل والمسؤوليات الشخصية',
    condProcrastination: 'التسويف وصعوبات التركيز والإنجاز',
    condCommunication: 'تطوير مهارات التواصل وحل الخلافات',
    condParenting: 'ضغوط التربية وبناء الذكاء العاطفي للأبناء',
    condResilience: 'بناء المرونة النفسية والتكيف مع التغيرات',
    condVenting: 'مساحة للفضفضة وتفريغ المشاعر',
    condOther: 'أخرى',
    lblOtherDesc: 'اكتب ما يصف حالتك',
    phOtherDesc: 'اكتب وصفًا مختصرًا للحالة أو ما تشعر به...',
    lblSpecGender: 'جنس الأخصائي المفضّل',
    gcAny: 'لا يهم', gcMale: 'ذكر', gcFemale: 'أنثى',
    btnFindSpec: 'ابحث عن أخصائيك الآن',
    langBtn: 'English', homeBtn: 'الرئيسية',
    // Runtime messages (used by auth.js / google flow)
    msgRecoverySent: 'تم إرسال رابط الاستعادة لبريدك الإلكتروني.',
    msgSendingOtp: 'جاري إرسال كود WhatsApp...',
    msgSendingOtpEn: 'Sending WhatsApp OTP...',
    msgVerifying: 'جاري التحقق وتأكيد الحساب...',
    msgLoggingIn: 'جاري التحقق والدخول...',
    msgInvalidEmail: 'يرجى إدخال بريد إلكتروني صالح',
    msgInvalidPhone: 'يرجى إدخال رقم هاتف أردني صحيح (مثال: 0791234567)',
    msgOtpSentShort: 'تم إرسال رمز جديد عبر WhatsApp',
    msgOtpSendError: 'خطأ في إرسال الرمز',
    msgOtpIncomplete: 'يرجى إدخال الرمز المكون من 6 أرقام كاملاً',
    msgOtpInvalid: 'رمز التحقق غير صحيح',
    msgUnexpected: 'حدث خطأ غير متوقع',
    msgGoogleNeedStep2: 'أكمل اختيار حالتك وجنس الأخصائي المفضّل أولاً',
    msgGooglePhoneRequired: 'يرجى إدخال رقم هاتفك الأردني لإكمال الحساب',
  },
  en: {
    loginWelcomeTitle: 'WELCOME', loginWelcomeSub: 'to PsyAI',
    loginWelcomeDesc: 'Your trusted sanctuary for psychological wellness and certified consultations.',
    btnToRegister: 'Sign Up',
    regWelcomeTitle: 'WELCOME!',
    regWelcomeDesc: "We're delighted to have you here. Start your mental wellness journey today.",
    btnToLogin: 'Sign In',
    loginHeading: 'Login', loginSub: 'Enter your credentials to continue',
    btnGoogleLogin: 'Sign in with Google',
    btnGoogleReg: 'Sign up with Google',
    sepOr: 'or register with email',
    sepOrLogin: 'or with email and password',
    lblIdent: 'Username or Email', phIdent: 'name@gmail.com or username',
    lblPassword: 'Password',
    rememberMe: 'Remember me', forgotPass: 'Forgot Password?',
    btnLogin: 'Login',
    noAccount: "Don't have an account?", linkRegister: 'Sign Up',
    regHeading: 'Create Account', regSub: 'Register today and begin your wellness journey',
    lblFirst: 'First Name', phFirst: 'e.g. John',
    lblLast: 'Last Name', phLast: 'e.g. Doe',
    lblEmail: 'Email (Gmail)',
    lblPhone: 'Phone Number',
    lblGender: 'Gender', phGender: 'Select Gender', optMale: 'Male', optFemale: 'Female',
    btnRegister: 'Create Account',
    btnNextStep: 'Next — Choose Your Specialist',
    hasAccount: 'Already have an account?', linkLogin: 'Sign In',
    backBtn: 'Back',
    step2Heading: 'Tell Us About Your Situation',
    step2Sub: 'We will recommend the best specialist for you',
    lblCondition: 'Condition / Issue Description',
    phCondition: 'Select what best describes your situation',
    condAnxiety: 'Anxiety & Ongoing Stress',
    condDepression: 'Sadness & Loss of Passion',
    condStress: 'Work Pressure & Professional Burnout',
    condBurnout: 'Job Burnout & Low Productivity',
    condRelationships: 'Family & Social Relationship Issues',
    condAnger: 'Anger Management & Emotional Balance',
    condSelfEsteem: 'Low Self-Esteem & Self-Confidence',
    condSleep: 'Sleep Disorders & Sleep Quality',
    condOverthinking: 'Overthinking & Mental Fog',
    condWorkLife: 'Work-Life Balance',
    condProcrastination: 'Procrastination & Focus Difficulties',
    condCommunication: 'Communication Skills & Conflict Resolution',
    condParenting: "Parenting Stress & Children's Emotional Intelligence",
    condResilience: 'Building Resilience & Adapting to Change',
    condFatigue: 'General Fatigue & Exhaustion',
    condVenting: 'Safe Space to Vent & Express Emotions',
    condOther: 'Other',
    lblOtherDesc: 'Describe your condition',
    phOtherDesc: 'Write a brief description of the condition or what you feel...',
    lblSpecGender: 'Preferred Specialist Gender',
    gcAny: 'Any', gcMale: 'Male', gcFemale: 'Female',
    btnFindSpec: 'Find My Specialist Now',
    langBtn: 'العربية', homeBtn: 'Home',
    msgRecoverySent: 'Recovery link sent to your email.',
    msgSendingOtp: 'Sending WhatsApp OTP...',
    msgSendingOtpEn: 'Sending WhatsApp OTP...',
    msgVerifying: 'Verifying and confirming your account...',
    msgLoggingIn: 'Verifying and signing you in...',
    msgInvalidEmail: 'Please enter a valid email',
    msgInvalidPhone: 'Please enter a valid Jordanian phone number',
    msgOtpSentShort: 'A new code was sent via WhatsApp',
    msgOtpSendError: 'Failed to send the code',
    msgOtpIncomplete: 'Please enter the complete 6-digit code',
    msgOtpInvalid: 'The verification code is incorrect',
    msgUnexpected: 'Something went wrong',
    msgGoogleNeedStep2: 'Please choose your condition and preferred specialist gender first',
    msgGooglePhoneRequired: 'Please enter your Jordanian phone number to complete the account',
  },
};

/** Human-readable language labels for the toggle button. */
const HTML_LANG = { ar: 'ar', en: 'en' };
const HTML_DIR = { ar: 'rtl', en: 'ltr' };

/** The mutable active language. Read via `getLang()`. */
let currentLang = 'ar';

/** @returns {string} the active language code ('ar' | 'en'). */
export function getLang() {
  return currentLang;
}

/**
 * Translate a single dictionary key for the active language.
 * Falls back to the key itself so a missing translation is visible, not silent.
 * @param {string} key
 * @returns {string}
 */
export function t(key) {
  return DICTIONARIES[currentLang][key] ?? key;
}

/**
 * Apply a language to the whole page: document attributes, every element that
 * declares `data-i18n` (text) or `data-i18n-ph` (placeholder), plus the two
 * top-bar labels.
 *
 * @param {'ar'|'en'} lang
 */
export function applyLang(lang) {
  currentLang = lang;
  const dict = DICTIONARIES[lang];

  document.documentElement.setAttribute('lang', HTML_LANG[lang]);
  document.documentElement.setAttribute('dir', HTML_DIR[lang]);

  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    if (dict[key] !== undefined) el.textContent = dict[key];
  });

  document.querySelectorAll('[data-i18n-ph]').forEach((el) => {
    const key = el.getAttribute('data-i18n-ph');
    if (dict[key] !== undefined) el.placeholder = dict[key];
  });

  const langLabel = document.getElementById('langLabel');
  const homeLbl = document.getElementById('homeLbl');
  if (langLabel) langLabel.textContent = dict.langBtn;
  if (homeLbl) homeLbl.textContent = dict.homeBtn;
}

/** Toggle between Arabic and English. @returns {string} the new language. */
export function toggleLang() {
  applyLang(currentLang === 'ar' ? 'en' : 'ar');
  return currentLang;
}
