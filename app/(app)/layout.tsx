import { getMyClubs } from '@/lib/queries/clubs';
import { BottomNav } from '@/components/layout/BottomNav';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // /more 등 club context 없는 페이지에서도 BottomNav가 보이도록 첫 active club을
  // fallback으로 사용. active club이 0개면 BottomNav가 스스로 숨음.
  const clubs = await getMyClubs();
  const fallbackClubId = clubs[0]?.id;

  return (
    <div className="min-h-screen pb-20">
      <main className="max-w-md mx-auto px-4 py-4">{children}</main>
      <BottomNav fallbackClubId={fallbackClubId} />
    </div>
  );
}
