/**
 * UI helpers — small, focused DOM utilities shared by the page controller.
 *
 * Nothing here knows about authentication; it only manipulates the DOM.
 */

/** Toast */
let toastTimer = null;

/**
 * Show the global toast message.
 * @param {string} message
 * @param {'ok'|'err'} [variant]
 */
export function showToast(message, variant = 'ok') {
  const toast = document.getElementById('toast');
  const toastMsg = document.getElementById('toastMsg');
  if (!toast || !toastMsg) return;

  toastMsg.textContent = message;
  toast.classList.toggle('toast--error', variant === 'err');
  toast.classList.add('show');

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3800);
}

/** Modal open/close */
export function openModal(id) {
  document.getElementById(id)?.classList.add('open');
}

export function closeModal(id) {
  document.getElementById(id)?.classList.remove('open');
}

/** Password visibility toggle */
const EYE_OPEN = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
const EYE_OFF = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`;

/**
 * Toggle an input between password and text, swapping the eye icon.
 * @param {string} inputId
 * @param {HTMLButtonElement} btn
 */
export function togglePassword(inputId, btn) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const reveal = input.type === 'password';
  input.type = reveal ? 'text' : 'password';
  if (btn) btn.innerHTML = reveal ? EYE_OFF : EYE_OPEN;
}

/**
 * Toggle a button's disabled state and swap its label while an async action
 * runs. Returns a restore function so callers can reset it in a `finally`.
 * @param {HTMLButtonElement} btn
 * @param {string} loadingText
 * @returns {() => void} restore
 */
export function withLoading(btn, loadingText) {
  if (!btn) return () => { };
  const original = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<span>${loadingText}</span>`;
  return () => {
    btn.disabled = false;
    btn.innerHTML = original;
  };
}

/** Step dots (1 = first step, 2 = second step) */
export function setStepDots(step) {
  const d1 = document.getElementById('dot1');
  const d2 = document.getElementById('dot2');
  if (!d1 || !d2) return;

  // Mutate classList in place (never replace the node) so the dot elements
  // keep their identity for any observer holding a reference.
  const paint = (el, classes) => {
    arrayFrom(el.classList).forEach((c) => el.classList.remove(c));
    classes.forEach((c) => el.classList.add(c));
  };

  if (step === 1) {
    paint(d1, ['step-dot', 'active']);
    paint(d2, ['step-dot']);
  } else {
    paint(d1, ['step-dot', 'done']);
    paint(d2, ['step-dot', 'active']);
  }
}

/** ClassList -> array (works for DOMTokenList and the test double alike). */
function arrayFrom(list) {
  if (list.length !== undefined && typeof list.item === 'function') {
    return Array.from(list);
  }
  return (list.toString() || '').split(/\s+/).filter(Boolean);
}

/* ---------------------------------------------------------------------------
 * OTP input group behaviour
 * ------------------------------------------------------------------------ */

/**
 * Wire the 6 single-digit OTP inputs for auto-advance, backspace and paste.
 * @param {object} handlers
 * @param {() => void} handlers.onComplete - called on Enter or a full paste
 */
export function setupOtpInputs({ onComplete } = {}) {
  const inputs = Array.from(document.querySelectorAll('.otp-digit'));
  inputs.forEach((input, idx) => {
    input.oninput = () => {
      if (input.value && idx < inputs.length - 1) inputs[idx + 1].focus();
    };
    input.onkeydown = (e) => {
      if (e.key === 'Backspace' && !input.value && idx > 0) {
        inputs[idx - 1].focus();
      } else if (e.key === 'Enter') {
        onComplete?.();
      }
    };
    input.onpaste = (e) => {
      e.preventDefault();
      const pasted = (e.clipboardData || window.clipboardData).getData('text').trim();
      if (/^\d{6}$/.test(pasted)) {
        pasted.split('').forEach((char, i) => {
          if (inputs[i]) inputs[i].value = char;
        });
        inputs[inputs.length - 1].focus();
      }
    };
  });
}

/** @returns {string} the digits currently entered across the OTP inputs. */
export function readOtpValue() {
  return Array.from(document.querySelectorAll('.otp-digit'))
    .map((i) => i.value)
    .join('');
}

/** Clear all OTP digit inputs. */
export function clearOtpInputs() {
  document.querySelectorAll('.otp-digit').forEach((i) => (i.value = ''));
}

/**
 * Fill the OTP inputs programmatically (used by the dev auto-fill badge).
 * @param {string} code
 */
export function fillOtpInputs(code) {
  const inputs = Array.from(document.querySelectorAll('.otp-digit'));
  code.split('').forEach((char, i) => {
    if (inputs[i]) inputs[i].value = char;
  });
}
