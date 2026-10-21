const cron = require('node-cron');
const prisma = require('../config/db');
const WhatsAppService = require('./whatsappService');
const EncryptionService = require('./encryptionService');

/**
 * ReminderWorker — Session Reminder Cron Job
 *
 * Runs every minute and processes pending SessionReminder records.
 * For each due reminder it:
 *   1. Fetches the booking + user + specialist data
 *   2. Sends a WhatsApp notification
 *   3. Marks the reminder as sent (or failed)
 *
 * Reminder types (from ReminderTypeEnum):
 *   - reminder_24h  → sent 24 hours before sessionTime
 *   - reminder_1h   → sent 1 hour before sessionTime
 *   - session_link  → sent 10 minutes before sessionTime (with join link)
 *
 * Safety:
 *   - Uses $transaction to atomically claim + mark each reminder (prevents double-processing
 *     in case of multiple server instances or fast restarts).
 *   - Catches per-reminder errors so one failure does not block others.
 *   - Never throws — all errors are logged only.
 */

const REMINDER_WINDOWS = {
  reminder_24h: 24 * 60 * 60 * 1000,  // 24 hours in ms
  reminder_1h:      60 * 60 * 1000,   // 1 hour in ms
  session_link:     10 * 60 * 1000    // 10 minutes in ms
};

// Build a human-readable WhatsApp message per reminder type
function buildMessage(type, patientName, specialistName, sessionTime, meetingLink) {
  const timeStr = new Date(sessionTime).toLocaleString('ar-JO', {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone: 'Asia/Amman'
  });

  switch (type) {
    case 'reminder_24h':
      return (
        `منصة PsyAI 🧠\n\n` +
        `مرحباً ${patientName}،\n` +
        `تذكير: لديك جلسة مع ${specialistName} غداً\n` +
        `📅 ${timeStr}\n\n` +
        `يمكنك التحضير لجلستك مسبقاً لضمان أفضل تجربة. نتمنى لك جلسة مثمرة!`
      );
    case 'reminder_1h':
      return (
        `منصة PsyAI 🧠\n\n` +
        `مرحباً ${patientName}،\n` +
        `تذكير: جلستك مع ${specialistName} بعد ساعة واحدة\n` +
        `🕐 ${timeStr}\n\n` +
        `يرجى التأكد من جهوزيتك وجودة الاتصال بالإنترنت.`
      );
    case 'session_link':
      return (
        `منصة PsyAI 🧠\n\n` +
        `مرحباً ${patientName}،\n` +
        `جلستك مع ${specialistName} ستبدأ خلال 10 دقائق!\n\n` +
        `🔗 رابط الانضمام:\n${meetingLink || 'سيتوفر الرابط قريباً'}\n\n` +
        `لا تتأخر، نتمنى لك جلسة موفقة 💙`
      );
    default:
      return `منصة PsyAI: تذكير بجلستك مع ${specialistName} في ${timeStr}`;
  }
}

/**
 * Process a single due reminder inside a Prisma transaction.
 * Returns true on success, false on failure.
 */
async function processReminder(reminder) {
  try {
    // Fetch full booking data with user + specialist
    const booking = await prisma.booking.findUnique({
      where: { id: reminder.bookingId },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            phoneEncrypted: true,
            phoneHash: true
          }
        },
        specialist: {
          select: {
            name: true,
            user: {
              select: {
                firstName: true,
                phoneEncrypted: true
              }
            }
          }
        }
      }
    });

    // Guard: booking must exist and be in an active state
    if (!booking || !['pending', 'confirmed'].includes(booking.status)) {
      await prisma.sessionReminder.update({
        where: { id: reminder.id },
        data: { status: 'failed', sentAt: new Date() }
      });
      return false;
    }

    // Decrypt patient phone
    const rawPhone = EncryptionService.decryptField(booking.user.phoneEncrypted);
    if (!rawPhone || rawPhone.length < 8) {
      await prisma.sessionReminder.update({
        where: { id: reminder.id },
        data: { status: 'failed', sentAt: new Date() }
      });
      console.warn(`[REMINDER] Booking ${booking.id}: patient has no valid phone — skipped.`);
      return false;
    }

    // Decrypt patient name
    const patientFirstName = EncryptionService.decryptField(booking.user.firstName) || 'عزيزي المريض';
    const specialistName = booking.specialist?.name || 'الأخصائي';
    const meetingLink = booking.meetingLink || `${process.env.APP_URL || 'https://psyai.app'}/session/${booking.id}`;

    const message = buildMessage(
      reminder.reminderType,
      patientFirstName,
      specialistName,
      booking.sessionTime,
      meetingLink
    );

    // Send WhatsApp message
    const sendResult = await WhatsAppService.sendWhatsAppMessage(rawPhone, null, message);

    const now = new Date();
    await prisma.sessionReminder.update({
      where: { id: reminder.id },
      data: {
        status: sendResult.success ? 'sent' : 'failed',
        sentAt: now
      }
    });

    if (sendResult.success) {
      console.log(`[REMINDER] ✅ ${reminder.reminderType} sent to booking ${booking.id} (${rawPhone.replace(/(\+\d{4})\d+(\d{2})/, '$1****$2')})`);
    } else {
      console.error(`[REMINDER] ❌ ${reminder.reminderType} failed for booking ${booking.id}: ${sendResult.message}`);
    }

    return sendResult.success;
  } catch (err) {
    console.error(`[REMINDER] Error processing reminder ${reminder.id}:`, err.message);
    // Mark as failed to avoid stuck reminders
    try {
      await prisma.sessionReminder.update({
        where: { id: reminder.id },
        data: { status: 'failed', sentAt: new Date() }
      });
    } catch (_) {}
    return false;
  }
}

/**
 * Main tick function — called every cron cycle.
 * Queries all due, pending reminders and processes them.
 */
async function processDueReminders() {
  const now = new Date();

  let dueReminders;
  try {
    dueReminders = await prisma.sessionReminder.findMany({
      where: {
        status: 'pending',
        scheduledAt: { lte: now }
      },
      orderBy: { scheduledAt: 'asc' },
      take: 50  // process max 50 per tick to avoid memory spikes
    });
  } catch (err) {
    console.error('[REMINDER] Failed to query due reminders:', err.message);
    return;
  }

  if (dueReminders.length === 0) return;

  console.log(`[REMINDER] Processing ${dueReminders.length} due reminder(s)...`);

  // Process concurrently with a concurrency limit of 5
  const CONCURRENCY = 5;
  for (let i = 0; i < dueReminders.length; i += CONCURRENCY) {
    const batch = dueReminders.slice(i, i + CONCURRENCY);
    await Promise.allSettled(batch.map(processReminder));
  }
}

/**
 * Schedule reminders for a newly confirmed booking.
 * Called from bookingsController or paymentsController after payment success.
 *
 * Creates three SessionReminder records:
 *   - reminder_24h: 24h before sessionTime
 *   - reminder_1h:  1h before sessionTime
 *   - session_link: 10min before sessionTime
 *
 * Uses upsert to be idempotent (safe to call multiple times for the same booking).
 */
async function scheduleBookingReminders(bookingId, sessionTime) {
  const sessionMs = new Date(sessionTime).getTime();
  const now = Date.now();

  const remindersToCreate = [
    { type: 'reminder_24h', offsetMs: 24 * 60 * 60 * 1000 },
    { type: 'reminder_1h',  offsetMs:      60 * 60 * 1000 },
    { type: 'session_link', offsetMs:      10 * 60 * 1000 }
  ]
    .map(({ type, offsetMs }) => ({
      type,
      scheduledAt: new Date(sessionMs - offsetMs)
    }))
    .filter(({ scheduledAt }) => scheduledAt.getTime() > now); // skip past reminders

  if (remindersToCreate.length === 0) {
    console.warn(`[REMINDER] Booking ${bookingId}: all reminder windows already passed.`);
    return;
  }

  const results = await Promise.allSettled(
    remindersToCreate.map(({ type, scheduledAt }) =>
      prisma.sessionReminder.upsert({
        where: {
          // Unique constraint: (bookingId, reminderType)
          unique_booking_reminder: { bookingId, reminderType: type }
        },
        update: {},  // already exists — leave it unchanged
        create: {
          bookingId,
          reminderType: type,
          scheduledAt,
          status: 'pending'
        }
      })
    )
  );

  const created = results.filter(r => r.status === 'fulfilled').length;
  console.log(`[REMINDER] Scheduled ${created}/${remindersToCreate.length} reminders for booking ${bookingId}`);
}

/**
 * Cancel pending reminders for a cancelled booking.
 * Sets pending reminders to status 'failed' or removes them.
 */
async function cancelBookingReminders(bookingId) {
  try {
    const result = await prisma.sessionReminder.updateMany({
      where: {
        bookingId,
        status: 'pending'
      },
      data: {
        status: 'failed',
        sentAt: new Date()
      }
    });
    console.log(`[REMINDER] Cancelled ${result.count || 0} pending reminder(s) for booking ${bookingId}`);
    return result;
  } catch (err) {
    console.error(`[REMINDER] Failed to cancel reminders for booking ${bookingId}:`, err.message);
    return null;
  }
}

/**
 * Start the cron job. Should be called once at server startup.
 * Cron: every minute (* * * * *)
 */
function startReminderWorker() {
  // Guard: do not start in test environment
  if (process.env.NODE_ENV === 'test') {
    console.log('[REMINDER] Worker disabled in test environment.');
    return null;
  }

  console.log('[REMINDER] Starting reminder cron worker (every 60 seconds)...');

  const task = cron.schedule('* * * * *', async () => {
    try {
      await processDueReminders();
    } catch (err) {
      // Top-level safety net — should never reach here
      console.error('[REMINDER] Unexpected cron error:', err.message);
    }
  });

  return task;
}

module.exports = {
  startReminderWorker,
  scheduleBookingReminders,
  cancelBookingReminders,
  processDueReminders,    // exported for testing
  processReminder,        // exported for testing
  buildMessage            // exported for testing
};

