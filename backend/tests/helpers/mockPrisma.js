/**
 * Shared test helpers.
 *
 * The application modules require the Prisma client from `../config/db`
 * (i.e. `server/src/config/db.js`). Every test suite calls
 * `jest.mock('../src/config/db', ...)` (or the equivalent path) with the
 * factory below so that no real database connection is ever opened.
 *
 * `createPrismaMock()` returns a plain object whose eagerly-created jest.fn()
 * properties can be configured per-test with mockResolvedValue / mockRejectedValue.
 */

function createPrismaMock() {
  return {
    user: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn()
    },
    specialist: {
      findUnique: jest.fn(),
      findMany: jest.fn()
    },
    booking: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn()
    },
    payment: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn()
    },
    otpToken: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
      delete: jest.fn()
    },
    service: {
      findMany: jest.fn()
    },
    article: {
      findMany: jest.fn(),
      findUnique: jest.fn()
    },
    company: {
      create: jest.fn(),
      upsert: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn()
    },
    b2bRequest: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn()
    },
    auditLog: {
      create: jest.fn()
    },
    specialistSchedule: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn()
    },
    articleQuestion: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn()
    },
    sessionReminder: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      upsert: jest.fn(),
      deleteMany: jest.fn()
    },
    passwordResetToken: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn()
    },
    // Prisma interactive transaction support
    $transaction: jest.fn().mockImplementation(async (fn) => {
      if (typeof fn === 'function') {
        // Execute the callback with a minimal tx proxy (tests override this per-test)
        return fn({});
      }
      return Promise.all(fn);
    })
  };
}

/**
 * Minimal Express-like response mock.
 * Awaits are unavoidable because controllers `await prisma...` before
 * responding, but the res calls themselves are synchronous.
 */
function createRes() {
  const res = {
    statusCode: 200,
    body: undefined,
    status: jest.fn().mockReturnThis(),
    json: jest.fn(function (payload) {
      res.body = payload;
      return res;
    }),
    send: jest.fn().mockReturnThis()
  };
  return res;
}

/**
 * Minimal Express request mock.
 */
function createReq({ body = {}, params = {}, query = {}, headers = {}, user } = {}) {
  return { body, params, query, headers, user };
}

module.exports = { createPrismaMock, createRes, createReq };
