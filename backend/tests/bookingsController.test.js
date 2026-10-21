const { createPrismaMock, createRes, createReq } = require('./helpers/mockPrisma');

const mockPrisma = createPrismaMock();
jest.mock('../src/config/db', () => mockPrisma);

const bookingsController = require('../src/controllers/bookingsController');

describe('bookingsController.createBooking', () => {
  let res, next;
  const futureTime = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const body = { specialistId: 'spec-1', sessionTime: futureTime, condition: 'anxiety', notes: 'hi' };

  const mockBookingResult = {
    id: 'booking-1',
    sessionTime: new Date(futureTime),
    status: 'pending',
    createdAt: new Date('2025-01-01'),
    specialist: { id: 'spec-1', name: 'د. سارة', title: 'أخصائية', price: 300, avatar: 'a.png' }
  };

  beforeEach(() => {
    jest.clearAllMocks();
    res = createRes();
    next = jest.fn();

    mockPrisma.$transaction.mockImplementation(async (fn) => {
      const tx = {
        booking: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockImplementation((...args) => mockPrisma.booking.create(...args))
        }
      };
      return fn(tx);
    });
  });

  it('creates a pending booking when the specialist exists', async () => {
    mockPrisma.specialist.findUnique.mockResolvedValue({ id: 'spec-1', name: 'د. سارة', price: 300 });
    mockPrisma.booking.create.mockResolvedValue(mockBookingResult);

    const req = createReq({ body, user: { id: 'user-1' } });
    await bookingsController.createBooking(req, res, next);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.body.success).toBe(true);
    expect(res.body.booking).toMatchObject({ id: 'booking-1', status: 'pending', price: 300 });

    const createdData = mockPrisma.booking.create.mock.calls[0][0].data;
    expect(createdData).toMatchObject({ userId: 'user-1', specialistId: 'spec-1', status: 'pending' });
    const EncryptionService = require('../src/services/encryptionService');
    expect(EncryptionService.decryptField(createdData.conditionEncrypted)).toBe('anxiety');
  });

  it('defaults condition and notes to null when nothing is provided', async () => {
    mockPrisma.specialist.findUnique.mockResolvedValue({ id: 'spec-1', price: 300 });
    mockPrisma.booking.create.mockResolvedValue({ ...mockBookingResult, specialist: { price: 300 } });

    const req = createReq({ body: { specialistId: 'spec-1', sessionTime: futureTime }, user: { id: 'user-1' } });
    await bookingsController.createBooking(req, res, next);

    const createdData = mockPrisma.booking.create.mock.calls[0][0].data;
    expect(createdData.conditionEncrypted).toBeNull();
    expect(createdData.notes).toBeNull();
  });

  it('returns 400 when sessionTime is invalid', async () => {
    const req = createReq({ body: { specialistId: 'spec-1', sessionTime: 'invalid-date' }, user: { id: 'user-1' } });
    await bookingsController.createBooking(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.body.message).toContain('غير صالح');
  });

  it('returns 400 when sessionTime is in the past', async () => {
    const req = createReq({
      body: { specialistId: 'spec-1', sessionTime: new Date(Date.now() - 60000).toISOString() },
      user: { id: 'user-1' }
    });
    await bookingsController.createBooking(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.body.message).toContain('الماضي');
  });

  it('returns 409 when the same slot is already booked — double-booking prevention', async () => {
    mockPrisma.specialist.findUnique.mockResolvedValue({ id: 'spec-1', price: 300 });
    mockPrisma.$transaction.mockImplementation(async (fn) => {
      const tx = {
        booking: {
          findFirst: jest.fn().mockResolvedValue({ id: 'existing' }),
          create: jest.fn()
        }
      };
      return fn(tx);
    });

    const req = createReq({ body, user: { id: 'user-1' } });
    await bookingsController.createBooking(req, res, next);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.body.message).toContain('محجوز بالفعل');
    expect(mockPrisma.booking.create).not.toHaveBeenCalled();
  });

  it('returns 404 when the specialist does not exist', async () => {
    mockPrisma.specialist.findUnique.mockResolvedValue(null);
    const req = createReq({ body, user: { id: 'user-1' } });
    await bookingsController.createBooking(req, res, next);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.body.success).toBe(false);
    expect(mockPrisma.booking.create).not.toHaveBeenCalled();
  });

  it('delegates database errors to next()', async () => {
    mockPrisma.specialist.findUnique.mockRejectedValue(new Error('db error'));
    const req = createReq({ body, user: { id: 'user-1' } });
    await bookingsController.createBooking(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});

describe('bookingsController.getMyBookings', () => {
  let res, next;

  beforeEach(() => {
    jest.clearAllMocks();
    res = createRes();
    next = jest.fn();
  });

  it('returns the user bookings with a count, newest first', async () => {
    mockPrisma.booking.findMany.mockResolvedValue([
      { id: 'b1', sessionTime: new Date(), status: 'confirmed', conditionEncrypted: null, notes: null, createdAt: new Date(), specialist: { id: 's1', name: 'X', title: 'T', avatar: null, price: 200 }, payment: { status: 'SUCCEEDED' } },
      { id: 'b2', sessionTime: new Date(), status: 'pending', conditionEncrypted: null, notes: null, createdAt: new Date(), specialist: { id: 's2', name: 'Y', title: 'T2', avatar: null, price: 150 }, payment: null }
    ]);
    const req = createReq({ user: { id: 'user-1' } });
    await bookingsController.getMyBookings(req, res, next);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.body.count).toBe(2);
    expect(res.body.bookings).toHaveLength(2);
  });

  it('returns an empty list with count 0 for a user with no bookings (edge case)', async () => {
    mockPrisma.booking.findMany.mockResolvedValue([]);
    const req = createReq({ user: { id: 'user-1' } });
    await bookingsController.getMyBookings(req, res, next);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.body.count).toBe(0);
    expect(res.body.bookings).toEqual([]);
  });

  it('delegates errors to next()', async () => {
    mockPrisma.booking.findMany.mockRejectedValue(new Error('db error'));
    const req = createReq({ user: { id: 'user-1' } });
    await bookingsController.getMyBookings(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});

describe('bookingsController.cancelBooking', () => {
  let res, next;

  beforeEach(() => {
    jest.clearAllMocks();
    res = createRes();
    next = jest.fn();
  });

  it('lets the owner cancel their booking and set status to "cancelled"', async () => {
    mockPrisma.booking.findUnique.mockResolvedValue({ id: 'b1', userId: 'user-1', status: 'pending' });
    mockPrisma.booking.update.mockResolvedValue({ id: 'b1', status: 'cancelled' });
    const req = createReq({ params: { id: 'b1' }, user: { id: 'user-1', role: 'user' } });
    await bookingsController.cancelBooking(req, res, next);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.body.booking.status).toBe('cancelled');
  });

  it('lets an admin cancel someone else\'s booking', async () => {
    mockPrisma.booking.findUnique.mockResolvedValue({ id: 'b1', userId: 'user-2', status: 'pending' });
    mockPrisma.booking.update.mockResolvedValue({ id: 'b1', status: 'cancelled' });
    const req = createReq({ params: { id: 'b1' }, user: { id: 'admin-1', role: 'admin' } });
    await bookingsController.cancelBooking(req, res, next);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns 404 when the booking does not exist', async () => {
    mockPrisma.booking.findUnique.mockResolvedValue(null);
    const req = createReq({ params: { id: 'b99' }, user: { id: 'user-1', role: 'user' } });
    await bookingsController.cancelBooking(req, res, next);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 403 when a non-owner non-admin tries to cancel', async () => {
    mockPrisma.booking.findUnique.mockResolvedValue({ id: 'b1', userId: 'user-2', status: 'pending' });
    const req = createReq({ params: { id: 'b1' }, user: { id: 'user-1', role: 'user' } });
    await bookingsController.cancelBooking(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('delegates errors to next()', async () => {
    mockPrisma.booking.findUnique.mockRejectedValue(new Error('db error'));
    const req = createReq({ params: { id: 'b1' }, user: { id: 'user-1', role: 'user' } });
    await bookingsController.cancelBooking(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});
