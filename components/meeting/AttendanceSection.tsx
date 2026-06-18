'use client';

import { useOptimistic, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { setAttendance } from '@/lib/actions/attendance';
import { AttendanceToggle } from './AttendanceToggle';
import { AttendanceSummary } from './AttendanceSummary';
import type { Attendance, AttendanceStatus, Profile } from '@/lib/types';

type AttendanceWithProfile = Attendance & { profile: Profile };

/**
 * 미래 모임 + 클럽 멤버 케이스 전용: 본인 토글 + 전체 카운트를 한 client wrapper에서 관리.
 * useOptimistic으로 클릭 즉시 본인 status와 카운트가 동시에 업데이트됨.
 * 서버 라운드트립이 끝나면 실제 prop으로 자연 전환.
 */
export function AttendanceSection({
  meetingId,
  initialAttendances,
  viewerProfile,
}: {
  meetingId: string;
  initialAttendances: AttendanceWithProfile[];
  viewerProfile: Profile;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [optimisticAttendances, addOptimistic] = useOptimistic(
    initialAttendances,
    (state: AttendanceWithProfile[], next: AttendanceStatus) => {
      const filtered = state.filter((a) => a.user_id !== viewerProfile.id);
      return [
        ...filtered,
        {
          id: `temp-${viewerProfile.id}`,
          meeting_id: meetingId,
          user_id: viewerProfile.id,
          status: next,
          updated_at: new Date().toISOString(),
          profile: viewerProfile,
        },
      ];
    }
  );

  const myStatus =
    optimisticAttendances.find((a) => a.user_id === viewerProfile.id)?.status ?? null;

  function handleChange(s: AttendanceStatus) {
    startTransition(async () => {
      addOptimistic(s);
      const r = await setAttendance(meetingId, s);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <>
      <AttendanceToggle status={myStatus} onChange={handleChange} />
      <AttendanceSummary meetingId={meetingId} attendances={optimisticAttendances} />
    </>
  );
}
