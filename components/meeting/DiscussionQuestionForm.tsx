'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { addQuestion } from '@/lib/actions/questions';
import { Button } from '@/components/ui/button';
import { MarkdownEditor, MarkdownModeTabs } from '@/components/meeting/MarkdownEditor';

export function DiscussionQuestionForm({ meetingId }: { meetingId: string }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [mode, setMode] = useState<'text' | 'preview'>('text');
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    const r = await addQuestion(meetingId, { content: text });
    setLoading(false);
    if (!r.ok) return toast.error(r.error);
    setText('');
    setMode('text');
    setOpen(false);
  }

  function cancel() {
    setText('');
    setMode('text');
    setOpen(false);
  }

  if (!open) {
    return (
      <Button variant="outline" className="w-full" onClick={() => setOpen(true)}>
        + 질문 추가
      </Button>
    );
  }

  return (
    <div className="space-y-2 border rounded-xl p-3 bg-stone-50">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-stone-700">발제문 입력</p>
        {mode === 'text' && (
          <span className="text-xs text-stone-400">**굵게**, *기울임*, {'>'} 인용구</span>
        )}
      </div>
      <MarkdownEditor
        value={text}
        onChange={setText}
        mode={mode}
        onRequestTextMode={() => setMode('text')}
        placeholder={'예: 주인공의 선택에 동의하시나요?\n\n> "그는 결국 떠났다"\n위 구절에서 느낀 감정은?'}
        rows={4}
        className="bg-white border-stone-200"
      />
      <div className="flex items-center justify-between">
        <MarkdownModeTabs mode={mode} onChange={setMode} />
        <div className="flex gap-2">
          <Button variant="ghost" onClick={cancel}>취소</Button>
          <Button onClick={submit} disabled={loading || text.trim().length === 0}>등록</Button>
        </div>
      </div>
    </div>
  );
}
