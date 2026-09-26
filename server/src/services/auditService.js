const prisma = require('../config/db');
const SecurityService = require('./securityService');

class AuditService {
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

      // Sanitization: Strip any potential sensitive fields before stringifying
      let sanitizedMetadata = null;
      if (metadata && typeof metadata === 'object') {
        const copy = { ...metadata };
        delete copy.password;
        delete copy.passwordHash;
        delete copy.otp;
        delete copy.otpCode;
        delete copy.token;
        delete copy.tokenHash;
        delete copy.cardNumber;
        delete copy.cvv;
        sanitizedMetadata = JSON.stringify(copy);
      }

      await prisma.auditLog.create({
        data: {
          actorId: finalActorId,
          actorRole: finalActorRole,
          action,
          resourceId: resourceId ? String(resourceId) : null,
          ipHash,
          result: result || 'SUCCESS',
          metadata: sanitizedMetadata
        }
      });
    } catch (err) {
      // Fail-safe: Audit logging error should not crash server, but should be reported internally
      console.error('[AUDIT LOGGING ERROR]:', err.message);
    }
  }
}

module.exports = AuditService;
