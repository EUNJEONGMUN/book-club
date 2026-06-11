# Multi-tenant Phase A — PR 4: Settings Expansion (rename + description + admin transfer + leave + delete) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Round out the group `/clubs/<id>/settings` page so admins can edit the group's name/description, transfer admin to another member, and delete the group; members can leave it.

**Architecture:** No new pages — extend the existing `/clubs/<id>/settings` from PR 3 by removing its admin-only guard and branching the UI by role (admin sees the full set; non-admin sees a read-only info section + a leave button). Add one new SECURITY DEFINER SQL function `transfer_admin` to keep the role swap atomic (both rows in one transaction). The rest are plain Supabase calls relying on existing RLS from PR 1: `clubs` UPDATE/DELETE for admins, `club_members` DELETE-self for leaves.

**Tech Stack:** Next.js 16 App Router, Supabase Postgres (SECURITY DEFINER + existing RLS), TypeScript, Tailwind, pnpm.

**Reference spec:** `docs/superpowers/specs/2026-06-09-multi-tenant-clubs-design.md`

**PR shape:** Single PR. The pieces are tightly coupled around one page; splitting would mean a half-finished settings page in production.

---

## File Structure

### New files

| File | Purpose |
|------|---------|
| `supabase/migrations/20260611000002_transfer_admin_function.sql` | `transfer_admin(target_club_id, new_admin_user_id)` SECURITY DEFINER — atomic role swap |
| `lib/actions/club-info.ts` | `updateClub({ clubId, name, description })` (rename + description edit) |
| `components/club/ClubInfoPanel.tsx` | Admin form for name + description |
| `components/club/ClubInfoReadOnly.tsx` | Non-admin view of name + description |
| `components/club/AdminTransferSection.tsx` | Admin-only: pick another active member, confirm, transfer |
| `components/club/DangerZoneSection.tsx` | Member: "그룹 탈퇴"; Admin: "그룹 삭제" |

### Modified files

| File | What changes |
|------|--------------|
| `lib/database.types.ts` | Regenerate after migration |
| `lib/queries/clubs.ts` | Add `getClubActiveMembers(clubId)` — admin/member rows with profile, excludes pending |
| `lib/actions/club-members.ts` | Add `transferAdmin(clubId, newAdminUserId)`, `leaveClub(clubId)`, `deleteClub(clubId)` |
| `app/(app)/clubs/[id]/settings/page.tsx` | Remove admin-only `notFound`; branch by role; render the new sections |
| `components/club/ClubSwitcher.tsx` | Show "그룹 설정" link for both admin and member (currently admin only) |

### Untouched

- Legacy `/meetings/*` routes (PR 5 cleanup)
- Existing RLS on `meetings`, `attendances`, `discussion_questions` (PR 5)
- `profiles.approved` column (PR 5)

---

## Pre-flight (one-time)

- [ ] Confirm local Supabase running: `supabase status`
- [ ] `git checkout main && git pull origin main` — should show PR 3 (`a953793 Feat/multi tenant invites (#19)`) at HEAD
- [ ] `git checkout -b feat/multi-tenant-settings-expansion`

---

## Task 1: SQL function — `transfer_admin`

Admin-only. Atomic role swap so the club never has zero admins (or two) mid-transaction.

**Files:**
- Create: `supabase/migrations/20260611000002_transfer_admin_function.sql`

- [ ] **Step 1: Create the file with this exact content**

```sql
-- Phase A · PR 4: transfer_admin helper
-- Atomically swaps the current admin to 'member' and promotes another active member to 'admin'.
-- SECURITY DEFINER so the function bypasses the per-row UPDATE policy on club_members and runs
-- the swap as one transaction (no race where the club briefly has two admins or zero).

CREATE OR REPLACE FUNCTION transfer_admin(target_club_id UUID, new_admin_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id UUID := auth.uid();
  new_admin_role club_member_role;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF current_user_id = new_admin_user_id THEN
    RAISE EXCEPTION 'Cannot transfer admin to yourself';
  END IF;

  -- Caller must be the current admin of this club
  IF NOT EXISTS (
    SELECT 1 FROM club_members
    WHERE club_id = target_club_id
      AND user_id = current_user_id
      AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Not admin';
  END IF;

  -- Target must already be an active member (admin or member) of this club
  SELECT role INTO new_admin_role
  FROM club_members
  WHERE club_id = target_club_id AND user_id = new_admin_user_id;

  IF new_admin_role IS NULL THEN
    RAISE EXCEPTION 'Target user is not in this club';
  END IF;
  IF new_admin_role = 'pending' THEN
    RAISE EXCEPTION 'Target user is still pending approval';
  END IF;

  -- Atomic swap
  UPDATE club_members
  SET role = 'member'
  WHERE club_id = target_club_id AND user_id = current_user_id;

  UPDATE club_members
  SET role = 'admin'
  WHERE club_id = target_club_id AND user_id = new_admin_user_id;
END;
$$;
```

- [ ] **Step 2: Apply locally**

Run: `supabase db reset`
Expected: completes.

- [ ] **Step 3: Verify the function exists**

```bash
PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
  -c "SELECT proname FROM pg_proc WHERE proname = 'transfer_admin';"
```
Expected: one row.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260611000002_transfer_admin_function.sql
git commit -m "$(cat <<'EOF'
feat(schema): add transfer_admin SECURITY DEFINER function

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Regenerate `lib/database.types.ts`

**Files:**
- Modify: `lib/database.types.ts`

- [ ] **Step 1: Regenerate**

Run: `supabase gen types typescript --local 2>/dev/null > lib/database.types.ts`

- [ ] **Step 2: Verify new function present**

Run: `grep "transfer_admin" lib/database.types.ts | head -3`
Expected: match showing the function.

- [ ] **Step 3: Typecheck**

Run: `pnpm tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add lib/database.types.ts
git commit -m "$(cat <<'EOF'
chore(types): regenerate database.types.ts after transfer_admin function

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Query — `getClubActiveMembers`

Returns admin + member rows (not pending), each with display_name. Used by the admin transfer selector.

**Files:**
- Modify: `lib/queries/clubs.ts`

- [ ] **Step 1: Append at end of `lib/queries/clubs.ts`**

```typescript

export type ClubActiveMember = {
  user_id: string;
  display_name: string;
  role: 'admin' | 'member';
  joined_at: string;
};

/** Returns admin + member rows for the club. Pending excluded. RLS restricts to active members of the club. */
export async function getClubActiveMembers(clubId: string): Promise<ClubActiveMember[]> {
  const supabase = await getSupabaseServer();
  const { data, error } = await supabase
    .from('club_members')
    .select('user_id, role, joined_at, profile:profiles(display_name)')
    .eq('club_id', clubId)
    .in('role', ['admin', 'member'])
    .order('joined_at', { ascending: true });
  if (error) throw error;
  return (data ?? [])
    .filter((row: any) => row.profile != null)
    .map((row: any) => ({
      user_id: row.user_id,
      display_name: row.profile.display_name,
      role: row.role as 'admin' | 'member',
      joined_at: row.joined_at,
    }));
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/queries/clubs.ts
git commit -m "$(cat <<'EOF'
feat(queries): add getClubActiveMembers

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Server action — `updateClub`

Update the club's name and (optional) description. RLS already restricts UPDATE to admins.

**Files:**
- Create: `lib/actions/club-info.ts`

- [ ] **Step 1: Create the file**

```typescript
'use server';

import { revalidatePath } from 'next/cache';
import * as Sentry from '@sentry/nextjs';
import { z } from 'zod';
import { getSupabaseServer } from '@/lib/supabase/server';

const updateClubSchema = z.object({
  clubId: z.string().uuid(),
  name: z.string().trim().min(1, '그룹 이름을 입력해주세요.').max(50, '그룹 이름은 50자 이내로 입력해주세요.'),
  description: z.string().trim().max(500, '설명은 500자 이내로 입력해주세요.').optional().nullable(),
});

export async function updateClub(input: {
  clubId: string;
  name: string;
  description?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = updateClubSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다.' };
  }

  const supabase = await getSupabaseServer();
  const { error } = await supabase
    .from('clubs')
    .update({
      name: parsed.data.name,
      description: parsed.data.description ?? null,
    })
    .eq('id', parsed.data.clubId);

  if (error) {
    console.error('[updateClub]', error);
    Sentry.captureException(error, { tags: { action: 'updateClub' } });
    return { ok: false, error: '그룹 정보를 저장하지 못했습니다.' };
  }

  revalidatePath(`/clubs/${parsed.data.clubId}`);
  revalidatePath(`/clubs/${parsed.data.clubId}/settings`);
  revalidatePath('/clubs');
  return { ok: true };
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/actions/club-info.ts
git commit -m "$(cat <<'EOF'
feat(actions): add updateClub (rename + description edit)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Server actions — `transferAdmin`, `leaveClub`, `deleteClub`

Appended to the existing `club-members.ts` file because they all touch membership.

**Files:**
- Modify: `lib/actions/club-members.ts`

- [ ] **Step 1: Append the three actions at the end of the file**

```typescript

export async function transferAdmin(
  clubId: string,
  newAdminUserId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await getSupabaseServer();
  const { error } = await supabase.rpc('transfer_admin', {
    target_club_id: clubId,
    new_admin_user_id: newAdminUserId,
  });

  if (error) {
    console.error('[transferAdmin]', error);
    Sentry.captureException(error, { tags: { action: 'transferAdmin' } });
    if (error.message?.includes('Not authenticated')) {
      return { ok: false, error: '로그인이 필요합니다.' };
    }
    if (error.message?.includes('Not admin')) {
      return { ok: false, error: '그룹 관리자만 이양할 수 있어요.' };
    }
    if (error.message?.includes('Cannot transfer admin to yourself')) {
      return { ok: false, error: '본인에게는 이양할 수 없어요.' };
    }
    if (error.message?.includes('Target user is not in this club')) {
      return { ok: false, error: '대상이 이 그룹의 멤버가 아닙니다.' };
    }
    if (error.message?.includes('Target user is still pending approval')) {
      return { ok: false, error: '승인 대기 중인 사용자에게는 이양할 수 없어요.' };
    }
    return { ok: false, error: '관리자 이양에 실패했어요.' };
  }

  revalidatePath(`/clubs/${clubId}/settings`);
  return { ok: true };
}

export async function leaveClub(clubId: string): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const supabase = await getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: '로그인이 필요합니다.' };
  }

  // Guard: admins must transfer or delete first.
  const { data: row } = await supabase
    .from('club_members')
    .select('role')
    .eq('club_id', clubId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (row?.role === 'admin') {
    return {
      ok: false,
      error: '관리자는 탈퇴할 수 없어요. 다른 멤버에게 이양하거나 그룹을 삭제해주세요.',
    };
  }

  const { error } = await supabase
    .from('club_members')
    .delete()
    .eq('club_id', clubId)
    .eq('user_id', user.id);

  if (error) {
    console.error('[leaveClub]', error);
    Sentry.captureException(error, { tags: { action: 'leaveClub' } });
    return { ok: false, error: '그룹 탈퇴에 실패했어요.' };
  }

  revalidatePath('/clubs');
  return { ok: true };
}

export async function deleteClub(clubId: string): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const supabase = await getSupabaseServer();
  const { error } = await supabase.from('clubs').delete().eq('id', clubId);

  if (error) {
    console.error('[deleteClub]', error);
    Sentry.captureException(error, { tags: { action: 'deleteClub' } });
    return { ok: false, error: '그룹 삭제에 실패했어요.' };
  }

  revalidatePath('/clubs');
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
feat(actions): add transferAdmin / leaveClub / deleteClub

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: `ClubInfoPanel` component (admin — editable)

**Files:**
- Create: `components/club/ClubInfoPanel.tsx`

- [ ] **Step 1: Create the component**

```typescript
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, Save, Pencil } from 'lucide-react';
import { updateClub } from '@/lib/actions/club-info';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Club } from '@/lib/types';

export function ClubInfoPanel({ club }: { club: Club }) {
  const router = useRouter();
  const [name, setName] = useState(club.name);
  const [description, setDescription] = useState(club.description ?? '');
  const [saving, setSaving] = useState(false);

  const dirty = name.trim() !== club.name || (description.trim() || null) !== (club.description ?? null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving || !dirty) return;
    setSaving(true);
    const result = await updateClub({
      clubId: club.id,
      name: name.trim(),
      description: description.trim() ? description.trim() : null,
    });
    setSaving(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success('그룹 정보를 저장했어요.');
    router.refresh();
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Pencil className="w-4 h-4 text-stone-500" />
        <h2 className="text-sm font-semibold text-stone-700">그룹 정보</h2>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="name" className="text-stone-700">그룹 이름</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={50}
            className="bg-stone-50 border-stone-200 focus:bg-white"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="description" className="text-stone-700">설명 (선택)</Label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={500}
            rows={3}
            placeholder="그룹 소개를 입력해주세요."
            className="block w-full bg-stone-50 border border-stone-200 rounded-md px-3 py-2 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-stone-300"
          />
          <p className="text-xs text-stone-400 text-right">{description.length}/500</p>
        </div>
        <Button type="submit" disabled={saving || !dirty} className="gap-1 bg-stone-800 hover:bg-stone-700 text-white">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          저장
        </Button>
      </form>
    </section>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/club/ClubInfoPanel.tsx
git commit -m "$(cat <<'EOF'
feat(club): add ClubInfoPanel (admin edits name + description)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: `ClubInfoReadOnly` component (non-admin)

**Files:**
- Create: `components/club/ClubInfoReadOnly.tsx`

- [ ] **Step 1: Create the component**

```typescript
import { Info } from 'lucide-react';
import type { Club } from '@/lib/types';

export function ClubInfoReadOnly({ club }: { club: Club }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Info className="w-4 h-4 text-stone-500" />
        <h2 className="text-sm font-semibold text-stone-700">그룹 정보</h2>
      </div>
      <div className="space-y-1">
        <p className="text-base font-medium text-stone-800">{club.name}</p>
        {club.description ? (
          <p className="text-sm text-stone-600 whitespace-pre-wrap">{club.description}</p>
        ) : (
          <p className="text-sm text-stone-400">아직 소개가 없어요.</p>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/club/ClubInfoReadOnly.tsx
git commit -m "$(cat <<'EOF'
feat(club): add ClubInfoReadOnly (non-admin view)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: `AdminTransferSection` component

**Files:**
- Create: `components/club/AdminTransferSection.tsx`

- [ ] **Step 1: Create the component**

```typescript
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Crown, Loader2 } from 'lucide-react';
import { transferAdmin } from '@/lib/actions/club-members';
import { Button } from '@/components/ui/button';
import type { ClubActiveMember } from '@/lib/queries/clubs';

export function AdminTransferSection({
  clubId,
  activeMembers,
  currentUserId,
}: {
  clubId: string;
  activeMembers: ClubActiveMember[];
  currentUserId: string;
}) {
  const router = useRouter();
  const others = activeMembers.filter((m) => m.user_id !== currentUserId);
  const [selected, setSelected] = useState<string>('');
  const [transferring, setTransferring] = useState(false);

  async function handleTransfer() {
    if (!selected || transferring) return;
    const target = others.find((m) => m.user_id === selected);
    if (!target) return;
    if (!confirm(`${target.display_name} 님에게 관리자 권한을 이양할까요? 이양 후엔 본인이 일반 멤버가 됩니다.`)) return;
    setTransferring(true);
    const result = await transferAdmin(clubId, selected);
    setTransferring(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success('관리자 권한을 이양했어요.');
    router.refresh();
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Crown className="w-4 h-4 text-stone-500" />
        <h2 className="text-sm font-semibold text-stone-700">관리자 이양</h2>
      </div>

      {others.length === 0 ? (
        <p className="text-sm text-stone-500">이양할 다른 멤버가 없어요.</p>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-stone-500">새 관리자를 선택하면 본인은 일반 멤버가 됩니다.</p>
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="block w-full bg-stone-50 border border-stone-200 rounded-md px-3 py-2 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-stone-300"
          >
            <option value="">멤버 선택</option>
            {others.map((m) => (
              <option key={m.user_id} value={m.user_id}>{m.display_name}</option>
            ))}
          </select>
          <Button
            onClick={handleTransfer}
            disabled={!selected || transferring}
            variant="outline"
            className="gap-1"
          >
            {transferring ? <Loader2 className="w-4 h-4 animate-spin" /> : <Crown className="w-4 h-4" />}
            이양하기
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
git add components/club/AdminTransferSection.tsx
git commit -m "$(cat <<'EOF'
feat(club): add AdminTransferSection

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: `DangerZoneSection` component (leave or delete depending on role)

**Files:**
- Create: `components/club/DangerZoneSection.tsx`

- [ ] **Step 1: Create the component**

```typescript
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Trash2, LogOut, Loader2, AlertTriangle } from 'lucide-react';
import { leaveClub, deleteClub } from '@/lib/actions/club-members';
import { Button } from '@/components/ui/button';

export function DangerZoneSection({
  clubId,
  clubName,
  isAdmin,
}: {
  clubId: string;
  clubName: string;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleLeave() {
    if (busy) return;
    if (!confirm(`정말 "${clubName}"에서 탈퇴할까요? 이 그룹의 모임에 다시 참여하려면 새 초대링크가 필요해요.`)) return;
    setBusy(true);
    const result = await leaveClub(clubId);
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success('그룹을 탈퇴했어요.');
    router.push('/clubs');
    router.refresh();
  }

  async function handleDelete() {
    if (busy) return;
    const confirmed = prompt(
      `정말 "${clubName}"을(를) 삭제할까요? 모든 모임/참석/발제문이 함께 사라지고 복구할 수 없어요.\n\n계속하려면 그룹 이름을 정확히 입력해주세요:`
    );
    if (confirmed !== clubName) {
      if (confirmed !== null) toast.error('이름이 일치하지 않아 취소했어요.');
      return;
    }
    setBusy(true);
    const result = await deleteClub(clubId);
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success('그룹을 삭제했어요.');
    router.push('/clubs');
    router.refresh();
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 text-red-500" />
        <h2 className="text-sm font-semibold text-red-700">위험 영역</h2>
      </div>

      {isAdmin ? (
        <div className="space-y-2 p-3 border border-red-200 rounded-xl bg-red-50/30">
          <p className="text-sm text-stone-700">
            그룹 삭제는 되돌릴 수 없어요. 모든 모임/참석/발제문이 함께 삭제됩니다.
          </p>
          <Button
            onClick={handleDelete}
            disabled={busy}
            variant="destructive"
            className="gap-1"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            그룹 삭제
          </Button>
        </div>
      ) : (
        <div className="space-y-2 p-3 border border-stone-200 rounded-xl bg-stone-50">
          <p className="text-sm text-stone-700">
            탈퇴하면 이 그룹의 모임을 더 이상 볼 수 없어요. 다시 들어오려면 새 초대링크가 필요해요.
          </p>
          <Button
            onClick={handleLeave}
            disabled={busy}
            variant="outline"
            className="gap-1"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
            그룹 탈퇴
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
git add components/club/DangerZoneSection.tsx
git commit -m "$(cat <<'EOF'
feat(club): add DangerZoneSection (leave for members, delete for admins)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Update settings page — branch by role

The PR 3 settings page bails out for non-admins with `notFound`. PR 4 lets members in and shows the relevant sections.

**Files:**
- Modify: `app/(app)/clubs/[id]/settings/page.tsx` (replace entire content)

- [ ] **Step 1: Replace the page content**

```typescript
import { notFound } from 'next/navigation';
import {
  getClubById,
  getActiveInvite,
  getPendingApplicants,
  getClubActiveMembers,
} from '@/lib/queries/clubs';
import { getSupabaseServer } from '@/lib/supabase/server';
import { InviteLinkPanel } from '@/components/club/InviteLinkPanel';
import { PendingApplicantsList } from '@/components/club/PendingApplicantsList';
import { ClubInfoPanel } from '@/components/club/ClubInfoPanel';
import { ClubInfoReadOnly } from '@/components/club/ClubInfoReadOnly';
import { AdminTransferSection } from '@/components/club/AdminTransferSection';
import { DangerZoneSection } from '@/components/club/DangerZoneSection';

async function getCurrentRole(clubId: string): Promise<{
  role: 'admin' | 'member' | null;
  userId: string | null;
}> {
  const supabase = await getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { role: null, userId: null };
  const { data } = await supabase
    .from('club_members')
    .select('role')
    .eq('club_id', clubId)
    .eq('user_id', user.id)
    .maybeSingle();
  const role = data?.role;
  if (role === 'admin' || role === 'member') return { role, userId: user.id };
  return { role: null, userId: user.id };
}

export default async function ClubSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: clubId } = await params;
  const { role, userId } = await getCurrentRole(clubId);
  if (!role || !userId) notFound();

  const club = await getClubById(clubId);
  if (!club) notFound();

  if (role === 'admin') {
    const [invite, applicants, members] = await Promise.all([
      getActiveInvite(clubId),
      getPendingApplicants(clubId),
      getClubActiveMembers(clubId),
    ]);

    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-xl font-bold">{club.name} 설정</h1>
          <p className="text-sm text-stone-500">관리자 전용</p>
        </div>
        <ClubInfoPanel club={club} />
        <InviteLinkPanel clubId={clubId} initialInvite={invite} />
        <PendingApplicantsList clubId={clubId} initialApplicants={applicants} />
        <AdminTransferSection clubId={clubId} activeMembers={members} currentUserId={userId} />
        <DangerZoneSection clubId={clubId} clubName={club.name} isAdmin={true} />
      </div>
    );
  }

  // member view
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold">{club.name} 설정</h1>
        <p className="text-sm text-stone-500">멤버</p>
      </div>
      <ClubInfoReadOnly club={club} />
      <DangerZoneSection clubId={clubId} clubName={club.name} isAdmin={false} />
    </div>
  );
}
```

- [ ] **Step 2: Build**

Run: `pnpm build`
Expected: builds.

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/clubs/[id]/settings/page.tsx"
git commit -m "$(cat <<'EOF'
feat(clubs): expand /clubs/<id>/settings to handle admin + member views

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: ClubSwitcher — show settings link for all members

PR 3 only showed "그룹 설정" to admins. Now all active members can reach the page (members see read-only info + the leave button).

**Files:**
- Modify: `components/club/ClubSwitcher.tsx`

- [ ] **Step 1: Replace the admin-only block with an always-shown block**

Find:
```typescript
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
```

Replace with:
```typescript
        <DropdownMenuItem asChild>
          <Link href={`/clubs/${currentClub.id}/settings`} className="cursor-pointer gap-2">
            <Settings className="w-4 h-4" />
            그룹 설정
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
```

(The `currentRole` prop stays for now — `AdminTransferSection` and other admin-only chrome on the settings page itself use it indirectly. We can remove the prop entirely in PR 5 cleanup if nothing else needs it.)

- [ ] **Step 2: Build**

Run: `pnpm build`
Expected: builds.

- [ ] **Step 3: Commit**

```bash
git add components/club/ClubSwitcher.tsx
git commit -m "$(cat <<'EOF'
feat(club): ClubSwitcher shows 그룹 설정 link for all members

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Deploy gate (verify, push, PR, merge, db push, smoke)

- [ ] **Step 1: Local verification**

```bash
pnpm vitest run
pnpm tsc --noEmit
pnpm build
```
Expected: all green; route table unchanged from PR 3 (no new routes — just expanded settings).

- [ ] **Step 2: Local smoke (recommended — uses two browser sessions/incognito)**

`pnpm dev` → http://localhost:3000:
- As an admin of a test club: drop-down → "그룹 설정" → see info panel (edit name + save) → admin transfer section (others list or empty state) → danger zone shows "그룹 삭제"
- Transfer to another member: confirm dialog → success → role flips → page now shows the member view (read-only info + "그룹 탈퇴")
- The receiving user: refresh `/clubs/<id>/settings` → now sees the full admin view
- Try leaving as the admin (should be blocked with the "관리자는 탈퇴할 수 없어요" message)
- Group delete: type group name exactly into the prompt → success → bounced to `/clubs`

Kill dev server.

- [ ] **Step 3: Push**

```bash
git push -u origin feat/multi-tenant-settings-expansion
```

- [ ] **Step 4: PR**

Title: `feat(settings): club rename + admin transfer + leave + delete (PR 4)`
Body:
```markdown
## Summary
- `/clubs/<id>/settings` now renders for all active members (admin + member), branching by role
- Admins can: edit name + description, transfer admin to another member, delete the group
- Members can: view info + leave the group (admins are blocked from leaving and must transfer or delete first)
- New SECURITY DEFINER SQL function `transfer_admin` keeps the role swap atomic
- `ClubSwitcher` shows "그룹 설정" link for all members (was admin-only in PR 3)

## Out of scope (PR 5)
- Legacy `/meetings/*` route cleanup
- `profiles.approved` column drop
- RLS rewrite of meetings/attendances/discussion_questions to use `is_club_member()`

## Test plan
- [x] typecheck + vitest + build all pass
- [x] Local smoke: admin transfer, member leave, admin delete, "관리자는 탈퇴 불가" guard
- [ ] After merge: `supabase db push` for `transfer_admin`
- [ ] After merge: production smoke (rename real club; verify other smoke steps with a test account)
```

- [ ] **Step 5: Merge**

CI green → Squash and merge → Delete branch.

- [ ] **Step 6: Production migration**

```bash
git checkout main
git pull origin main
supabase db push
```
Confirm `y`. Applies `20260611000002_transfer_admin_function.sql`.

- [ ] **Step 7: Production smoke**

Visit https://book-club-five-nu.vercel.app/clubs/<부글부글 id>/settings:
- Edit name (try "부글부글 v2") → save → top-bar updates → revert back
- Edit description ("매월 둘째·넷째 토요일 …") → save → check display
- Admin transfer dropdown shows the three real members
- Do NOT transfer / delete the real 부글부글 group during smoke — verify the UI only

- [ ] **Step 8: Local cleanup**

```bash
git branch -D feat/multi-tenant-settings-expansion
```

---

## Done criteria

- ✅ Admin can edit name + description, transfer admin, delete the group
- ✅ Members can view info + leave
- ✅ Admin is blocked from leaving (must transfer or delete first)
- ✅ ClubSwitcher shows the settings link for everyone in the group
- ✅ `transfer_admin` function exists in production

## Out of scope for this PR

- Legacy `/meetings/*` route removal + `profiles.approved` drop + RLS rewrite of `meetings`/`attendances`/`discussion_questions` to use `is_club_member()` — all PR 5
- Group avatar / image upload (deferred per spec)
- Bulk member management (kick, role changes beyond admin transfer) — phase B+
