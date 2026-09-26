/**
 * Unit tests for assets/js/auth.js — the authentication controller.
 *
 * Run with:
 *   & "C:\Program Files\nodejs\node.exe" --test tests/
 *
 * Strategy (TDD-friendly seams):
 *  - `fetch` is mocked, so the real `api.js` network layer runs and we assert
 *    on the actual request/response contract.
 *  - A minimal fake DOM (element registry + classList/style/value) is installed
 *    as `document` / `localStorage` globals BEFORE dynamically importing the
 *    module, because `config.js` reads `localStorage` at import time.
 *  - `ui.js` helpers run against the same fake DOM, so toasts, buttons and OTP
 *    inputs are all observable in the assertions.
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

/* ---------------------------------------------------------------------------
 * Fake DOM plumbing
 * ------------------------------------------------------------------------ */

function makeClassList(initial = []) {
  const set = new Set(initial);
  return {
    add: (...c) => c.forEach((x) => set.add(x)),
    remove: (...c) => c.forEach((x) => set.delete(x)),
    contains: (c) => set.has(c),
    toggle: (c, force) => {
      const on = force !== undefined ? force : !set.has(c);
      if (on) set.add(c); else set.delete(c);
      return on;
    },
    toString: () => [...set].join(' '),
  };
}

function makeEl(id, props = {}) {
  return {
    id,
    tagName: 'DIV',
    value: '',
    textContent: '',
    innerHTML: '',
    disabled: false,
    type: '',
    placeholder: '',
    dataset: {},
    style: {},
    classList: makeClassList(props.classes || []),
    focusCount: 0,
    focus() { this.focusCount++; },
    ...props,
  };
}

/** id -> element registry, rebuilt before every test. */
let registry;
let otpInputs;

function makeDocument() {
  return {
    documentElement: {
      setAttribute(k, v) { this['attr_' + k] = v; },
      getAttribute() { return null; },
    },
    body: makeEl('body'),
    getElementById: (id) => registry[id] ?? null,
    querySelector: (sel) => {
      const m = sel.match(/otp-digit.*?(\d+)/);
      if (m) return otpInputs[Number(m[1])] ?? null;
      return null;
    },
    querySelectorAll: (sel) => (sel.includes('.otp-digit') ? otpInputs : []),
  };
}

function makeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    clear: () => map.clear(),
  };
}

/* --- fetch mock ---------------------------------------------------------- */

let fetchCalls;      // array of { url, body }
let fetchResponder;  // (url, body) => { ok, status, data } | null

function installFetch() {
  fetchCalls = [];
  globalThis.fetch = async (url, opts) => {
    const body = opts && opts.body ? JSON.parse(opts.body) : null;
    fetchCalls.push({ url: String(url), body });
    const res = fetchResponder(String(url), body) || { ok: false, status: 500, data: {} };
    return { ok: res.ok, status: res.status, json: async () => res.data };
  };
}

/* --- element registry ----------------------------------------------------- */

function buildRegistry() {
  registry = {
    authCard: makeEl('authCard'),
    colRegister: makeEl('colRegister'),
    rFirst: makeEl('rFirst'), rLast: makeEl('rLast'),
    rEmail: makeEl('rEmail'), rPhone: makeEl('rPhone'),
    rGender: makeEl('rGender'), rPass: makeEl('rPass'),
    finalRegBtn: makeEl('finalRegBtn', { innerHTML: 'original' }),
    rCondition: makeEl('rCondition'),
    rSpecGender: makeEl('rSpecGender'),
    otpPhoneDisplay: makeEl('otpPhoneDisplay'),
    otpDevBadge: makeEl('otpDevBadge'),
    otpDevCodeVal: makeEl('otpDevCodeVal'),
    otpErrorMsg: makeEl('otpErrorMsg'),
    otpTimer: makeEl('otpTimer'),
    otpResendBtn: makeEl('otpResendBtn'),
    btnConfirmOtp: makeEl('btnConfirmOtp', { innerHTML: 'original' }),
    lIdent: makeEl('lIdent'), lPass: makeEl('lPass'),
    loginBtn: makeEl('loginBtn', { innerHTML: 'original' }),
    gEmail: makeEl('gEmail'), gName: makeEl('gName'), gPhone: makeEl('gPhone'),
    gAccountName: makeEl('gAccountName'), gAccountEmail: makeEl('gAccountEmail'),
    gAccountAvatar: makeEl('gAccountAvatar'),
    gSubmitBtn: makeEl('gSubmitBtn', { innerHTML: 'original' }),
    gModal: makeEl('gModal'), gModalTitle: makeEl('gModalTitle'), gModalSub: makeEl('gModalSub'),
    googlePhoneModal: makeEl('googlePhoneModal'),
    googleRegBadge: makeEl('googleRegBadge'),
    googleRegBadgeEmail: makeEl('googleRegBadgeEmail'),
    otpModal: makeEl('otpModal'),
    fModal: makeEl('fModal'),
    toast: makeEl('toast'), toastMsg: makeEl('toastMsg'),
    dot1: makeEl('dot1'), dot2: makeEl('dot2'),
  };
  otpInputs = Array.from({ length: 6 }, (_, i) => makeEl('otp' + i));
}

/* ---------------------------------------------------------------------------
 * Globals + module under test
 * ------------------------------------------------------------------------ */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

globalThis.localStorage = makeStorage();
globalThis.document = makeDocument();
globalThis.window = { location: { href: 'http://localhost/login.html' }, localStorage: globalThis.localStorage };
globalThis.location = globalThis.window.location;
globalThis.navigator = { clipboard: null };

installFetch();

const auth = await import('../assets/js/auth.js');
const ui = await import('../assets/js/ui.js');

/* Reset DOM + module state between tests. */
function resetState() {
  buildRegistry();
  installFetch();
  globalThis.document = makeDocument();
  globalThis.localStorage = makeStorage();
  globalThis.window.localStorage = globalThis.localStorage;
  auth.showLogin();
}

const STEP1 = { detail: { first: 'Ahmad', last: 'Ali', email: 'a@gmail.com', phone: '0791234567', gender: 'male', password: 'secret123' } };

/* ---------------------------------------------------------------------------
 * auth.js — view switching
 * ------------------------------------------------------------------------ */

describe('auth controller — view switching', () => {
  beforeEach(resetState);

  test('positive: showRegister switches the card to register mode', () => {
    auth.showRegister();
    assert.equal(registry.authCard.classList.contains('reg'), true);
  });

  test('positive: showLogin returns to login mode', () => {
    auth.showRegister();
    auth.showLogin();
    assert.equal(registry.authCard.classList.contains('reg'), false);
  });

  test('edge: showRegister resets a stale step-2 state back to step 1', () => {
    registry.colRegister.classList.add('step2');
    auth.showRegister();
    assert.equal(registry.colRegister.classList.contains('step2'), false);
  });
});

/* ---------------------------------------------------------------------------
 * auth.js — register step 2 / OTP request
 * ------------------------------------------------------------------------ */

describe('auth controller — submitRegisterStep2', () => {
  beforeEach(resetState);

  test('positive: valid data + successful OTP send opens the OTP modal', async () => {
    auth.handleRegisterStep1(STEP1);
    fetchResponder = () => ({ ok: true, status: 200, data: { success: true, devCode: '123456' } });
    registry.rCondition.value = 'condAnxiety';
    registry.rSpecGender.value = 'any';

    await auth.submitRegisterStep2();

    assert.equal(registry.colRegister.classList.contains('step2'), true);
    assert.equal(registry.otpPhoneDisplay.textContent, '0791234567');
    assert.equal(registry.otpDevCodeVal.textContent, '123456');
    assert.equal(registry.otpDevBadge.style.display, 'flex');
    assert.equal(fetchCalls[0].url.includes('send-otp'), true);
  });

  test('negative: missing psychological condition blocks submission with no API call', async () => {
    registry.rCondition.value = '';
    await auth.submitRegisterStep2();
    assert.equal(registry.toastMsg.textContent.length > 0, true);
    assert.equal(registry.colRegister.classList.contains('step2'), false);
    assert.equal(fetchCalls.length, 0);
  });

  test('negative: OTP send failure keeps the user on the form with an inline error', async () => {
    auth.handleRegisterStep1(STEP1);
    fetchResponder = () => ({ ok: false, status: 500, data: { success: false } });
    registry.rCondition.value = 'condAnxiety';
    await auth.submitRegisterStep2();
    assert.equal(registry.otpErrorMsg.textContent.length > 0, true);
    assert.equal(registry.colRegister.classList.contains('step2'), false);
  });

  test('edge: network rejection during OTP send falls back to the offline dev code', async () => {
    auth.handleRegisterStep1(STEP1);
    globalThis.fetch = async () => { throw new TypeError('network down'); };
    registry.rCondition.value = 'condAnxiety';
    await auth.submitRegisterStep2();
    assert.equal(registry.otpDevCodeVal.textContent, '123456'); // OFFLINE_CODE
    assert.equal(registry.otpDevBadge.style.display, 'flex');
    assert.equal(registry.colRegister.classList.contains('step2'), true);
  });
});

/* ---------------------------------------------------------------------------
 * auth.js — OTP verification
 * ------------------------------------------------------------------------ */

describe('auth controller — verifyAndCompleteRegistration', () => {
  beforeEach(resetState);

  async function reachOtpStage() {
    auth.handleRegisterStep1(STEP1);
    fetchResponder = () => ({ ok: true, status: 200, data: { success: true, devCode: '111222' } });
    registry.rCondition.value = 'condAnxiety';
    registry.rSpecGender.value = 'any';
    await auth.submitRegisterStep2();
  }

  test('negative: incomplete OTP shows an error and never calls verify-otp', async () => {
    await reachOtpStage();
    fetchCalls.length = 0;
    otpInputs.slice(0, 3).forEach((i) => (i.value = '1'));
    await auth.verifyAndCompleteRegistration();
    assert.equal(registry.otpErrorMsg.textContent.length > 0, true);
    assert.equal(fetchCalls.length, 0);
  });

  test('negative: wrong code surfaces the backend message and re-enables the button', async () => {
    await reachOtpStage();
    fetchResponder = () => ({ ok: false, status: 401, data: { success: false, message: 'bad code' } });
    otpInputs.forEach((i) => (i.value = '9'));
    await auth.verifyAndCompleteRegistration();
    assert.equal(registry.otpErrorMsg.textContent.includes('bad code'), true);
    assert.equal(registry.btnConfirmOtp.disabled, false);
  });

  test('positive: correct code completes registration, stores session, redirects', async () => {
    await reachOtpStage();
    fetchResponder = (url) => {
      if (url.includes('verify-otp')) return { ok: true, status: 200, data: { success: true } };
      return { ok: true, status: 200, data: { success: true, user: { id: 1 }, token: 'tok123' } };
    };
    otpInputs.forEach((i, idx) => (i.value = '111222'[idx]));

    const p = auth.verifyAndCompleteRegistration();
    await sleep(1600); // > REDIRECT_DELAY_MS
    await p;

    assert.equal(globalThis.window.location.href.includes('index.html'), true);
    assert.equal(globalThis.localStorage.getItem('psyai_token'), 'tok123');
    assert.ok(globalThis.localStorage.getItem('psyai_user'));
  });

  test('edge: unexpected exception is caught and shown as an error', async () => {
    await reachOtpStage();
    globalThis.fetch = async () => { throw new Error('boom'); };
    otpInputs.forEach((i, idx) => (i.value = '111222'[idx]));
    await auth.verifyAndCompleteRegistration();
    assert.equal(registry.otpErrorMsg.textContent.length > 0, true);
    assert.equal(registry.btnConfirmOtp.disabled, false);
  });
});

/* ---------------------------------------------------------------------------
 * auth.js — resend OTP
 * ------------------------------------------------------------------------ */

describe('auth controller — resendOtp', () => {
  beforeEach(resetState);

  test('positive: resend with pending registration calls send-otp and refreshes dev code', async () => {
    auth.handleRegisterStep1(STEP1);
    fetchResponder = () => ({ ok: true, status: 200, data: { success: true, devCode: '999888' } });
    registry.rCondition.value = 'condAnxiety';
    await auth.submitRegisterStep2();

    fetchCalls.length = 0;
    await auth.resendOtp();
    assert.equal(fetchCalls.length, 1);
    assert.equal(fetchCalls[0].url.includes('send-otp'), true);
    assert.equal(registry.otpDevCodeVal.textContent, '999888');
  });

  test('negative: resend without a pending registration is a safe no-op', async () => {
    await auth.resendOtp();
    assert.equal(fetchCalls.length, 0);
  });

  test('edge: resend failure shows an error message', async () => {
    auth.handleRegisterStep1(STEP1);
    fetchResponder = () => ({ ok: true, status: 200, data: { success: true, devCode: '1' } });
    registry.rCondition.value = 'condAnxiety';
    await auth.submitRegisterStep2();

    globalThis.fetch = async () => { throw new Error('network'); };
    await auth.resendOtp();
    assert.equal(registry.otpErrorMsg.textContent.length > 0, true);
  });
});

/* ---------------------------------------------------------------------------
 * auth.js — login
 * ------------------------------------------------------------------------ */

describe('auth controller — submitLogin', () => {
  beforeEach(resetState);

  test('positive: valid credentials hit /api/auth/login and redirect', async () => {
    registry.lIdent.value = 'a@gmail.com';
    registry.lPass.value = 'secret123';
    fetchResponder = () => ({ ok: true, status: 200, data: { success: true, user: { id: 1 }, token: 'jwt' } });

    const p = auth.submitLogin({ preventDefault() { } });
    await sleep(1400);
    await p;

    assert.equal(fetchCalls.length, 1);
    assert.equal(fetchCalls[0].url.includes('/api/auth/login'), true);
    assert.deepEqual(fetchCalls[0].body, { identifier: 'a@gmail.com', password: 'secret123' });
    assert.equal(globalThis.localStorage.getItem('psyai_token'), 'jwt');
    assert.equal(globalThis.window.location.href.includes('index.html'), true);
  });

  test('negative: wrong password toasts the backend error and restores the button', async () => {
    registry.lIdent.value = 'a@gmail.com';
    registry.lPass.value = 'wrong';
    fetchResponder = () => ({ ok: false, status: 401, data: { success: false, message: 'Invalid credentials' } });

    await auth.submitLogin({ preventDefault() { } });

    assert.equal(registry.toastMsg.textContent.includes('Invalid credentials'), true);
    assert.equal(registry.loginBtn.disabled, false);
    assert.equal(registry.loginBtn.innerHTML, 'original');
    assert.equal(globalThis.localStorage.getItem('psyai_token'), null);
  });

  test('edge: network failure surfaces a generic error and re-enables the button', async () => {
    registry.lIdent.value = 'a@gmail.com';
    registry.lPass.value = 'x';
    globalThis.fetch = async () => { throw new TypeError('offline'); };
    await auth.submitLogin({ preventDefault() { } });
    assert.equal(registry.toastMsg.textContent.length > 0, true);
    assert.equal(registry.loginBtn.disabled, false);
  });
});

/* ---------------------------------------------------------------------------
 * auth.js — Google account completion
 * ------------------------------------------------------------------------ */

describe('auth controller — submitGooglePhone', () => {
  beforeEach(resetState);

  test('negative: non-gmail account is rejected before any network call', async () => {
    auth.openGoogleModal({ email: 'user@yahoo.com', name: 'X' });
    registry.gPhone.value = '0791234567';
    await auth.submitGooglePhone();
    assert.equal(registry.toastMsg.textContent.length > 0, true);
    assert.equal(fetchCalls.length, 0);
  });

  test('negative: invalid Jordanian phone is rejected before any network call', async () => {
    auth.openGoogleModal({ email: 'x@gmail.com', name: 'X' });
    registry.gPhone.value = '12345';
    await auth.submitGooglePhone();
    assert.equal(fetchCalls.length, 0);
  });

  test('positive: valid gmail + Jordanian phone completes and redirects', async () => {
    auth.openGoogleModal({ email: 'x@gmail.com', name: 'X' });
    registry.rCondition.value = 'condAnxiety';
    registry.rSpecGender.value = 'any';
    registry.gPhone.value = '0791234567';
    fetchResponder = () => ({ ok: true, status: 200, data: { success: true, user: { id: 2 }, token: 'g-tok' } });

    const p = auth.submitGooglePhone();
    await sleep(1400);
    await p;

    assert.equal(globalThis.localStorage.getItem('psyai_token'), 'g-tok');
    assert.equal(globalThis.window.location.href.includes('index.html'), true);
  });

  test('edge: backend failure restores the submit button', async () => {
    auth.openGoogleModal({ email: 'x@gmail.com', name: 'X' });
    registry.rCondition.value = 'condAnxiety';
    registry.gPhone.value = '0791234567';
    fetchResponder = () => ({ ok: false, status: 400, data: { success: false, message: 'phone exists' } });
    await auth.submitGooglePhone();
    assert.equal(registry.gSubmitBtn.disabled, false);
    assert.equal(registry.gSubmitBtn.innerHTML, 'original');
  });

  test('positive: Google signup without condition routes to step 2 and subsequent step 2 submit requests OTP', async () => {
    auth.openGoogleModal({ email: 'user@gmail.com', name: 'User Google' });
    registry.rCondition.value = '';
    registry.gPhone.value = '0791234567';
    await auth.submitGooglePhone();

    assert.equal(registry.colRegister.classList.contains('step2'), true);
    assert.equal(auth.isRegisterView(), true);

    registry.rCondition.value = 'depression';
    registry.rSpecGender.value = 'male';
    fetchResponder = () => ({ ok: true, status: 200, data: { success: true, devCode: '654321' } });

    await auth.submitRegisterStep2();
    assert.equal(registry.otpPhoneDisplay.textContent, '0791234567');
    assert.equal(registry.otpDevCodeVal.textContent, '654321');
  });
});

/* ---------------------------------------------------------------------------
 * auth.js — forgot password
 * ------------------------------------------------------------------------ */

describe('auth controller — handleForgot', () => {
  beforeEach(resetState);

  test('opens the forgot-password modal', () => {
    auth.handleForgot();
    assert.equal(registry.fModal.classList.contains('open'), true);
  });
});

/* ---------------------------------------------------------------------------
 * ui.js — supporting utilities (same fake DOM)
 * ------------------------------------------------------------------------ */

describe('ui utilities', () => {
  beforeEach(resetState);

  test('showToast sets the message and the error variant', () => {
    ui.showToast('oops', 'err');
    assert.equal(registry.toastMsg.textContent, 'oops');
    assert.equal(registry.toast.classList.contains('toast--error'), true);
    assert.equal(registry.toast.classList.contains('show'), true);
  });

  test('withLoading disables the button and restores it afterwards', () => {
    const btn = registry.loginBtn;
    const restore = ui.withLoading(btn, 'working…');
    assert.equal(btn.disabled, true);
    restore();
    assert.equal(btn.disabled, false);
    assert.equal(btn.innerHTML, 'original');
  });

  test('edge: withLoading on a null button is a safe no-op', () => {
    const restore = ui.withLoading(null, 'x');
    assert.doesNotThrow(restore);
  });

  test('fillOtpInputs / readOtpValue / clearOtpInputs round-trip', () => {
    ui.fillOtpInputs('654321');
    assert.equal(otpInputs.map((i) => i.value).join(''), '654321');
    assert.equal(ui.readOtpValue(), '654321');
    ui.clearOtpInputs();
    assert.equal(ui.readOtpValue(), '');
  });

  test('setStepDots marks the correct dot active per step', () => {
    ui.setStepDots(1);
    assert.equal(registry.dot1.classList.contains('active'), true);
    ui.setStepDots(2);
    assert.equal(registry.dot1.classList.contains('done'), true);
    assert.equal(registry.dot2.classList.contains('active'), true);
  });

  test('togglePassword flips the input type', () => {
    registry.lPass.type = 'password';
    ui.togglePassword('lPass');
    assert.equal(registry.lPass.type, 'text');
    ui.togglePassword('lPass');
    assert.equal(registry.lPass.type, 'password');
  });
});
