import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { sanitizeNext } from '@/lib/auth/safe-next';

async function finishGoogleConnection(searchParams: URLSearchParams, origin: string) {
  const profile = new URL('/more/profile', origin);
  profile.hash = 'login-methods';
  const finish = (result: 'cancelled' | 'conflict' | 'failed' | 'linked') => {
    profile.searchParams.set('google', result);
    return NextResponse.redirect(profile);
  };
  const failure = (code: string | null | undefined) =>
    finish(code === 'identity_already_exists' ? 'conflict' : 'failed');

  if (searchParams.get('error') === 'access_denied') return finish('cancelled');
  const code = searchParams.get('code');
  if (!code || searchParams.has('error') || searchParams.has('error_code')) {
    return failure(searchParams.get('error_code'));
  }
  try {
    const supabase = await getSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return finish('failed');

    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return failure(error.code);
    if (data.user?.id !== user.id || !data.user.identities?.some(({ provider }) => provider === 'google')) {
      return finish('failed');
    }
    return finish('linked');
  } catch {
    return finish('failed');
  }
}

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  if (searchParams.get('intent') === 'link-google') return finishGoogleConnection(searchParams, origin);
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
