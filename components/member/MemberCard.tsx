import type { MemberStats, MemberHistoryItem } from '@/lib/queries/members';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

export function MemberCard({
  member,
  history,
}: {
  member: MemberStats;
  history?: MemberHistoryItem[];
}) {
  return (
    <div className="py-2 space-y-1">
      <div className="flex items-center gap-3">
        <Avatar>
          <AvatarImage src={member.avatar_url ?? undefined} alt={member.display_name} />
          <AvatarFallback>{member.display_name.slice(0, 1)}</AvatarFallback>
        </Avatar>
        <div className="flex-1">
          <p className="font-medium">{member.display_name}</p>
          <p className="text-xs text-slate-500">
            참석:{member.attended_count}회&nbsp;&nbsp;발제:{member.hosted_count}회
          </p>
        </div>
      </div>
      {history && history.length > 0 && (
        <details className="pl-11 text-xs">
          <summary className="cursor-pointer text-slate-400 list-none select-none">
            참여이력 ({history.length}건)
          </summary>
          <ul className="mt-1 space-y-0.5">
            {history.map((item) => {
              const d = new Date(item.scheduled_at);
              return (
                <li key={item.meeting_id} className="text-slate-600">
                  {d.getFullYear()}년 {d.getMonth() + 1}월, {item.book_title}
                  {item.is_host && ' (발제)'}
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </div>
  );
}
