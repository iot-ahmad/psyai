/**
 * Tests for reminderWorker.js
 * We test the pure/deterministic functions (buildMessage, scheduleBookingReminders, processDueReminders)
 * without actually starting the cron job.
 */

// Set test environment before any requires
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';

const { createPrismaMock } = require('./helpers/mockPrisma');

const mockPrisma = createPrismaMock();
jest.mock('../src/config/db', () => mockPrisma);

// Mock WhatsAppService
const mockWhatsapp = {
  sendWhatsAppMessage: jest.fn(),
  sendSessionStartNotification: jest.fn()
};
jest.mock('../src/services/whatsappService', () => mockWhatsapp);

// Import after mocks are set up
const {
  buildMessage,
  scheduleBookingReminders,
  cancelBookingReminders,
  processDueReminders,
  processReminder,
  startReminderWorker
} = require('../src/services/reminderWorker');

const EncryptionService = require('../src/services/encryptionService');

// ── buildMessage ─────────────────────────────────────────────────────────────
describe('reminderWorker.buildMessage', () => {
  const sessionTime = new Date('2025-06-15T10:00:00Z');

  it('returns a 24h reminder message containing specialist name', () => {
    const msg = buildMessage('reminder_24h', 'سارة', 'د. أحمد', sessionTime, null);
    expect(msg).toContain('د. أحمد');
    expect(msg).toContain('سارة');
    expect(msg).toContain('غداً');
  });

  it('returns a 1h reminder message mentioning one hour', () => {
    const msg = buildMessage('reminder_1h', 'سارة', 'د. أحمد', sessionTime, null);
    expect(msg).toContain('ساعة');
    expect(msg).toContain('سارة');
  });

  it('returns a session_link message containing the meeting link', () => {
    const link = 'https://meet.psyai.app/session/abc';
    const msg = buildMessage('session_link', 'سارة', 'د. أحمد', sessionTime, link);
    expect(msg).toContain(link);
    expect(msg).toContain('10 دقائق');
  });

  it('returns a generic fallback for unknown types', () => {
    const msg = buildMessage('unknown_type', 'سارة', 'د. أحمد', sessionTime, null);
    expect(msg).toContain('تذكير');
  });
});

// ── scheduleBookingReminders ──────────────────────────────────────────────────
describe('reminderWorker.scheduleBookingReminders', () => {
  beforeEach(() => jest.clearAllMocks());

  it('creates all 3 reminder records for a session 48h in the future', async () => {
    mockPrisma.sessionReminder.upsert.mockResolvedValue({});

    const futureTime = new Date(Date.now() + 48 * 60 * 60 * 1000);
    await scheduleBookingReminders('booking-1', futureTime);

    expect(mockPrisma.sessionReminder.upsert).toHaveBeenCalledTimes(3);

    const types = mockPrisma.sessionReminder.upsert.mock.calls.map(
      ([{ create }]) => create.reminderType
    );
    expect(types).toContain('reminder_24h');
    expect(types).toContain('reminder_1h');
    expect(types).toContain('session_link');
  });

  it('skips past reminder windows for a session 30 minutes in the future', async () => {
    mockPrisma.sessionReminder.upsert.mockResolvedValue({});

    // 30min in future: only session_link (10min) is still valid — 24h and 1h windows already passed
    const nearFuture = new Date(Date.now() + 30 * 60 * 1000);
    await scheduleBookingReminders('booking-2', nearFuture);

    expect(mockPrisma.sessionReminder.upsert).toHaveBeenCalledTimes(1);
    const type = mockPrisma.sessionReminder.upsert.mock.calls[0][0].create.reminderType;
    expect(type).toBe('session_link');
  });

  it('creates no reminders when the session is in the past', async () => {
    const pastTime = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago
    await scheduleBookingReminders('booking-3', pastTime);

    expect(mockPrisma.sessionReminder.upsert).not.toHaveBeenCalled();
  });

  it('does not throw when upsert fails — logs instead', async () => {
    mockPrisma.sessionReminder.upsert.mockRejectedValue(new Error('db error'));

    const futureTime = new Date(Date.now() + 48 * 60 * 60 * 1000);
    // Should resolve without throwing
    await expect(scheduleBookingReminders('booking-4', futureTime)).resolves.toBeUndefined();
  });
});

// ── processDueReminders ───────────────────────────────────────────────────────
describe('reminderWorker.processDueReminders', () => {
  beforeEach(() => jest.clearAllMocks());

  it('does nothing when there are no due reminders', async () => {
    mockPrisma.sessionReminder.findMany.mockResolvedValue([]);
    await processDueReminders();
    expect(mockPrisma.sessionReminder.update).not.toHaveBeenCalled();
    expect(mockWhatsapp.sendWhatsAppMessage).not.toHaveBeenCalled();
  });

  it('processes due reminders and sends WhatsApp messages', async () => {
    const encryptedPhone = EncryptionService.encryptField('+962791234567');
    const encryptedName = EncryptionService.encryptField('سارة');

    mockPrisma.sessionReminder.findMany.mockResolvedValue([
      { id: 'rem-1', bookingId: 'book-1', reminderType: 'reminder_1h', scheduledAt: new Date() }
    ]);

    mockPrisma.booking.findUnique.mockResolvedValue({
      id: 'book-1',
      status: 'confirmed',
      sessionTime: new Date(Date.now() + 60 * 60 * 1000),
      meetingLink: null,
      user: {
        id: 'user-1',
        firstName: encryptedName,
        phoneEncrypted: encryptedPhone
      },
      specialist: { name: 'د. خالد' }
    });

    mockWhatsapp.sendWhatsAppMessage.mockResolvedValue({ success: true, provider: 'simulator' });
    mockPrisma.sessionReminder.update.mockResolvedValue({});

    await processDueReminders();

    expect(mockWhatsapp.sendWhatsAppMessage).toHaveBeenCalledTimes(1);
    const [phone, , message] = mockWhatsapp.sendWhatsAppMessage.mock.calls[0];
    expect(phone).toBe('+962791234567');
    expect(message).toContain('د. خالد');
    expect(mockPrisma.sessionReminder.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'sent' }) })
    );
  });

  it('marks reminder as failed when booking is cancelled', async () => {
    mockPrisma.sessionReminder.findMany.mockResolvedValue([
      { id: 'rem-2', bookingId: 'book-2', reminderType: 'reminder_24h', scheduledAt: new Date() }
    ]);
    mockPrisma.booking.findUnique.mockResolvedValue({
      id: 'book-2',
      status: 'cancelled', // cancelled booking
      sessionTime: new Date(),
      user: { id: 'u1', firstName: 'X', phoneEncrypted: 'X' },
      specialist: { name: 'Y' }
    });
    mockPrisma.sessionReminder.update.mockResolvedValue({});

    await processDueReminders();

    expect(mockWhatsapp.sendWhatsAppMessage).not.toHaveBeenCalled();
    expect(mockPrisma.sessionReminder.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'failed' }) })
    );
  });

  it('marks reminder as failed when WhatsApp send fails', async () => {
    const encryptedPhone = EncryptionService.encryptField('+962799000000');
    const encryptedName = EncryptionService.encryptField('علي');

    mockPrisma.sessionReminder.findMany.mockResolvedValue([
      { id: 'rem-3', bookingId: 'book-3', reminderType: 'session_link', scheduledAt: new Date() }
    ]);
    mockPrisma.booking.findUnique.mockResolvedValue({
      id: 'book-3',
      status: 'confirmed',
      sessionTime: new Date(Date.now() + 10 * 60 * 1000),
      meetingLink: 'https://meet.example.com/abc',
      user: { id: 'u2', firstName: encryptedName, phoneEncrypted: encryptedPhone },
      specialist: { name: 'د. ليلى' }
    });

    mockWhatsapp.sendWhatsAppMessage.mockResolvedValue({ success: false, message: 'API error' });
    mockPrisma.sessionReminder.update.mockResolvedValue({});

    await processDueReminders();

    expect(mockPrisma.sessionReminder.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'failed' }) })
    );
  });
});

// ── cancelBookingReminders ───────────────────────────────────────────────────
describe('reminderWorker.cancelBookingReminders', () => {
  beforeEach(() => jest.clearAllMocks());

  it('updates pending reminders to failed with sentAt timestamp', async () => {
    mockPrisma.sessionReminder.updateMany.mockResolvedValue({ count: 2 });

    const result = await cancelBookingReminders('booking-cancel-1');

    expect(mockPrisma.sessionReminder.updateMany).toHaveBeenCalledWith({
      where: {
        bookingId: 'booking-cancel-1',
        status: 'pending'
      },
      data: {
        status: 'failed',
        sentAt: expect.any(Date)
      }
    });
    expect(result).toEqual({ count: 2 });
  });

  it('handles db error without throwing', async () => {
    mockPrisma.sessionReminder.updateMany.mockRejectedValue(new Error('db down'));

    const result = await cancelBookingReminders('booking-cancel-2');
    expect(result).toBeNull();
  });
});

// ── startReminderWorker ───────────────────────────────────────────────────────
describe('reminderWorker.startReminderWorker', () => {
  it('returns null in test environment (NODE_ENV=test)', () => {
    const result = startReminderWorker();
    expect(result).toBeNull();
  });
});