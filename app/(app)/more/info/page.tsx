import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { notFound } from 'next/navigation';
import { requireMember } from '@/lib/auth/membership';
import { getClubSettings, getActiveInvite, getActiveMembers } from '@/lib/queries/club';
import { ClubInfoPanel } from '@/components/club/ClubInfoPanel';
import { ClubInfoReadOnly } from '@/components/club/ClubInfoReadOnly';
import { InviteLinkPanel } from '@/components/club/InviteLinkPanel';
import { AdminTransferSection } from '@/components/club/AdminTransferSection';
import { DangerZoneSection } from '@/components/club/DangerZoneSection';

export default async function GroupSettingsPage() {
  const { role, user } = await requireMember();
  const club = await getClubSettings();
  if (!club) notFound();

  const isAdmin = role === 'admin';
  const [invite, members] = isAdmin
    ? await Promise.all([getActiveInvite(), getActiveMembers()])
    : [null, []];
  const panelClassName = 'rounded-2xl border border-stone-200/80 bg-white p-5 shadow-sm';

  return (
    <div className="space-y-5 pb-4">
      <Link href="/more" className="inline-flex min-h-11 items-center gap-1 text-sm text-stone-500 hover:text-stone-900">
        <ArrowLeft aria-hidden="true" className="size-4" /> 설정
      </Link>
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-stone-900">그룹 설정</h1>
        <p className="break-words text-sm text-stone-500">{club.name}{isAdmin ? ' · 관리자 전용' : ''}</p>
      </div>
      <div className={panelClassName}>
        {isAdmin ? <ClubInfoPanel club={club} /> : <ClubInfoReadOnly club={club} />}
      </div>
      {isAdmin ? (
        <>
          <div className={panelClassName}><InviteLinkPanel initialInvite={invite} /></div>
          <div className={panelClassName}><AdminTransferSection activeMembers={members} currentUserId={user.id} /></div>
        </>
      ) : (
        <div className={panelClassName}><DangerZoneSection clubName={club.name} isAdmin={false} /></div>
      )}
    </div>
  );
}
