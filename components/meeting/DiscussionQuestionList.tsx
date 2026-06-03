'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Pencil, Trash2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { updateQuestion, deleteQuestion } from '@/lib/actions/questions';
import type { DiscussionQuestion } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

export function DiscussionQuestionList({
  meetingId,
  questions,
  isHost,
}: {
  meetingId: string;
  questions: DiscussionQuestion[];
  isHost: boolean;
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">발제문 {questions.length}개</p>
      {questions.length === 0 && (
        <p className="text-sm text-slate-500">아직 등록된 질문이 없습니다.</p>
      )}
      <ul className="space-y-2">
        {questions.map((q, i) => (
          <li key={q.id} className="border rounded-xl p-3 bg-white">
            <QuestionItem index={i + 1} question={q} meetingId={meetingId} editable={isHost} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function QuestionItem({
  index,
  question,
  meetingId,
  editable,
}: {
  index: number;
  question: DiscussionQuestion;
  meetingId: string;
  editable: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(question.content);

  async function save() {
    const r = await updateQuestion(question.id, meetingId, { content: text });
    if (!r.ok) return toast.error(r.error);
    setEditing(false);
  }

  async function remove() {
    if (!confirm('이 질문을 삭제할까요?')) return;
    const r = await deleteQuestion(question.id, meetingId);
    if (!r.ok) toast.error(r.error);
  }

  if (editing) {
    return (
      <div className="space-y-2">
        <p className="text-xs text-stone-400 px-1">Markdown 지원: **굵게**, *기울임*, {'>'} 인용구</p>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={1000}
          rows={4}
          className="bg-stone-50 border-stone-200"
        />
        <div className="flex gap-2 justify-end">
          <Button size="sm" variant="ghost" onClick={() => { setText(question.content); setEditing(false); }}>
            취소
          </Button>
          <Button size="sm" className="bg-stone-800 hover:bg-stone-700 text-white" onClick={save}>
            저장
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-between gap-3">
      <div className="flex-1 min-w-0">
        <span className="text-sm font-semibold text-stone-500 mr-2">Q{index}.</span>
        <div className="inline prose prose-sm prose-stone max-w-none text-sm [&>p]:inline [&>blockquote]:border-l-2 [&>blockquote]:border-stone-300 [&>blockquote]:pl-3 [&>blockquote]:text-stone-500 [&>blockquote]:italic [&>blockquote]:my-1">
          <ReactMarkdown>{question.content}</ReactMarkdown>
        </div>
      </div>
      {editable && (
        <div className="flex gap-1 shrink-0">
          <Button size="icon" variant="ghost" onClick={() => setEditing(true)}>
            <Pencil className="w-4 h-4" />
          </Button>
          <Button size="icon" variant="ghost" onClick={remove}>
            <Trash2 className="w-4 h-4 text-red-500" />
          </Button>
        </div>
      )}
    </div>
  );
}
