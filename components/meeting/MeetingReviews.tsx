'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import * as Sentry from '@sentry/nextjs';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { Globe, Lock, Loader2, Trash2, VenetianMask } from 'lucide-react';
import { upsertMyReview, deleteMyReview } from '@/lib/actions/reviews';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { MeetingReview } from '@/lib/queries/reviews';
import type { ReviewVisibility } from '@/lib/validation/review';

const MAX_LEN = 200;

const VISIBILITY_OPTIONS: { value: ReviewVisibility; label: string; icon: typeof Lock }[] = [
  { value: 'private', label: '비공개', icon: Lock },
  { value: 'public', label: '공개', icon: Globe },
  { value: 'anonymous', label: '익명', icon: VenetianMask },
];

const VISIBILITY_BADGE: Record<ReviewVisibility, { label: string; bg: string; text: string; icon: typeof Lock }> = {
  private: { label: '비공개', bg: 'bg-muted', text: 'text-muted-foreground', icon: Lock },
  public: { label: '공개', bg: 'bg-warning', text: 'text-warning-foreground', icon: Globe },
  anonymous: { label: '익명', bg: 'bg-violet-100', text: 'text-violet-700', icon: VenetianMask },
};

type Props = {
  meetingId: string;
  initialOwn: MeetingReview | null;
  others: MeetingReview[];
  isPastMeeting: boolean;
};

export function MeetingReviews({ meetingId, initialOwn, others, isPastMeeting }: Props) {
  const [own, setOwn] = useState(initialOwn);
  const [content, setContent] = useState(initialOwn?.content ?? '');
  const [visibility, setVisibility] = useState<ReviewVisibility>(initialOwn?.visibility ?? 'private');
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(initialOwn == null);

  async function save() {
    const trimmed = content.trim();
    if (!trimmed) return toast.error('내용을 입력해주세요.');
    if (trimmed.length > MAX_LEN) return toast.error(`${MAX_LEN}자 이내로 입력해주세요.`);
    setSaving(true);
    try {
      const r = await upsertMyReview(meetingId, { content: trimmed, visibility });
      if (!r.ok) return toast.error(r.error);
      toast.success('저장됐어요.');
      const now = new Date().toISOString();
      setOwn({
        id: own?.id ?? '',
        user_id: own?.user_id ?? '',
        display_name: own?.display_name ?? '',
        avatar_url: own?.avatar_url ?? null,
        content: trimmed,
        visibility,
        created_at: own?.created_at ?? now,
        updated_at: now,
      });
      setEditing(false);
    } catch (e) {
      console.error('[MeetingReviews:save]', e);
      Sentry.captureException(e, { tags: { component: 'MeetingReviews', step: 'save' } });
      toast.error('저장 결과를 확인하지 못했습니다. 페이지를 새로고침해 확인해주세요.');
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!confirm('한줄 평을 삭제할까요?')) return;
    setSaving(true);
    try {
      const r = await deleteMyReview(meetingId);
      if (!r.ok) return toast.error(r.error);
      toast.success('삭제됐어요.');
      setOwn(null);
      setContent('');
      setVisibility('private');
      setEditing(true);
    } catch (e) {
      console.error('[MeetingReviews:remove]', e);
      Sentry.captureException(e, { tags: { component: 'MeetingReviews', step: 'remove' } });
      toast.error('삭제 결과를 확인하지 못했습니다. 페이지를 새로고침해 확인해주세요.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-foreground">한줄 평</h2>

      {/* 본인 영역 */}
      {!isPastMeeting ? (
        <p className="text-sm text-muted-foreground px-3 py-2 bg-muted/50 rounded-lg">
          모임 시작 시각부터 한줄 평을 남길 수 있어요.
        </p>
      ) : editing ? (
        <div className="space-y-2 p-3 border border-border rounded-xl bg-muted/50">
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value.slice(0, MAX_LEN))}
            placeholder="이번 모임은 어땠나요?"
            rows={3}
            className="bg-card border-border text-sm"
          />
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="inline-flex rounded-full bg-muted p-0.5">
              {VISIBILITY_OPTIONS.map((o) => {
                const Icon = o.icon;
                const active = visibility === o.value;
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => setVisibility(o.value)}
                    className={
                      'inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full transition-colors ' +
                      (active
                        ? 'bg-card text-foreground shadow-sm font-medium'
                        : 'text-muted-foreground hover:text-foreground')
                    }
                  >
                    <Icon className="w-3 h-3" />
                    {o.label}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground tabular-nums">{content.length}/{MAX_LEN}</span>
              {own && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setContent(own.content);
                    setVisibility(own.visibility);
                    setEditing(false);
                  }}
                >
                  취소
                </Button>
              )}
              <Button type="button" size="sm" onClick={save} disabled={saving || content.trim().length === 0}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : '저장'}
              </Button>
            </div>
          </div>
        </div>
      ) : (
        own && (
          <div className="p-3 border border-border rounded-xl bg-warning/40 space-y-2">
            <div className="flex items-start gap-2">
              <OwnVisibilityBadge visibility={own.visibility} />
              <p className="flex-1 text-sm text-foreground whitespace-pre-wrap">{own.content}</p>
            </div>
            <div className="flex items-center justify-end gap-1">
              <Button variant="ghost" size="sm" onClick={() => setEditing(true)} disabled={saving}>
                수정
              </Button>
              <Button variant="ghost" size="sm" onClick={remove} disabled={saving} className="text-muted-foreground">
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        )
      )}

      {/* 다른 멤버 공개 평 (anonymous 포함) — display_name/avatar 이미 서버에서 마스킹됨 */}
      {others.length > 0 && (
        <ul className="space-y-2 pt-1">
          {others.map((r) => (
            <li key={r.id} className="p-3 border border-border rounded-xl bg-card">
              <div className="flex items-start gap-3">
                <Avatar className="w-8 h-8 shrink-0">
                  <AvatarImage src={r.avatar_url ?? undefined} alt={r.display_name} />
                  <AvatarFallback className="bg-muted text-muted-foreground text-xs font-medium">
                    {r.display_name.slice(0, 1)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <p className="text-sm font-semibold text-foreground truncate">{r.display_name}</p>
                    <p className="text-xs text-muted-foreground tabular-nums shrink-0">
                      {format(new Date(r.updated_at), 'yyyy.MM.dd', { locale: ko })}
                    </p>
                  </div>
                  <p className="text-sm text-foreground mt-0.5 whitespace-pre-wrap">{r.content}</p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {isPastMeeting && others.length === 0 && !own && (
        <p className="text-xs text-muted-foreground px-1">첫 한줄 평을 남겨보세요.</p>
      )}
    </section>
  );
}

function OwnVisibilityBadge({ visibility }: { visibility: ReviewVisibility }) {
  const { label, bg, text, icon: Icon } = VISIBILITY_BADGE[visibility];
  return (
    <span
      className={`shrink-0 inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${bg} ${text}`}
    >
      <Icon className="w-3 h-3" />
      {label}
    </span>
  );
}
