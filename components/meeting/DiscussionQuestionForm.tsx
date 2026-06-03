'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { addQuestion } from '@/lib/actions/questions';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

export function DiscussionQuestionForm({
  meetingId,
  questionsCount,
}: {
  meetingId: string;
  questionsCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    const r = await addQuestion(meetingId, { content: text });
    setLoading(false);
    if (!r.ok) return toast.error(r.error);
    setText('');
    setOpen(false);
  }

  if (!open) {
    return (
      <Button variant="outline" className="w-full" onClick={() => setOpen(true)}>
        + 질문 추가
        {questionsCount < 5 && (
          <span className="text-xs text-slate-500 ml-2">(5~10개 권장)</span>
        )}
      </Button>
    );
  }

  return (
    <div className="space-y-2 border rounded-xl p-3 bg-stone-50">
      <p className="text-xs text-stone-400">Markdown 지원: **굵게**, *기울임*, {'>'} 인용구</p>
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={'예: 주인공의 선택에 동의하시나요?\n\n> "그는 결국 떠났다"\n위 구절에서 느낀 감정은?'}
        maxLength={1000}
        rows={4}
        className="bg-white border-stone-200"
      />
      <div className="flex gap-2 justify-end">
        <Button
          variant="ghost"
          onClick={() => {
            setText('');
            setOpen(false);
          }}
        >
          취소
        </Button>
        <Button onClick={submit} disabled={loading || text.trim().length === 0}>
          등록
        </Button>
      </div>
    </div>
  );
}
