/**
 * Authentication controller.
 *
 * Owns the page state machine (login ↔ register, step 1 ↔ 2) and every
 * authentication flow: WhatsApp OTP registration, standard login, Google
 * sign-in, and OTP resend/verify. It talks to the `api` layer for the network
 * and to `ui` helpers for DOM feedback, keeping each concern separate.
 */

import * as api from './api.js';
import * as ui from './ui.js';
import {
  OTP,
  STORAGE_KEYS,
  REDIRECT_DELAY_MS,
  ROLE_REDIRECTS,
  SPECIALISTS_PAGE,
  DEFAULT_SPEC_GENDER,
} from './config.js';
import { t, getLang } from './i18n.js';

/* ---------------------------------------------------------------------------
 * Module state
 * ------------------------------------------------------------------------ */

const state = {
  isRegisterView: false,
  specGender: DEFAULT_SPEC_GENDER,
  /** Data collected across the two registration steps (or the Google flow). */
  pendingRegistration: null,
  /** Latest dev/simulator OTP code, used as an offline fallback. */
  currentDevCode: null,
  otpTimer: null,
};

/** @returns {boolean} whether the register view is active. */
export function isRegisterView() {
  return state.isRegisterView;
}

/* ---------------------------------------------------------------------------
 * View switching (login ↔ register) and register steps
 * ------------------------------------------------------------------------ */

/** Switch the card to the register view. */
export function showRegister() {
  if (state.isRegisterView) return;
  state.isRegisterView = true;

  const card = document.getElementById('authCard');
  card?.classList.add('reg');
  pulseCard(card);
  document.body.classList.add('is-reg');
  resetToStep1();
}

/** Switch the card to the login view. */
export function showLogin() {
  state.pendingRegistration = null;
  if (!state.isRegisterView) return;
  state.isRegisterView = false;

  const card = document.getElementById('authCard');
  card?.classList.remove('reg');
  pulseCard(card);
  document.body.classList.remove('is-reg');
  resetToStep1();
}

/**
 * Brief scale/glow pulse (≈ panel duration) so the flip feels physical.
 * Purely cosmetic — safe to no-op when the card is absent (tests).
 * @param {Element|null|undefined} card
 */
function pulseCard(card) {
  if (!card?.classList) return;
  card.classList.add('is-switching');
  setTimeout(() => card.classList.remove('is-switching'), 3000);
}

/** Move the register column to step 2 (condition + specialist preference). */
export function goToRegisterStep2() {
  document.getElementById('colRegister')?.classList.add('step2');
  ui.setStepDots(2);
}

/** Return the register column to step 1. */
export function resetToStep1() {
  document.getElementById('colRegister')?.classList.remove('step2');
  ui.setStepDots(1);
  const badge = document.getElementById('googleRegBadge');
  if (badge) badge.style.display = 'none';
}

/** Handle change of psychological condition dropdown (reveals 'other' textarea). */
export function handleConditionChange(value) {
  const wrap = document.getElementById('otherDescWrap');
  const textarea = document.getElementById('rOtherDesc');
  if (!wrap) return;

  if (value === 'other') {
    wrap.style.display = 'block';
    if (typeof requestAnimationFrame !== 'undefined') {
      requestAnimationFrame(() => wrap.classList.add('visible'));
    } else {
      wrap.classList.add('visible');
    }
    if (textarea) textarea.required = true;
  } else {
    wrap.classList.remove('visible');
    setTimeout(() => {
      if (!wrap.classList.contains('visible')) {
        wrap.style.display = 'none';
      }
    }, 350);
    if (textarea) {
      textarea.value = '';
      textarea.required = false;
    }
  }
}

/* ---------------------------------------------------------------------------
 * Persistence + redirect helpers
 * ------------------------------------------------------------------------ */

/**
 * Persist the session token and user object to localStorage.
 * Writes the legacy `token` key too so older pages keep working.
 * @param {string} token
 * @param {object} user
 */
function persistSession(token, user) {
  try {
    localStorage.setItem(STORAGE_KEYS.TOKEN, token);
    localStorage.setItem(STORAGE_KEYS.TOKEN_LEGACY, token);
    localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
  } catch (err) {
    console.warn('[STORAGE] LocalStorage is restricted in this browser session:', err);
  }
}

/** @returns {boolean} whether the user arrived from a booking flow. */
function isFromBooking() {
  return new URLSearchParams(window.location.search).get('from') === 'booking';
}

/**
 * Decide and perform the post-authentication redirect.
 * @param {object} user
 * @param {{bookingToSpecialists?: boolean, withPrefs?: boolean}} [opts]
 */
function redirectAfterAuth(user, { bookingToSpecialists = false, withPrefs = false } = {}) {
  setTimeout(() => {
    if (bookingToSpecialists) {
      window.location.href = SPECIALISTS_PAGE;
      return;
    }
    if (withPrefs) {
      const data = state.pendingRegistration || user || {};
      const cond = data.condition || user?.condition || '';
      const specGen = data.specGenderPref || user?.specGenderPref || DEFAULT_SPEC_GENDER;
      window.location.href =
        `${SPECIALISTS_PAGE}?condition=${encodeURIComponent(cond)}&specGender=${encodeURIComponent(specGen)}`;
      return;
    }
    const roleTarget = ROLE_REDIRECTS[user?.role] || 'index.html';
    window.location.href = roleTarget;
  }, REDIRECT_DELAY_MS);
}

/* ---------------------------------------------------------------------------
 * Register — step 1 → request OTP
 * ------------------------------------------------------------------------ */

/**
 * Capture register step-1 data (used by the step-1 → step-2 → OTP flow).
 * @param {object} [customData]
 * @returns {object} the raw step-1 values
 */
export function handleRegisterStep1(customData) {
  let step1;
  if (customData) {
    const src = customData.detail || customData;
    step1 = {
      firstName: src.firstName || src.first || '',
      lastName: src.lastName || src.last || '',
      email: src.email || '',
      phone: src.phone || '',
      gender: src.gender || '',
      password: src.password || '',
    };
  } else {
    step1 = readRegisterStep1();
  }
  state.pendingRegistration = { ...(state.pendingRegistration || {}), ...step1 };
  return state.pendingRegistration;
}

/** Read the raw registration form values into a plain object. */
function readRegisterStep1() {
  const val = (id) => document.getElementById(id)?.value?.trim() ?? '';
  return {
    firstName: val('rFirst'),
    lastName: val('rLast'),
    email: val('rEmail'),
    phone: val('rPhone'),
    gender: document.getElementById('rGender')?.value ?? '',
    password: document.getElementById('rPass')?.value ?? '',
  };
}

/** Read register step 2 (condition + specialist preference + other description). */
function readRegisterStep2() {
  const condition = document.getElementById('rCondition')?.value ?? '';
  const otherDesc = document.getElementById('rOtherDesc')?.value?.trim() ?? '';
  return {
    condition,
    otherDesc: condition === 'other' ? otherDesc : '',
    specGenderPref: document.getElementById('rSpecGender')?.value ?? DEFAULT_SPEC_GENDER,
  };
}

/**
 * Handle register step 2 submit: merge step-1 + step-2 data, request an OTP,
 * then open the OTP modal.
 * @param {Event} [event]
 */
export async function submitRegisterStep2(event) {
  event?.preventDefault?.();

  const step1 = readRegisterStep1();
  const step2 = readRegisterStep2();

  // Merge step-1 form inputs, keeping existing pending data if fields are empty
  const activeStep1 = {};
  for (const [k, v] of Object.entries(step1)) {
    if (v) activeStep1[k] = v;
  }

  state.pendingRegistration = {
    ...(state.pendingRegistration || {}),
    ...activeStep1,
    ...step2,
  };

  // The condition drives specialist matching — it is required.
  if (!state.pendingRegistration.condition) {
    ui.showToast(t('lblCondition'), 'err');
    return;
  }

  // If 'other' condition is chosen, custom description is required
  if (state.pendingRegistration.condition === 'other' && !state.pendingRegistration.otherDesc) {
    ui.showToast(t('lblOtherDesc') || 'يرجى كتابة ما يصف حالتك', 'err');
    document.getElementById('rOtherDesc')?.focus?.();
    return;
  }

  const restore = ui.withLoading(
    document.getElementById('finalRegBtn'),
    t('msgSendingOtp'),
  );

  try {
    const devCode = await requestOtp(state.pendingRegistration.phone);
    state.currentDevCode = devCode;
    goToRegisterStep2();
    openOtpModal(state.pendingRegistration.phone, devCode);
    ui.showToast(`تم إرسال رمز التحقق إلى واتساب على الرقم ${state.pendingRegistration.phone}`);
  } catch (err) {
    const errEl = document.getElementById('otpErrorMsg');
    if (errEl) {
      errEl.textContent = err?.message || t('msgUnexpected');
      errEl.style.display = 'block';
    }
    ui.showToast(err?.message || t('msgUnexpected'), 'err');
  } finally {
    restore();
  }
}

/**
 * Request an OTP, falling back to the offline simulator code if the backend
 * is unreachable.
 * @param {string} phone
 * @returns {Promise<string>} the dev code (if any)
 */
async function requestOtp(phone) {
  try {
    const result = await api.sendOtp(phone);
    if (result.success) return result.devCode || OTP.OFFLINE_CODE;
    throw new Error(result.message || t('msgOtpSendError'));
  } catch (err) {
    if (err instanceof TypeError) {
      return OTP.OFFLINE_CODE;
    }
    throw err;
  }
}

/* ---------------------------------------------------------------------------
 * OTP modal
 * ------------------------------------------------------------------------ */

/**
 * Open the OTP modal for a phone, optionally surfacing the dev code.
 * @param {string} phone
 * @param {string|null} devCode
 */
export function openOtpModal(phone, devCode) {
  const phoneEl = document.getElementById('otpPhoneDisplay');
  if (phoneEl) phoneEl.textContent = phone;

  const badge = document.getElementById('otpDevBadge');
  if (badge) {
    if (devCode) {
      badge.style.display = 'flex';
      const codeEl = document.getElementById('otpDevCodeVal');
      if (codeEl) codeEl.textContent = devCode;
    } else {
      badge.style.display = 'none';
    }
  }

  ui.clearOtpInputs();
  const errEl = document.getElementById('otpErrorMsg');
  if (errEl) errEl.style.display = 'none';

  ui.openModal('otpModal');
  setTimeout(() => document.querySelector('.otp-digit[data-idx="0"]')?.focus(), 100);

  startOtpCountdown();
  ui.setupOtpInputs({ onComplete: verifyAndCompleteRegistration });
}

/** Close the OTP modal and stop its countdown. */
export function closeOtpModal() {
  ui.closeModal('otpModal');
  if (state.otpTimer) clearInterval(state.otpTimer);
}

/** Auto-fill the dev OTP and submit (dev helper badge). */
export function autoFillDevOtp() {
  if (!state.currentDevCode) return;
  ui.fillOtpInputs(state.currentDevCode);
  verifyAndCompleteRegistration();
}

/** Start / restart the 60s resend countdown. */
function startOtpCountdown() {
  let seconds = OTP.RESEND_SECONDS;
  const timerEl = document.getElementById('otpTimer');
  const resendBtn = document.getElementById('otpResendBtn');
  if (resendBtn) {
    resendBtn.disabled = true;
    resendBtn.style.opacity = '0.5';
  }

  if (state.otpTimer) clearInterval(state.otpTimer);
  state.otpTimer = setInterval(() => {
    seconds -= 1;
    if (timerEl) timerEl.textContent = String(seconds);
    if (seconds <= 0) {
      clearInterval(state.otpTimer);
      if (resendBtn) {
        resendBtn.disabled = false;
        resendBtn.style.opacity = '1';
        resendBtn.innerHTML = 'إعادة الإرسال الآن';
      }
    }
  }, 1000);
}

/** Resend the OTP for the pending registration phone. */
export async function resendOtp() {
  const pending = state.pendingRegistration || readRegisterStep2AndStep1();
  if (!pending?.phone) return;
  state.pendingRegistration = pending;

  try {
    const res = await api.sendOtp(pending.phone);
    const devCode = res.devCode || (res.success ? OTP.OFFLINE_CODE : null);
    state.currentDevCode = devCode;
    ui.showToast(t('msgOtpSentShort'));
    if (devCode) {
      const badge = document.getElementById('otpDevBadge');
      const codeEl = document.getElementById('otpDevCodeVal');
      if (badge) badge.style.display = 'flex';
      if (codeEl) codeEl.textContent = devCode;
    }
    startOtpCountdown();
  } catch (err) {
    const errEl = document.getElementById('otpErrorMsg');
    if (errEl) {
      errEl.textContent = err?.message || t('msgOtpSendError');
      errEl.style.display = 'block';
    }
    ui.showToast(err?.message || t('msgOtpSendError'), 'err');
  }
}

/**
 * Read the visible register fields as a fallback pending-registration object.
 * @returns {object|null}
 */
function readRegisterStep2AndStep1() {
  const step1 = readRegisterStep1();
  return step1.phone ? { ...step1, ...readRegisterStep2() } : null;
}

export { readRegisterStep2AndStep1 };

/* ---------------------------------------------------------------------------
 * OTP verification + account creation
 * ------------------------------------------------------------------------ */

/** Verify the entered OTP and finish registration (Google or standard). */
export async function verifyAndCompleteRegistration() {
  const digits = ui.readOtpValue();
  const errEl = document.getElementById('otpErrorMsg');

  if (digits.length !== OTP.LENGTH) {
    if (errEl) {
      errEl.textContent = t('msgOtpIncomplete');
      errEl.style.display = 'block';
    }
    return;
  }
  if (errEl) errEl.style.display = 'none';

  const restore = ui.withLoading(
    document.getElementById('btnConfirmOtp'),
    t('msgVerifying'),
  );

  try {
    if (state.pendingRegistration?.isGoogle) {
      await completeGoogleRegistration(digits);
    } else {
      await completeStandardRegistration(digits);
    }
  } catch (err) {
    if (errEl) {
      errEl.textContent = err.message || t('msgOtpInvalid');
      errEl.style.display = 'block';
    }
  } finally {
    restore();
  }
}

/** Finish the standard email/password registration after OTP success. */
async function completeStandardRegistration(digits) {
  const payload = { ...state.pendingRegistration, otpCode: digits };

  let user;
  let token;
  try {
    ({ user, token } = await api.register(payload));
  } catch (err) {
    if (err instanceof TypeError) {
      if (state.currentDevCode && digits !== state.currentDevCode) {
        throw new Error(t('msgOtpInvalid'));
      }
      user = buildOfflineUser('u');
      token = `mock_jwt_${Date.now()}`;
    } else {
      throw err;
    }
  }

  persistSession(token, user);
  closeOtpModal();
  ui.showToast('تم تأكيد رقم هاتفك وإنشاء الحساب بنجاح!');
  redirectAfterAuth(user, { withPrefs: true });
}

/** Finish a Google-originated registration after OTP success. */
async function completeGoogleRegistration(digits) {
  let verified = false;
  try {
    const res = await api.verifyOtp(state.pendingRegistration.phone, digits);
    verified = res.success;
  } catch {
    verified =
      (state.currentDevCode && digits === state.currentDevCode) ||
      (!state.currentDevCode && digits.length === OTP.LENGTH);
  }
  if (!verified && state.currentDevCode && digits !== state.currentDevCode) {
    throw new Error(t('msgOtpInvalid'));
  }

  const data = state.pendingRegistration;
  let user;
  let token = `mock_jwt_token_${Date.now()}`;
  try {
    const res = await api.googleAuth({
      email: data.email,
      firstName: data.firstName,
      lastName: data.lastName,
      phone: data.phone,
      condition: data.condition,
      specGenderPref: data.specGenderPref,
    });
    user = res.user;
    token = res.token;
    ui.showToast(res.message || 'تم تأكيد رقم الهاتف وتسجيل الدخول بنجاح!');
  } catch {
    user = buildOfflineUser('g');
    ui.showToast('تم تأكيد رقم الهاتف وتسجيل الدخول بنجاح!');
  }

  persistSession(token, user);
  closeOtpModal();
  redirectAfterAuth(user, { withPrefs: true });
}

/** Build a local user object for the offline/demo fallback. */
function buildOfflineUser(prefix) {
  const d = state.pendingRegistration || {};
  return {
    id: `${prefix}_${Date.now()}`,
    firstName: d.firstName || 'مستخدم',
    lastName: d.lastName || 'Google',
    email: d.email,
    phone: d.phone,
    gender: d.gender,
    role: 'user',
    condition: d.condition,
    specGenderPref: d.specGenderPref || 'all',
  };
}

/* ---------------------------------------------------------------------------
 * Standard login
 * ------------------------------------------------------------------------ */

/**
 * Handle login form submit.
 * @param {Event} event
 */
export async function submitLogin(event) {
  event?.preventDefault?.();
  const identifier = document.getElementById('lIdent')?.value?.trim() ?? '';
  const password = document.getElementById('lPass')?.value ?? '';

  const restore = ui.withLoading(document.getElementById('loginBtn'), t('msgLoggingIn'));

  try {
    const { user, token, message } = await api.login(identifier, password);
    persistSession(token, user);
    ui.showToast(message || `أهلاً بك مجدداً يا ${user.firstName}!`);
    redirectAfterAuth(user, { bookingToSpecialists: isFromBooking() });
  } catch (err) {
    ui.showToast(err?.message || t('msgUnexpected'), 'err');
  } finally {
    restore();
  }
}

/**
 * Open the password-recovery modal (and confirm with a toast).
 * @param {Event} [event]
 */
export function handleForgot(event) {
  event?.preventDefault?.();
  ui.openModal('fModal');
  ui.showToast(t('msgRecoverySent'));
}

/* ---------------------------------------------------------------------------
 * Google sign-in
 * ------------------------------------------------------------------------ */

/**
 * Open the Google phone-collection modal.
 * @param {object|string} [source]
 */
export function openGoogleModal(source) {
  let finalEmail = '';
  let finalName = '';
  let phone = '';

  if (typeof source === 'object' && source !== null && (source.email || source.name)) {
    finalEmail = source.email || '';
    finalName = source.name || 'مستخدم Google';
  } else {
    const pick = (id) => document.getElementById(id)?.value ?? '';
    const emailInput = pick('lIdent') || pick('rEmail');
    const fName = pick('rFirst');
    const lName = pick('rLast');
    phone = pick('rPhone');
    finalEmail = emailInput.includes('@') ? emailInput : 'user.google@gmail.com';
    finalName = (fName || lName) ? `${fName} ${lName}`.trim() : 'مستخدم Google';
  }

  setValue('gEmail', finalEmail);
  setValue('gName', finalName);
  setValue('gPhone', phone);
  setText('gAccountName', finalName);
  setText('gAccountEmail', finalEmail);
  setText('gAccountAvatar', (finalName[0] || 'G').toUpperCase());

  ui.openModal('googlePhoneModal');
  setTimeout(() => document.getElementById('gPhone')?.focus(), 150);
}

/** Close the Google modal. */
export function closeGoogleModal() {
  ui.closeModal('googlePhoneModal');
}

/** Google sign-up button handler. */
export function handleGoogleSignUp() {
  openGoogleModal('register');
}

/** Google sign-in button handler. */
export function handleGoogleLogin() {
  openGoogleModal('login');
}

/**
 * Submit the Google phone modal: validate, perform auth or OTP, and redirect.
 * @param {Event} [event]
 */
export async function submitGooglePhone(event) {
  event?.preventDefault?.();
  const email = document.getElementById('gEmail')?.value?.trim() ?? '';
  const fullName = document.getElementById('gName')?.value?.trim() ?? '';
  const rawPhone = document.getElementById('gPhone')?.value?.trim() ?? '';

  if (!email || !email.toLowerCase().endsWith('@gmail.com')) {
    ui.showToast(t('msgInvalidEmail'), 'err');
    return;
  }
  if (!rawPhone || rawPhone.replace(/\D/g, '').length < 8) {
    ui.showToast(t('msgInvalidPhone'), 'err');
    return;
  }

  const [firstName, ...rest] = fullName.split(' ');
  const cond = document.getElementById('rCondition')?.value || state.pendingRegistration?.condition || '';
  const specGen = document.getElementById('rSpecGender')?.value || state.specGender;

  // When condition is not yet chosen (standard Google registration flow), route to Step 2
  if (!cond) {
    state.pendingRegistration = {
      isGoogle: true,
      email,
      firstName: firstName || 'مستخدم',
      lastName: rest.join(' ') || 'Google',
      phone: rawPhone,
    };

    closeGoogleModal();
    showRegister();
    goToRegisterStep2();

    const badge = document.getElementById('googleRegBadge');
    const badgeEmail = document.getElementById('googleRegBadgeEmail');
    if (badge) badge.style.display = 'flex';
    if (badgeEmail) badgeEmail.textContent = `${email} (${rawPhone})`;

    ui.showToast(t('msgGoogleNeedStep2') || 'يرجى تحديد حالتك وجنس الأخصائي المفضّل لإكمال التسجيل');
    setTimeout(() => document.getElementById('rCondition')?.focus(), 250);
    return;
  }

  const restore = ui.withLoading(
    document.getElementById('gSubmitBtn'),
    getLang() === 'ar' ? t('msgSendingOtp') : t('msgSendingOtpEn'),
  );

  try {
    const res = await api.googleAuth({
      email,
      firstName: firstName || 'مستخدم',
      lastName: rest.join(' ') || 'Google',
      phone: rawPhone,
      condition: cond,
      specGenderPref: specGen,
    });
    const user = res.user;
    const token = res.token;
    persistSession(token, user);
    closeGoogleModal();
    ui.showToast(res.message || 'تم تسجيل الدخول بنجاح!');
    redirectAfterAuth(user);
  } catch (err) {
    ui.showToast(err.message || t('msgUnexpected'), 'err');
  } finally {
    restore();
  }
}

/* ---------------------------------------------------------------------------
 * Small DOM setters
 * ------------------------------------------------------------------------ */
function setValue(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value;
}
function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

if (typeof window !== 'undefined') {
  window.PsyAIAuth = {
    showRegister,
    showLogin,
    handleRegisterStep1,
    goToRegisterStep2,
    resetToStep1,
    submitRegisterStep2,
    verifyAndCompleteRegistration,
    resendOtp,
    submitLogin,
    openGoogleModal,
    closeGoogleModal,
    handleGoogleSignUp,
    handleGoogleLogin,
    submitGooglePhone,
    handleForgot,
  };
}
