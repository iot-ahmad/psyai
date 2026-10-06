const crypto = require('crypto');

const DEFAULT_KEY_SEED = 'psyai_default_db_encryption_key_2025_aes256_gcm_vault';
const DEFAULT_PEPPER = 'psyai_default_blind_index_pepper_2025_hmac_sha256';

/**
 * Get 32-byte Buffer key for AES-256-GCM
 */
function getKey() {
  const envKey = process.env.DB_ENCRYPTION_KEY;
  if (!envKey) {
    return crypto.createHash('sha256').update(DEFAULT_KEY_SEED).digest();
  }
  if (envKey.length === 64 && /^[0-9a-fA-F]{64}$/.test(envKey)) {
    return Buffer.from(envKey, 'hex');
  }
  if (Buffer.byteLength(envKey, 'utf8') === 32) {
    return Buffer.from(envKey, 'utf8');
  }
  return crypto.createHash('sha256').update(envKey).digest();
}

/**
 * Get pepper for HMAC-SHA256 hashing / blind indexing
 */
function getPepper() {
  return process.env.BLIND_INDEX_PEPPER || DEFAULT_PEPPER;
}

/**
 * Encrypt a text field using AES-256-GCM
 * @param {string|null} text
 * @returns {string|null} Format: iv:authTag:ciphertext (hex)
 */
function encryptField(text) {
  if (text === null || text === undefined || text === '') {
    return text;
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);

  let encrypted = cipher.update(String(text), 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypt an AES-256-GCM encrypted field
 * @param {string|null} ciphertext
 * @returns {string|null} Plaintext
 */
function decryptField(ciphertext) {
  if (ciphertext === null || ciphertext === undefined || ciphertext === '') {
    return ciphertext;
  }

  if (typeof ciphertext !== 'string') {
    return ciphertext;
  }

  const parts = ciphertext.split(':');
  if (parts.length !== 3) {
    // Legacy / unencrypted plaintext fallback
    return ciphertext;
  }

  const [ivHex, authTagHex, encryptedHex] = parts;
  if (ivHex.length !== 24 || authTagHex.length !== 32) {
    return ciphertext;
  }

  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));

    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    // In case of integrity failure or legacy string matching format, return raw
    return ciphertext;
  }
}

/**
 * Generate a deterministic HMAC-SHA256 Hash / Blind Index for exact search without exposing original data
 * Used for email_hash and phone_hash in PostgreSQL schema
 * @param {string|null} value
 * @returns {string|null} HMAC-SHA256 hex string (64 chars)
 */
function generateBlindIndex(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const normalized = String(value).toLowerCase().replace(/[\s\-\(\)]/g, '').trim();
  return crypto.createHmac('sha256', getPepper()).update(normalized).digest('hex');
}

/**
 * Alias for generateBlindIndex
 */
function hashValue(value) {
  return generateBlindIndex(value);
}

/**
 * Helper to decrypt sensitive User fields
 * @param {object|null} user
 * @returns {object|null}
 */
function decryptUserFields(user) {
  if (!user || typeof user !== 'object') {
    return user;
  }

  const copy = { ...user };
  if (copy.firstName !== undefined) copy.firstName = decryptField(copy.firstName);
  if (copy.first_name !== undefined) copy.first_name = decryptField(copy.first_name);
  if (copy.lastName !== undefined) copy.lastName = decryptField(copy.lastName);
  if (copy.last_name !== undefined) copy.last_name = decryptField(copy.last_name);
  
  if (copy.emailEncrypted !== undefined) {
    copy.email = decryptField(copy.emailEncrypted);
  } else if (copy.email_encrypted !== undefined) {
    copy.email = decryptField(copy.email_encrypted);
  } else if (copy.email !== undefined) {
    copy.email = decryptField(copy.email);
  }

  if (copy.phoneEncrypted !== undefined) {
    copy.phone = decryptField(copy.phoneEncrypted);
  } else if (copy.phone_encrypted !== undefined) {
    copy.phone = decryptField(copy.phone_encrypted);
  } else if (copy.phone !== undefined) {
    copy.phone = decryptField(copy.phone);
  }

  if (copy.conditionEncrypted !== undefined) {
    copy.condition = decryptField(copy.conditionEncrypted);
  } else if (copy.condition_encrypted !== undefined) {
    copy.condition = decryptField(copy.condition_encrypted);
  } else if (copy.condition !== undefined) {
    copy.condition = decryptField(copy.condition);
  }

  const fName = copy.firstName || copy.first_name || '';
  const lName = copy.lastName || copy.last_name || '';
  if (fName || lName) {
    copy.fullName = `${fName} ${lName}`.trim();
  }

  return copy;
}

/**
 * Helper to decrypt sensitive Booking fields
 * @param {object|null} booking
 * @returns {object|null}
 */
function decryptBookingFields(booking) {
  if (!booking || typeof booking !== 'object') {
    return booking;
  }

  const copy = { ...booking };
  if (copy.condition !== undefined) copy.condition = decryptField(copy.condition);
  if (copy.notes !== undefined) copy.notes = decryptField(copy.notes);

  if (copy.user && typeof copy.user === 'object') {
    copy.user = decryptUserFields(copy.user);
  }

  return copy;
}

module.exports = {
  encryptField,
  decryptField,
  generateBlindIndex,
  hashValue,
  decryptUserFields,
  decryptBookingFields
};
