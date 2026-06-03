'use client';

import { useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { Textarea } from '@/components/ui/textarea';

const PREVIEW_PROSE = 'prose prose-sm prose-stone max-w-none [&>p]:my-0.5 [&>blockquote]:border-l-2 [&>blockquote]:border-stone-300 [&>blockquote]:pl-3 [&>blockquote]:text-stone-500 [&>blockquote]:italic [&>blockquote]:my-1';

type Props = {
  value: string;
  onChange: (v: string) => void;
  mode: 'text' | 'preview';
  onRequestTextMode?: () => void;
  placeholder?: string;
  rows?: number;
  className?: string;
};

export function MarkdownEditor({ value, onChange, mode, onRequestTextMode, placeholder, rows = 4, className }: Props) {
  const taRef = useRef<HTMLTextAreaElement>(null);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
      e.preventDefault();
      const ta = taRef.current;
      if (!ta) return;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const selected = value.slice(start, end);
      const newValue = value.slice(0, start) + `**${selected}**` + value.slice(end);
      onChange(newValue);
      requestAnimationFrame(() => {
        ta.setSelectionRange(start + 2, end + 2);
      });
    }
  }

  if (mode === 'preview') {
    const previewSource = value.trim() ? value : placeholder ?? '';
    const isEmpty = !value.trim();

    return (
      <div
        role="button"
        tabIndex={0}
        onClick={onRequestTextMode}
        onKeyDown={(e) => e.key === 'Enter' && onRequestTextMode?.()}
        title="클릭하여 편집"
        className="min-h-[6rem] px-3 py-2 rounded-md border border-stone-200 bg-white text-sm cursor-text hover:border-stone-300 hover:bg-stone-50/50 transition-colors"
      >
        {previewSource ? (
          <div className={`${PREVIEW_PROSE} ${isEmpty ? '[&_*]:text-stone-400 [&>p]:text-stone-400' : ''}`}>
            <ReactMarkdown>{previewSource}</ReactMarkdown>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <Textarea
      ref={taRef}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      maxLength={1000}
      rows={rows}
      className={className}
      autoFocus
    />
  );
}

type TabsProps = {
  mode: 'text' | 'preview';
  onChange: (mode: 'text' | 'preview') => void;
};

export function MarkdownModeTabs({ mode, onChange }: TabsProps) {
  return (
    <div className="flex items-center text-xs text-stone-500 border border-stone-200 rounded-md overflow-hidden">
      <button
        type="button"
        onClick={() => onChange('preview')}
        className={`px-2.5 py-1 transition-colors ${
          mode === 'preview' ? 'bg-stone-100 text-stone-800 font-medium' : 'hover:bg-stone-50'
        }`}
      >
        미리보기
      </button>
      <span className="text-stone-200 select-none">|</span>
      <button
        type="button"
        onClick={() => onChange('text')}
        className={`px-2.5 py-1 transition-colors ${
          mode === 'text' ? 'bg-stone-100 text-stone-800 font-medium' : 'hover:bg-stone-50'
        }`}
      >
        텍스트
      </button>
    </div>
  );
}
