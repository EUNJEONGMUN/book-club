import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import {
  getAllMembersWithStats,
  getCurrentProfile,
  getPendingMembers,
  getMemberHistory,
  type MemberHistoryItem,
} from '@/lib/queries/members';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { MemberCard } from '@/components/member/MemberCard';
import { LogoutButton } from './logout-button';
import { ApproveButton } from './approve-button';

export default async function MorePage() {
  const me = await getCurrentProfile();
  const [members, pending] = await Promise.all([
    getAllMembersWithStats(),
    me?.is_admin ? getPendingMembers() : Promise.resolve([]),
  ]);

  const meStat = members.find((m) => m.id === me?.id);

  const myHistory: MemberHistoryItem[] = me ? await getMemberHistory(me.id) : [];
  const allHistories: Map<string, MemberHistoryItem[]> | null = me?.is_admin
    ? new Map(
        await Promise.all(
          members.map(async (m) => [m.id, await getMemberHistory(m.id)] as const)
        )
      )
    : null;

  function getHistory(memberId: string): MemberHistoryItem[] | undefined {
    if (allHistories) return allHistories.get(memberId) ?? [];
    if (memberId === me?.id) return myHistory;
    return undefined;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-stone-800">설정</h1>

      {/* 내 프로필 */}
      <Link
        href="/more/profile"
        className="flex items-center gap-4 p-4 bg-white rounded-2xl border border-stone-100 shadow-sm hover:bg-stone-50 transition-colors"
      >
        <Avatar className="w-12 h-12">
          <AvatarImage src={meStat?.avatar_url ?? undefined} alt={me?.display_name} />
          <AvatarFallback className="bg-stone-100 text-stone-600 text-base font-medium">
            {me?.display_name.slice(0, 1)}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-stone-800">{me?.display_name}</p>
          <p className="text-xs text-stone-400 mt-0.5">
            참석 {meStat?.attended_count ?? 0}회 · 발제 {meStat?.hosted_count ?? 0}회
          </p>
        </div>
        <ChevronRight className="w-4 h-4 text-stone-300 shrink-0" />
      </Link>

      {/* 승인 대기 (관리자만) */}
      {me?.is_admin && (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold text-stone-400 uppercase tracking-wide px-1">
            승인 대기 {pending.length}명
          </h2>
          {pending.length === 0 ? (
            <p className="text-sm text-stone-400 px-1">대기 중인 사용자가 없습니다.</p>
          ) : (
            <div className="bg-white rounded-2xl border border-stone-100 shadow-sm divide-y divide-stone-100">
              {pending.map((p) => (
                <div key={p.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="font-medium text-stone-800">{p.display_name}</p>
                    <p className="text-xs text-stone-400">
                      {new Date(p.joined_at).toLocaleDateString('ko-KR')} 가입
                    </p>
                  </div>
                  <ApproveButton userId={p.id} />
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* 멤버 목록 */}
      <section className="space-y-2">
        <h2 className="text-xs font-semibold text-stone-400 uppercase tracking-wide px-1">
          멤버 {members.length}명
        </h2>
        <div className="bg-white rounded-2xl border border-stone-100 shadow-sm divide-y divide-stone-100 px-4">
          {members.map((m) => (
            <MemberCard key={m.id} member={m} history={getHistory(m.id)} />
          ))}
        </div>
      </section>

      <LogoutButton />
    </div>
  );
}
