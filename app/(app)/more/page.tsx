import Link from 'next/link';
import { ChevronRight, Settings, Users } from 'lucide-react';
import { getCurrentProfile } from '@/lib/queries/members';
import { getMyClubs, getPendingCountsForMyAdminClubs } from '@/lib/queries/clubs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { LogoutButton } from './logout-button';

export default async function MorePage() {
  const [me, clubs, pendingCounts] = await Promise.all([
    getCurrentProfile(),
    getMyClubs(),
    getPendingCountsForMyAdminClubs(),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-stone-800">설정</h1>

      {/* 내 프로필 */}
      <Link
        href="/more/profile"
        className="flex items-center gap-4 p-4 bg-white rounded-2xl border border-stone-100 shadow-sm hover:bg-stone-50 transition-colors"
      >
        <Avatar className="w-12 h-12">
          <AvatarImage src={me?.avatar_url ?? undefined} alt={me?.display_name} />
          <AvatarFallback className="bg-stone-100 text-stone-600 text-base font-medium">
            {me?.display_name.slice(0, 1)}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-stone-800">{me?.display_name}</p>
        </div>
        <ChevronRight className="w-4 h-4 text-stone-300 shrink-0" />
      </Link>

      {/* 그룹별 설정 */}
      {clubs.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-stone-600 px-1">내 그룹</h2>
          <div className="space-y-3">
            {clubs.map((club) => {
              const isAdmin = club.role === 'admin';
              const pendingCount = pendingCounts[club.id] ?? 0;
              return (
                <div
                  key={club.id}
                  className="bg-white rounded-2xl border border-stone-100 shadow-sm overflow-hidden"
                >
                  <div className="px-4 pt-3 pb-2 flex items-center gap-2">
                    <p className="font-semibold text-stone-800 truncate">{club.name}</p>
                    {isAdmin && (
                      <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium shrink-0">
                        admin
                      </span>
                    )}
                  </div>
                  <ul className="divide-y divide-stone-100">
                    <li>
                      <Link
                        href={`/clubs/${club.id}/settings`}
                        className="flex items-center gap-3 px-4 py-3 hover:bg-stone-50 transition-colors min-h-11"
                      >
                        <Settings className="w-4 h-4 text-stone-500 shrink-0" />
                        <span className="flex-1 text-sm text-stone-700">그룹 설정</span>
                        <ChevronRight className="w-4 h-4 text-stone-300 shrink-0" />
                      </Link>
                    </li>
                    {isAdmin && (
                      <li>
                        <Link
                          href={`/clubs/${club.id}/applicants`}
                          className="flex items-center gap-3 px-4 py-3 hover:bg-stone-50 transition-colors min-h-11"
                        >
                          <Users className="w-4 h-4 text-stone-500 shrink-0" />
                          <span className="flex-1 text-sm text-stone-700">
                            가입 신청자 ({pendingCount}명)
                          </span>
                          <ChevronRight className="w-4 h-4 text-stone-300 shrink-0" />
                        </Link>
                      </li>
                    )}
                  </ul>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <LogoutButton />
    </div>
  );
}
