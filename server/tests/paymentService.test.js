const { createPrismaMock } = require('./helpers/mockPrisma');

const mockPrisma = createPrismaMock();
jest.mock('../src/config/db', () => mockPrisma);

// Silence the noisy gateway console output produced by the service.
jest.spyOn(console, 'log').mockImplementation(() => { });

const PaymentService = require('../src/services/paymentService');

describe('PaymentService.processCardPayment', () => {
  const baseBooking = {
    id: 'booking-1',
    userId: 'user-1',
    status: 'pending',
    specialist: { id: 'spec-1', price: 300 },
    user: { id: 'user-1' }
  };

  const validCard = {
    bookingId: 'booking-1',
    userId: 'user-1',
    cardNumber: '4111 1111 1111 1111',
    cardHolder: 'Sara Ahmad',
    expiry: '12/29',
    cvv: '123'
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Default happy-path behaviour; individual tests override as needed.
    mockPrisma.booking.findUnique.mockResolvedValue(baseBooking);
    mockPrisma.booking.update.mockResolvedValue({ ...baseBooking, status: 'confirmed' });
    mockPrisma.payment.findUnique.mockResolvedValue(null);
    mockPrisma.payment.create.mockImplementation(async ({ data }) => ({
      id: 'payment-1',
      createdAt: new Date('2025-01-01T00:00:00Z'),
      ...data
    }));
  });

  describe('positive cases', () => {
    it('creates a payment and confirms the booking for a valid Visa card', async () => {
      const result = await PaymentService.processCardPayment(validCard);

      expect(result.success).toBe(true);
      expect(result.payment).toMatchObject({
        transactionRef: expect.stringMatching(/^TXN_VISA_\d+_[0-9A-F]{6}$/),
        amount: 300,
        currency: 'SAR',
        cardBrand: 'Visa',
        cardLast4: '1111'
      });

      expect(mockPrisma.payment.create).toHaveBeenCalledTimes(1);
      const createdData = mockPrisma.payment.create.mock.calls[0][0].data;
      expect(createdData).toMatchObject({
        bookingId: 'booking-1',
        userId: 'user-1',
        amount: 300,
        currency: 'SAR',
        status: 'paid',
        paymentMethod: 'VISA_CARD',
        cardLast4: '1111',
        cardBrand: 'Visa'
      });

      expect(mockPrisma.booking.update).toHaveBeenCalledWith({
        where: { id: 'booking-1' },
        data: { status: 'confirmed' }
      });
    });

    it('detects a Mastercard from a "5" prefix', async () => {
      const result = await PaymentService.processCardPayment({
        ...validCard,
        cardNumber: '5555123412344444'
      });

      expect(result.payment.cardBrand).toBe('Mastercard');
      expect(mockPrisma.payment.create.mock.calls[0][0].data.paymentMethod)
        .toBe('MASTERCARD_CARD');
    });

    it('detects a Mada card from a "6" prefix', async () => {
      const result = await PaymentService.processCardPayment({
        ...validCard,
        cardNumber: '6070 8811 2233 4455'
      });

      expect(result.payment.cardBrand).toBe('Mada');
      expect(mockPrisma.payment.create.mock.calls[0][0].data.paymentMethod)
        .toBe('MADA_CARD');
    });

    it('strips non-digit separators before computing the last 4 digits', async () => {
      await PaymentService.processCardPayment({
        ...validCard,
        cardNumber: '4111-1111-1111-1234'
      });

      expect(mockPrisma.payment.create.mock.calls[0][0].data.cardLast4).toBe('1234');
    });

    it('falls back to the default amount (250) when the specialist price is missing', async () => {
      mockPrisma.booking.findUnique.mockResolvedValue({
        ...baseBooking,
        specialist: { id: 'spec-1' } // no price
      });

      const result = await PaymentService.processCardPayment(validCard);
      expect(result.payment.amount).toBe(250);
    });

    it('falls back to 250 when there is no specialist relation at all', async () => {
      mockPrisma.booking.findUnique.mockResolvedValue({
        ...baseBooking,
        specialist: null
      });

      const result = await PaymentService.processCardPayment(validCard);
      expect(result.payment.amount).toBe(250);
    });

    it('is idempotent: returns the existing payment when the booking is already paid', async () => {
      mockPrisma.booking.findUnique.mockResolvedValue({ ...baseBooking, status: 'confirmed' });
      const existingPayment = { id: 'pay-existing', status: 'paid', amount: 300 };
      mockPrisma.payment.findUnique.mockResolvedValue(existingPayment);

      const result = await PaymentService.processCardPayment(validCard);

      expect(result.success).toBe(true);
      expect(result.payment).toBe(existingPayment);
      expect(mockPrisma.payment.create).not.toHaveBeenCalled();
      expect(mockPrisma.booking.update).not.toHaveBeenCalled();
    });

    it('still processes payment for a completed booking that has no paid record', async () => {
      mockPrisma.booking.findUnique.mockResolvedValue({ ...baseBooking, status: 'completed' });
      mockPrisma.payment.findUnique.mockResolvedValue(null);

      const result = await PaymentService.processCardPayment(validCard);

      expect(result.success).toBe(true);
      expect(mockPrisma.payment.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('negative cases', () => {
    it('throws when the booking does not exist', async () => {
      mockPrisma.booking.findUnique.mockResolvedValue(null);

      await expect(PaymentService.processCardPayment(validCard))
        .rejects.toThrow('جلسة الحجز غير موجودة');

      expect(mockPrisma.payment.create).not.toHaveBeenCalled();
    });

    it('throws when the requesting user does not own the booking', async () => {
      mockPrisma.booking.findUnique.mockResolvedValue({
        ...baseBooking,
        userId: 'someone-else'
      });

      await expect(PaymentService.processCardPayment(validCard))
        .rejects.toThrow('غير مصرح لك بسداد قيمة هذا الحجز');
    });

    it('rejects a card number that is too short (< 13 digits)', async () => {
      await expect(
        PaymentService.processCardPayment({ ...validCard, cardNumber: '411111' })
      ).rejects.toThrow('رقم البطاقة غير صحيح أو غير مكتمل');

      expect(mockPrisma.payment.create).not.toHaveBeenCalled();
    });

    it('rejects a card number that is too long (> 19 digits)', async () => {
      await expect(
        PaymentService.processCardPayment({ ...validCard, cardNumber: '4'.repeat(20) })
      ).rejects.toThrow('رقم البطاقة غير صحيح أو غير مكتمل');
    });

    it('propagates database errors from payment.create', async () => {
      mockPrisma.payment.create.mockRejectedValue(new Error('DB down'));

      await expect(PaymentService.processCardPayment(validCard))
        .rejects.toThrow('DB down');
      // The booking must not be confirmed if the payment write failed.
      expect(mockPrisma.booking.update).not.toHaveBeenCalled();
    });
  });

  describe('edge cases', () => {
    it('counts exactly 13 digits as valid (lower boundary)', async () => {
      await expect(
        PaymentService.processCardPayment({ ...validCard, cardNumber: '4'.repeat(13) })
      ).resolves.toMatchObject({ success: true });
    });

    it('counts exactly 19 digits as valid (upper boundary)', async () => {
      await expect(
        PaymentService.processCardPayment({ ...validCard, cardNumber: '4'.repeat(19) })
      ).resolves.toMatchObject({ success: true });
    });

    it('preserves leading zeros of the card number when extracting last 4', async () => {
      await PaymentService.processCardPayment({
        ...validCard,
        cardNumber: '4111000000012'
      });
      expect(mockPrisma.payment.create.mock.calls[0][0].data.cardLast4).toBe('0012');
    });

    it('produces unique transaction references across sequential calls', async () => {
      const a = await PaymentService.processCardPayment(validCard);
      const b = await PaymentService.processCardPayment(validCard);

      expect(a.payment.transactionRef).not.toBe(b.payment.transactionRef);
    });
  });
});

describe('PaymentService.getPaymentByBooking', () => {
  beforeEach(() => jest.clearAllMocks());

  it('queries by bookingId and includes the nested specialist', async () => {
    const payment = { id: 'pay-1', bookingId: 'booking-1' };
    mockPrisma.payment.findUnique.mockResolvedValue(payment);

    const result = await PaymentService.getPaymentByBooking('booking-1');

    expect(result).toBe(payment);
    expect(mockPrisma.payment.findUnique).toHaveBeenCalledWith({
      where: { bookingId: 'booking-1' },
      include: {
        booking: {
          include: { specialist: true }
        }
      }
    });
  });

  it('returns null when no payment is found', async () => {
    mockPrisma.payment.findUnique.mockResolvedValue(null);
    await expect(PaymentService.getPaymentByBooking('missing')).resolves.toBeNull();
  });
});
