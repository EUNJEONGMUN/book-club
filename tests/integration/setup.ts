import { config } from 'dotenv';
import { vi } from 'vitest';

config({ path: '.env.test', override: true });

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));
// supabase/server mock은 T3에서 auth.ts와 함께 추가
