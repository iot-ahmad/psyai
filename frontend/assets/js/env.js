/**
 * PsyAI — runtime environment (classic script, load BEFORE any other script).
 *
 * Single source of truth for the backend URL used by every page.
 *
 * Resolution order:
 *   1. <meta name="psyai-api-base" content="https://api.example.com"> on the page
 *   2. localStorage "psyai_api_url" (developer override; must be an http(s) URL)
 *   3. Local development: page opened from file:// or a localhost dev server on a
 *      port other than 5000  ->  http://localhost:5000
 *   4. PRODUCTION_API_BASE below. Empty string = same origin (the backend serves
 *      the frontend, or the host proxies /api/* to the backend).
 */
(function () {
  'use strict';

  /** Set this to the deployed backend URL, e.g. "https://api.psyai.ai". */
  var PRODUCTION_API_BASE = '';

  var LOCAL_DEV_API = 'http://localhost:5000';

  function clean(url) {
    return String(url || '').trim().replace(/\/+$/, '');
  }

  function isHttpUrl(url) {
    return /^https?:\/\/[^\s]+$/i.test(url);
  }

  function readOverride() {
    try {
      var v = clean(window.localStorage.getItem('psyai_api_url'));
      return isHttpUrl(v) ? v : '';
    } catch (_) {
      return '';
    }
  }

  function resolve() {
    var meta = document.querySelector('meta[name="psyai-api-base"]');
    var metaVal = meta ? clean(meta.getAttribute('content')) : '';
    if (metaVal && isHttpUrl(metaVal)) return metaVal;

    var override = readOverride();
    if (override) return override;

    var loc = window.location;
    if (loc.protocol === 'file:') return LOCAL_DEV_API;

    var isLocalHost = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(loc.hostname);
    if (isLocalHost && loc.port !== '5000') return LOCAL_DEV_API;

    return clean(PRODUCTION_API_BASE);
  }

  var base = resolve();

  /** Escape untrusted text before inserting it into HTML strings. */
  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  window.PSYAI_API_BASE = base;
  window.PsyAIEnv = Object.freeze({
    apiBase: base,
    apiUrl: function (path) {
      return base + (path.charAt(0) === '/' ? path : '/' + path);
    },
    escapeHtml: escapeHtml,
  });
})();
