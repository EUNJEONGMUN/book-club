import { notFound } from 'next/navigation';
import { getClubById, getMyClubs } from '@/lib/queries/clubs';
import { ClubSwitcher } from '@/components/club/ClubSwitcher';
import { BottomNav } from '@/components/layout/BottomNav';

export default async function ClubLayout({
  params,
  children,
}: {
  params: Promise<{ id: string }>;
  children: React.ReactNode;
}) {
  const { id } = await params;
  const [club, myClubs] = await Promise.all([getClubById(id), getMyClubs()]);
  if (!club) notFound();

  return (
    <>
      <header className="sticky top-0 z-40 bg-white border-b border-stone-100">
        <div className="max-w-md mx-auto px-4 py-3">
          <ClubSwitcher
            currentClub={{ id: club.id, name: club.name }}
            allClubs={myClubs}
          />
        </div>
      </header>
      <div className="space-y-6 pt-4">{children}</div>
      <BottomNav />
    </>
  );
}
