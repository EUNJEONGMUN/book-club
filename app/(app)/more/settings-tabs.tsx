'use client';

import { useState } from 'react';
import Link from 'next/link';
import { BookOpen } from 'lucide-react';
import { MemberCard } from '@/components/member/MemberCard';
import type { MemberStats, MemberHistoryItem } from '@/lib/queries/members';
import type { Meeting, Profile } from '@/lib/types';

type HostedMeeting = Meeting & { host: Profile };

type Props = {
  members: MemberStats[];
  myId: string;
  histories: Record<string, MemberHistoryItem[]>;
  hostedMeetings: HostedMeeting[];
};

export function SettingsTabs({ members, myId, histories, hostedMeetings }: Props) {
  const getHistory = (id: string) => histories[id];
  const [tab, setTab] = useState<'members' | 'hosted'>('members');

  // 본인 먼저, 나머지는 가나다 순
  const sorted = [
    ...members.filter((m) => m.id === myId),
    ...members.filter((m) => m.id !== myId).sort((a, b) =>
      a.display_name.localeCompare(b.display_name, 'ko')
    ),
  ];

  return (
    <section className="space-y-2">
      {/* 탭 헤더 */}
      <div className="flex gap-1 bg-stone-100 rounded-xl p-1">
        <TabButton active={tab === 'members'} onClick={() => setTab('members')}>
          멤버 {members.length}명
        </TabButton>
        <TabButton active={tab === 'hosted'} onClick={() => setTab('hosted')}>
          나의 발제 {hostedMeetings.length}건
        </TabButton>
      </div>

      {/* 멤버 목록 */}
      {tab === 'members' && (
        <div className="bg-white rounded-2xl border border-stone-100 shadow-sm divide-y divide-stone-100 px-4">
          {sorted.map((m) => (
            <MemberCard key={m.id} member={m} history={getHistory(m.id)} isMe={m.id === myId} />
          ))}
        </div>
      )}

      {/* 나의 발제 */}
      {tab === 'hosted' && (
        <div className="bg-white rounded-2xl border border-stone-100 shadow-sm divide-y divide-stone-100">
          {hostedMeetings.length === 0 ? (
            <p className="py-8 text-center text-sm text-stone-400">아직 발제한 모임이 없습니다.</p>
          ) : (
            hostedMeetings.map((m) => {
              const date = new Date(m.scheduled_at);
              return (
                <Link
                  key={m.id}
                  href={`/meetings/${m.id}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-stone-50 transition-colors"
                >
                  <div className="shrink-0 w-10 h-14 rounded bg-stone-100 overflow-hidden flex items-center justify-center">
                    {m.book_cover_url ? (
                      <img src={m.book_cover_url} alt={m.book_title} className="w-full h-full object-cover" />
                    ) : (
                      <BookOpen className="w-4 h-4 text-stone-300" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-stone-800 truncate">{m.book_title}</p>
                    <p className="text-xs text-stone-400 mt-0.5">
                      {m.book_author && <span>{m.book_author} · </span>}
                      {date.getFullYear()}.{String(date.getMonth() + 1).padStart(2, '0')}.{String(date.getDate()).padStart(2, '0')}
                    </p>
                  </div>
                </Link>
              );
            })
          )}
        </div>
      )}
    </section>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 py-1.5 rounded-lg text-sm font-medium transition-colors ${
        active ? 'bg-white text-stone-800 shadow-sm' : 'text-stone-400 hover:text-stone-600'
      }`}
    >
      {children}
    </button>
  );
}
