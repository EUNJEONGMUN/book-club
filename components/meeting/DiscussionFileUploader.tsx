'use client';

import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { FileText, ImageIcon, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CandidateQuestionsEditor, newCandidate, type Candidate } from '@/components/meeting/CandidateQuestionsEditor';
import {
  prepareDiscussionFileUpload,
  finishDiscussionFileUpload,
  removeDiscussionFile,
  extractQuestionsFromPdf,
} from '@/lib/actions/discussion-files';
import { addQuestionsInBulk } from '@/lib/actions/questions';
import { DISCUSSION_FILE_SIZE_ERROR, DISCUSSION_FILE_TYPES, MAX_DISCUSSION_FILE_BYTES } from '@/lib/discussion-file';
import { uploadDiscussionFileToStorage } from '@/lib/supabase/discussion-file-upload';

type Props = {
  meetingId: string;
  currentFileUrl: string | null;
  currentFileName: string | null;
};

export function DiscussionFileUploader({ meetingId, currentFileUrl, currentFileName }: Props) {
  const [fileUrl, setFileUrl] = useState(currentFileUrl);
  const [displayName, setDisplayName] = useState<string | null>(currentFileName);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [removing, setRemoving] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileBusy = uploading || removing;
  const fileControlsDisabled = fileBusy || extracting || saving;

  const isPdf = fileUrl ? /\.pdf(\?|$)/i.test(fileUrl) : false;
  const hasStoredName = displayName != null && displayName.length > 0;
  function safeDecodeBasename(url: string): string {
    const raw = url.split('/').pop()?.split('?')[0] ?? '';
    try { return decodeURIComponent(raw); } catch { return raw; }
  }
  const fileName = hasStoredName
    ? displayName!
    : (fileUrl ? safeDecodeBasename(fileUrl) || (isPdf ? 'PDF 파일' : '이미지 파일') : null);
  const linkHref = fileUrl
    ? (hasStoredName ? `${fileUrl}?download=${encodeURIComponent(displayName!)}` : fileUrl)
    : '#';

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || fileControlsDisabled) return;
    e.target.value = '';
    if (file.size > MAX_DISCUSSION_FILE_BYTES) return toast.error(DISCUSSION_FILE_SIZE_ERROR);
    setUploading(true);
    try {
      const prepared = await prepareDiscussionFileUpload(meetingId, {
        name: file.name,
        size: file.size,
        type: file.type,
      }, fileUrl);
      if (!prepared.ok) return toast.error(prepared.error);

      await uploadDiscussionFileToStorage(file, prepared, setUploadProgress);
      setUploadProgress(100);
      const result = await finishDiscussionFileUpload(meetingId, prepared.ticket)
        .catch(() => finishDiscussionFileUpload(meetingId, prepared.ticket));
      if (!result.ok) return toast.error(result.error);
      setFileUrl(result.url);
      setDisplayName(result.fileName);
      setCandidates([]);
      toast.success('파일이 업로드되었습니다.');
    } catch {
      toast.error('파일 변경 결과를 확인하지 못했습니다. 페이지를 새로고침해 확인해주세요.');
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  }

  async function handleRemove() {
    if (fileControlsDisabled || !confirm('파일을 삭제할까요?')) return;
    setRemoving(true);
    const r = await removeDiscussionFile(meetingId, fileUrl).finally(() => setRemoving(false));
    if (!r.ok) return toast.error(r.error);
    setFileUrl(null);
    setDisplayName(null);
    setCandidates([]);
  }

  async function handleExtract() {
    if (!fileUrl || extracting) return;
    setExtracting(true);
    const r = await extractQuestionsFromPdf(meetingId, fileUrl);
    setExtracting(false);
    if (!r.ok) return toast.error(r.error);
    setCandidates(r.questions.map((content) => newCandidate(content)));
    toast.success(`${r.questions.length}개의 질문을 추출했습니다.`);
  }

  async function handleSaveCandidates() {
    if (saving) return;
    const filtered = candidates
      .map((c) => c.content.trim())
      .filter((content) => content.length > 0);
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
      <input
        ref={inputRef}
        type="file"
        accept={DISCUSSION_FILE_TYPES.join(',')}
        className="hidden"
        onChange={handleFileChange}
      />
      {/* 현재 파일 */}
      {fileUrl ? (
        <div className="flex items-center gap-3 p-3 bg-stone-50 rounded-xl border border-stone-200">
          {isPdf ? (
            <FileText className="w-5 h-5 text-red-500 shrink-0" />
          ) : (
            <ImageIcon className="w-5 h-5 text-blue-500 shrink-0" />
          )}
          <a
            href={linkHref}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 text-sm text-stone-700 underline underline-offset-2 truncate"
          >
            {fileName}
          </a>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={fileControlsDisabled}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? '교체 중...' : '파일 교체'}
          </Button>
          <button
            type="button"
            aria-label="발제 파일 삭제"
            disabled={fileControlsDisabled}
            onClick={handleRemove}
            className="text-stone-400 hover:text-red-500 transition-colors disabled:opacity-50"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div>
          <Button
            type="button"
            variant="outline"
            className="w-full border-stone-200 text-stone-600"
            disabled={fileControlsDisabled}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />업로드 중...</>
            ) : (
              '+ PDF 또는 이미지 업로드 (최대 20MB)'
            )}
          </Button>
        </div>
      )}
      {uploadProgress !== null && (
        <p role="status" className="text-sm text-stone-600">
          {uploadProgress === 100 ? '업로드한 파일 확인 중…' : `파일 업로드 중 ${uploadProgress}%`}
        </p>
      )}

      {/* PDF → 발제문 생성 */}
      {fileUrl && isPdf && candidates.length === 0 && (
        <div className="space-y-2">
          <Button
            type="button"
            variant="outline"
            className="w-full border-stone-200 text-stone-600"
            disabled={extracting || fileBusy}
            onClick={handleExtract}
          >
            {extracting ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />AI가 발제문을 추출하고 있어요...</>
            ) : (
              '📄 발제문 생성 (PDF에서 질문 추출)'
            )}
          </Button>
          {extracting ? (
            <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-700">
              <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <p className="font-medium">PDF 분석 중 — 보통 30초~2분 정도 소요됩니다</p>
                <p className="text-amber-600">페이지를 닫지 마시고 잠시만 기다려주세요.</p>
              </div>
            </div>
          ) : (
            <p className="text-xs text-stone-400 px-1">AI가 PDF를 분석합니다 (30초~2분 소요)</p>
          )}
        </div>
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
