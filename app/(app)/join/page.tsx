import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSupabaseServer } from '@/lib/supabase/server';
import { getMembership } from '@/lib/auth/membership';
import { Button } from '@/components/ui/button';
import { JoinButton } from './JoinButton';

type ValidationResult =
  | { status: 'valid'; club_name: string }
  | { status: 'already_member'; club_name: string }
  | { status: 'already_pending'; club_name: string }
  | { status: 'expired' | 'revoked' | 'not_found' };

export default async function JoinPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const membership = await getMembership();
  if (membership?.role === 'admin' || membership?.role === 'member') redirect('/');
  if (membership?.role === 'pending') redirect('/pending');

  const { token } = await searchParams;
  if (typeof token !== 'string' || !token.trim()) redirect('/onboarding');

  const supabase = await getSupabaseServer();
  const { data, error } = await supabase.rpc('validate_invite_token', { invite_token: token });

  if (error || !data) {
    return (
      <div className="space-y-4 max-w-sm mx-auto">
        <h1 className="text-xl font-bold">확인할 수 없어요</h1>
        <p className="text-sm text-stone-500">초대 링크를 확인하는 중 오류가 발생했어요. 잠시 후 다시 시도해주세요.</p>
        <Link href="/"><Button variant="outline" className="w-full">홈으로</Button></Link>
      </div>
    );
  }

  const result = data as unknown as ValidationResult;

  if (result.status === 'already_member') {
    redirect('/');
  }

  if (result.status === 'already_pending') redirect('/pending');

  if (result.status === 'not_found') {
    return (
      <div className="space-y-4 max-w-sm mx-auto">
        <h1 className="text-xl font-bold">잘못된 초대 링크예요</h1>
        <p className="text-sm text-stone-500">관리자에게 초대 링크를 다시 요청해주세요.</p>
        <Link href="/"><Button variant="outline" className="w-full">홈으로</Button></Link>
      </div>
    );
  }

  if (result.status === 'revoked') {
    return (
      <div className="space-y-4 max-w-sm mx-auto">
        <h1 className="text-xl font-bold">취소된 초대링크예요</h1>
        <p className="text-sm text-stone-500">관리자에게 새 초대링크를 요청해주세요.</p>
        <Link href="/"><Button variant="outline" className="w-full">홈으로</Button></Link>
      </div>
    );
  }

  if (result.status === 'expired') {
    return (
      <div className="space-y-4 max-w-sm mx-auto">
        <h1 className="text-xl font-bold">만료된 초대링크예요</h1>
        <p className="text-sm text-stone-500">관리자에게 새 초대링크를 요청해주세요.</p>
        <Link href="/"><Button variant="outline" className="w-full">홈으로</Button></Link>
      </div>
    );
  }

  // valid
  if (result.status !== 'valid') {
    return null;
  }

  return (
    <div className="space-y-4 max-w-sm mx-auto">
      <h1 className="text-xl font-bold">{result.club_name}</h1>
      <p className="text-sm text-stone-500">
        부글부글의 초대를 받으셨어요. 가입을 신청하면 관리자의 승인 후 멤버가 됩니다.
      </p>
      <JoinButton token={token} />
      <Link href="/">
        <Button variant="ghost" className="w-full text-stone-500">취소</Button>
      </Link>
    </div>
  );
}
