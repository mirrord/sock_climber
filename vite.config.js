import { defineConfig } from 'vite';

export default defineConfig({
  base: '/sock_climber/',
  test: {
    include: ['tests/**/*.test.js'],
    environment: 'jsdom',
    reporters: ['default', 'junit'],
    outputFile: 'test-results.xml',
  },
});
