import { redirect } from 'next/navigation';
import { getSupabaseServer } from '@/lib/supabase/server';
import { SignupForm } from './signup-form';
import { CompleteProfileForm } from './complete-profile-form';

export default async function SignupPage() {
  const supabase = await getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', user.id)
      .maybeSingle();
    if (profile) redirect('/');

    // 구글 OAuth 첫 로그인 — 이름만 입력하면 됨
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50">
        <CompleteProfileForm userEmail={user.email ?? ''} />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50">
      <SignupForm />
    </div>
  );
}
