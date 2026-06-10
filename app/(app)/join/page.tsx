import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSupabaseServer } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { JoinButton } from './JoinButton';

type ValidationResult =
  | { status: 'valid'; club_id: string; club_name: string }
  | { status: 'already_member'; club_id: string; club_name: string }
  | { status: 'already_pending'; club_id: string; club_name: string }
  | { status: 'expired' | 'revoked' | 'not_found' };

export default async function JoinPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  if (!token) {
    return (
      <div className="space-y-4 max-w-sm mx-auto">
        <h1 className="text-xl font-bold">초대코드가 없어요</h1>
        <p className="text-sm text-stone-500">초대링크의 token이 누락됐어요. 새 링크를 받아주세요.</p>
        <Link href="/clubs"><Button variant="outline" className="w-full">내 그룹으로</Button></Link>
      </div>
    );
  }

  const supabase = await getSupabaseServer();
  const { data, error } = await supabase.rpc('validate_invite_token', { invite_token: token });

  if (error || !data) {
    return (
      <div className="space-y-4 max-w-sm mx-auto">
        <h1 className="text-xl font-bold">확인할 수 없어요</h1>
        <p className="text-sm text-stone-500">초대코드 검증 중 오류가 발생했어요. 잠시 후 다시 시도해주세요.</p>
        <Link href="/clubs"><Button variant="outline" className="w-full">내 그룹으로</Button></Link>
      </div>
    );
  }

  const result = data as unknown as ValidationResult;

  if (result.status === 'already_member') {
    redirect(`/clubs/${result.club_id}`);
  }

  if (result.status === 'already_pending') {
    return (
      <div className="space-y-4 max-w-sm mx-auto">
        <h1 className="text-xl font-bold">신청 완료</h1>
        <p className="text-sm text-stone-500">
          <strong>{result.club_name}</strong>에 이미 가입 신청을 보냈어요. 관리자 승인을 기다려주세요.
        </p>
        <Link href="/clubs"><Button variant="outline" className="w-full">내 그룹으로</Button></Link>
      </div>
    );
  }

  if (result.status === 'not_found') {
    return (
      <div className="space-y-4 max-w-sm mx-auto">
        <h1 className="text-xl font-bold">잘못된 초대코드예요</h1>
        <p className="text-sm text-stone-500">코드가 올바른지 확인해주세요.</p>
        <Link href="/clubs"><Button variant="outline" className="w-full">내 그룹으로</Button></Link>
      </div>
    );
  }

  if (result.status === 'revoked') {
    return (
      <div className="space-y-4 max-w-sm mx-auto">
        <h1 className="text-xl font-bold">취소된 초대링크예요</h1>
        <p className="text-sm text-stone-500">관리자에게 새 초대링크를 요청해주세요.</p>
        <Link href="/clubs"><Button variant="outline" className="w-full">내 그룹으로</Button></Link>
      </div>
    );
  }

  if (result.status === 'expired') {
    return (
      <div className="space-y-4 max-w-sm mx-auto">
        <h1 className="text-xl font-bold">만료된 초대링크예요</h1>
        <p className="text-sm text-stone-500">관리자에게 새 초대링크를 요청해주세요.</p>
        <Link href="/clubs"><Button variant="outline" className="w-full">내 그룹으로</Button></Link>
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
        이 그룹의 초대를 받으셨어요. 가입을 신청하면 관리자의 승인 후 멤버가 됩니다.
      </p>
      <JoinButton token={token} />
      <Link href="/clubs">
        <Button variant="ghost" className="w-full text-stone-500">취소</Button>
      </Link>
    </div>
  );
}
