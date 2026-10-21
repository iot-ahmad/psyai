/**
 * Jest configuration for the PsyAI backend.
 *
 * Tests are unit tests that isolate business logic by mocking Prisma
 * (the database layer) and any external I/O, so no real database or
 * network is required to run the suite.
 */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  clearMocks: true,
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/index.js'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov'],
  verbose: true
};
