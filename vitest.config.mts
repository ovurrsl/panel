import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    // Date assertions are locale *and* zone dependent. Pinning the zone here is
    // what stops "15.03.2026 09:30" from becoming "15.03.2026 12:30" on a
    // machine in another country and failing a test that is actually correct.
    env: { TZ: 'UTC' },
  },
});
