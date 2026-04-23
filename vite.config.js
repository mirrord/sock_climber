import { defineConfig } from 'vite';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.js'],
    environment: 'jsdom',
    base: '/sock_climber/',
    reporters: ['default', 'junit'],
    outputFile: 'test-results.xml',
  },
});
