'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Pencil, Check, X, Plus, ChevronDown } from 'lucide-react';
import { setAttendanceFor, deleteAttendance } from '@/lib/actions/attendance';
import { Button } from '@/components/ui/button';
import type { Attendance, AttendanceStatus, Profile } from '@/lib/types';

type AttendanceWithProfile = Attendance & { profile: Profile };

type ClubMemberMinimal = {
  user_id: string;
  display_name: string;
};

const VIEW_STATUSES: { value: AttendanceStatus; label: string; bg: string; text: string; countColor: string; summaryColor: string; divider: string }[] = [
  { value: 'attending', label: '참석', bg: 'bg-blue-50', text: 'text-blue-700', countColor: 'text-blue-600', summaryColor: 'text-blue-500', divider: 'border-blue-200' },
  { value: 'not_attending', label: '불참', bg: 'bg-red-50', text: 'text-red-700', countColor: 'text-red-500', summaryColor: 'text-red-400', divider: 'border-red-200' },
  { value: 'undecided', label: '미정', bg: 'bg-amber-50', text: 'text-amber-700', countColor: 'text-amber-500', summaryColor: 'text-amber-400', divider: 'border-amber-200' },
];

export function AttendanceSummary({
  meetingId,
  attendances,
  clubMembers = [],
  canEdit = false,
}: {
  meetingId: string;
  attendances: AttendanceWithProfile[];
  /** 편집 모드의 "추가하기" pool 계산용 (active 멤버 전체) */
  clubMembers?: ClubMemberMinimal[];
  /** true면 "수정" 버튼 노출. 호스트/admin이 지난 모임 정정용. */
  canEdit?: boolean;
}) {
  const [items, setItems] = useState(attendances);
  const [editing, setEditing] = useState(false);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">참석 현황</p>
        {canEdit && (
          editing ? (
            <Button variant="outline" size="sm" onClick={() => setEditing(false)} className="h-7 gap-1 text-xs">
              <Check className="w-3.5 h-3.5" />
              완료
            </Button>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => setEditing(true)} className="h-7 gap-1 text-xs text-stone-500">
              <Pencil className="w-3.5 h-3.5" />
              수정
            </Button>
          )
        )}
      </div>

      {editing ? (
        <EditPanel
          meetingId={meetingId}
          items={items}
          setItems={setItems}
          clubMembers={clubMembers}
        />
      ) : (
        <ViewGrid items={items} />
      )}
    </div>
  );
}

function ViewGrid({ items }: { items: AttendanceWithProfile[] }) {
  const grouped = (status: AttendanceStatus) => items.filter((a) => a.status === status);
  return (
    <div className="grid grid-cols-3 gap-2 items-start">
      {VIEW_STATUSES.map((s) => {
        const members = grouped(s.value);
        return (
          <div key={s.value} className={`${s.bg} rounded-lg p-3 space-y-2`}>
            <div className="text-center">
              <p className={`text-xs font-medium ${s.text}`}>{s.label}</p>
              <p className={`text-2xl font-bold ${s.countColor}`}>{members.length}</p>
            </div>
            {members.length > 0 && (
              <details className={`group text-xs border-t pt-2 ${s.divider}`}>
                <summary className={`cursor-pointer list-none text-center select-none ${s.summaryColor}`}>
                  <span className="group-open:hidden">▶ </span>
                  <span className="hidden group-open:inline">▼ </span>
                  명단 보기
                </summary>
                <ul className="mt-2 space-y-1">
                  {members.map((a) => (
                    <li key={a.id} className={`${s.text} truncate`}>· {a.profile.display_name}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        );
      })}
    </div>
  );
}

function EditPanel({
  meetingId,
  items,
  setItems,
  clubMembers,
}: {
  meetingId: string;
  items: AttendanceWithProfile[];
  setItems: React.Dispatch<React.SetStateAction<AttendanceWithProfile[]>>;
  clubMembers: ClubMemberMinimal[];
}) {
  const attending = items.filter((a) => a.status === 'attending');
  const notAttending = items.filter((a) => a.status === 'not_attending');
  const recordedUserIds = new Set(
    items.filter((a) => a.status === 'attending' || a.status === 'not_attending').map((a) => a.user_id)
  );
  const available = clubMembers.filter((m) => !recordedUserIds.has(m.user_id));

  const [pending, startTransition] = useTransition();
  const [pickerOpen, setPickerOpen] = useState(false);

  function handleDelete(userId: string) {
    if (!confirm('이 참석 기록을 지울까요?')) return;
    const prev = items;
    setItems((cur) => cur.filter((a) => a.user_id !== userId));
    startTransition(async () => {
      const r = await deleteAttendance(meetingId, userId);
      if (!r.ok) {
        setItems(prev);
        toast.error(r.error);
      }
    });
  }

  function handleAdd(userId: string, displayName: string, status: AttendanceStatus) {
    const prev = items;
    const optimistic: AttendanceWithProfile = {
      id: `temp-${userId}`,
      meeting_id: meetingId,
      user_id: userId,
      status,
      updated_at: new Date().toISOString(),
      profile: { id: userId, display_name: displayName } as Profile,
    };
    setItems((cur) => [...cur.filter((a) => a.user_id !== userId), optimistic]);
    startTransition(async () => {
      const r = await setAttendanceFor(meetingId, userId, status);
      if (!r.ok) {
        setItems(prev);
        toast.error(r.error);
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 items-start">
        <EditColumn
          label="참석"
          members={attending}
          bg="bg-blue-50"
          text="text-blue-700"
          countColor="text-blue-600"
          divider="border-blue-200"
          onDelete={handleDelete}
          pending={pending}
        />
        <EditColumn
          label="불참"
          members={notAttending}
          bg="bg-red-50"
          text="text-red-700"
          countColor="text-red-500"
          divider="border-red-200"
          onDelete={handleDelete}
          pending={pending}
        />
      </div>

      <div className="border border-stone-200 rounded-lg p-3 bg-stone-50 space-y-2">
        <button
          type="button"
          onClick={() => setPickerOpen((v) => !v)}
          className="w-full flex items-center justify-between text-sm font-medium text-stone-700"
        >
          <span className="flex items-center gap-1.5">
            <Plus className="w-4 h-4" />
            추가하기
            <span className="text-xs text-stone-400">({available.length}명 추가 가능)</span>
          </span>
          <ChevronDown className={`w-4 h-4 text-stone-400 transition-transform ${pickerOpen ? 'rotate-180' : ''}`} />
        </button>
        {pickerOpen && (
          available.length === 0 ? (
            <p className="text-xs text-stone-400 px-1">추가할 멤버가 없어요.</p>
          ) : (
            <ul className="space-y-1.5">
              {available.map((m) => (
                <li key={m.user_id} className="flex items-center gap-2 text-sm">
                  <span className="flex-1 truncate text-stone-700">{m.display_name}</span>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => handleAdd(m.user_id, m.display_name, 'attending')}
                    className="text-xs px-2 py-1 rounded bg-blue-100 text-blue-700 hover:bg-blue-200 transition-colors disabled:opacity-50"
                  >
                    참석으로
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => handleAdd(m.user_id, m.display_name, 'not_attending')}
                    className="text-xs px-2 py-1 rounded bg-red-100 text-red-700 hover:bg-red-200 transition-colors disabled:opacity-50"
                  >
                    불참으로
                  </button>
                </li>
              ))}
            </ul>
          )
        )}
      </div>
    </div>
  );
}

function EditColumn({
  label,
  members,
  bg,
  text,
  countColor,
  divider,
  onDelete,
  pending,
}: {
  label: string;
  members: AttendanceWithProfile[];
  bg: string;
  text: string;
  countColor: string;
  divider: string;
  onDelete: (userId: string) => void;
  pending: boolean;
}) {
  return (
    <div className={`${bg} rounded-lg p-3 space-y-2`}>
      <div className="text-center">
        <p className={`text-xs font-medium ${text}`}>{label}</p>
        <p className={`text-2xl font-bold ${countColor}`}>{members.length}</p>
      </div>
      {members.length > 0 && (
        <ul className={`space-y-1 border-t pt-2 ${divider}`}>
          {members.map((a) => (
            <li key={a.id} className={`flex items-center gap-1.5 text-xs ${text}`}>
              <span className="flex-1 truncate">{a.profile.display_name}</span>
              <button
                type="button"
                disabled={pending}
                onClick={() => onDelete(a.user_id)}
                className="shrink-0 w-5 h-5 rounded hover:bg-white/60 transition-colors disabled:opacity-50 flex items-center justify-center"
                title="삭제"
              >
                <X className="w-3 h-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
