const bcrypt = require('bcryptjs');
const SecurityService = require('./securityService');
const prisma = require('../config/db');

class WhatsAppService {
  /**
   * Format and sanitize phone number to standardized international/E.164-compatible string
   */
  static cleanPhone(phone) {
    if (!phone) return '';
    let cleaned = String(phone).replace(/[\s\-\(\)]/g, '').trim();
    // Normalize leading 00 to +
    if (cleaned.startsWith('00')) {
      cleaned = '+' + cleaned.slice(2);
    }
    // Normalize local Jordanian mobile format 07xxxxxxxx to +9627xxxxxxxx
    if (/^07[789]\d{7}$/.test(cleaned)) {
      cleaned = '+962' + cleaned.slice(1);
    }
    return cleaned;
  }

  /**
   * Generate 6-digit numeric OTP using CSPRNG
   */
  static generateOtp() {
    return SecurityService.generateSecureOtp();
  }

  /**
   * Generate, hash and save OTP for a phone number
   * 6 numeric digits CSPRNG, stored as hash, 5 min validity, with 15-min lockout & 60s cooldown
   */
  static async createAndSendOtp(rawPhone) {
    const phone = this.cleanPhone(rawPhone);
    if (!phone || phone.length < 8) {
      return {
        success: false,
        message: 'رقم الهاتف المدخل غير صالح'
      };
    }

    // Check if phone is currently under a 15-minute lockout or active cooldown
    const existing = await prisma.otpToken.findUnique({ where: { phone } });
    const now = new Date();

    if (existing && existing.phoneLockUntil && now < existing.phoneLockUntil) {
      const minutesLeft = Math.ceil((existing.phoneLockUntil.getTime() - now.getTime()) / (60 * 1000));
      return {
        success: false,
        isLocked: true,
        message: `تم قفل محاولات التحقق مؤقتاً بسبب تكرار المحاولات الخاطئة. يرجى الانتظار ${minutesLeft} دقيقة.`
      };
    }

    // 60-second cooldown throttle per phone number to prevent SMS/WhatsApp flooding
    if (
      existing &&
      existing.createdAt &&
      !existing.phoneLockUntil &&
      process.env.NODE_ENV !== 'test' &&
      now.getTime() - existing.createdAt.getTime() < 60 * 1000
    ) {
      const secondsLeft = Math.ceil((60 * 1000 - (now.getTime() - existing.createdAt.getTime())) / 1000);
      return {
        success: false,
        isThrottled: true,
        message: `يرجى الانتظار ${secondsLeft} ثانية قبل طلب رمز تحقق جديد.`
      };
    }

    const code = this.generateOtp();
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
        phoneLockUntil: null,
        createdAt: now
      },
      create: {
        phone,
        codeHash,
        expiresAt,
        attempts: 0,
        phoneLockUntil: null,
        createdAt: now
      }
    });

    // Send via provider
    const sendResult = await this.sendWhatsAppMessage(phone, code);
    if (!sendResult.success) {
      return {
        success: false,
        message: sendResult.message || 'فشل إرسال رمز التحقق عبر WhatsApp، يرجى المحاولة لاحقاً.'
      };
    }

    const isTestEnv = process.env.NODE_ENV === 'test';

    return {
      success: true,
      phone,
      expiresInMinutes,
      // Security: ONLY reveal devCode during automated unit/integration test runs
      ...(isTestEnv ? { devCode: code } : {}),
      provider: sendResult.provider
    };
  }

  /**
   * Send WhatsApp message via Meta Cloud API or Simulator
   */
  static async sendWhatsAppMessage(phone, code) {
    const provider = process.env.WHATSAPP_PROVIDER || 'simulator';
    const messageText = `منصة PsyAI: رمز التحقق الخاص بك هو: *${code}*\n\nالرمز صالح لمدة ٥ دقائق. لا تشارك هذا الرمز مع أي شخص لضمان أمان حسابك.`;

    if (provider === 'meta') {
      if (!process.env.WHATSAPP_API_TOKEN || !process.env.WHATSAPP_PHONE_NUMBER_ID) {
        console.error('[SECURITY] Meta WhatsApp API credentials missing.');
        return {
          success: false,
          provider: 'meta',
          message: 'بيانات اعتماد WhatsApp API غير مكتملة في الخادم.'
        };
      }

      try {
        const url = `https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
        const recipient = phone.replace(/^\+/, '');

        const requestBody = process.env.WHATSAPP_TEMPLATE_NAME
          ? {
              messaging_product: 'whatsapp',
              to: recipient,
              type: 'template',
              template: {
                name: process.env.WHATSAPP_TEMPLATE_NAME,
                language: { code: process.env.WHATSAPP_TEMPLATE_LANG || 'ar' },
                components: [
                  {
                    type: 'body',
                    parameters: [{ type: 'text', text: code }]
                  },
                  {
                    type: 'button',
                    sub_type: 'url',
                    index: 0,
                    parameters: [{ type: 'text', text: code }]
                  }
                ]
              }
            }
          : {
              messaging_product: 'whatsapp',
              to: recipient,
              type: 'text',
              text: { body: messageText }
            };

        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.WHATSAPP_API_TOKEN}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(requestBody)
        });

        const data = typeof res.json === 'function' ? await res.json().catch(() => ({})) : {};
        const isOk = res.ok === true || (res.ok === undefined && (res.status === undefined || (res.status >= 200 && res.status < 300)));

        if (!isOk) {
          console.error('[SECURITY] Meta WhatsApp API HTTP Error:', res.status, data);
          return {
            success: false,
            provider: 'meta',
            message: 'فشل إرسال رسالة WhatsApp عبر المزود الرسمي.',
            data
          };
        }

        return { success: true, provider: 'meta', data };
      } catch (err) {
        console.error('[SECURITY] Meta WhatsApp API Network Error:', err.message);
        return {
          success: false,
          provider: 'meta',
          message: 'حدث خطأ في الاتصال بمزود خدمة WhatsApp.'
        };
      }
    }

    // Simulator Provider
    if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
      const maskedPhone = phone.replace(/^(\+?\d{4})\d+(\d{2})$/, '$1****$2');
      console.log(`[WHATSAPP SIMULATOR] Code ${code} sent to ${maskedPhone}`);
    }

    return {
      success: true,
      provider: 'simulator',
      ...(process.env.NODE_ENV === 'test' ? { devCode: code } : {})
    };
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
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.WHATSAPP_API_TOKEN}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: phone.replace(/^\+/, ''),
            type: 'text',
            text: { body: messageText }
          })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          console.error('[SECURITY] Meta WhatsApp Session Notification Error:', res.status, data);
          return { success: false, provider: 'meta', message: 'فشل إرسال إشعار الجلسة' };
        }
        return { success: true, provider: 'meta', data, messageText };
      } catch (err) {
        console.error('[SECURITY] Meta WhatsApp Notification Network Error:', err.message);
        return { success: false, provider: 'meta', message: err.message };
      }
    }

    return { success: true, provider: 'simulator', messageText };
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

    const now = new Date();

    // Check expiration first (expired wins over exhausted)
    if (now > record.expiresAt) {
      await prisma.otpToken.delete({ where: { phone } });
      return {
        success: false,
        message: 'انتهت صلاحية رمز التحقق. يرجى طلب رمز جديد.'
      };
    }

    // Check if phone is currently locked out
    if (record.phoneLockUntil && now < record.phoneLockUntil) {
      const minutesLeft = Math.ceil((record.phoneLockUntil.getTime() - now.getTime()) / (60 * 1000));
      return {
        success: false,
        isLocked: true,
        message: `تم قفل محاولات التحقق مؤقتاً بسبب تكرار المحاولات الخاطئة. يرجى الانتظار ${minutesLeft} دقيقة.`
      };
    }

    // Check if previous attempts already exhausted
    if (record.attempts >= 3) {
      await prisma.otpToken.delete({ where: { phone } });
      return {
        success: false,
        message: 'تم استنفاد المحاولات المسموحة (٣ محاولات). يرجى طلب رمز جديد.'
      };
    }

    // Compare code
    let isMatch = false;
    if (record.codeHash && record.codeHash.startsWith('$2')) {
      isMatch = await bcrypt.compare(String(inputCode), record.codeHash);
    } else if (record.codeHash) {
      isMatch = SecurityService.verifyOtpHash(String(inputCode), record.codeHash);
    }

    if (!isMatch) {
      const newAttempts = record.attempts + 1;
      const remaining = Math.max(0, 3 - newAttempts);

      await prisma.otpToken.update({
        where: { phone },
        data: {
          attempts: { increment: 1 },
          ...(newAttempts >= 3 ? { phoneLockUntil: new Date(Date.now() + 15 * 60 * 1000) } : {})
        }
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
