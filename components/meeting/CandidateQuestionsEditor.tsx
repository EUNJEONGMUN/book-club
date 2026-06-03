'use client';

import { useState } from 'react';
import { ArrowDown, ArrowUp, Check, Loader2, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MarkdownEditor, MarkdownModeTabs } from '@/components/meeting/MarkdownEditor';

export type Candidate = { id: string; content: string };

type Props = {
  candidates: Candidate[];
  onChange: (next: Candidate[]) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
};

export function newCandidate(content = ''): Candidate {
  const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return { id, content };
}

export function CandidateQuestionsEditor({ candidates, onChange, onSave, onCancel, saving }: Props) {
  const nonEmptyCount = candidates.filter((c) => c.content.trim().length > 0).length;

  return (
    <div className="space-y-3 p-3 bg-amber-50 rounded-xl border border-amber-200">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-amber-700">
          추출된 질문 {candidates.length}개 — 검토 후 저장
        </p>
      </div>

      <div className="space-y-2">
        {candidates.map((c, i) => (
          <CandidateItem
            key={c.id}
            index={i}
            total={candidates.length}
            value={c.content}
            onChange={(next) => {
              const updated = candidates.map((cur, j) => (j === i ? { ...cur, content: next } : cur));
              onChange(updated);
            }}
            onRemove={() => onChange(candidates.filter((_, j) => j !== i))}
            onMoveUp={() => {
              if (i === 0) return;
              const updated = [...candidates];
              [updated[i - 1], updated[i]] = [updated[i], updated[i - 1]];
              onChange(updated);
            }}
            onMoveDown={() => {
              if (i === candidates.length - 1) return;
              const updated = [...candidates];
              [updated[i + 1], updated[i]] = [updated[i], updated[i + 1]];
              onChange(updated);
            }}
          />
        ))}
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full border-dashed border-amber-300 text-amber-700 hover:bg-amber-100"
        onClick={() => onChange([...candidates, newCandidate()])}
      >
        <Plus className="w-4 h-4 mr-1" />
        질문 직접 추가
      </Button>

      <div className="flex gap-2 pt-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="border-amber-200 text-amber-700"
          onClick={onCancel}
        >
          취소
        </Button>
        <Button
          type="button"
          size="sm"
          className="bg-amber-600 hover:bg-amber-700 text-white flex-1"
          disabled={saving || nonEmptyCount === 0}
          onClick={onSave}
        >
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              저장 중...
            </>
          ) : (
            <>
              <Check className="w-4 h-4 mr-1" />
              {nonEmptyCount}개 저장
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

type ItemProps = {
  index: number;
  total: number;
  value: string;
  onChange: (next: string) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
};

function CandidateItem({ index, total, value, onChange, onRemove, onMoveUp, onMoveDown }: ItemProps) {
  const [mode, setMode] = useState<'text' | 'preview'>('preview');

  return (
    <div className="rounded-lg border border-amber-200 bg-white overflow-hidden">
      <div className="flex items-center justify-between px-2 py-1.5 bg-amber-50/60 border-b border-amber-200/60">
        <span className="text-xs font-semibold text-amber-700">Q{index + 1}</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={index === 0}
            onClick={onMoveUp}
            className="p-1 text-stone-400 hover:text-stone-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="위로"
          >
            <ArrowUp className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            disabled={index === total - 1}
            onClick={onMoveDown}
            className="p-1 text-stone-400 hover:text-stone-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="아래로"
          >
            <ArrowDown className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="p-1 text-stone-400 hover:text-red-500 transition-colors ml-1"
            title="삭제"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <div className="p-2 space-y-2">
        <MarkdownEditor
          value={value}
          onChange={onChange}
          mode={mode}
          onRequestTextMode={() => setMode('text')}
          rows={3}
          className="bg-white border-amber-200 text-sm"
          placeholder="질문 내용 입력..."
        />
        <div className="flex items-center justify-between">
          <MarkdownModeTabs mode={mode} onChange={setMode} />
          {mode === 'text' && (
            <span className="text-[10px] text-stone-400">**굵게**, *기울임*, {'>'} 인용</span>
          )}
        </div>
      </div>
    </div>
  );
}
