/** @type {import('jest').Config} */
const config = {
  testEnvironment: 'node',
  transform: {
    '^.+\\.(js|jsx)$': 'babel-jest',
  },
  transformIgnorePatterns: [
    '/node_modules/(?!formidable)',
  ],
  testMatch: ['**/__tests__/**/*.test.js'],
};

module.exports = config;
