import Link from 'next/link';
import { ChevronRight, Settings, Users } from 'lucide-react';
import { notFound } from 'next/navigation';
import { LogoutButton } from './logout-button';
import { requireMember } from '@/lib/auth/membership';
import { getClubSettings, getPendingApplicants } from '@/lib/queries/club';
import { getCurrentProfile } from '@/lib/queries/members';
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
  const rowClassName = 'flex min-h-16 items-center gap-3 px-5 py-4 text-stone-700 transition-colors hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-stone-400';

  return (
    <div className="space-y-8 pb-4">
      <h1 className="text-2xl font-bold tracking-tight text-stone-900">설정</h1>

      <Link
        href="/more/profile"
        aria-label={`${displayName} 프로필 수정`}
        className="flex items-center gap-4 rounded-2xl border border-stone-200/80 bg-white p-5 shadow-sm transition-colors hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400"
      >
        <Avatar className="size-14">
          {profile?.avatar_url && <AvatarImage src={profile.avatar_url} alt="" />}
          <AvatarFallback className="bg-stone-100 text-lg font-medium text-stone-600">
            {displayName.slice(0, 1)}
          </AvatarFallback>
        </Avatar>
        <span className="min-w-0 flex-1 truncate text-lg font-semibold text-stone-900">{displayName}</span>
        <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-stone-300" />
      </Link>

      <section aria-labelledby="my-group-heading" className="space-y-3">
        <h2 id="my-group-heading" className="px-1 text-sm font-semibold text-stone-600">내 그룹</h2>
        <div className="overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-sm">
          <div className="flex items-center gap-2 px-5 pb-2 pt-5">
            <h3 className="min-w-0 break-words text-lg font-bold text-stone-900">{club.name}</h3>
            <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${role === 'admin' ? 'bg-amber-100 text-amber-700' : 'bg-stone-100 text-stone-600'}`}>
              {role === 'admin' ? '관리자' : '멤버'}
            </span>
          </div>
          <Link href="/more/info" className={rowClassName}>
            <Settings aria-hidden="true" className="size-5 shrink-0 text-stone-500" />
            <span className="flex-1">그룹 설정</span>
            <ChevronRight aria-hidden="true" className="size-5 text-stone-300" />
          </Link>
          {role === 'admin' && (
            <Link href="/more/applicants" className={`${rowClassName} border-t border-stone-100`}>
              <Users aria-hidden="true" className="size-5 shrink-0 text-stone-500" />
              <span className="flex-1">가입 신청자 <span className="text-stone-500">({applicants.length}명)</span></span>
              <ChevronRight aria-hidden="true" className="size-5 text-stone-300" />
            </Link>
          )}
        </div>
      </section>

      <LogoutButton />
    </div>
  );
}
