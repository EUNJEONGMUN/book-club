'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Check } from 'lucide-react';
import { setAttendanceFor } from '@/lib/actions/attendance';
import type { Attendance, AttendanceStatus, Profile } from '@/lib/types';

type AttendanceWithProfile = Attendance & { profile: Profile };

const STATUSES: { value: AttendanceStatus; label: string }[] = [
  { value: 'attending', label: '참' },
  { value: 'not_attending', label: '불' },
  { value: 'undecided', label: '미' },
];

export function AttendanceSummary({
  meetingId,
  attendances,
  canEdit = false,
}: {
  meetingId: string;
  attendances: AttendanceWithProfile[];
  /** true면 각 멤버 이름 옆에 inline 토글 버튼. 호스트/admin이 지난 모임 정정용. */
  canEdit?: boolean;
}) {
  // 낙관적 업데이트용 local state
  const [items, setItems] = useState(attendances);

  const groups = {
    attending: items.filter((a) => a.status === 'attending'),
    not_attending: items.filter((a) => a.status === 'not_attending'),
    undecided: items.filter((a) => a.status === 'undecided'),
  };

  function onLocalChange(userId: string, status: AttendanceStatus) {
    setItems((prev) => prev.map((a) => (a.user_id === userId ? { ...a, status } : a)));
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">참석 현황</p>
        {canEdit && <span className="text-xs text-stone-400">멤버 옆 버튼으로 정정</span>}
      </div>
      <div className="grid grid-cols-3 gap-2 items-start">
        <StatusGroup
          label="참석"
          members={groups.attending}
          bg="bg-blue-50"
          text="text-blue-700"
          countColor="text-blue-600"
          summaryColor="text-blue-500"
          divider="border-blue-200"
          meetingId={meetingId}
          canEdit={canEdit}
          onLocalChange={onLocalChange}
        />
        <StatusGroup
          label="불참"
          members={groups.not_attending}
          bg="bg-red-50"
          text="text-red-700"
          countColor="text-red-500"
          summaryColor="text-red-400"
          divider="border-red-200"
          meetingId={meetingId}
          canEdit={canEdit}
          onLocalChange={onLocalChange}
        />
        <StatusGroup
          label="미정"
          members={groups.undecided}
          bg="bg-amber-50"
          text="text-amber-700"
          countColor="text-amber-500"
          summaryColor="text-amber-400"
          divider="border-amber-200"
          meetingId={meetingId}
          canEdit={canEdit}
          onLocalChange={onLocalChange}
        />
      </div>
    </div>
  );
}

function StatusGroup({
  label,
  members,
  bg,
  text,
  countColor,
  summaryColor,
  divider,
  meetingId,
  canEdit,
  onLocalChange,
}: {
  label: string;
  members: AttendanceWithProfile[];
  bg: string;
  text: string;
  countColor: string;
  summaryColor: string;
  divider: string;
  meetingId: string;
  canEdit: boolean;
  onLocalChange: (userId: string, status: AttendanceStatus) => void;
}) {
  return (
    <div className={`${bg} rounded-lg p-3 space-y-2`}>
      <div className="text-center">
        <p className={`text-xs font-medium ${text}`}>{label}</p>
        <p className={`text-2xl font-bold ${countColor}`}>{members.length}</p>
      </div>
      {members.length > 0 && (
        <details className={`group text-xs border-t pt-2 ${divider}`} open={canEdit}>
          <summary className={`cursor-pointer list-none text-center select-none ${summaryColor}`}>
            <span className="group-open:hidden">▶ </span>
            <span className="hidden group-open:inline">▼ </span>
            명단 보기
          </summary>
          <ul className="mt-2 space-y-1.5">
            {members.map((a) => (
              <li key={a.id} className={`${text} truncate`}>
                {canEdit ? (
                  <MemberEditRow
                    meetingId={meetingId}
                    userId={a.user_id}
                    displayName={a.profile.display_name}
                    current={a.status}
                    onLocalChange={onLocalChange}
                  />
                ) : (
                  <span>· {a.profile.display_name}</span>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function MemberEditRow({
  meetingId,
  userId,
  displayName,
  current,
  onLocalChange,
}: {
  meetingId: string;
  userId: string;
  displayName: string;
  current: AttendanceStatus;
  onLocalChange: (userId: string, status: AttendanceStatus) => void;
}) {
  const [pending, startTransition] = useTransition();

  function handle(next: AttendanceStatus) {
    if (next === current || pending) return;
    const prev = current;
    onLocalChange(userId, next);
    startTransition(async () => {
      const r = await setAttendanceFor(meetingId, userId, next);
      if (!r.ok) {
        onLocalChange(userId, prev);
        toast.error(r.error);
      }
    });
  }

  return (
    <div className="flex items-center gap-1.5">
      <span className="flex-1 truncate text-stone-700">{displayName}</span>
      <div className="flex items-center gap-0.5">
        {STATUSES.map((s) => (
          <button
            key={s.value}
            type="button"
            onClick={() => handle(s.value)}
            disabled={pending}
            className={
              'w-5 h-5 rounded text-[10px] flex items-center justify-center transition-colors ' +
              (s.value === current
                ? 'bg-stone-800 text-white'
                : 'bg-white text-stone-500 hover:bg-stone-100')
            }
            title={s.label}
          >
            {s.value === current ? <Check className="w-3 h-3" /> : s.label}
          </button>
        ))}
      </div>
    </div>
  );
}
