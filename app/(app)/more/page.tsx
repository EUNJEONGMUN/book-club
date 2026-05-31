import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { getAllMembersWithStats, getCurrentProfile } from '@/lib/queries/members';
import { MemberCard } from '@/components/member/MemberCard';
import { Card, CardContent } from '@/components/ui/card';
import { LogoutButton } from './logout-button';

export default async function MorePage() {
  const [me, members] = await Promise.all([getCurrentProfile(), getAllMembersWithStats()]);
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

      <Card>
        <CardContent className="p-0">
          <Link
            href="/more/invite"
            className="flex items-center justify-between p-4 hover:bg-slate-50"
          >
            <span>초대 링크 관리</span>
            <ChevronRight className="w-4 h-4 text-slate-400" />
          </Link>
        </CardContent>
      </Card>

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
