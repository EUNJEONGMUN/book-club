import { notFound } from 'next/navigation';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { getClubById, getMemberHistoryInClub, getClubMembersWithStats } from '@/lib/queries/clubs';
import { getSupabaseServer } from '@/lib/supabase/server';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent } from '@/components/ui/card';

async function getCurrentRole(clubId: string): Promise<{
  role: 'admin' | 'member' | null;
  userId: string | null;
}> {
  const supabase = await getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { role: null, userId: null };
  const { data } = await supabase
    .from('club_members')
    .select('role')
    .eq('club_id', clubId)
    .eq('user_id', user.id)
    .maybeSingle();
  const role = data?.role;
  if (role === 'admin' || role === 'member') return { role, userId: user.id };
  return { role: null, userId: user.id };
}

export default async function MemberHistoryPage({
  params,
}: {
  params: Promise<{ id: string; userId: string }>;
}) {
  const { id: clubId, userId: targetUserId } = await params;

  const { role, userId: viewerId } = await getCurrentRole(clubId);
  if (!role || !viewerId) notFound();

  // admin은 누구든 OK, member는 본인만
  if (role !== 'admin' && viewerId !== targetUserId) notFound();

  const club = await getClubById(clubId);
  if (!club) notFound();

  const members = await getClubMembersWithStats(clubId);
  const target = members.find((m) => m.user_id === targetUserId);
  if (!target) notFound();

  const history = await getMemberHistoryInClub(clubId, targetUserId);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Avatar className="w-14 h-14">
          <AvatarImage src={target.avatar_url ?? undefined} alt={target.display_name} />
          <AvatarFallback className="bg-stone-100 text-stone-600 text-lg font-medium">
            {target.display_name.slice(0, 1)}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-stone-800 truncate">{target.display_name}</h1>
            {target.role === 'admin' && (
              <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                admin
              </span>
            )}
          </div>
          <p className="text-sm text-stone-500 mt-0.5">
            참석 {target.attended_count}회 · 발제 {target.hosted_count}회
          </p>
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-stone-600 mb-2">모임 이력</h2>
        {history.length === 0 ? (
          <p className="text-sm text-stone-500 py-8 text-center">아직 참여한 모임이 없어요.</p>
        ) : (
          <ul className="space-y-3">
            {history.map((h) => (
              <li key={h.meeting_id}>
                <Card>
                  <CardContent className="p-4 flex gap-3">
                    <div className="w-12 h-16 bg-stone-100 rounded shrink-0 flex items-center justify-center overflow-hidden">
                      {h.book_cover_url ? (
                        <img src={h.book_cover_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-xl">📚</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-stone-800 truncate">{h.book_title}</p>
                        <span
                          className={
                            h.is_host
                              ? 'text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium shrink-0'
                              : 'text-xs bg-stone-100 text-stone-600 px-2 py-0.5 rounded-full font-medium shrink-0'
                          }
                        >
                          {h.is_host ? '발제' : '참석'}
                        </span>
                      </div>
                      <p className="text-xs text-stone-500 mt-0.5">
                        {format(new Date(h.scheduled_at), 'yyyy.MM.dd (EEE)', { locale: ko })}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
