import { getClubName } from '@/lib/club-name';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSupabaseServer } from '@/lib/supabase/server';
import { authPath, sanitizeNext } from '@/lib/auth/safe-next';
import { SignupForm } from './signup-form';
import { CompleteProfileForm } from './complete-profile-form';

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const { next: destination } = await searchParams;
  const next = sanitizeNext(typeof destination === 'string' ? destination : undefined);
  const loginPath = authPath('/login', next);
  const clubName = await getClubName();
  const supabase = await getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', user.id)
      .maybeSingle();
    if (profile) redirect(next);

    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-stone-50">
        <div className="w-full max-w-sm space-y-8">
          <div className="text-center space-y-2">
            <div className="text-4xl">📖</div>
            <h1 className="text-2xl font-semibold text-stone-800 tracking-tight">{clubName}</h1>
          </div>
          <CompleteProfileForm userEmail={user.email ?? ''} next={next} />
          <p className="text-sm text-center text-stone-500">
            이미 계정이 있나요?{' '}
            <Link href={loginPath} className="text-stone-800 font-medium underline underline-offset-4">
              로그인
            </Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-stone-50">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center space-y-2">
          <div className="text-4xl">📖</div>
          <h1 className="text-2xl font-semibold text-stone-800 tracking-tight">{clubName}</h1>
          <p className="text-sm text-stone-500">함께 책 읽는 사람들</p>
        </div>
        <SignupForm next={next} />
        <p className="text-sm text-center text-stone-500">
          이미 계정이 있나요?{' '}
          <Link href={loginPath} className="text-stone-800 font-medium underline underline-offset-4">
            로그인
          </Link>
        </p>
      </div>
    </div>
  );
}
