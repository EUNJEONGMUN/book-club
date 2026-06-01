import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { getAllMembersWithStats, getCurrentProfile, getPendingMembers } from '@/lib/queries/members';
import { MemberCard } from '@/components/member/MemberCard';
import { Card, CardContent } from '@/components/ui/card';
import { LogoutButton } from './logout-button';
import { ApproveButton } from './approve-button';

export default async function MorePage() {
  const me = await getCurrentProfile();
  const [members, pending] = await Promise.all([
    getAllMembersWithStats(),
    me?.is_admin ? getPendingMembers() : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">더보기</h1>

      <Card>
        <CardContent className="p-0">
          <Link
            href="/more/profile"
            className="flex items-center justify-between p-4 hover:bg-slate-50"
          >
            <span>내 프로필 ({me?.display_name})</span>
            <ChevronRight className="w-4 h-4 text-slate-400" />
          </Link>
        </CardContent>
      </Card>

      {me?.is_admin && (
        <section className="space-y-1">
          <h2 className="text-sm font-semibold text-slate-700">
            승인 대기 {pending.length}명
          </h2>
          {pending.length === 0 ? (
            <p className="text-sm text-slate-400 px-1">대기 중인 사용자가 없습니다.</p>
          ) : (
            <Card>
              <CardContent className="px-4 divide-y">
                {pending.map((p) => (
                  <div key={p.id} className="flex items-center justify-between py-3">
                    <div>
                      <p className="font-medium">{p.display_name}</p>
                      <p className="text-xs text-slate-500">
                        {new Date(p.joined_at).toLocaleDateString('ko-KR')} 가입
                      </p>
                    </div>
                    <ApproveButton userId={p.id} />
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </section>
      )}

      <section className="space-y-1">
        <h2 className="text-sm font-semibold text-slate-700">멤버 {members.length}명</h2>
        <Card>
          <CardContent className="px-4 divide-y">
            {members.map((m) => <MemberCard key={m.id} member={m} />)}
          </CardContent>
        </Card>
      </section>

      <LogoutButton />
    </div>
  );
}
