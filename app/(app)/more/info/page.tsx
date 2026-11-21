import { notFound } from 'next/navigation';
import { requireMember } from '@/lib/auth/membership';
import { getClubSettings, getActiveInvite } from '@/lib/queries/club';
import { ClubInfoPanel } from '@/components/club/ClubInfoPanel';
import { ClubInfoReadOnly } from '@/components/club/ClubInfoReadOnly';
import { InviteLinkPanel } from '@/components/club/InviteLinkPanel';
import { DangerZoneSection } from '@/components/club/DangerZoneSection';
import { SettingsBackLink } from '../settings-back-link';

export default async function GroupSettingsPage() {
  const { role } = await requireMember();
  const club = await getClubSettings();
  if (!club) notFound();

  const isAdmin = role === 'admin';
  const invite = isAdmin ? await getActiveInvite() : null;
  const panelClassName = 'rounded-2xl border border-border/80 bg-card p-5 shadow-sm';

  return (
    <div className="space-y-5 pb-4">
      <SettingsBackLink />
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">그룹 설정</h1>
        <p className="break-words text-sm text-muted-foreground">{club.name}{isAdmin ? ' · 관리자 전용' : ''}</p>
      </div>
      <div className={panelClassName}>
        {isAdmin ? <ClubInfoPanel club={club} /> : <ClubInfoReadOnly club={club} />}
      </div>
      {isAdmin ? (
        <div className={panelClassName}><InviteLinkPanel initialInvite={invite} /></div>
      ) : (
        <div className={panelClassName}><DangerZoneSection clubName={club.name} isAdmin={false} /></div>
      )}
    </div>
  );
}
