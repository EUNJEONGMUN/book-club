'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { MemberStats, MemberHistoryItem } from '@/lib/queries/members';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

export function MemberCard({
  member,
  history,
}: {
  member: MemberStats;
  history?: MemberHistoryItem[];
}) {
  const [open, setOpen] = useState(false);
  const hasHistory = history && history.length > 0;

  return (
    <div className="py-3 space-y-2">
      <div className="flex items-center gap-3">
        <Avatar>
          <AvatarImage src={member.avatar_url ?? undefined} alt={member.display_name} />
          <AvatarFallback className="bg-stone-100 text-stone-600 text-sm font-medium">
            {member.display_name.slice(0, 1)}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-stone-800">{member.display_name}</p>
          <p className="text-xs text-stone-400">
            참석 {member.attended_count}회 · 발제 {member.hosted_count}회
          </p>
        </div>
        {hasHistory && (
          <button
            onClick={() => setOpen(!open)}
            className="flex items-center gap-1 text-xs text-stone-400 hover:text-stone-600 transition-colors shrink-0"
          >
            <span>이력 {history.length}건</span>
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
            />
          </button>
        )}
      </div>

      {hasHistory && open && (
        <ul className="pl-11 space-y-1.5">
          {history.map((item) => {
            const d = new Date(item.scheduled_at);
            return (
              <li key={item.meeting_id} className="flex items-center gap-2 text-xs">
                <span className="text-stone-400 shrink-0 w-14">
                  {d.getFullYear()}.{String(d.getMonth() + 1).padStart(2, '0')}
                </span>
                <span className="text-stone-600 truncate">{item.book_title}</span>
                {item.is_host && (
                  <span className="shrink-0 px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-[10px] font-medium">
                    발제
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
