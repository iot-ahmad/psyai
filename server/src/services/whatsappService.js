const bcrypt = require('bcryptjs');
const SecurityService = require('./securityService');
const prisma = require('../config/db');

class WhatsAppService {
  /**
   * Format phone number to clean string (removes spaces, formatting artifacts)
   */
  static cleanPhone(phone) {
    return String(phone || '').replace(/[\s\-\(\)]/g, '').trim();
  }

  /**
   * Generate 6-digit numeric OTP using CSPRNG
   */
  static generateOtp() {
    return SecurityService.generateSecureOtp();
  }

  /**
   * Generate, hash and save OTP for a phone number
   * Section 4: 6 numeric digits CSPRNG, stored as hash, 3-5 min validity
   */
  static async createAndSendOtp(rawPhone) {
    const phone = this.cleanPhone(rawPhone);

    // Check if phone is currently under a 15-minute lockout
    const existing = await prisma.otpToken.findUnique({ where: { phone } });
    if (existing && existing.phoneLockUntil && new Date() < existing.phoneLockUntil) {
      const minutesLeft = Math.ceil((existing.phoneLockUntil.getTime() - Date.now()) / (60 * 1000));
      return {
        success: false,
        isLocked: true,
        message: `تم قفل محاولات التحقق مؤقتاً بسبب تكرار المحاولات الخاطئة. يرجى الانتظار ${minutesLeft} دقيقة.`
      };
    }

    const code = this.generateOtp();
    // Use bcrypt or HMAC hash
    const salt = await bcrypt.genSalt(8);
    const codeHash = await bcrypt.hash(code, salt);
    const expiresInMinutes = 5;
    const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);

    // Upsert OtpToken record
    await prisma.otpToken.upsert({
      where: { phone },
      update: {
        codeHash,
        expiresAt,
        attempts: 0,
        phoneLockUntil: null
      },
      create: {
        phone,
        codeHash,
        expiresAt,
        attempts: 0,
        phoneLockUntil: null
      }
    });

    // Send via provider
    const sendResult = await this.sendWhatsAppMessage(phone, code);
    return {
      success: true,
      phone,
      expiresInMinutes,
      // In development/simulator mode only, surface the code for automated test runners
      devCode: process.env.NODE_ENV !== 'production' || process.env.WHATSAPP_PROVIDER === 'simulator' ? code : undefined,
      provider: sendResult.provider
    };
  }

  /**
   * Send WhatsApp message via Meta Cloud API or Simulator
   */
  static async sendWhatsAppMessage(phone, code) {
    const provider = process.env.WHATSAPP_PROVIDER || 'simulator';
    const messageText = `منصة PsyAI: رمز التحقق الخاص بك هو: *${code}*\n\nالرمز صالح لمدة ٥ دقائق. لا تشارك هذا الرمز مع أي شخص لضمان أمان حسابك.`;

    if (provider === 'meta' && process.env.WHATSAPP_API_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID) {
      try {
        const url = `https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.WHATSAPP_API_TOKEN}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: phone,
            type: 'text',
            text: { body: messageText }
          })
        });
        const data = await res.json();
        return { success: true, provider: 'meta', data };
      } catch (err) {
        console.error('[SECURITY] Meta WhatsApp API Error:', err.message);
      }
    }

    if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
      const maskedPhone = phone.replace(/^(\+?\d{4})\d+(\d{2})$/, '$1****$2');
      console.log(`[WHATSAPP SIMULATOR] Code sent to ${maskedPhone}`);
    }

    return { success: true, provider: 'simulator', devCode: code };
  }

  /**
   * Send WhatsApp appointment alert with patient, specialist and session link
   */
  static async sendSessionStartNotification(phone, patientName, specialistName, sessionUrl) {
    const provider = process.env.WHATSAPP_PROVIDER || 'simulator';
    const messageText = `منصة PsyAI: مرحباً ${patientName}، موعد جلستك مع ${specialistName} سيبدأ قريباً.\n\nيرجى الانضمام للجلسة عبر الرابط:\n${sessionUrl}`;

    if (provider === 'meta' && process.env.WHATSAPP_API_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID) {
      try {
        const url = `https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
        await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.WHATSAPP_API_TOKEN}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: phone,
            type: 'text',
            text: { body: messageText }
          })
        });
      } catch (err) {
        console.error('[SECURITY] Meta WhatsApp API Error:', err.message);
      }
    }

    return { success: true, messageText };
  }

  /**
   * Verify an entered OTP
   */
  static async verifyOtp(rawPhone, inputCode) {
    const phone = this.cleanPhone(rawPhone);

    const record = await prisma.otpToken.findUnique({
      where: { phone }
    });

    if (!record) {
      return {
        success: false,
        message: 'لم يتم طلب رمز تحقق لهذا الرقم أو انتهت صلاحيته'
      };
    }

    // Check expiration first (expired wins over exhausted)
    if (new Date() > record.expiresAt) {
      await prisma.otpToken.delete({ where: { phone } });
      return {
        success: false,
        message: 'انتهت صلاحية رمز التحقق. يرجى طلب رمز جديد.'
      };
    }

    // Check if phone attempts exhausted
    if (record.attempts >= 3) {
      await prisma.otpToken.delete({ where: { phone } });
      return {
        success: false,
        message: 'تم استنفاد المحاولات المسموحة (٣ محاولات). يرجى طلب رمز جديد.'
      };
    }

    // Compare code
    let isMatch = false;
    if (record.codeHash.startsWith('$2')) {
      isMatch = await bcrypt.compare(String(inputCode), record.codeHash);
    } else {
      isMatch = SecurityService.verifyOtpHash(String(inputCode), record.codeHash);
    }

    if (!isMatch) {
      const newAttempts = record.attempts + 1;
      const remaining = Math.max(0, 3 - newAttempts);

      await prisma.otpToken.update({
        where: { phone },
        data: { attempts: { increment: 1 } }
      });

      return {
        success: false,
        message: `رمز التحقق غير صحيح. متبقي ${remaining} محاولات.`
      };
    }

    // Success: Delete token (anti-replay)
    await prisma.otpToken.delete({ where: { phone } });

    return {
      success: true,
      message: 'تم التحقق من رقم الهاتف بنجاح'
    };
  }
}

module.exports = WhatsAppService;
