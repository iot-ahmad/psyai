const { createPrismaMock, createRes, createReq } = require('./helpers/mockPrisma');

const mockPrisma = createPrismaMock();
jest.mock('../src/config/db', () => mockPrisma);

const bookingsController = require('../src/controllers/bookingsController');

describe('bookingsController.createBooking', () => {
  let res, next;
  const body = { specialistId: 'spec-1', sessionTime: 'اليوم 05:00 م', condition: 'anxiety', notes: 'hi' };

  beforeEach(() => {
    jest.clearAllMocks();
    res = createRes();
    next = jest.fn();
  });

  it('creates a pending booking when the specialist exists', async () => {
    mockPrisma.specialist.findUnique.mockResolvedValue({ id: 'spec-1', name: 'د. سارة', price: 300 });
    mockPrisma.booking.create.mockResolvedValue({
      id: 'booking-1',
      sessionTime: body.sessionTime,
      status: 'pending',
      createdAt: new Date('2025-01-01'),
      specialist: { id: 'spec-1', name: 'د. سارة', title: 'أخصائية', price: 300, avatar: 'a.png' }
    });

    const req = createReq({ body, user: { id: 'user-1', condition: 'depression' } });
    await bookingsController.createBooking(req, res, next);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.body.success).toBe(true);
    expect(res.body.booking).toMatchObject({
      id: 'booking-1',
      status: 'pending',
      price: 300
    });

    const createdData = mockPrisma.booking.create.mock.calls[0][0].data;
    expect(createdData).toMatchObject({
      userId: 'user-1',
      specialistId: 'spec-1',
      sessionTime: body.sessionTime,
      condition: 'anxiety', // body condition wins over the user's default
      status: 'pending'
    });
  });

  it('falls back to the user condition when none is given in the body', async () => {
    mockPrisma.specialist.findUnique.mockResolvedValue({ id: 'spec-1', price: 300 });
    mockPrisma.booking.create.mockResolvedValue({
      id: 'booking-1',
      sessionTime: body.sessionTime,
      status: 'pending',
      createdAt: new Date(),
      specialist: { price: 300 }
    });

    const req = createReq({
      body: { specialistId: 'spec-1', sessionTime: body.sessionTime },
      user: { id: 'user-1', condition: 'depression' }
    });
    await bookingsController.createBooking(req, res, next);

    expect(mockPrisma.booking.create.mock.calls[0][0].data.condition).toBe('depression');
  });

  it('defaults condition to null and notes to null when nothing is provided', async () => {
    mockPrisma.specialist.findUnique.mockResolvedValue({ id: 'spec-1', price: 300 });
    mockPrisma.booking.create.mockResolvedValue({
      id: 'booking-1',
      sessionTime: body.sessionTime,
      status: 'pending',
      createdAt: new Date(),
      specialist: { price: 300 }
    });

    const req = createReq({
      body: { specialistId: 'spec-1', sessionTime: body.sessionTime },
      user: { id: 'user-1' }
    });
    await bookingsController.createBooking(req, res, next);

    const createdData = mockPrisma.booking.create.mock.calls[0][0].data;
    expect(createdData.condition).toBeNull();
    expect(createdData.notes).toBeNull();
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
    const bookings = [{ id: 'b1' }, { id: 'b2' }];
    mockPrisma.booking.findMany.mockResolvedValue(bookings);

    const req = createReq({ user: { id: 'user-1' } });
    await bookingsController.getMyBookings(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.body.count).toBe(2);
    expect(res.body.bookings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'b1', sessionLink: '/session.html?id=b1' }),
        expect.objectContaining({ id: 'b2', sessionLink: '/session.html?id=b2' })
      ])
    );

    const arg = mockPrisma.booking.findMany.mock.calls[0][0];
    expect(arg.where).toEqual({ userId: 'user-1' });
    expect(arg.orderBy).toEqual({ createdAt: 'desc' });
  });

  it('returns an empty list with count 0 for a user with no bookings (edge case)', async () => {
    mockPrisma.booking.findMany.mockResolvedValue([]);

    const req = createReq({ user: { id: 'user-1' } });
    await bookingsController.getMyBookings(req, res, next);

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
    mockPrisma.booking.findUnique.mockResolvedValue({ id: 'booking-1', userId: 'user-1' });
    mockPrisma.booking.update.mockResolvedValue({ id: 'booking-1', status: 'cancelled' });

    const req = createReq({ params: { id: 'booking-1' }, user: { id: 'user-1', role: 'user' } });
    await bookingsController.cancelBooking(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.body.booking.status).toBe('cancelled');
    expect(mockPrisma.booking.update).toHaveBeenCalledWith({
      where: { id: 'booking-1' },
      data: { status: 'cancelled' }
    });
  });

  it('lets an admin cancel someone else\'s booking', async () => {
    mockPrisma.booking.findUnique.mockResolvedValue({ id: 'booking-1', userId: 'someone-else' });
    mockPrisma.booking.update.mockResolvedValue({ id: 'booking-1', status: 'cancelled' });

    const req = createReq({ params: { id: 'booking-1' }, user: { id: 'admin-1', role: 'admin' } });
    await bookingsController.cancelBooking(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockPrisma.booking.update).toHaveBeenCalledTimes(1);
  });

  it('returns 404 when the booking does not exist', async () => {
    mockPrisma.booking.findUnique.mockResolvedValue(null);

    const req = createReq({ params: { id: 'missing' }, user: { id: 'user-1', role: 'user' } });
    await bookingsController.cancelBooking(req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(mockPrisma.booking.update).not.toHaveBeenCalled();
  });

  it('returns 403 when a non-owner non-admin tries to cancel', async () => {
    mockPrisma.booking.findUnique.mockResolvedValue({ id: 'booking-1', userId: 'owner' });

    const req = createReq({ params: { id: 'booking-1' }, user: { id: 'intruder', role: 'user' } });
    await bookingsController.cancelBooking(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.body.success).toBe(false);
    expect(mockPrisma.booking.update).not.toHaveBeenCalled();
  });

  it('delegates errors to next()', async () => {
    mockPrisma.booking.findUnique.mockRejectedValue(new Error('db error'));
    const req = createReq({ params: { id: 'booking-1' }, user: { id: 'user-1', role: 'user' } });
    await bookingsController.cancelBooking(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});
