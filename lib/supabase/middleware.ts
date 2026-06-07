import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import type { Database } from '@/lib/database.types';

export async function updateSession(req: NextRequest) {
  let res = NextResponse.next({ request: req });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (toSet) => {
          toSet.forEach(({ name, value }) => req.cookies.set(name, value));
          res = NextResponse.next({ request: req });
          toSet.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  const path = req.nextUrl.pathname;
  const isPublic = path.startsWith('/login') || path.startsWith('/signup') || path.startsWith('/auth') || path.startsWith('/pending');

  if (!user && !isPublic) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    url.searchParams.set('next', req.nextUrl.pathname + req.nextUrl.search);
    return NextResponse.redirect(url);
  }

  // 인증됐지만 profile 없는 경우 (예: 구글 OAuth 첫 로그인) → /signup 으로 이동
  // signOut()을 호출하지 않는 이유: 구글 OAuth 세션을 유지해야 /signup에서
  // CompleteProfileForm이 사용자 이메일을 읽고 프로필을 생성할 수 있기 때문.
  // 이 세션은 profile이 없으면 모든 비공개 경로에서 이 조건에 걸려 /signup으로만
  // 리다이렉트되므로, 보호 경로에는 접근 불가.
  if (user && !isPublic) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, approved')
      .eq('id', user.id)
      .maybeSingle();
    if (!profile) {
      const url = req.nextUrl.clone();
      const originalNext = req.nextUrl.pathname + req.nextUrl.search;
      url.pathname = '/signup';
      url.search = '';
      if (originalNext !== '/') url.searchParams.set('next', originalNext);
      return NextResponse.redirect(url);
    }
    // 가입 승인 대기 중인 사용자 → /pending
    if (!profile.approved) {
      const url = req.nextUrl.clone();
      url.pathname = '/pending';
      url.search = '';
      return NextResponse.redirect(url);
    }
  }

  return res;
}
