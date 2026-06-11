// vitest.config.integration.ts
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./tests/integration/setup.ts'],
    include: ['tests/integration/**/*.test.ts'],
    globals: true,
    testTimeout: 10_000,
    // 로컬 supabase DB를 공유하므로 직렬 실행 (race 방지)
    fileParallelism: false,
  },
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
});
