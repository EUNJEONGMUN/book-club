'use client';

import { useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Textarea } from '@/components/ui/textarea';

export const PREVIEW_PROSE = [
  'max-w-none text-sm',
  '[&>p]:my-0.5',
  '[&>blockquote]:border-l-2 [&>blockquote]:border-stone-300 [&>blockquote]:pl-3 [&>blockquote]:text-stone-500 [&>blockquote]:italic [&>blockquote]:my-1',
  '[&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-1 [&_li]:my-0',
  '[&_table]:my-2 [&_table]:border-collapse [&_th]:border [&_th]:border-stone-300 [&_th]:px-2 [&_th]:py-1 [&_th]:bg-stone-100 [&_td]:border [&_td]:border-stone-300 [&_td]:px-2 [&_td]:py-1',
  '[&_:not(pre)>code]:bg-stone-200/70 [&_:not(pre)>code]:px-1.5 [&_:not(pre)>code]:py-0.5 [&_:not(pre)>code]:rounded [&_:not(pre)>code]:text-stone-700',
  '[&_pre]:bg-stone-100 [&_pre]:border [&_pre]:border-stone-200 [&_pre]:p-3 [&_pre]:rounded-md [&_pre]:overflow-x-auto [&_pre]:my-2',
  '[&_a]:text-stone-600 [&_a]:underline',
  '[&_strong]:font-semibold [&_em]:italic [&_del]:line-through [&_del]:text-stone-400',
].join(' ');

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

  function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const ta = taRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    if (start === end) return; // 선택된 텍스트 없으면 일반 붙여넣기

    const pasted = e.clipboardData.getData('text').trim();
    const urlPattern = /^https?:\/\/\S+$/i;
    if (!urlPattern.test(pasted)) return;

    e.preventDefault();
    const selected = value.slice(start, end);
    const insertion = `[${selected}](${pasted})`;
    const newValue = value.slice(0, start) + insertion + value.slice(end);
    onChange(newValue);
    requestAnimationFrame(() => {
      const pos = start + insertion.length;
      ta.setSelectionRange(pos, pos);
    });
  }

  if (mode === 'preview') {
    const previewSource = value.trim() ? value : placeholder ?? '';
    const isEmpty = !value.trim();

    function handlePreviewClick(e: React.MouseEvent<HTMLDivElement>) {
      // 링크 클릭은 통과 (편집 모드로 전환하지 않음)
      const target = e.target as HTMLElement;
      if (target.closest('a')) return;
      onRequestTextMode?.();
    }

    return (
      <div
        role="button"
        tabIndex={0}
        onClick={handlePreviewClick}
        onKeyDown={(e) => e.key === 'Enter' && onRequestTextMode?.()}
        title="클릭하여 편집 (링크는 새 탭으로 열림)"
        className="min-h-[6rem] px-3 py-2 rounded-md border border-stone-200 bg-white text-sm cursor-text hover:border-stone-300 hover:bg-stone-50/50 transition-colors"
      >
        {previewSource ? (
          <div className={`${PREVIEW_PROSE} ${isEmpty ? '[&_*]:text-stone-400 [&>p]:text-stone-400' : ''}`}>
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                a: ({ node: _node, ...props }) => (
                  <a {...props} target="_blank" rel="noopener noreferrer" />
                ),
              }}
            >
              {previewSource}
            </ReactMarkdown>
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
      onPaste={handlePaste}
      placeholder={placeholder}
      maxLength={5000}
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
