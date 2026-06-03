'use client';

import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { FileText, ImageIcon, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CandidateQuestionsEditor } from '@/components/meeting/CandidateQuestionsEditor';
import {
  uploadDiscussionFile,
  removeDiscussionFile,
  extractQuestionsFromPdf,
  addQuestionsInBulk,
} from '@/lib/actions/discussion-files';

type Props = {
  meetingId: string;
  currentFileUrl: string | null;
  currentFileName: string | null;
};

export function DiscussionFileUploader({ meetingId, currentFileUrl, currentFileName }: Props) {
  const [fileUrl, setFileUrl] = useState(currentFileUrl);
  const [displayName, setDisplayName] = useState<string | null>(currentFileName);
  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [candidates, setCandidates] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const isPdf = fileUrl?.toLowerCase().includes('.pdf') ||
    fileUrl?.match(/\.(pdf)(\?|$)/i) != null;
  const fileName = displayName
    ?? (fileUrl ? decodeURIComponent(fileUrl.split('/').pop() ?? '') || (isPdf ? 'PDF 파일' : '이미지 파일') : null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append('file', file);
    const r = await uploadDiscussionFile(meetingId, fd);
    setUploading(false);
    if (!r.ok) return toast.error(r.error);
    setFileUrl(r.url);
    setDisplayName(r.fileName);
    setCandidates([]);
    toast.success('파일이 업로드되었습니다.');
    if (inputRef.current) inputRef.current.value = '';
  }

  async function handleRemove() {
    if (!confirm('파일을 삭제할까요?')) return;
    const r = await removeDiscussionFile(meetingId);
    if (!r.ok) return toast.error(r.error);
    setFileUrl(null);
    setDisplayName(null);
    setCandidates([]);
  }

  async function handleExtract() {
    if (!fileUrl) return;
    setExtracting(true);
    const r = await extractQuestionsFromPdf(fileUrl);
    setExtracting(false);
    if (!r.ok) return toast.error(r.error);
    setCandidates(r.questions);
    toast.success(`${r.questions.length}개의 질문을 추출했습니다.`);
  }

  async function handleSaveCandidates() {
    const filtered = candidates.filter((q) => q.trim().length > 0);
    if (filtered.length === 0) return;
    setSaving(true);
    const r = await addQuestionsInBulk(meetingId, filtered);
    setSaving(false);
    if (!r.ok) return toast.error(r.error);
    toast.success(`${filtered.length}개의 질문이 추가되었습니다.`);
    setCandidates([]);
  }

  return (
    <div className="space-y-3">
      {/* 현재 파일 */}
      {fileUrl ? (
        <div className="flex items-center gap-3 p-3 bg-stone-50 rounded-xl border border-stone-200">
          {isPdf ? (
            <FileText className="w-5 h-5 text-red-500 shrink-0" />
          ) : (
            <ImageIcon className="w-5 h-5 text-blue-500 shrink-0" />
          )}
          <a
            href={fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 text-sm text-stone-700 underline underline-offset-2 truncate"
          >
            {fileName}
          </a>
          <button onClick={handleRemove} className="text-stone-400 hover:text-red-500 transition-colors">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div>
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,image/*"
            className="hidden"
            onChange={handleFileChange}
          />
          <Button
            type="button"
            variant="outline"
            className="w-full border-stone-200 text-stone-600"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />업로드 중...</>
            ) : (
              '+ PDF 또는 이미지 업로드'
            )}
          </Button>
        </div>
      )}

      {/* PDF → 발제문 생성 */}
      {fileUrl && isPdf && candidates.length === 0 && (
        <Button
          type="button"
          variant="outline"
          className="w-full border-stone-200 text-stone-600"
          disabled={extracting}
          onClick={handleExtract}
        >
          {extracting ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" />추출 중...</>
          ) : (
            '📄 발제문 생성 (PDF에서 질문 추출)'
          )}
        </Button>
      )}

      {/* 추출된 질문 후보 */}
      {candidates.length > 0 && (
        <CandidateQuestionsEditor
          candidates={candidates}
          onChange={setCandidates}
          onSave={handleSaveCandidates}
          onCancel={() => setCandidates([])}
          saving={saving}
        />
      )}
    </div>
  );
}
