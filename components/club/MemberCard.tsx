'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import type { ClubMemberWithStats, MemberHistoryItem } from '@/lib/queries/clubs';

type Props = {
  member: ClubMemberWithStats;
  /** undefined = 권한 없음(토글 안 보임). 빈 배열 = 권한 있지만 이력 없음. */
  history?: MemberHistoryItem[];
  defaultExpanded?: boolean;
};

export function MemberCard({ member, history, defaultExpanded = true }: Props) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const canExpand = history !== undefined;

  return (
    <div className="px-4 py-4 flex gap-3">
      <Avatar className="w-12 h-12 shrink-0">
        <AvatarImage src={member.avatar_url ?? undefined} alt={member.display_name} />
        <AvatarFallback className="bg-stone-100 text-stone-600 text-base font-medium">
          {member.display_name.slice(0, 1)}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-semibold text-stone-800 truncate">{member.display_name}</p>
              {member.role === 'admin' && (
                <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium shrink-0">
                  admin
                </span>
              )}
            </div>
            <p className="text-xs text-stone-500 mt-0.5">
              참석 {member.attended_count}회 · 발제 {member.hosted_count}회
            </p>
          </div>
          {canExpand && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="shrink-0 flex items-center gap-1 text-xs text-stone-500 hover:text-stone-700 transition-colors"
              aria-expanded={expanded}
            >
              이력 {history!.length}건
              {expanded ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>
          )}
        </div>
        {canExpand && expanded && history!.length > 0 && (
          <ul className="mt-3 space-y-2">
            {history!.map((h) => (
              <li key={h.meeting_id} className="flex items-center gap-3 text-sm">
                <span className="text-stone-400 tabular-nums shrink-0 w-14">
                  {format(new Date(h.scheduled_at), 'yyyy.MM')}
                </span>
                <span className="text-stone-700 truncate flex-1">{h.book_title}</span>
                {h.is_host && (
                  <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium shrink-0">
                    발제
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
