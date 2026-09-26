const { createRes, createReq } = require('./helpers/mockPrisma');
const {
  validate,
  registerSchema,
  loginSchema,
  verifyOtpSchema,
  sendOtpSchema,
  bookingSchema,
  visaPaymentSchema
} = require('../src/middlewares/validate');

/**
 * Run a schema through the validate() middleware and return a promise that
 * resolves with { status, body, nextCalled, nextArg }.
 */
function runValidation(schema, body) {
  const res = createRes();
  const next = jest.fn();
  const req = createReq({ body });

  validate(schema)(req, res, next);

  return { req, res, next };
}

describe('validate() middleware behavior', () => {
  it('calls next() and replaces req.body with the parsed value on success', () => {
    const { req, res, next } = runValidation(sendOtpSchema, { phone: '+962791234567' });

    expect(next).toHaveBeenCalledWith();
    expect(res.status).not.toHaveBeenCalled();
    expect(req.body).toEqual({ phone: '+962791234567' });
  });

  it('returns 400 with joined Arabic error messages on a Zod failure', () => {
    const { res, next } = runValidation(sendOtpSchema, { phone: 'bad' });

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.body.success).toBe(false);
    expect(typeof res.body.message).toBe('string');
    expect(res.body.errors).toBeInstanceOf(Array);
  });

  it('passes through non-Zod errors to next()', () => {
    const boom = new Error('boom');
    const res = createRes();
    const next = jest.fn();
    const schema = {
      parse: () => {
        throw boom;
      }
    };

    validate(schema)(createReq({ body: {} }), res, next);

    expect(next).toHaveBeenCalledWith(boom);
    expect(res.status).not.toHaveBeenCalled();
  });
});

describe('registerSchema', () => {
  const valid = {
    firstName: 'Sara',
    lastName: 'Ahmad',
    email: 'Sara@Example.com',
    phone: '+962791234567',
    gender: 'female',
    password: 'password123'
  };

  describe('positive cases', () => {
    it('accepts a fully valid payload and normalizes email to lowercase/trimmed', () => {
      const parsed = registerSchema.parse(valid);
      expect(parsed.email).toBe('sara@example.com');
    });

    it('trims surrounding whitespace from names', () => {
      const parsed = registerSchema.parse({
        ...valid,
        firstName: '  Sara  ',
        lastName: '  Ahmad  '
      });
      expect(parsed.firstName).toBe('Sara');
      expect(parsed.lastName).toBe('Ahmad');
    });

    it('accepts the optional condition and specGenderPref fields', () => {
      const parsed = registerSchema.parse({
        ...valid,
        condition: 'anxiety',
        specGenderPref: 'male'
      });
      expect(parsed.condition).toBe('anxiety');
      expect(parsed.specGenderPref).toBe('male');
    });
  });

  describe('negative cases', () => {
    it('rejects a too-short first name', () => {
      expect(() => registerSchema.parse({ ...valid, firstName: 'S' })).toThrow();
    });

    it('rejects an invalid email', () => {
      expect(() => registerSchema.parse({ ...valid, email: 'not-an-email' })).toThrow();
    });

    it('rejects a phone that is not in +9627[789] format', () => {
      expect(() => registerSchema.parse({ ...valid, phone: '+962123456789' })).toThrow();
    });

    it('rejects a phone with the wrong length', () => {
      expect(() => registerSchema.parse({ ...valid, phone: '+96279123' })).toThrow();
    });

    it('rejects an unsupported gender', () => {
      expect(() => registerSchema.parse({ ...valid, gender: 'other' })).toThrow();
    });

    it('rejects a password shorter than 6 characters', () => {
      expect(() => registerSchema.parse({ ...valid, password: '12345' })).toThrow();
    });

    it('rejects an invalid specGenderPref', () => {
      expect(() => registerSchema.parse({ ...valid, specGenderPref: 'unknown' })).toThrow();
    });

    it('rejects a payload missing required fields', () => {
      expect(() => registerSchema.parse({})).toThrow();
    });
  });

  describe('edge cases', () => {
    it('accepts a password of exactly 6 characters (boundary)', () => {
      expect(() => registerSchema.parse({ ...valid, password: '123456' })).not.toThrow();
    });

    it('accepts a first name of exactly 2 characters (boundary)', () => {
      expect(() => registerSchema.parse({ ...valid, firstName: 'Sa' })).not.toThrow();
    });

    it.each(['+962771234567', '+962781234567', '+962791234567'])(
      'accepts the valid Jordanian prefixes %s',
      (phone) => {
        expect(() => registerSchema.parse({ ...valid, phone })).not.toThrow();
      }
    );
  });
});

describe('loginSchema', () => {
  it('accepts a valid identifier and password', () => {
    expect(() => loginSchema.parse({ identifier: 'sara@example.com', password: 'x' }))
      .not.toThrow();
  });

  it('rejects an identifier shorter than 3 characters', () => {
    expect(() => loginSchema.parse({ identifier: 'ab', password: 'x' })).toThrow();
  });

  it('rejects an empty password', () => {
    expect(() => loginSchema.parse({ identifier: 'sara@example.com', password: '' })).toThrow();
  });

  it('rejects when password is missing entirely', () => {
    expect(() => loginSchema.parse({ identifier: 'sara@example.com' })).toThrow();
  });
});

describe('verifyOtpSchema', () => {
  it('accepts a valid 6-digit code', () => {
    expect(() => verifyOtpSchema.parse({ phone: '+962791234567', code: '123456' }))
      .not.toThrow();
  });

  it('rejects a code that is not 6 digits', () => {
    expect(() => verifyOtpSchema.parse({ phone: '+962791234567', code: '123' })).toThrow();
  });

  it('rejects a 6-character code containing letters', () => {
    expect(() => verifyOtpSchema.parse({ phone: '+962791234567', code: '12ab56' })).toThrow();
  });
});

describe('sendOtpSchema', () => {
  it('accepts a valid Jordanian phone', () => {
    expect(() => sendOtpSchema.parse({ phone: '+962791234567' })).not.toThrow();
  });

  it('rejects a non-Jordanian / malformed phone', () => {
    expect(() => sendOtpSchema.parse({ phone: '0791234567' })).toThrow();
  });
});

describe('bookingSchema', () => {
  const valid = {
    specialistId: '123e4567-e89b-12d3-a456-426614174000',
    sessionTime: 'اليوم 05:00 م'
  };

  it('accepts a valid booking payload', () => {
    expect(() => bookingSchema.parse(valid)).not.toThrow();
  });

  it('rejects a non-UUID specialistId', () => {
    expect(() => bookingSchema.parse({ ...valid, specialistId: 'spec-1' })).toThrow();
  });

  it('rejects a too-short sessionTime', () => {
    expect(() => bookingSchema.parse({ ...valid, sessionTime: 'x' })).toThrow();
  });

  it('accepts the optional condition and notes', () => {
    expect(() => bookingSchema.parse({ ...valid, condition: 'anxiety', notes: 'hello' }))
      .not.toThrow();
  });
});

describe('visaPaymentSchema', () => {
  const valid = {
    bookingId: '123e4567-e89b-12d3-a456-426614174000',
    cardNumber: '4111111522222',
    cardHolder: 'Sara Ahmad',
    expiry: '12/29',
    cvv: '123'
  };

  describe('positive cases', () => {
    // The schema requires a card number of at least 12 characters.
    it('accepts a valid payment payload', () => {
      expect(() => visaPaymentSchema.parse(valid)).not.toThrow();
    });

    it('accepts a 4-digit CVV (Amex)', () => {
      expect(() => visaPaymentSchema.parse({ ...valid, cvv: '1234' })).not.toThrow();
    });

    it('accepts an expiry without the slash', () => {
      expect(() => visaPaymentSchema.parse({ ...valid, expiry: '1229' })).not.toThrow();
    });
  });

  describe('negative cases', () => {
    it('rejects a non-UUID bookingId', () => {
      expect(() => visaPaymentSchema.parse({ ...valid, bookingId: 'booking-1' })).toThrow();
    });

    it('rejects a card number shorter than 12 characters', () => {
      expect(() => visaPaymentSchema.parse({ ...valid, cardNumber: '41111' })).toThrow();
    });

    it('rejects a card number longer than 19 characters', () => {
      expect(() => visaPaymentSchema.parse({ ...valid, cardNumber: '4'.repeat(20) })).toThrow();
    });

    it('rejects a card holder shorter than 3 characters', () => {
      expect(() => visaPaymentSchema.parse({ ...valid, cardHolder: 'Sa' })).toThrow();
    });

    it('rejects an invalid expiry month', () => {
      expect(() => visaPaymentSchema.parse({ ...valid, expiry: '13/29' })).toThrow();
    });

    it('rejects a CVV that is not 3-4 digits', () => {
      expect(() => visaPaymentSchema.parse({ ...valid, cvv: '12' })).toThrow();
    });

    it('rejects a CVV containing letters', () => {
      expect(() => visaPaymentSchema.parse({ ...valid, cvv: '1a3' })).toThrow();
    });
  });

  describe('edge cases', () => {
    it('accepts a card number of exactly 12 characters (lower boundary)', () => {
      expect(() => visaPaymentSchema.parse({ ...valid, cardNumber: '4'.repeat(12) }))
        .not.toThrow();
    });

    it('accepts a card number of exactly 19 characters (upper boundary)', () => {
      expect(() => visaPaymentSchema.parse({ ...valid, cardNumber: '4'.repeat(19) }))
        .not.toThrow();
    });

    it('accepts expiry month "01" and "12" (boundaries)', () => {
      expect(() => visaPaymentSchema.parse({ ...valid, expiry: '01/29' })).not.toThrow();
      expect(() => visaPaymentSchema.parse({ ...valid, expiry: '12/29' })).not.toThrow();
    });
  });
});
