/**
 * Backend API layer.
 *
 * All network access lives here so the rest of the app deals only in
 * promises and plain objects — never in fetch details. Every function accepts
 * plain arguments and resolves with the parsed JSON body, throwing an Error
 * with the backend's message on failure.
 */

import { API_BASE, ENDPOINTS } from './config.js';

/**
 * Low-level JSON POST helper.
 * @param {string} path - endpoint path (e.g. ENDPOINTS.LOGIN)
 * @param {object} body - request payload
 * @returns {Promise<{ok: boolean, status: number, data: any}>}
 */
async function postJson(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  // Some error responses may have an empty/non-JSON body; guard the parse.
  let data = {};
  try {
    data = await res.json();
  } catch {
    data = {};
  }
  return { ok: res.ok, status: res.status, data };
}

/**
 * Request a WhatsApp OTP for a phone number.
 * @param {string} phone
 * @returns {Promise<{success: boolean, devCode?: string}>}
 */
export function sendOtp(phone) {
  return postJson(ENDPOINTS.SEND_OTP, { phone }).then(({ ok, data }) => ({
    success: ok && data.success === true,
    devCode: data.devCode,
    message: data.message,
  }));
}

/**
 * Verify a WhatsApp OTP code.
 * @param {string} phone
 * @param {string} code
 * @returns {Promise<{success: boolean, message?: string}>}
 */
export function verifyOtp(phone, code) {
  return postJson(ENDPOINTS.VERIFY_OTP, { phone, code }).then(({ ok, data }) => ({
    success: ok && data.success === true,
    message: data.message,
  }));
}

/**
 * Register a standard (email/password) account, including OTP verification.
 * @param {object} payload
 * @returns {Promise<{user: object, token: string}>}
 */
export async function register(payload) {
  const { ok, data } = await postJson(ENDPOINTS.REGISTER, payload);
  if (!ok || !data.success) {
    throw new Error(data.message || 'Registration failed');
  }
  return { user: data.user, token: data.token };
}

/**
 * Log in with an identifier (email or phone) and password.
 * @param {string} identifier
 * @param {string} password
 * @returns {Promise<{user: object, token: string, message: string}>}
 */
export async function login(identifier, password) {
  const { ok, data } = await postJson(ENDPOINTS.LOGIN, { identifier, password });
  if (!ok || !data.success) {
    throw new Error(data.message || 'Login failed');
  }
  return { user: data.user, token: data.token, message: data.message };
}

/**
 * Complete a Google sign-in by supplying the phone number.
 * @param {object} payload
 * @returns {Promise<{user: object, token: string, message: string}>}
 */
export async function googleAuth(payload) {
  const { ok, data } = await postJson(ENDPOINTS.GOOGLE, payload);
  if (!ok || !data.success) {
    throw new Error(data.message || 'Google authentication failed');
  }
  return { user: data.user, token: data.token, message: data.message };
}
