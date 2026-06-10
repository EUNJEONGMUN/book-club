# Multi-tenant Phase A — PR 3: Invites, Apply, Approve Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire up the actual invite + apply + approve flow so an admin can issue an invite link, a friend can apply through it, and the admin can approve them — without SQL Editor intervention. After this PR ships, the existing onboarding code-input field becomes functional and the `/clubs/<id>/settings` page exists.

**Architecture:** Three SECURITY DEFINER SQL functions (`rotate_invite`, `validate_invite_token`, `apply_to_club`) keep admin/auth checks in the database so server actions stay thin. Approve/reject are plain Supabase calls — RLS from PR 1 T8 already allows admins to UPDATE and self-or-admin to DELETE `club_members`. New `/clubs/<id>/settings` page (admin guard) renders two panels: active invite + applicants list. New `/join?token=...` page validates the token and lets the user submit an application. The onboarding code-input field swaps its toast for a real `applyToClub` call.

**Tech Stack:** Next.js 16 App Router, Supabase Postgres (SECURITY DEFINER functions + RLS), TypeScript, Tailwind, pnpm.

**Reference spec:** `docs/superpowers/specs/2026-06-09-multi-tenant-clubs-design.md`

**PR split:** This plan is intended as a single PR (PR 3) — the user-visible value (admin issuing a link → friend joining → admin approving) only materializes when all three pieces are deployed together. If the diff feels too large during review, the natural split point is "after Task 9" (backend + settings page exist but the join page / onboarding wire-up haven't shipped yet — admins can rotate links but friends can't act on them). Default: ship as one PR.

---

## File Structure

### New files

| File | Purpose |
|------|---------|
| `supabase/migrations/20260611000001_invite_apply_functions.sql` | Three SECURITY DEFINER functions: `rotate_invite`, `validate_invite_token`, `apply_to_club` |
| `lib/actions/club-invites.ts` | `rotateInvite(clubId)` server action (calls `rotate_invite` RPC) |
| `lib/actions/club-members.ts` | `applyToClub(token)`, `approveMember(clubId, userId)`, `rejectMember(clubId, userId)` server actions |
| `components/club/InviteLinkPanel.tsx` | Client component: show current active link, copy button, rotate button |
| `components/club/PendingApplicantsList.tsx` | Client component: list of pending applicants, approve/reject buttons |
| `app/(app)/clubs/[id]/settings/page.tsx` | Settings page (admin guard + the two panels above) |
| `app/(app)/join/page.tsx` | Token-based join page: validate, show club info, submit application |

### Modified files

| File | What changes |
|------|--------------|
| `lib/queries/clubs.ts` | Append `getActiveInvite(clubId)` + `getPendingApplicants(clubId)` |
| `lib/database.types.ts` | Regenerate after migration |
| `components/club/ClubSwitcher.tsx` | Add "그룹 설정" link in the dropdown (admin only — needs `currentRole` prop) |
| `app/(app)/clubs/[id]/layout.tsx` | Pass `currentRole` to `ClubSwitcher` (from `myClubs` lookup) |
| `app/(app)/onboarding/page.tsx` | Replace placeholder toast with real `applyToClub` call + result handling |

### Untouched

- Legacy `/meetings/*` routes (PR 5 cleanup)
- Existing RLS on `meetings`, `attendances`, `discussion_questions` (PR 5)
- `profiles.approved` column (PR 5)

---

## Pre-flight (one-time)

- [ ] Confirm local Supabase running: `supabase status`
- [ ] `git checkout main && git pull origin main`
- [ ] `git log --oneline -3` shows the PR 2 + hotfix merges at HEAD
- [ ] `git checkout -b feat/multi-tenant-invites`

---

## Task 1: SQL function — `rotate_invite`

Admin-only. Revokes any active invite for the club then inserts a fresh one. Returns the new token.

**Files:**
- Create: `supabase/migrations/20260611000001_invite_apply_functions.sql`

- [ ] **Step 1: Create the file with the rotate_invite function**

```sql
-- Phase A · PR 3: invite/apply/approve helpers
-- All SECURITY DEFINER. auth + admin checks live inside each function so
-- server actions can stay thin and we keep policy centralized.

CREATE OR REPLACE FUNCTION rotate_invite(target_club_id UUID)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id UUID := auth.uid();
  new_token TEXT;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM club_members
    WHERE club_id = target_club_id
      AND user_id = current_user_id
      AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Not admin';
  END IF;

  -- Revoke any active invite for this club (soft delete)
  UPDATE club_invites
  SET revoked_at = now()
  WHERE club_id = target_club_id AND revoked_at IS NULL;

  -- Generate new opaque token. UUID format gives ~128 bits of entropy.
  new_token := gen_random_uuid()::TEXT;

  INSERT INTO club_invites (club_id, token, created_by, expires_at)
  VALUES (target_club_id, new_token, current_user_id, now() + INTERVAL '30 days');

  RETURN new_token;
END;
$$;
```

- [ ] **Step 2: Commit (no apply yet — apply after T3 with all three functions in)**

```bash
git add supabase/migrations/20260611000001_invite_apply_functions.sql
git commit -m "$(cat <<'EOF'
feat(schema): add rotate_invite SECURITY DEFINER function

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: SQL function — `validate_invite_token`

Read-only. Anyone authenticated can call (token is the auth — they wouldn't have it otherwise). Returns JSON describing the state so the UI can branch: valid / expired / revoked / not_found / already_member / already_pending.

**Files:**
- Modify (append): `supabase/migrations/20260611000001_invite_apply_functions.sql`

- [ ] **Step 1: Append the function**

```sql

CREATE OR REPLACE FUNCTION validate_invite_token(invite_token TEXT)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  invite_row club_invites%ROWTYPE;
  club_row clubs%ROWTYPE;
  current_user_id UUID := auth.uid();
  membership_role club_member_role;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO invite_row FROM club_invites WHERE token = invite_token LIMIT 1;
  IF NOT FOUND THEN
    RETURN json_build_object('status', 'not_found');
  END IF;

  IF invite_row.revoked_at IS NOT NULL THEN
    RETURN json_build_object('status', 'revoked');
  END IF;

  IF invite_row.expires_at <= now() THEN
    RETURN json_build_object('status', 'expired');
  END IF;

  SELECT * INTO club_row FROM clubs WHERE id = invite_row.club_id;

  SELECT role INTO membership_role
  FROM club_members
  WHERE club_id = invite_row.club_id AND user_id = current_user_id;

  IF membership_role IN ('admin', 'member') THEN
    RETURN json_build_object(
      'status', 'already_member',
      'club_id', club_row.id,
      'club_name', club_row.name
    );
  END IF;

  IF membership_role = 'pending' THEN
    RETURN json_build_object(
      'status', 'already_pending',
      'club_id', club_row.id,
      'club_name', club_row.name
    );
  END IF;

  RETURN json_build_object(
    'status', 'valid',
    'club_id', club_row.id,
    'club_name', club_row.name
  );
END;
$$;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260611000001_invite_apply_functions.sql
git commit -m "$(cat <<'EOF'
feat(schema): add validate_invite_token SECURITY DEFINER function

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: SQL function — `apply_to_club`

Inserts a `pending` row (idempotent via the composite PK). Returns club info on success. Raises on invalid/expired/revoked token.

**Files:**
- Modify (append): `supabase/migrations/20260611000001_invite_apply_functions.sql`

- [ ] **Step 1: Append the function**

```sql

CREATE OR REPLACE FUNCTION apply_to_club(invite_token TEXT)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  invite_row club_invites%ROWTYPE;
  club_row clubs%ROWTYPE;
  current_user_id UUID := auth.uid();
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO invite_row FROM club_invites WHERE token = invite_token LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid invite';
  END IF;
  IF invite_row.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'Invite revoked';
  END IF;
  IF invite_row.expires_at <= now() THEN
    RAISE EXCEPTION 'Invite expired';
  END IF;

  INSERT INTO club_members (club_id, user_id, role)
  VALUES (invite_row.club_id, current_user_id, 'pending')
  ON CONFLICT (club_id, user_id) DO NOTHING;

  SELECT * INTO club_row FROM clubs WHERE id = invite_row.club_id;
  RETURN json_build_object(
    'club_id', club_row.id,
    'club_name', club_row.name
  );
END;
$$;
```

- [ ] **Step 2: Apply locally + verify all three functions**

Run: `supabase db reset`
Expected: completes.

```bash
PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
  -c "SELECT proname FROM pg_proc WHERE proname IN ('rotate_invite','validate_invite_token','apply_to_club') ORDER BY proname;"
```
Expected: three rows, one per function.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260611000001_invite_apply_functions.sql
git commit -m "$(cat <<'EOF'
feat(schema): add apply_to_club SECURITY DEFINER function

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Regenerate `lib/database.types.ts`

The three new RPC functions need to be in the types for `supabase.rpc('rotate_invite', ...)` to typecheck.

**Files:**
- Modify: `lib/database.types.ts`

- [ ] **Step 1: Regenerate**

Run: `supabase gen types typescript --local 2>/dev/null > lib/database.types.ts`
Expected: completes in ~5s.

- [ ] **Step 2: Verify new functions present**

Run: `grep -E "rotate_invite|validate_invite_token|apply_to_club" lib/database.types.ts | head -5`
Expected: matches showing the three function names.

- [ ] **Step 3: Typecheck**

Run: `pnpm tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add lib/database.types.ts
git commit -m "$(cat <<'EOF'
chore(types): regenerate database.types.ts after invite/apply functions

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Queries — `getActiveInvite` + `getPendingApplicants`

**Files:**
- Modify (append): `lib/queries/clubs.ts`

- [ ] **Step 1: Read the existing file**

Run: `cat lib/queries/clubs.ts`
Note the existing imports and where to append.

- [ ] **Step 2: Append the new queries**

Add to the imports at the top:
```typescript
import type { ClubInvite } from '@/lib/types';
```

(`Club`, `Meeting`, `Profile`, `Attendance` should already be imported — extend the import list rather than adding a second line.)

Then append at the end of the file:

```typescript

/** Returns the currently active invite for the club, or null. RLS restricts this to club admins. */
export async function getActiveInvite(clubId: string): Promise<ClubInvite | null> {
  const supabase = await getSupabaseServer();
  const { data, error } = await supabase
    .from('club_invites')
    .select('*')
    .eq('club_id', clubId)
    .is('revoked_at', null)
    .gte('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export type PendingApplicant = {
  user_id: string;
  display_name: string;
  joined_at: string; // application time (joined_at in club_members)
};

/** Returns pending applicants for the club. RLS restricts to active members of the club. */
export async function getPendingApplicants(clubId: string): Promise<PendingApplicant[]> {
  const supabase = await getSupabaseServer();
  const { data, error } = await supabase
    .from('club_members')
    .select('user_id, joined_at, profile:profiles(display_name)')
    .eq('club_id', clubId)
    .eq('role', 'pending')
    .order('joined_at', { ascending: true });
  if (error) throw error;
  return (data ?? [])
    .filter((row: any) => row.profile != null)
    .map((row: any) => ({
      user_id: row.user_id,
      display_name: row.profile.display_name,
      joined_at: row.joined_at,
    }));
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add lib/queries/clubs.ts
git commit -m "$(cat <<'EOF'
feat(queries): add getActiveInvite + getPendingApplicants

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Server action — `rotateInvite`

**Files:**
- Create: `lib/actions/club-invites.ts`

- [ ] **Step 1: Create the file**

```typescript
'use server';

import { revalidatePath } from 'next/cache';
import * as Sentry from '@sentry/nextjs';
import { getSupabaseServer } from '@/lib/supabase/server';

export async function rotateInvite(clubId: string): Promise<
  { ok: true; token: string } | { ok: false; error: string }
> {
  const supabase = await getSupabaseServer();
  const { data, error } = await supabase.rpc('rotate_invite', { target_club_id: clubId });

  if (error) {
    console.error('[rotateInvite]', error);
    Sentry.captureException(error, { tags: { action: 'rotateInvite' } });
    if (error.message?.includes('Not authenticated')) {
      return { ok: false, error: '로그인이 필요합니다.' };
    }
    if (error.message?.includes('Not admin')) {
      return { ok: false, error: '그룹 관리자만 초대링크를 발급할 수 있어요.' };
    }
    return { ok: false, error: '초대링크 발급에 실패했습니다.' };
  }
  if (!data) {
    return { ok: false, error: '초대링크 발급에 실패했습니다.' };
  }

  revalidatePath(`/clubs/${clubId}/settings`);
  return { ok: true, token: data as string };
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/actions/club-invites.ts
git commit -m "$(cat <<'EOF'
feat(actions): add rotateInvite server action

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Server actions — `applyToClub` + `approveMember` + `rejectMember`

**Files:**
- Create: `lib/actions/club-members.ts`

- [ ] **Step 1: Create the file**

```typescript
'use server';

import { revalidatePath } from 'next/cache';
import * as Sentry from '@sentry/nextjs';
import { getSupabaseServer } from '@/lib/supabase/server';

export async function applyToClub(token: string): Promise<
  { ok: true; clubId: string; clubName: string } | { ok: false; error: string }
> {
  const trimmed = token.trim();
  if (trimmed.length === 0) {
    return { ok: false, error: '초대코드를 입력해주세요.' };
  }

  // Accept either a raw token or a full /join?token=... URL.
  let parsedToken = trimmed;
  try {
    const url = new URL(trimmed);
    const t = url.searchParams.get('token');
    if (t) parsedToken = t;
  } catch {
    // Not a URL — use as-is.
  }

  const supabase = await getSupabaseServer();
  const { data, error } = await supabase.rpc('apply_to_club', { invite_token: parsedToken });

  if (error) {
    console.error('[applyToClub]', error);
    Sentry.captureException(error, { tags: { action: 'applyToClub' } });
    if (error.message?.includes('Not authenticated')) {
      return { ok: false, error: '로그인이 필요합니다.' };
    }
    if (error.message?.includes('Invalid invite')) {
      return { ok: false, error: '유효하지 않은 초대코드입니다.' };
    }
    if (error.message?.includes('Invite revoked')) {
      return { ok: false, error: '취소된 초대링크입니다. admin에게 새 링크를 요청해주세요.' };
    }
    if (error.message?.includes('Invite expired')) {
      return { ok: false, error: '만료된 초대링크입니다. admin에게 새 링크를 요청해주세요.' };
    }
    return { ok: false, error: '가입 신청에 실패했습니다.' };
  }
  if (!data) {
    return { ok: false, error: '가입 신청에 실패했습니다.' };
  }

  const result = data as { club_id: string; club_name: string };
  return { ok: true, clubId: result.club_id, clubName: result.club_name };
}

export async function approveMember(clubId: string, userId: string): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const supabase = await getSupabaseServer();
  const { error } = await supabase
    .from('club_members')
    .update({ role: 'member' })
    .eq('club_id', clubId)
    .eq('user_id', userId)
    .eq('role', 'pending');

  if (error) {
    console.error('[approveMember]', error);
    Sentry.captureException(error, { tags: { action: 'approveMember' } });
    return { ok: false, error: '승인에 실패했습니다.' };
  }
  revalidatePath(`/clubs/${clubId}/settings`);
  return { ok: true };
}

export async function rejectMember(clubId: string, userId: string): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const supabase = await getSupabaseServer();
  const { error } = await supabase
    .from('club_members')
    .delete()
    .eq('club_id', clubId)
    .eq('user_id', userId)
    .eq('role', 'pending');

  if (error) {
    console.error('[rejectMember]', error);
    Sentry.captureException(error, { tags: { action: 'rejectMember' } });
    return { ok: false, error: '거절에 실패했습니다.' };
  }
  revalidatePath(`/clubs/${clubId}/settings`);
  return { ok: true };
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/actions/club-members.ts
git commit -m "$(cat <<'EOF'
feat(actions): add applyToClub / approveMember / rejectMember server actions

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: `InviteLinkPanel` component (client)

**Files:**
- Create: `components/club/InviteLinkPanel.tsx`

- [ ] **Step 1: Create the component**

```typescript
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Copy, RefreshCw, Loader2, Key } from 'lucide-react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { rotateInvite } from '@/lib/actions/club-invites';
import { Button } from '@/components/ui/button';
import type { ClubInvite } from '@/lib/types';

export function InviteLinkPanel({
  clubId,
  initialInvite,
}: {
  clubId: string;
  initialInvite: ClubInvite | null;
}) {
  const router = useRouter();
  const [invite, setInvite] = useState(initialInvite);
  const [rotating, setRotating] = useState(false);

  const fullUrl = invite
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/join?token=${invite.token}`
    : null;

  async function handleRotate() {
    if (rotating) return;
    if (invite && !confirm('현재 초대링크가 무효화됩니다. 계속할까요?')) return;
    setRotating(true);
    const result = await rotateInvite(clubId);
    setRotating(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(invite ? '새 초대링크를 발급했어요.' : '초대링크를 만들었어요.');
    router.refresh(); // refetch invite from server
  }

  async function handleCopy() {
    if (!fullUrl) return;
    try {
      await navigator.clipboard.writeText(fullUrl);
      toast.success('초대링크가 복사됐어요.');
    } catch {
      toast.error('복사에 실패했어요. 직접 선택해서 복사해주세요.');
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Key className="w-4 h-4 text-stone-500" />
        <h2 className="text-sm font-semibold text-stone-700">초대링크</h2>
      </div>

      {invite && fullUrl ? (
        <div className="space-y-2">
          <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 text-xs text-stone-700 break-all">
            {fullUrl}
          </div>
          <p className="text-xs text-stone-500">
            만료: {format(new Date(invite.expires_at), 'yyyy-MM-dd HH:mm', { locale: ko })} (30일)
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleCopy} className="flex-1 gap-1">
              <Copy className="w-4 h-4" />
              복사
            </Button>
            <Button variant="outline" size="sm" onClick={handleRotate} disabled={rotating} className="flex-1 gap-1">
              {rotating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              재발급
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-stone-500">아직 발급된 초대링크가 없어요.</p>
          <Button onClick={handleRotate} disabled={rotating} className="gap-1">
            {rotating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Key className="w-4 h-4" />}
            초대링크 만들기
          </Button>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/club/InviteLinkPanel.tsx
git commit -m "$(cat <<'EOF'
feat(club): add InviteLinkPanel (copy + rotate)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: `PendingApplicantsList` component (client)

**Files:**
- Create: `components/club/PendingApplicantsList.tsx`

- [ ] **Step 1: Create the component**

```typescript
'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Check, X, Loader2, UserPlus } from 'lucide-react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { approveMember, rejectMember } from '@/lib/actions/club-members';
import { Button } from '@/components/ui/button';
import type { PendingApplicant } from '@/lib/queries/clubs';

export function PendingApplicantsList({
  clubId,
  initialApplicants,
}: {
  clubId: string;
  initialApplicants: PendingApplicant[];
}) {
  const router = useRouter();
  const [applicants, setApplicants] = useState(initialApplicants);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [, startTransition] = useTransition();

  function mark(userId: string, on: boolean) {
    setPending((prev) => {
      const next = new Set(prev);
      if (on) next.add(userId);
      else next.delete(userId);
      return next;
    });
  }

  function handleApprove(userId: string) {
    mark(userId, true);
    startTransition(async () => {
      const result = await approveMember(clubId, userId);
      mark(userId, false);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success('가입을 승인했어요.');
      setApplicants((prev) => prev.filter((a) => a.user_id !== userId));
      router.refresh();
    });
  }

  function handleReject(userId: string) {
    if (!confirm('가입 신청을 거절할까요?')) return;
    mark(userId, true);
    startTransition(async () => {
      const result = await rejectMember(clubId, userId);
      mark(userId, false);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success('가입 신청을 거절했어요.');
      setApplicants((prev) => prev.filter((a) => a.user_id !== userId));
      router.refresh();
    });
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <UserPlus className="w-4 h-4 text-stone-500" />
        <h2 className="text-sm font-semibold text-stone-700">가입 신청 ({applicants.length})</h2>
      </div>

      {applicants.length === 0 ? (
        <p className="text-sm text-stone-500">아직 신청이 없어요.</p>
      ) : (
        <ul className="space-y-2">
          {applicants.map((a) => {
            const isPending = pending.has(a.user_id);
            return (
              <li key={a.user_id} className="p-3 bg-stone-50 rounded-xl border border-stone-200 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{a.display_name}</p>
                  <p className="text-xs text-stone-500">
                    {format(new Date(a.joined_at), 'yyyy-MM-dd HH:mm', { locale: ko })}
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() => handleApprove(a.user_id)}
                  disabled={isPending}
                  className="gap-1 bg-stone-800 hover:bg-stone-700 text-white"
                >
                  {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  승인
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleReject(a.user_id)}
                  disabled={isPending}
                  className="gap-1"
                >
                  <X className="w-3.5 h-3.5" />
                  거절
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/club/PendingApplicantsList.tsx
git commit -m "$(cat <<'EOF'
feat(club): add PendingApplicantsList (approve/reject)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Settings page `/clubs/<id>/settings` (admin guard)

**Files:**
- Create: `app/(app)/clubs/[id]/settings/page.tsx`

- [ ] **Step 1: Create the page**

```typescript
import { notFound } from 'next/navigation';
import { getClubById, getActiveInvite, getPendingApplicants } from '@/lib/queries/clubs';
import { getSupabaseServer } from '@/lib/supabase/server';
import { InviteLinkPanel } from '@/components/club/InviteLinkPanel';
import { PendingApplicantsList } from '@/components/club/PendingApplicantsList';

async function getCurrentRole(clubId: string): Promise<'admin' | 'member' | 'pending' | null> {
  const supabase = await getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from('club_members')
    .select('role')
    .eq('club_id', clubId)
    .eq('user_id', user.id)
    .maybeSingle();
  return (data?.role as 'admin' | 'member' | 'pending' | undefined) ?? null;
}

export default async function ClubSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: clubId } = await params;
  const role = await getCurrentRole(clubId);
  if (role !== 'admin') notFound();

  const [club, invite, applicants] = await Promise.all([
    getClubById(clubId),
    getActiveInvite(clubId),
    getPendingApplicants(clubId),
  ]);
  if (!club) notFound();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold">{club.name} 설정</h1>
        <p className="text-sm text-stone-500">관리자 전용</p>
      </div>
      <InviteLinkPanel clubId={clubId} initialInvite={invite} />
      <PendingApplicantsList clubId={clubId} initialApplicants={applicants} />
    </div>
  );
}
```

- [ ] **Step 2: Build**

Run: `pnpm build`
Expected: builds; `/clubs/[id]/settings` in route table.

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/clubs/[id]/settings/page.tsx"
git commit -m "$(cat <<'EOF'
feat(clubs): add /clubs/<id>/settings page (admin only)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: `ClubSwitcher` — show "그룹 설정" link for admins

The current `ClubSwitcher` only takes `currentClub` (id + name) and `allClubs`. To know whether to show the settings link, it also needs the caller's role in the current club. The group layout already has access to `myClubs` so it can pass the role.

**Files:**
- Modify: `components/club/ClubSwitcher.tsx`
- Modify: `app/(app)/clubs/[id]/layout.tsx`

- [ ] **Step 1: Update `ClubSwitcher` props + render**

Replace the entire `components/club/ClubSwitcher.tsx` content with:

```typescript
'use client';

import Link from 'next/link';
import { ChevronDown, List, Settings } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { MyClub } from '@/lib/queries/clubs';

export function ClubSwitcher({
  currentClub,
  currentRole,
  allClubs,
}: {
  currentClub: { id: string; name: string };
  currentRole: 'admin' | 'member';
  allClubs: MyClub[];
}) {
  const others = allClubs.filter((c) => c.id !== currentClub.id);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-1 text-base font-semibold text-stone-800 hover:text-stone-600 transition-colors">
        <span className="truncate max-w-[200px]">{currentClub.name}</span>
        <ChevronDown className="w-4 h-4 shrink-0" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={6} className="min-w-56">
        {others.length > 0 && (
          <>
            {others.map((c) => (
              <DropdownMenuItem key={c.id} asChild>
                <Link href={`/clubs/${c.id}`} className="cursor-pointer">
                  {c.name}
                </Link>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
          </>
        )}
        {currentRole === 'admin' && (
          <>
            <DropdownMenuItem asChild>
              <Link href={`/clubs/${currentClub.id}/settings`} className="cursor-pointer gap-2">
                <Settings className="w-4 h-4" />
                그룹 설정
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem asChild>
          <Link href="/clubs" className="cursor-pointer gap-2">
            <List className="w-4 h-4" />
            그룹 목록
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 2: Update `app/(app)/clubs/[id]/layout.tsx` to pass `currentRole`**

Open `app/(app)/clubs/[id]/layout.tsx`. The current pattern fetches `[club, myClubs]`. Derive the current role from `myClubs.find(...)`:

Replace the layout body content with:

```typescript
import { notFound } from 'next/navigation';
import { getClubById, getMyClubs } from '@/lib/queries/clubs';
import { ClubSwitcher } from '@/components/club/ClubSwitcher';
import { BottomNav } from '@/components/layout/BottomNav';

export default async function ClubLayout({
  params,
  children,
}: {
  params: Promise<{ id: string }>;
  children: React.ReactNode;
}) {
  const { id } = await params;
  const [club, myClubs] = await Promise.all([getClubById(id), getMyClubs()]);
  if (!club) notFound();

  const currentRole = myClubs.find((c) => c.id === id)?.role;
  // RLS already restricts getClubById to active members, so if we reached here without a role
  // something is off — bail out safely.
  if (!currentRole) notFound();

  return (
    <>
      <header className="sticky top-0 z-40 bg-white border-b border-stone-100">
        <div className="max-w-md mx-auto px-4 py-3">
          <ClubSwitcher
            currentClub={{ id: club.id, name: club.name }}
            currentRole={currentRole}
            allClubs={myClubs}
          />
        </div>
      </header>
      <div className="space-y-6 pt-4">{children}</div>
      <BottomNav />
    </>
  );
}
```

- [ ] **Step 3: Build**

Run: `pnpm build`
Expected: builds.

- [ ] **Step 4: Commit**

```bash
git add components/club/ClubSwitcher.tsx "app/(app)/clubs/[id]/layout.tsx"
git commit -m "$(cat <<'EOF'
feat(club): ClubSwitcher shows "그룹 설정" link for admins; layout passes role

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: `/join` page

Server component. Reads the `token` query param, calls `validate_invite_token`, and renders one of:
- valid → club name + "가입 신청" button (client island that calls `applyToClub`)
- already_member → instant redirect to `/clubs/<id>`
- already_pending → "신청 완료, 승인 대기 중" message
- expired / revoked / not_found → error message

Login is enforced by middleware: a non-authenticated visitor hits `/login?next=/join?token=...`, signs in, then comes back here (the `?next=` preservation from `feedback_local_build_before_pr` — sorry, from PR 7's `?next=` work, lives in `lib/auth/safe-next.ts`).

**Files:**
- Create: `app/(app)/join/page.tsx`
- Create: `app/(app)/join/JoinButton.tsx` (small client island for the apply action)

- [ ] **Step 1: Create the client button**

```typescript
// app/(app)/join/JoinButton.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { applyToClub } from '@/lib/actions/club-members';
import { Button } from '@/components/ui/button';

export function JoinButton({ token }: { token: string }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (submitting) return;
    setSubmitting(true);
    const result = await applyToClub(token);
    if (!result.ok) {
      setSubmitting(false);
      toast.error(result.error);
      return;
    }
    toast.success('가입 신청을 보냈어요. 관리자 승인을 기다려주세요.');
    router.push('/clubs');
    router.refresh();
  }

  return (
    <Button onClick={submit} disabled={submitting} className="w-full bg-stone-800 hover:bg-stone-700 text-white">
      {submitting ? (
        <><Loader2 className="w-4 h-4 mr-2 animate-spin" />신청 중...</>
      ) : (
        '가입 신청'
      )}
    </Button>
  );
}
```

- [ ] **Step 2: Create the server page**

```typescript
// app/(app)/join/page.tsx
import { redirect } from 'next/navigation';
import { getSupabaseServer } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { JoinButton } from './JoinButton';

type ValidationResult =
  | { status: 'valid'; club_id: string; club_name: string }
  | { status: 'already_member'; club_id: string; club_name: string }
  | { status: 'already_pending'; club_id: string; club_name: string }
  | { status: 'expired' | 'revoked' | 'not_found' };

export default async function JoinPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  if (!token) {
    return (
      <div className="space-y-4 max-w-sm mx-auto">
        <h1 className="text-xl font-bold">초대코드가 없어요</h1>
        <p className="text-sm text-stone-500">초대링크의 token이 누락됐어요. 새 링크를 받아주세요.</p>
        <Link href="/clubs"><Button variant="outline" className="w-full">내 그룹으로</Button></Link>
      </div>
    );
  }

  const supabase = await getSupabaseServer();
  const { data, error } = await supabase.rpc('validate_invite_token', { invite_token: token });

  if (error || !data) {
    return (
      <div className="space-y-4 max-w-sm mx-auto">
        <h1 className="text-xl font-bold">확인할 수 없어요</h1>
        <p className="text-sm text-stone-500">초대코드 검증 중 오류가 발생했어요. 잠시 후 다시 시도해주세요.</p>
        <Link href="/clubs"><Button variant="outline" className="w-full">내 그룹으로</Button></Link>
      </div>
    );
  }

  const result = data as ValidationResult;

  if (result.status === 'already_member') {
    redirect(`/clubs/${result.club_id}`);
  }

  if (result.status === 'already_pending') {
    return (
      <div className="space-y-4 max-w-sm mx-auto">
        <h1 className="text-xl font-bold">신청 완료</h1>
        <p className="text-sm text-stone-500">
          <strong>{result.club_name}</strong>에 이미 가입 신청을 보냈어요. 관리자 승인을 기다려주세요.
        </p>
        <Link href="/clubs"><Button variant="outline" className="w-full">내 그룹으로</Button></Link>
      </div>
    );
  }

  if (result.status === 'not_found') {
    return (
      <div className="space-y-4 max-w-sm mx-auto">
        <h1 className="text-xl font-bold">잘못된 초대코드예요</h1>
        <p className="text-sm text-stone-500">코드가 올바른지 확인해주세요.</p>
        <Link href="/clubs"><Button variant="outline" className="w-full">내 그룹으로</Button></Link>
      </div>
    );
  }

  if (result.status === 'revoked') {
    return (
      <div className="space-y-4 max-w-sm mx-auto">
        <h1 className="text-xl font-bold">취소된 초대링크예요</h1>
        <p className="text-sm text-stone-500">관리자에게 새 초대링크를 요청해주세요.</p>
        <Link href="/clubs"><Button variant="outline" className="w-full">내 그룹으로</Button></Link>
      </div>
    );
  }

  if (result.status === 'expired') {
    return (
      <div className="space-y-4 max-w-sm mx-auto">
        <h1 className="text-xl font-bold">만료된 초대링크예요</h1>
        <p className="text-sm text-stone-500">관리자에게 새 초대링크를 요청해주세요.</p>
        <Link href="/clubs"><Button variant="outline" className="w-full">내 그룹으로</Button></Link>
      </div>
    );
  }

  // valid
  return (
    <div className="space-y-4 max-w-sm mx-auto">
      <h1 className="text-xl font-bold">{result.club_name}</h1>
      <p className="text-sm text-stone-500">
        이 그룹의 초대를 받으셨어요. 가입을 신청하면 관리자의 승인 후 멤버가 됩니다.
      </p>
      <JoinButton token={token} />
      <Link href="/clubs">
        <Button variant="ghost" className="w-full text-stone-500">취소</Button>
      </Link>
    </div>
  );
}
```

- [ ] **Step 3: Build**

Run: `pnpm build`
Expected: builds; `/join` in route table.

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/join/page.tsx" "app/(app)/join/JoinButton.tsx"
git commit -m "$(cat <<'EOF'
feat(join): add /join?token=... page with status branching

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: Wire up onboarding code input

The current `app/(app)/onboarding/page.tsx` shows a toast that says "곧 활성화됩니다". Replace that with a real `applyToClub` call. On success, push the user to the new club; on `already_member` / `already_pending` etc. surface a useful toast.

**Files:**
- Modify: `app/(app)/onboarding/page.tsx`

- [ ] **Step 1: Update the page**

Replace the entire file content with:

```typescript
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Plus, Key, Loader2 } from 'lucide-react';
import { applyToClub } from '@/lib/actions/club-members';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function OnboardingPage() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleCodeSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    const result = await applyToClub(code);
    if (!result.ok) {
      setSubmitting(false);
      toast.error(result.error);
      return;
    }
    toast.success(`${result.clubName}에 가입 신청을 보냈어요. 관리자 승인을 기다려주세요.`);
    router.push('/clubs');
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-stone-50">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center space-y-2">
          <div className="text-4xl">📖</div>
          <h1 className="text-2xl font-semibold text-stone-800 tracking-tight">시작하기</h1>
          <p className="text-sm text-stone-500">새 그룹을 만들거나 초대코드로 가입할 수 있어요</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-6 space-y-5">
          <Link href="/clubs/new" className="block">
            <Button className="w-full bg-stone-800 hover:bg-stone-700 text-white gap-2">
              <Plus className="w-4 h-4" />
              새 그룹 만들기
            </Button>
          </Link>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-stone-100" />
            <span className="text-xs text-stone-400">또는</span>
            <div className="flex-1 h-px bg-stone-100" />
          </div>

          <form onSubmit={handleCodeSubmit} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="code" className="text-stone-700">초대코드 또는 링크</Label>
              <Input
                id="code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="ABC-XYZ-123 또는 초대 URL 전체"
                className="bg-stone-50 border-stone-200 focus:bg-white"
              />
            </div>
            <Button
              type="submit"
              variant="outline"
              disabled={submitting || code.trim().length === 0}
              className="w-full gap-2"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Key className="w-4 h-4" />}
              초대코드로 가입
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build**

Run: `pnpm build`
Expected: builds.

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/onboarding/page.tsx"
git commit -m "$(cat <<'EOF'
feat(onboarding): wire up code input to real applyToClub action

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: Deploy gate (verify, push, PR, merge, db push, smoke)

- [ ] **Step 1: Local verification**

```bash
pnpm vitest run
pnpm tsc --noEmit
pnpm build
```
Expected: all green. Route table includes `/clubs/[id]/settings` and `/join`.

- [ ] **Step 2: Local smoke (optional but recommended)**

`pnpm dev` → http://localhost:3000:
- Login → `/` → `/clubs`. Enter the (local) admin's first club. Top-bar drop-down → "그룹 설정" (visible because admin).
- Settings page: "초대링크 만들기" → token generated, copy/rotate visible. "가입 신청 (0)" because nobody applied yet.
- Open an incognito window (or different account): visit `http://localhost:3000/join?token=<paste-the-token>`. Login if needed. "가입 신청" → success toast.
- Back in the admin window: refresh `/clubs/<id>/settings` → applicant appears. Approve → applicant disappears, the other window's user is now a member.

Kill dev server.

- [ ] **Step 3: Push**

```bash
git push -u origin feat/multi-tenant-invites
```

- [ ] **Step 4: PR**

Title: `feat(invites): admin invite + apply + approve (PR 3)`
Body:
```markdown
## Summary
- Three new SECURITY DEFINER SQL functions: rotate_invite, validate_invite_token, apply_to_club
- New server actions: rotateInvite, applyToClub, approveMember, rejectMember
- New page `/clubs/<id>/settings` (admin only): invite link panel + applicants list
- New page `/join?token=...` for friends arriving via invite link
- Onboarding code input is now wired to applyToClub
- ClubSwitcher drop-down shows "그룹 설정" link for admins

## Out of scope (PR 4+)
- Group rename / description edit, admin transfer, group leave/delete (PR 4)
- Legacy /meetings/* cleanup + profiles.approved drop + RLS rewrite (PR 5)

## Test plan
- [x] typecheck + vitest + build all pass
- [x] Local smoke: admin issues link → friend joins via link → admin approves → friend is member
- [ ] After merge: `supabase db push` to apply the three new functions
- [ ] After merge: admin issues a real link in production → share via 카톡 → friend joins → admin approves
```

- [ ] **Step 5: Merge**

CI green → Squash and merge → Delete branch.

- [ ] **Step 6: Production migration**

```bash
git checkout main
git pull origin main
supabase db push
```
Confirm `y`. Applies `20260611000001_invite_apply_functions.sql`.

- [ ] **Step 7: Production smoke**

Admin (you) logs in → `/clubs/<부글부글-id>` → top-bar drop-down → "그룹 설정" → "초대링크 만들기" → copy the URL → 카톡으로 본인 다른 계정 또는 친구한테 보내기 → 그쪽에서 클릭 → /login → 로그인 → /join?token=... → "가입 신청" → admin이 settings에서 승인 → 그쪽이 부글부글 멤버가 됨.

- [ ] **Step 8: Local cleanup**

```bash
git branch -D feat/multi-tenant-invites
```

---

## Done criteria

- ✅ Admin can issue and rotate invite links from `/clubs/<id>/settings`
- ✅ Friends arriving via `/join?token=...` see club info + can apply
- ✅ Onboarding code input works for new sign-ups
- ✅ Admin can approve/reject pending applicants
- ✅ All three new SQL functions live in production

## Out of scope for this PR

- Group rename, description edit (PR 4)
- Admin transfer / group leave / group delete (PR 4)
- Legacy `/meetings/*` route removal + `profiles.approved` drop + RLS rewrite of `meetings`/`attendances`/`discussion_questions` (PR 5)
