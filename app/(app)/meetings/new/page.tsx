import Link from 'next/link';
import { MeetingForm } from '@/components/meeting/MeetingForm';
import { createMeeting } from '@/lib/actions/meetings';
import { getMyClubs } from '@/lib/queries/clubs';

export default async function NewMeetingPage() {
  const clubs = await getMyClubs();
  const defaultClubId = clubs[0]?.id ?? null;

  if (!defaultClubId) {
    return (
      <div className="space-y-4 text-center py-16">
        <p className="text-stone-600">그룹을 먼저 만들어주세요.</p>
        <Link
          href="/onboarding"
          className="inline-block rounded-lg bg-stone-800 px-5 py-2 text-sm text-white hover:bg-stone-700"
        >
          그룹 만들기
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-stone-800">새 모임 등록</h1>
      <MeetingForm
        onSubmit={(d) => createMeeting({ ...d, club_id: defaultClubId })}
        submitLabel="등록하기"
        redirectOnSuccess={(id) => `/meetings/${id}`}
      />
    </div>
  );
}
