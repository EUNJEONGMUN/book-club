import type { MemberStats } from '@/lib/queries/members';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

export function MemberCard({ member }: { member: MemberStats }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <Avatar>
        <AvatarImage src={member.avatar_url ?? undefined} alt={member.display_name} />
        <AvatarFallback>{member.display_name.slice(0, 1)}</AvatarFallback>
      </Avatar>
      <div className="flex-1">
        <p className="font-medium">{member.display_name}</p>
        <p className="text-xs text-slate-500">
          참석 {member.attended_count}회 · 호스트 {member.hosted_count}회
        </p>
      </div>
    </div>
  );
}
