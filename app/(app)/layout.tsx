import { getClubName } from '@/lib/club-name';
import { getMembership } from '@/lib/auth/membership';
import { BottomNav } from '@/components/layout/BottomNav';
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [membership, clubName] = await Promise.all([getMembership(), getClubName()]);
  const active = membership?.role === 'admin' || membership?.role === 'member';
  return <div className="min-h-screen pb-20">
    {active && <header className="sticky top-0 z-40 bg-white border-b border-stone-100">
      <div className="max-w-md mx-auto px-4 py-3 text-base font-semibold text-stone-800">{clubName}</div>
    </header>}
    <main className="max-w-md mx-auto px-4 py-4">{children}</main>
    {active && <BottomNav />}
  </div>;
}
