'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Pencil, Trash2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { updateQuestion, deleteQuestion } from '@/lib/actions/questions';
import type { DiscussionQuestion } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { MarkdownEditor, MarkdownModeTabs, PREVIEW_PROSE } from '@/components/meeting/MarkdownEditor';

export function DiscussionQuestionList({
  meetingId,
  questions,
  canEdit,
}: {
  meetingId: string;
  questions: DiscussionQuestion[];
  canEdit: boolean;
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">발제문 {questions.length}개</p>
      {questions.length === 0 && (
        <p className="text-sm text-muted-foreground">아직 등록된 질문이 없습니다.</p>
      )}
      <ul className="space-y-2">
        {questions.map((q, i) => (
          <li key={q.id} className="border rounded-xl p-3 bg-card">
            <QuestionItem index={i + 1} question={q} meetingId={meetingId} editable={canEdit} />
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
  const [mode, setMode] = useState<'text' | 'preview'>('text');

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
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-foreground">발제문 입력</p>
          {mode === 'text' && (
            <span className="text-xs text-muted-foreground">**굵게**, *기울임*, {'>'} 인용구</span>
          )}
        </div>
        <MarkdownEditor
          value={text}
          onChange={setText}
          mode={mode}
          onRequestTextMode={() => setMode('text')}
          rows={4}
          className="bg-muted/50 border-border"
        />
        <div className="flex items-center justify-between">
          <MarkdownModeTabs mode={mode} onChange={setMode} />
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => { setText(question.content); setMode('text'); setEditing(false); }}>
              취소
            </Button>
            <Button size="sm" onClick={save}>
              저장
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-between gap-3">
      <div className="flex-1 min-w-0">
        <span className="text-sm font-semibold text-muted-foreground mr-2">Q{index}.</span>
        <div className={`inline ${PREVIEW_PROSE} [&>p]:inline`}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{question.content}</ReactMarkdown>
        </div>
      </div>
      {editable && (
        <div className="flex gap-1 shrink-0">
          <Button size="icon" variant="ghost" aria-label={`질문 ${index} 수정`} onClick={() => setEditing(true)}>
            <Pencil className="w-4 h-4" />
          </Button>
          <Button size="icon" variant="ghost" aria-label={`질문 ${index} 삭제`} onClick={remove}>
            <Trash2 className="w-4 h-4 text-danger-foreground" />
          </Button>
        </div>
      )}
    </div>
  );
}
