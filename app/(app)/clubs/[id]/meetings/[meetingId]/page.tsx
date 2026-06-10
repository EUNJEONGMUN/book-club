import { notFound } from 'next/navigation';
import { getMeetingDetail } from '@/lib/queries/meetings';
import { getCurrentProfile } from '@/lib/queries/members';
import { MeetingDetailHeader } from '@/components/meeting/MeetingDetailHeader';
import { DiscussionQuestionList } from '@/components/meeting/DiscussionQuestionList';
import { DiscussionQuestionForm } from '@/components/meeting/DiscussionQuestionForm';
import { DiscussionFileUploader } from '@/components/meeting/DiscussionFileUploader';

export default async function MeetingDetailPage({ params }: { params: Promise<{ id: string; meetingId: string }> }) {
  const { id: clubId, meetingId } = await params;
  const meeting = await getMeetingDetail(meetingId);
  if (!meeting) notFound();
  if (meeting.club_id !== clubId) notFound();
  const me = await getCurrentProfile();
  const isHost = me?.id === meeting.host_id;

  return (
    <div className="space-y-6">
      <MeetingDetailHeader meeting={meeting} isHost={isHost} />
      <section className="space-y-3">
        <p className="text-sm font-medium">발제 자료</p>
        {isHost && (
          <DiscussionFileUploader
            meetingId={meeting.id}
            currentFileUrl={meeting.discussion_file_url ?? null}
            currentFileName={meeting.discussion_file_name ?? null}
          />
        )}
        {!isHost && meeting.discussion_file_url && (() => {
          const url = meeting.discussion_file_url;
          const storedName = meeting.discussion_file_name;
          const isPdf = /\.pdf(\?|$)/i.test(url);
          let fallback = '';
          try {
            fallback = decodeURIComponent(url.split('/').pop()?.split('?')[0] ?? '');
          } catch {
            fallback = url.split('/').pop()?.split('?')[0] ?? '';
          }
          const name = storedName || fallback || '발제 파일';
          const downloadUrl = storedName ? `${url}?download=${encodeURIComponent(storedName)}` : url;
          return (
            <a
              href={downloadUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 p-3 bg-stone-50 rounded-xl border border-stone-200 text-sm text-stone-700 hover:bg-stone-100 transition-colors"
            >
              {isPdf ? '📄' : '🖼️'} {name}
            </a>
          );
        })()}
      </section>
      <DiscussionQuestionList meetingId={meeting.id} questions={meeting.questions} isHost={isHost} />
      {isHost && (
        <DiscussionQuestionForm meetingId={meeting.id} questionsCount={meeting.questions.length} />
      )}
    </div>
  );
}
