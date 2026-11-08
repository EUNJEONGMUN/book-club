import Link from 'next/link';
import { LogoutButton } from './logout-button';
import { requireMember } from '@/lib/auth/membership';
import { notFound } from 'next/navigation';
import {
  getClubSettings,
  getActiveInvite,
  getActiveMembers,
} from '@/lib/queries/club';
import { InviteLinkPanel } from '@/components/club/InviteLinkPanel';
import { ClubInfoPanel } from '@/components/club/ClubInfoPanel';
import { ClubInfoReadOnly } from '@/components/club/ClubInfoReadOnly';
import { AdminTransferSection } from '@/components/club/AdminTransferSection';
import { DangerZoneSection } from '@/components/club/DangerZoneSection';

export default async function SettingsPage() {
  const { role, user } = await requireMember();
  const userId = user.id;

  const club = await getClubSettings();
  if (!club) notFound();

  if (role === 'admin') {
    const [invite, members] = await Promise.all([
      getActiveInvite(),
      getActiveMembers(),
    ]);

    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-xl font-bold">{club.name} 설정</h1>
          <p className="text-sm text-stone-500">관리자 전용</p>
        </div>
        <Link href="/more/profile" className="block underline text-sm">내 프로필 수정</Link>
        <Link href="/more/applicants" className="block underline text-sm">가입 신청자 관리</Link>
        <ClubInfoPanel club={club} />
        <InviteLinkPanel initialInvite={invite} />
        <AdminTransferSection activeMembers={members} currentUserId={userId} />
        <LogoutButton />
      </div>
    );
  }

  // member view
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold">{club.name} 설정</h1>
        <p className="text-sm text-stone-500">멤버</p>
      </div>
      <Link href="/more/profile" className="block underline text-sm">내 프로필 수정</Link>
      <ClubInfoReadOnly club={club} />
      <DangerZoneSection clubName={club.name} isAdmin={false} />
      <LogoutButton />
    </div>
  );
}
