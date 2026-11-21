import { getClubName } from '@/lib/club-name';
import { getMembership } from '@/lib/auth/membership';
import { BottomNav } from '@/components/layout/BottomNav';
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [membership, clubName] = await Promise.all([getMembership(), getClubName()]);
  const active = membership?.role === 'admin' || membership?.role === 'member';
  return <div data-slot="app-shell" className={active ? 'min-h-screen pb-[var(--bottom-nav-height)]' : 'min-h-screen'}>
    {active && <header data-slot="app-header" className="sticky top-0 z-40 border-b border-border bg-card text-card-foreground">
      <div className="max-w-md mx-auto px-4 py-3 text-base font-semibold">{clubName}</div>
    </header>}
    <main className="max-w-md mx-auto px-4 py-4">{children}</main>
    {active && <BottomNav />}
  </div>;
}
