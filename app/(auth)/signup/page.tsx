import { getInviteByToken } from '@/lib/queries/invites';
import { SignupForm } from './signup-form';

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  if (!token) {
    return <ErrorView message="초대 링크가 필요합니다. 가입은 초대를 받은 분만 가능합니다." />;
  }
  const invite = await getInviteByToken(token);
  if (!invite) return <ErrorView message="잘못된 초대 링크입니다." />;
  if (invite.used_by) return <ErrorView message="이미 사용된 초대 링크입니다." />;
  if (new Date(invite.expires_at) < new Date()) return <ErrorView message="만료된 초대 링크입니다." />;

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50">
      <SignupForm token={token} />
    </div>
  );
}

function ErrorView({ message }: { message: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="text-center space-y-3">
        <p className="text-xl">😕</p>
        <p className="text-slate-700">{message}</p>
        <a href="/login" className="text-sm underline text-slate-600">로그인 페이지로</a>
      </div>
    </div>
  );
}
