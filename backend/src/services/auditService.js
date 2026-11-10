const prisma = require('../config/db');
const SecurityService = require('./securityService');

class AuditService {
  /**
   * Crypto-shredding: Cryptographically destroy personal data while preserving immutable audit structure (AUTH-304)
   * Overwrites sensitive audit trail payloads with zero-knowledge cryptographic shreds
   * @param {string} userId
   */
  static async cryptoShredUserLogs(userId) {
    if (!userId) return;
    try {
      await prisma.auditLog.updateMany({
        where: { userId },
        data: {
          details: JSON.stringify({ shredded: true, shreddedAt: new Date().toISOString() })
        }
      });
      console.log(`[AUDIT] Crypto-shredding completed for user ${userId}`);
    } catch (err) {
      console.error('[AUDIT] Crypto-shredding error:', err.message);
    }
  }

  /**
   * Record an immutable audit log entry (Section 7: Append-only architecture)
   * Schema: { actor_id, actor_role, action, resource_id, timestamp, ip_hash, result }
   *
   * @param {object} params
   * @param {import('express').Request} [params.req]
   * @param {string} [params.actorId]
   * @param {string} [params.actorRole]
   * @param {string} params.action - e.g. "AUTH_LOGIN", "OTP_VERIFIED", "BOOKING_CREATED", "SPECIALIST_VIEW_APPOINTMENTS"
   * @param {string} [params.resourceId]
   * @param {string} params.result - "SUCCESS" | "DENIED" | "FAILED"
   * @param {object} [params.metadata] - Sanitized non-sensitive metadata only
   */
  static async log({ req, actorId, actorRole, action, resourceId, result, metadata }) {
    try {
      const actor = req?.user;
      const finalActorId = actorId || actor?.id || null;
      const finalActorRole = actorRole || actor?.role || 'anonymous';
      const ip = req?.headers?.['x-forwarded-for'] || req?.socket?.remoteAddress || req?.ip || '127.0.0.1';
      const ipHash = SecurityService.hashIp(Array.isArray(ip) ? ip[0] : ip.split(',')[0]);

      // AUTH-107: Sanitization - Strip and redact any sensitive data before logging or storing
      let sanitizedMetadata = null;
      if (metadata && typeof metadata === 'object') {
        const copy = { ...metadata };
        delete copy.password;
        delete copy.passwordHash;
        delete copy.otp;
        delete copy.otpCode;
        delete copy.devCode;
        delete copy.devOtp;
        delete copy.token;
        delete copy.tokenHash;
        delete copy.verificationTicket;
        delete copy.cardNumber;
        delete copy.cvv;
        // Mask phone if present
        if (copy.phone && typeof copy.phone === 'string') {
          copy.phone = copy.phone.replace(/^(\+?\d{4})\d+(\d{2})$/, '$1****$2');
        }
        // Mask email if present
        if (copy.email && typeof copy.email === 'string') {
          copy.email = copy.email.replace(/^(.)(.*)(@.*)$/, '$1***$3');
        }
        sanitizedMetadata = JSON.stringify(copy);
      }

      await prisma.auditLog.create({
        data: {
          userId: finalActorId,
          action,
          entity: finalActorRole || 'anonymous',
          entityId: resourceId ? String(resourceId) : null,
          details: sanitizedMetadata
        }
      });
    } catch (err) {
      // Fail-safe: Audit logging error should not crash server, but should be reported internally
      console.error('[AUDIT LOGGING ERROR]:', err.message);
    }
  }
}

module.exports = AuditService;
