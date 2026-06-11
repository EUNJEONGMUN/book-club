# Multi-tenant Phase A — PR 5: Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close out Phase A by deleting everything the new multi-tenant model superseded — the legacy `/meetings/*` routes and queries, the global `profiles.approved` gate (middleware + admin UI + queries + action + `/pending` page), and the temporary RLS that let any approved user see any meeting. Replace the meeting/attendance/question RLS with club-membership-based policies, lock down `meetings.club_id` to NOT NULL, and drop the `approved` column.

**Architecture:** One DB migration does the heavy lifting: drop the four legacy meeting policies + the attendance/question policies, replace them with `is_club_member()`-scoped equivalents (host-only writes stay host-only, but everything is now also gated by the host's club membership), tighten `meetings.club_id` to NOT NULL, and drop `profiles.approved`. App-side: rip out the `approved`-related middleware branch, queries, server action, and `/more` admin chrome, plus the legacy `/meetings/*` pages and their now-unused queries.

**Tech Stack:** Next.js 16 App Router, Supabase Postgres (RLS rewrite), TypeScript, pnpm.

**Reference spec:** `docs/superpowers/specs/2026-06-09-multi-tenant-clubs-design.md`

**PR shape:** Single PR. The code cleanup and DB cleanup are interlocked — middleware that reads `approved` would crash the moment the column is dropped, and the new RLS only makes sense once the app has stopped trusting "approved means everything visible". Ship together.

**⚠️ Risk note (highest of phase A):** RLS rewrite affects every read of `meetings`/`attendances`/`discussion_questions`. A typo in any policy = data leak or 0-row blackout. The migration MUST be tested locally end-to-end (each role × each table × each operation) before pushing.

---

## File Structure

### New files

| File | Purpose |
|------|---------|
| `supabase/migrations/20260611000003_phase_a_cleanup.sql` | RLS rewrite + meetings.club_id NOT NULL + profiles.approved drop, all in one transaction |

### Modified files

| File | What changes |
|------|--------------|
| `lib/database.types.ts` | Regenerate after migration |
| `lib/supabase/middleware.ts` | Drop the approved branch (`!profile.approved` → `/pending` redirect) and the `/pending` entry in `isPublic` |
| `lib/queries/members.ts` | Remove approved-based filter functions |
| `lib/queries/meetings.ts` | Remove unused legacy queries (`getNextMeeting`, `getUpcomingMeetings`, `getPastMeetings`); keep `getMeetingDetail` and `getHostedMeetings` which are still referenced |
| `lib/actions/admin.ts` | Remove the `approve` action (the file itself goes away if `approve` was its only export) |
| `components/club/ClubSwitcher.tsx` | Remove the now-unused `currentRole` prop |
| `app/(app)/clubs/[id]/layout.tsx` | Stop computing/passing `currentRole` to `ClubSwitcher` |
| `components/meeting/MeetingCard.tsx` | Simplify the `club_id ? new : legacy` link to just the new URL (club_id is NOT NULL now) |
| `components/meeting/NextMeetingCard.tsx` | Same simplification |

### Deleted files

| File | Why |
|------|-----|
| `app/(app)/meetings/page.tsx` | Legacy meetings list — replaced by `/clubs/<id>/meetings` in PR 2 |
| `app/(app)/meetings/new/page.tsx` | Legacy create — replaced by `/clubs/<id>/meetings/new` |
| `app/(app)/meetings/[id]/page.tsx` | Legacy detail — replaced by `/clubs/<id>/meetings/<meetingId>` |
| `app/(app)/meetings/[id]/edit/page.tsx` | Legacy edit — replaced by `/clubs/<id>/meetings/<meetingId>/edit` |
| `app/(app)/meetings/[id]/edit/edit-form.tsx` | Only used by the legacy edit page above. (Verify no other importers in T8.) |
| `app/(auth)/pending/page.tsx` | Pending state no longer exists |
| `app/(app)/more/approve-button.tsx` | UI to approve users — admin no longer manages approval |
| `app/(app)/more/settings-tabs.tsx` | Tabs for pending/approved user lists — same |

### Untouched (deferred to phase B+)

- `profiles.is_admin` column — kept for now; spec didn't require dropping it
- Anything in `/more/profile` (user's own profile editing)

---

## Pre-flight

- [ ] `git checkout main && git pull origin main` — should show PR 4 (`a2a20d8 Feat/multi tenant settings expansion (#21)`) at HEAD
- [ ] `git checkout -b feat/multi-tenant-cleanup`
- [ ] Confirm local Supabase running: `supabase status`
- [ ] Confirm `meetings.club_id` has zero NULLs locally (the migration would fail otherwise — but our seed has no meetings so this is trivially true):
  ```bash
  PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
    -c "SELECT COUNT(*) AS null_count FROM meetings WHERE club_id IS NULL;"
  ```
  Expected: `0`.

---

## Task 1: Cleanup migration (RLS + NOT NULL + drop column)

This is the single most consequential change in phase A. Drop all the legacy policies on `meetings`/`attendances`/`discussion_questions`, replace them with `is_club_member()`-scoped policies (host-only writes preserved, but every read/write also requires club membership), tighten `meetings.club_id` to NOT NULL, and drop `profiles.approved`.

**Files:**
- Create: `supabase/migrations/20260611000003_phase_a_cleanup.sql`

- [ ] **Step 1: Create the file with this exact content**

```sql
-- Phase A · PR 5: cleanup migration
-- 1. Replace legacy RLS on meetings / attendances / discussion_questions with
--    club-membership-scoped policies. (host_id-based write checks stay; SELECT becomes
--    "must be an active member of the meeting's club".)
-- 2. Make meetings.club_id NOT NULL (PR 1 backfill already populated every row).
-- 3. Drop profiles.approved — the column is no longer read by any code path after PR 5.

BEGIN;

-- =====================================================
-- meetings
-- =====================================================
DROP POLICY IF EXISTS meetings_select ON meetings;
DROP POLICY IF EXISTS meetings_insert ON meetings;
DROP POLICY IF EXISTS meetings_update_host ON meetings;
DROP POLICY IF EXISTS meetings_delete_host ON meetings;

CREATE POLICY meetings_select_member ON meetings
  FOR SELECT TO authenticated
  USING (is_club_member(club_id));

CREATE POLICY meetings_insert_member_host ON meetings
  FOR INSERT TO authenticated
  WITH CHECK (host_id = auth.uid() AND is_club_member(club_id));

CREATE POLICY meetings_update_host ON meetings
  FOR UPDATE TO authenticated
  USING (host_id = auth.uid() AND is_club_member(club_id))
  WITH CHECK (host_id = auth.uid() AND is_club_member(club_id));

CREATE POLICY meetings_delete_host ON meetings
  FOR DELETE TO authenticated
  USING (host_id = auth.uid() AND is_club_member(club_id));

-- =====================================================
-- attendances (scope via meeting → club)
-- =====================================================
DROP POLICY IF EXISTS attendances_select ON attendances;
DROP POLICY IF EXISTS attendances_upsert_own ON attendances;
DROP POLICY IF EXISTS attendances_update_own ON attendances;

CREATE POLICY attendances_select_member ON attendances
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM meetings m
      WHERE m.id = attendances.meeting_id AND is_club_member(m.club_id)
    )
  );

CREATE POLICY attendances_insert_own_member ON attendances
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM meetings m
      WHERE m.id = meeting_id AND is_club_member(m.club_id)
    )
  );

CREATE POLICY attendances_update_own_member ON attendances
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM meetings m
      WHERE m.id = attendances.meeting_id AND is_club_member(m.club_id)
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM meetings m
      WHERE m.id = attendances.meeting_id AND is_club_member(m.club_id)
    )
  );

-- =====================================================
-- discussion_questions (scope via meeting → club + host writes)
-- =====================================================
DROP POLICY IF EXISTS questions_select ON discussion_questions;
DROP POLICY IF EXISTS questions_insert_host ON discussion_questions;
DROP POLICY IF EXISTS questions_update_host ON discussion_questions;
DROP POLICY IF EXISTS questions_delete_host ON discussion_questions;

CREATE POLICY questions_select_member ON discussion_questions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM meetings m
      WHERE m.id = discussion_questions.meeting_id AND is_club_member(m.club_id)
    )
  );

CREATE POLICY questions_insert_host_member ON discussion_questions
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM meetings m
      WHERE m.id = meeting_id
        AND m.host_id = auth.uid()
        AND is_club_member(m.club_id)
    )
  );

CREATE POLICY questions_update_host_member ON discussion_questions
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM meetings m
      WHERE m.id = discussion_questions.meeting_id
        AND m.host_id = auth.uid()
        AND is_club_member(m.club_id)
    )
  );

CREATE POLICY questions_delete_host_member ON discussion_questions
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM meetings m
      WHERE m.id = discussion_questions.meeting_id
        AND m.host_id = auth.uid()
        AND is_club_member(m.club_id)
    )
  );

-- =====================================================
-- meetings.club_id NOT NULL
-- =====================================================
ALTER TABLE meetings ALTER COLUMN club_id SET NOT NULL;

-- =====================================================
-- profiles.approved DROP
-- =====================================================
ALTER TABLE profiles DROP COLUMN approved;

COMMIT;
```

- [ ] **Step 2: Apply locally**

Run: `supabase db reset`
Expected: completes; new migration applies cleanly.

- [ ] **Step 3: Verify the new policy set**

```bash
PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -c "
SELECT tablename, COUNT(*) AS policy_count
FROM pg_policies
WHERE tablename IN ('meetings','attendances','discussion_questions','clubs','club_members','club_invites')
GROUP BY tablename ORDER BY tablename;"
```
Expected:
- `attendances`: 3 (select_member, insert_own_member, update_own_member)
- `clubs`: 4 (unchanged from PR 1)
- `club_invites`: 3 (unchanged)
- `club_members`: 3 (unchanged)
- `discussion_questions`: 4 (select_member, insert_host_member, update_host_member, delete_host_member)
- `meetings`: 4 (select_member, insert_member_host, update_host, delete_host)

- [ ] **Step 4: Verify the column changes**

```bash
PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -c "
SELECT column_name, is_nullable FROM information_schema.columns
WHERE table_name = 'meetings' AND column_name = 'club_id';"
```
Expected: `is_nullable = NO`.

```bash
PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -c "
SELECT column_name FROM information_schema.columns
WHERE table_name = 'profiles' AND column_name = 'approved';"
```
Expected: 0 rows.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260611000003_phase_a_cleanup.sql
git commit -m "$(cat <<'EOF'
feat(schema): phase A cleanup — RLS rewrite + club_id NOT NULL + drop approved

Rewrites meetings/attendances/discussion_questions RLS to be scoped by
club membership via is_club_member(). Host-only writes are preserved
and additionally require the host to still be in the meeting's club.

Tightens meetings.club_id to NOT NULL (PR 1 backfilled every row) and
drops the now-unused profiles.approved column. After this migration the
app's "anyone approved can see everything" model is gone — only active
club members see their club's meetings/attendances/questions.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Regenerate `lib/database.types.ts`

The dropped column + the NOT NULL change both affect generated types.

**Files:**
- Modify: `lib/database.types.ts`

- [ ] **Step 1: Regenerate**

Run: `supabase gen types typescript --local 2>/dev/null > lib/database.types.ts`

- [ ] **Step 2: Verify `approved` is gone**

Run: `grep "approved" lib/database.types.ts || echo "(no matches — expected)"`
Expected: `(no matches — expected)`.

- [ ] **Step 3: Verify `club_id` is non-nullable**

Run: `grep -A1 "club_id" lib/database.types.ts | head -10`
Expected: shows `club_id: string` (no `| null`) in the Row shape; the Insert/Update may still allow `| null` — that's fine.

- [ ] **Step 4: Typecheck (expect errors!)**

Run: `pnpm tsc --noEmit`
Expected: **errors** in any file that still references `approved` (middleware, queries/members.ts, actions/admin.ts, /more components). Don't fix them yet — Tasks 3-6 do that.

- [ ] **Step 5: Commit types only**

```bash
git add lib/database.types.ts
git commit -m "$(cat <<'EOF'
chore(types): regenerate database.types.ts after cleanup migration

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Remove `approved` branch from middleware

**Files:**
- Modify: `lib/supabase/middleware.ts`

- [ ] **Step 1: Inspect current content**

Run: `cat lib/supabase/middleware.ts`

You'll see two `if` blocks for authenticated-with-profile handling. The profile fetch selects `id, approved`, and there's an `if (!profile.approved) { redirect /pending }` block.

- [ ] **Step 2: Strip the approved branch**

Replace lines 41–62 (the `if (user && !isPublic) { ... }` block) with:

```typescript
  // 인증됐지만 profile 없는 경우 (예: 구글 OAuth 첫 로그인) → /signup 으로 이동
  if (user && !isPublic) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', user.id)
      .maybeSingle();
    if (!profile) {
      const url = req.nextUrl.clone();
      const originalNext = req.nextUrl.pathname + req.nextUrl.search;
      url.pathname = '/signup';
      url.search = '';
      if (originalNext !== '/') url.searchParams.set('next', originalNext);
      return NextResponse.redirect(url);
    }
  }
```

Also remove `/pending` from the `isPublic` check on line 26:

```typescript
  const isPublic = path.startsWith('/login') || path.startsWith('/signup') || path.startsWith('/auth');
```

- [ ] **Step 3: Typecheck**

Run: `pnpm tsc --noEmit`
Expected: no errors in `middleware.ts` (other files in tasks 4–6 may still error).

- [ ] **Step 4: Commit**

```bash
git add lib/supabase/middleware.ts
git commit -m "$(cat <<'EOF'
fix(middleware): drop approved-gate + /pending public branch

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Remove approved-based functions from `lib/queries/members.ts`

**Files:**
- Modify: `lib/queries/members.ts`

- [ ] **Step 1: Inspect current content**

Run: `cat lib/queries/members.ts`

Find the functions that filter `.eq('approved', true)` (~line 29) and `.eq('approved', false)` (~line 55). These are used by the legacy admin chrome we're deleting in Task 6.

- [ ] **Step 2: Delete both functions**

Open `lib/queries/members.ts`, delete the entire `getApprovedMembers` (or however it's named — the one with `.eq('approved', true)`) and the entire `getPendingMembers`-style function. Keep `getCurrentProfile` and anything else that doesn't touch `approved`.

- [ ] **Step 3: Typecheck (may surface call-site errors)**

Run: `pnpm tsc --noEmit`
Expected: errors only at the call sites for the deleted functions, which Task 6 will remove.

- [ ] **Step 4: Commit**

```bash
git add lib/queries/members.ts
git commit -m "$(cat <<'EOF'
chore(queries): remove approved-based member queries

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Remove `approve` action from `lib/actions/admin.ts`

**Files:**
- Modify (or delete): `lib/actions/admin.ts`

- [ ] **Step 1: Inspect the file**

Run: `cat lib/actions/admin.ts`

If `approve` (the action that writes `.update({ approved: true })`) is the only exported function in the file, delete the whole file. Otherwise, just delete the `approve` function and its imports if they became unused.

- [ ] **Step 2: Apply the deletion**

If deleting the whole file:
```bash
git rm lib/actions/admin.ts
```

If only deleting the function: open the file, remove the `approve` export and any imports (e.g. `revalidatePath`) that are no longer used.

- [ ] **Step 3: Typecheck**

Run: `pnpm tsc --noEmit`
Expected: errors only at the import sites for the deleted action — Task 6 will fix those.

- [ ] **Step 4: Commit**

```bash
git add lib/actions/admin.ts
git commit -m "$(cat <<'EOF'
chore(actions): remove approve admin action (approved column dropped)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Strip approved-related admin UI from `/more`

**Files:**
- Delete: `app/(app)/more/approve-button.tsx`
- Delete: `app/(app)/more/settings-tabs.tsx`
- Modify: `app/(app)/more/page.tsx`

- [ ] **Step 1: Inspect `app/(app)/more/page.tsx`**

Run: `cat app/\(app\)/more/page.tsx`

Note which of `approve-button` / `settings-tabs` it imports, and what UI sections call those imports. The non-admin chrome (logout-button, navigation to profile editing) should stay.

- [ ] **Step 2: Delete the two component files**

```bash
git rm "app/(app)/more/approve-button.tsx" "app/(app)/more/settings-tabs.tsx"
```

- [ ] **Step 3: Edit `app/(app)/more/page.tsx`**

Remove the imports for `ApproveButton`, `SettingsTabs` (and anything else that no longer exists — like the deleted query functions from Task 4 or the deleted `approve` action from Task 5). Remove the JSX sections that rendered them. Keep the page's other functionality (logout, profile link, anything else the page still does).

Read the file carefully and produce a minimal edit — don't restructure unrelated chrome.

- [ ] **Step 4: Typecheck**

Run: `pnpm tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/more/page.tsx" "app/(app)/more/approve-button.tsx" "app/(app)/more/settings-tabs.tsx"
git commit -m "$(cat <<'EOF'
chore(more): remove approve-button + settings-tabs (admin approval UI)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Delete `/pending` page

The middleware no longer redirects anyone here, and there's no approved-gate to wait for.

**Files:**
- Delete: `app/(auth)/pending/page.tsx`

- [ ] **Step 1: Verify the file exists and isn't imported elsewhere**

Run: `ls "app/(auth)/pending/" 2>&1 && grep -rn "/pending\|/(auth)/pending" app components lib 2>&1 | grep -v ".next"`

Expected: file exists; no remaining imports/links (the middleware change in Task 3 already removed the only programmatic redirect).

- [ ] **Step 2: Delete**

```bash
git rm "app/(auth)/pending/page.tsx"
# Also remove the empty directory if git keeps it:
rmdir "app/(auth)/pending" 2>/dev/null || true
```

- [ ] **Step 3: Build (catches missing-route errors)**

Run: `pnpm build`
Expected: builds. `/pending` is no longer in the route table.

- [ ] **Step 4: Commit**

```bash
git add "app/(auth)/pending/page.tsx"
git commit -m "$(cat <<'EOF'
chore(auth): delete /pending page (approved gate removed)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Delete legacy `/meetings/*` routes

**Files:**
- Delete: `app/(app)/meetings/page.tsx`
- Delete: `app/(app)/meetings/new/page.tsx`
- Delete: `app/(app)/meetings/[id]/page.tsx`
- Delete: `app/(app)/meetings/[id]/edit/page.tsx`
- Delete: `app/(app)/meetings/[id]/edit/edit-form.tsx`

- [ ] **Step 1: Verify nothing outside `app/(app)/meetings/*` imports those files**

Run:
```bash
grep -rn "from '@/app/(app)/meetings\|from \"@/app/(app)/meetings" app components lib 2>&1 | grep -v ".next"
```
Expected: 0 hits (the new `/clubs/[id]/meetings/[meetingId]/edit/page.tsx` does NOT import the legacy `edit-form` — it constructs its own form. Verify before deleting.)

If `edit-form.tsx` IS imported by the new club-scoped edit page, then DO NOT delete it. Instead, move it next to the new page or keep it in place and only delete the legacy `page.tsx` files. Adjust the deletion list accordingly.

- [ ] **Step 2: Delete the legacy pages**

```bash
git rm "app/(app)/meetings/page.tsx" \
       "app/(app)/meetings/new/page.tsx" \
       "app/(app)/meetings/[id]/page.tsx" \
       "app/(app)/meetings/[id]/edit/page.tsx" \
       "app/(app)/meetings/[id]/edit/edit-form.tsx"
# (Skip edit-form.tsx from the rm list if Step 1 showed it's still imported.)
rmdir "app/(app)/meetings/[id]/edit" "app/(app)/meetings/[id]" "app/(app)/meetings/new" "app/(app)/meetings" 2>/dev/null || true
```

- [ ] **Step 3: Build**

Run: `pnpm build`
Expected: builds. `/meetings/*` no longer in the route table.

- [ ] **Step 4: Commit**

```bash
git add -A "app/(app)/meetings/"
git commit -m "$(cat <<'EOF'
chore(meetings): remove legacy /meetings/* routes (superseded by /clubs/<id>/meetings/*)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Remove unused legacy queries from `lib/queries/meetings.ts`

After Task 8 nothing reads `getNextMeeting`/`getUpcomingMeetings`/`getPastMeetings` — those were only used by the old `/` home page (now an entry router) and `/meetings` list page (now deleted).

**Files:**
- Modify: `lib/queries/meetings.ts`

- [ ] **Step 1: Confirm zero callers**

Run:
```bash
grep -rn "getNextMeeting\b\|getUpcomingMeetings\b\|getPastMeetings\b" app components lib 2>&1 | grep -v ".next" | grep -v "lib/queries/meetings.ts"
```
Expected: 0 lines.

- [ ] **Step 2: Delete the three function bodies + the now-unused `NextMeeting` type**

Open `lib/queries/meetings.ts`. Delete:
- The `NextMeeting` type export (its only consumer was `getNextMeeting`)
- The whole `getNextMeeting` function
- The whole `getUpcomingMeetings` function
- The whole `getPastMeetings` function

Keep `getMeetingDetail`, `MeetingDetail`, `getHostedMeetings`, and `getMyAttendance` — they're still imported by the new club-scoped pages.

If any imports become unused after this (e.g. `Profile` only used by `NextMeeting`), remove them too.

- [ ] **Step 3: Typecheck**

Run: `pnpm tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add lib/queries/meetings.ts
git commit -m "$(cat <<'EOF'
chore(queries): remove unused legacy meetings queries

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Simplify `MeetingCard` + `NextMeetingCard` links

Now that `meetings.club_id` is NOT NULL, the `club_id ? new : legacy` fallback in both cards is dead code. Collapse to the new URL only.

**Files:**
- Modify: `components/meeting/MeetingCard.tsx`
- Modify: `components/meeting/NextMeetingCard.tsx`

- [ ] **Step 1: `MeetingCard.tsx` — simplify the href**

Find:
```typescript
    <Link
      href={meeting.club_id ? `/clubs/${meeting.club_id}/meetings/${meeting.id}` : `/meetings/${meeting.id}`}
      className="block"
    >
```

Replace with:
```typescript
    <Link href={`/clubs/${meeting.club_id}/meetings/${meeting.id}`} className="block">
```

- [ ] **Step 2: `NextMeetingCard.tsx` — same simplification**

Find:
```typescript
        <Link href={meeting.club_id ? `/clubs/${meeting.club_id}/meetings/${meeting.id}` : `/meetings/${meeting.id}`}>
```

Replace with:
```typescript
        <Link href={`/clubs/${meeting.club_id}/meetings/${meeting.id}`}>
```

- [ ] **Step 3: Typecheck**

Run: `pnpm tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/meeting/MeetingCard.tsx components/meeting/NextMeetingCard.tsx
git commit -m "$(cat <<'EOF'
chore(meeting): drop legacy URL fallback from MeetingCard/NextMeetingCard

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Drop `currentRole` prop from `ClubSwitcher`

After PR 4 Task 11, `currentRole` no longer affects what the dropdown shows (the settings link is unconditional). Remove the prop and the layout's role-derivation chore.

**Files:**
- Modify: `components/club/ClubSwitcher.tsx`
- Modify: `app/(app)/clubs/[id]/layout.tsx`

- [ ] **Step 1: `ClubSwitcher.tsx` — remove the prop**

Open `components/club/ClubSwitcher.tsx`. In the props type, delete the `currentRole: 'admin' | 'member';` line. The component body doesn't reference `currentRole` anymore (PR 4 made the settings link unconditional), so no body changes needed.

- [ ] **Step 2: `app/(app)/clubs/[id]/layout.tsx` — stop computing/passing role**

Open `app/(app)/clubs/[id]/layout.tsx`. Remove the `currentRole = myClubs.find(...)?.role` line and the `if (!currentRole) notFound()` guard (the existing `if (!club) notFound()` is sufficient — `getClubById` only returns rows the RLS lets the caller see, which means they're already an active member). Update the `<ClubSwitcher>` call to drop the `currentRole={currentRole}` line.

The layout becomes:

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

  return (
    <>
      <header className="sticky top-0 z-40 bg-white border-b border-stone-100">
        <div className="max-w-md mx-auto px-4 py-3">
          <ClubSwitcher
            currentClub={{ id: club.id, name: club.name }}
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
chore(club): drop unused currentRole prop from ClubSwitcher + layout

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Deploy gate (verify, push, PR, merge, db push, smoke)

- [ ] **Step 1: Full local verification**

```bash
pnpm vitest run
pnpm tsc --noEmit
pnpm build
```
Expected: all green. Route table no longer contains `/meetings`, `/meetings/[id]`, `/meetings/[id]/edit`, `/meetings/new`, or `/pending`.

- [ ] **Step 2: Local smoke — RLS sanity (most important risk)**

`pnpm dev` → http://localhost:3000. As a logged-in user:
- `/` → `/clubs` (if any clubs) or `/onboarding` (if zero)
- Create a test club, then a meeting inside it. Verify the meeting appears in `/clubs/<id>/meetings` and the detail page works.
- Log in as a different account that is NOT in the same club → directly visit `/clubs/<other-club-id>/meetings` → should 404 (RLS hides the club itself) and any attempt to hit `/clubs/<other-id>/meetings/<meeting-id>` should also 404.

Kill the dev server.

- [ ] **Step 3: Push**

```bash
git push -u origin feat/multi-tenant-cleanup
```

- [ ] **Step 4: PR**

Title: `feat(cleanup): RLS rewrite + drop approved + remove legacy meetings/* (PR 5)`
Body:
```markdown
## Summary
- Rewrites meetings/attendances/discussion_questions RLS to use is_club_member()
- Makes meetings.club_id NOT NULL (PR 1 already backfilled every row)
- Drops profiles.approved + every code path that touched it
  - Middleware no longer redirects to /pending
  - /pending page removed
  - /more admin chrome (approve button + settings tabs) removed
  - approve admin action + approved-based member queries removed
- Removes legacy /meetings/* routes + the queries only they used
- Simplifies MeetingCard/NextMeetingCard links (club_id is NOT NULL)
- Drops unused currentRole prop from ClubSwitcher

## Risk
- RLS rewrite is the highest-risk change in phase A. Verified locally
  that own-club meetings still load and cross-club access 404s.
- Single transaction migration — if anything fails the whole thing
  rolls back.

## Test plan
- [x] typecheck + vitest + build all pass
- [x] Local RLS smoke: own-club access works, cross-club access blocked
- [ ] After merge: `supabase db push` to apply the cleanup migration
- [ ] After merge: production smoke — login → /clubs → enter 부글부글 → meetings list → a meeting detail → attendance toggle → share. Verify legacy /meetings/<id> URLs now 404.

## What this closes
Phase A is complete after this merge. Multi-tenant clubs are live with
invites, approval, admin management, and the legacy single-tenant model
is fully removed.
```

- [ ] **Step 5: Merge**

CI green → Squash and merge → Delete branch.

- [ ] **Step 6: Production migration**

```bash
git checkout main
git pull origin main
supabase db push
```
Confirm `y`. Applies `20260611000003_phase_a_cleanup.sql`.

- [ ] **Step 7: Production smoke**

Visit https://book-club-five-nu.vercel.app/:
- `/` → `/clubs` redirect
- Enter 부글부글 → home shows next meeting → list shows past + upcoming → meeting detail loads → attendance toggle works
- Try a legacy URL directly: `https://book-club-five-nu.vercel.app/meetings/<a-known-meeting-id>` → expect 404
- Try `https://book-club-five-nu.vercel.app/pending` → expect 404

- [ ] **Step 8: Local cleanup**

```bash
git branch -D feat/multi-tenant-cleanup
```

---

## Done criteria

- ✅ `profiles.approved` is gone from the schema; no code references it
- ✅ RLS on meetings/attendances/discussion_questions is club-scoped
- ✅ `meetings.club_id` is NOT NULL
- ✅ Legacy `/meetings/*` and `/pending` routes are gone
- ✅ App still behaves identically for an active member of 부글부글
- ✅ Cross-club access returns 404

## What's out of scope (phase B+)

- `profiles.is_admin` cleanup — global app admin concept survives this PR; can be retired or re-purposed in phase B
- Group avatar / image (deferred per spec)
- Co-admin / member kick (deferred per spec)
- The `/more` page's remaining navigation polish — only the admin chrome was removed; the page still renders profile link + logout
