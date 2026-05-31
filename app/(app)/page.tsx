import { getCurrentProfile } from '@/lib/queries/members';

export default async function HomePage() {
  const profile = await getCurrentProfile();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">안녕하세요, {profile?.display_name}님</h1>
      <p className="text-slate-600">홈 화면 준비 중...</p>
    </div>
  );
}
