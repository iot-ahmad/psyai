 /**
 * Page bootstrap (entry point).
 *
 * This is the only module that knows about the concrete DOM: it wires events
 * to the auth controller and runs the initial language/URL-param setup. All
 * business logic lives in `auth.js`.
 */

import { applyLang, toggleLang, getLang } from './i18n.js';
import * as auth from './auth.js';
import { togglePassword } from './ui.js';

/** Attach a click handler by element id, if the element exists. */
function onClick(id, handler) {
  document.getElementById(id)?.addEventListener('click', handler);
}

/** Attach a submit handler by element id, if the element exists. */
function onSubmit(id, handler) {
  document.getElementById(id)?.addEventListener('submit', handler);
}

/** Wire every interactive control on the page. */
function wireEvents() {
  // View switching
  onClick('langBtn', () => toggleLang());
  onClick('homeBtn', () => {
    window.location.href = 'index.html';
  });
  onClick('regNextBtn', () => { }); // submit handled by form
  onSubmit('registerForm', (e) => {
    e.preventDefault();
    auth.goToRegisterStep2();
  });
  onSubmit('step2Form', auth.submitRegisterStep2);
  document.getElementById('rCondition')?.addEventListener('change', (e) => {
    auth.handleConditionChange(e.target.value);
  });
  onSubmit('loginForm', auth.submitLogin);

  // Footer switch links (multiple "go to register/login" buttons)
  document.querySelectorAll('[data-action="go-register"]').forEach((el) =>
    el.addEventListener('click', auth.showRegister),
  );
  document.querySelectorAll('[data-action="go-login"]').forEach((el) =>
    el.addEventListener('click', auth.showLogin),
  );
  onClick('backToStep1Btn', auth.resetToStep1);

  // Google auth
  onClick('googleLoginBtn', auth.handleGoogleLogin);
  onClick('googleRegBtn', auth.handleGoogleSignUp);
  onSubmit('googlePhoneForm', auth.submitGooglePhone);
  onClick('closeGoogleModalBtn', auth.closeGoogleModal);

  // Forgot password
  onClick('forgotLink', auth.handleForgot);

  // Password visibility toggles (data-target points at the input id)
  document.querySelectorAll('[data-toggle-password]').forEach((btn) =>
    btn.addEventListener('click', () =>
      togglePassword(btn.getAttribute('data-toggle-password'), btn),
    ),
  );

  // OTP modal
  onClick('closeOtpModalBtn', auth.closeOtpModal);
  onClick('otpResendBtn', auth.resendOtp);
  onClick('otpDevBadge', auth.autoFillDevOtp);
  onSubmit('otpConfirmForm', (e) => {
    e.preventDefault();
    auth.verifyAndCompleteRegistration();
  });

  // Close a modal when its backdrop (not its content) is clicked
  document.querySelectorAll('.otp-modal-overlay').forEach((overlay) => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.classList.remove('open');
    });
  });
}

/** Apply the initial language and honour URL params (register/booking mode). */
function bootstrap() {
  applyLang(getLang());

  const params = new URLSearchParams(window.location.search);
  if (params.get('mode') === 'register' || params.get('signup') === 'true') {
    auth.showRegister();
  }
}

// Export to window immediately for robust inline onclick handlers across all browsers
window.PsyAIAuth = auth;
window.PsyAIShowRegister = auth.showRegister;
window.PsyAIShowLogin = auth.showLogin;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    wireEvents();
    bootstrap();
  });
} else {
  wireEvents();
  bootstrap();
}
