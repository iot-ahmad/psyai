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
      create: jest.fn()
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
      create: jest.fn()
    },
    auditLog: {
      create: jest.fn()
    },
    passwordResetToken: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn()
    }
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
