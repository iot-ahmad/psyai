/**
 * Central configuration for the authentication page.
 *
 * Keeping every magic value here means a future change (a new endpoint, a
 * different storage key, a longer OTP) happens in exactly one place.
 */

/** Helper for safe storage access (protects against browser privacy blocks like Brave Shields) */
function getSavedApiBase() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem('psyai_api_url') : null;
  } catch {
    return null;
  }
}

/** Base URL of the backend API. Overridable at runtime for staging/production. */
export const API_BASE = getSavedApiBase() || 'http://localhost:5000';

/** localStorage keys used to persist the session. */
export const STORAGE_KEYS = Object.freeze({
  TOKEN: 'psyai_token',
  TOKEN_LEGACY: 'token',
  USER: 'psyai_user',
  API_URL: 'psyai_api_url',
});

/** Backend endpoints. */
export const ENDPOINTS = Object.freeze({
  SEND_OTP: '/api/auth/send-otp',
  VERIFY_OTP: '/api/auth/verify-otp',
  REGISTER: '/api/auth/register',
  LOGIN: '/api/auth/login',
  GOOGLE: '/api/auth/google',
});

/** Where each role is sent after a successful login/registration. */
export const ROLE_REDIRECTS = Object.freeze({
  admin: 'admin.html',
  specialist: 'specialist.html',
  user: 'index.html',
});

/** Page that a patient is sent to once authenticated / to pick a specialist. */
export const SPECIALISTS_PAGE = 'specialists.html';

/** OTP rules kept in one place so UI and validation stay in sync. */
export const OTP = Object.freeze({
  LENGTH: 6,
  RESEND_SECONDS: 60,
  /** Fallback code used when the backend is unreachable (offline demo mode). */
  OFFLINE_CODE: '123456',
});

/** Simulated network latency before redirecting, in ms. */
export const REDIRECT_DELAY_MS = 1200;

/** Default specialist preference when the user has not chosen one. */
export const DEFAULT_SPEC_GENDER = 'any';
