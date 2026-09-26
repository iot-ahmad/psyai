const crypto = require('crypto');
const bcrypt = require('bcryptjs');

let argon2 = null;
try {
  argon2 = require('argon2');
} catch {
  // Optional if native argon2 bindings are not present, bcrypt used as fallback
}

const OTP_PEPPER = process.env.OTP_PEPPER || 'psyai_kms_pepper_secret_998877_secure_key';
const IP_SALT = process.env.IP_SALT || 'psyai_ip_hash_salt_2025_wellness';

class SecurityService {
  /**
   * Hash a password according to Section 3: Argon2id (Memory >= 64MB, Time >= 3, Parallelism = 4)
   * Falls back to high-cost bcrypt (cost 12) if argon2 native module is not installed.
   * @param {string} password
   * @returns {Promise<string>}
   */
  static async hashPassword(password) {
    if (!password || typeof password !== 'string') {
      throw new Error('Password must be a valid non-empty string');
    }

    if (argon2) {
      try {
        return await argon2.hash(password, {
          type: argon2.argon2id,
          memoryCost: 65536, // 64 MB
          timeCost: 3,       // 3 iterations
          parallelism: 4     // 4 parallel threads
        });
      } catch (err) {
        console.error('[SECURITY] Argon2 failed, falling back to Bcrypt:', err.message);
      }
    }

    const salt = await bcrypt.genSalt(12);
    return await bcrypt.hash(password, salt);
  }

  /**
   * Verify a password against an Argon2id or Bcrypt hash
   * @param {string} password
   * @param {string} hash
   * @returns {Promise<boolean>}
   */
  static async verifyPassword(password, hash) {
    if (!password || !hash) return false;

    if (hash.startsWith('$argon2') && argon2) {
      try {
        return await argon2.verify(hash, password);
      } catch {
        return false;
      }
    }

    // Default or Bcrypt hash
    try {
      return await bcrypt.compare(password, hash);
    } catch {
      return false;
    }
  }

  /**
   * Hash a 6-digit numeric OTP using HMAC-SHA256 with an isolated server-side pepper (Section 4)
   * @param {string} code
   * @returns {string}
   */
  static hashOtp(code) {
    const cleanCode = String(code).trim();
    return crypto
      .createHmac('sha256', OTP_PEPPER)
      .update(cleanCode)
      .digest('hex');
  }

  /**
   * Verify an OTP hash using constant-time comparison to prevent timing attacks
   * @param {string} inputCode
   * @param {string} storedHash
   * @returns {boolean}
   */
  static verifyOtpHash(inputCode, storedHash) {
    if (!inputCode || !storedHash) return false;

    try {
      const inputHash = this.hashOtp(inputCode);
      const inputBuf = Buffer.from(inputHash, 'hex');
      const storedBuf = Buffer.from(storedHash, 'hex');

      if (inputBuf.length !== storedBuf.length) return false;
      return crypto.timingSafeEqual(inputBuf, storedBuf);
    } catch {
      return false;
    }
  }

  /**
   * Generate a 32-byte cryptographically secure random token (CSPRNG) for password reset
   * @returns {{ rawToken: string, tokenHash: string }}
   */
  static generatePasswordResetToken() {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto
      .createHash('sha256')
      .update(rawToken)
      .digest('hex');

    return { rawToken, tokenHash };
  }

  /**
   * Hash a raw password reset token for lookup
   * @param {string} rawToken
   * @returns {string}
   */
  static hashPasswordResetToken(rawToken) {
    return crypto
      .createHash('sha256')
      .update(String(rawToken).trim())
      .digest('hex');
  }

  /**
   * Hash an IP address for privacy-compliant audit logging (never stores raw IP)
   * @param {string} ip
   * @returns {string}
   */
  static hashIp(ip) {
    const cleanIp = String(ip || '127.0.0.1').trim();
    return crypto
      .createHash('sha256')
      .update(cleanIp + IP_SALT)
      .digest('hex')
      .slice(0, 32);
  }

  /**
   * Generate 6-digit numeric OTP using CSPRNG
   * @returns {string}
   */
  static generateSecureOtp() {
    return (100000 + crypto.randomInt(900000)).toString();
  }
}

module.exports = SecurityService;
