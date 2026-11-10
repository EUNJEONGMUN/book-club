import { config } from 'dotenv';
import { vi } from 'vitest';
import { currentClient } from './helpers/auth';

config({ path: '.env.test', override: true });

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServer: async () => currentClient(),
}));
