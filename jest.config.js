// jest.config.js - 微信小程序游戏测试配置
module.exports = {
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/tests/setup.js'],
  testMatch: ['<rootDir>/tests/**/*.test.js'],
  collectCoverageFrom: ['miniprogram/utils/**/*.js'],
  coveragePathIgnorePatterns: ['miniprogram/utils/renderer.js'],
  moduleNameMapper: {
    // 将 miniprogram 内部路径映射到实际文件
    '^../../utils/(.*)\\.js$': '<rootDir>/miniprogram/utils/$1.js',
    '^../../data/(.*)\\.js$': '<rootDir>/miniprogram/data/$1.js'
  },
  // 允许 require 小程序模块
  moduleDirectories: ['node_modules', '<rootDir>'],
  // 测试超时
  testTimeout: 10000,
  clearMocks: true,
  // 重置 Date.now 在每个测试前
  globals: {}
};