import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { sanitizeNext } from '@/lib/auth/safe-next';

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get('code');
  const safeNext = sanitizeNext(searchParams.get('next'));
  const failed = (error: 'oauth_cancelled' | 'oauth_callback_failed') => {
    const url = new URL('/login', origin);
    url.searchParams.set('error', error);
    if (safeNext !== '/') url.searchParams.set('next', safeNext);
    return NextResponse.redirect(url);
  };

  if (searchParams.has('error') || !code) {
    return failed(searchParams.get('error') === 'access_denied' ? 'oauth_cancelled' : 'oauth_callback_failed');
  }
  try {
    const supabase = await getSupabaseServer();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return failed('oauth_callback_failed');
  } catch {
    return failed('oauth_callback_failed');
  }
  return NextResponse.redirect(new URL(safeNext, origin));
}
