import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { sanitizeNext } from '@/lib/auth/safe-next';

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get('code');
  const safeNext = sanitizeNext(searchParams.get('next'));

  if (code) {
    const supabase = await getSupabaseServer();
    await supabase.auth.exchangeCodeForSession(code);
  }
  return NextResponse.redirect(new URL(safeNext, origin));
}
