import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent } from '@/components/ui/card';
import type { ClubMemberWithStats } from '@/lib/queries/clubs';

export function MemberCard({ member }: { member: ClubMemberWithStats }) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <Avatar className="w-12 h-12">
          <AvatarImage src={member.avatar_url ?? undefined} alt={member.display_name} />
          <AvatarFallback className="bg-stone-100 text-stone-600 text-base font-medium">
            {member.display_name.slice(0, 1)}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-stone-800 truncate">{member.display_name}</p>
            {member.role === 'admin' && (
              <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                admin
              </span>
            )}
          </div>
          <p className="text-xs text-stone-500 mt-0.5">
            참석 {member.attended_count}회 · 발제 {member.hosted_count}회
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
