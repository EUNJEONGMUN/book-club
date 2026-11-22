import Link from 'next/link';
import { ChevronRight, Palette, Settings, Users } from 'lucide-react';
import { notFound } from 'next/navigation';
import { LogoutButton } from './logout-button';
import { requireMember } from '@/lib/auth/membership';
import { getClubSettings } from '@/lib/queries/club';
import { getPendingApplicants, getCurrentProfile } from '@/lib/queries/members';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

export default async function SettingsPage() {
  const { role } = await requireMember();
  const [club, profile, applicants] = await Promise.all([
    getClubSettings(),
    getCurrentProfile(),
    role === 'admin' ? getPendingApplicants() : Promise.resolve([]),
  ]);
  if (!club) notFound();

  const displayName = profile?.display_name || '내 프로필';
  const rowClassName = 'flex min-h-16 items-center gap-3 px-5 py-4 text-foreground transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring';

  return (
    <div className="space-y-8 pb-4">
      <h1 className="text-2xl font-bold tracking-tight text-foreground">설정</h1>

      <Link
        href="/more/profile"
        aria-label={`${displayName} 프로필 수정`}
        className="flex items-center gap-4 rounded-2xl border border-border/80 bg-card p-5 shadow-sm transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Avatar className="size-14">
          {profile?.avatar_url && <AvatarImage src={profile.avatar_url} alt="" />}
          <AvatarFallback className="bg-muted text-lg font-medium text-muted-foreground">
            {displayName.slice(0, 1)}
          </AvatarFallback>
        </Avatar>
        <span className="min-w-0 flex-1 truncate text-lg font-semibold text-foreground">{displayName}</span>
        <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
      </Link>

      <section aria-labelledby="settings-group-heading" className="space-y-3">
        <h2 id="settings-group-heading" className="px-1 text-sm font-semibold text-muted-foreground">내 그룹</h2>
        <div className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-sm">
          <div className="flex items-center gap-2 px-5 pb-2 pt-5">
            <h3 className="min-w-0 break-words text-lg font-bold text-foreground">{club.name}</h3>
            <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${role === 'admin' ? 'bg-warning text-warning-foreground' : 'bg-muted text-muted-foreground'}`}>
              {role === 'admin' ? '관리자' : '멤버'}
            </span>
          </div>
          <Link href="/more/info" className={rowClassName}>
            <Settings aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
            <span className="flex-1">그룹 설정</span>
            <ChevronRight aria-hidden="true" className="size-5 text-muted-foreground" />
          </Link>
          {role === 'admin' && (
            <Link href="/more/applicants" className={`${rowClassName} border-t border-border`}>
              <Users aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
              <span className="flex-1">가입 신청자 <span className="text-muted-foreground">({applicants.length}명)</span></span>
              <ChevronRight aria-hidden="true" className="size-5 text-muted-foreground" />
            </Link>
          )}
          <Link href="/more/theme" className={`${rowClassName} border-t border-border`}>
            <Palette aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
            <span className="flex-1">테마 변경</span>
            <ChevronRight aria-hidden="true" className="size-5 text-muted-foreground" />
          </Link>
        </div>
      </section>

      <LogoutButton />
    </div>
  );
}
