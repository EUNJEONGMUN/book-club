# Spec — Multi-tenant 그룹 + 초대 시스템 (Phase A)

## Goal

부글부글을 단일 그룹 앱에서 **N개 그룹을 지원하는 multi-tenant 서비스**로 전환한다. 사용자가 그룹을 직접 만들거나, 초대링크로 다른 그룹에 가입할 수 있다. setlog와 유사한 모델.

## Background

현재 부글부글은 closed beta 단일 그룹:
- `profiles.approved = true` 인 사용자는 모든 모임을 다 볼 수 있음
- 관리자(`EUNJEONGMUN`)가 supabase studio에서 수동으로 `approved` 토글
- 모든 RLS 정책이 "approved 사용자면 접근 가능" 기반
- (참고: `20260601000001_drop_invites.sql`에서 한 번 invites 테이블이 있었다가 drop됨 — 이번 작업이 그 방향의 부활 + 확장)

이번 phase A는 multi-tenant 전환의 핵심 골격을 만든다. 권한 세분화(co-admin, 강퇴, 알림 등)는 후속 phase로 분리.

## 결정 사항 (12개)

| # | 항목 | 결정 |
|---|------|------|
| 1 | 그룹 생성 권한 | **인증된 사용자 누구나** 새 그룹 만들 수 있음. 만든 사람이 그 그룹의 admin |
| 2 | 가입 흐름 | **회원가입/로그인 → 초대코드 입력 → 가입 신청 → admin 승인 → 멤버**. (친구가 보낸 URL 클릭한 경우 회원가입 후 token이 자동 보존되어 같은 신청 페이지로 이동) |
| 3 | 앱 회원가입 | open (누구나 가능, `profiles.approved` 제거) |
| 4 | 마이그레이션 | default "부글부글" 그룹 자동 생성, `EUNJEONGMUN`이 admin, 현재 approved 사용자 모두 멤버로 이전 |
| 5 | 용어 | 한국어: 그룹 / 모임. DB: `clubs` / `meetings` (SQL `groups`는 reserved word라 피함) |
| 6 | 모임 생성 권한 | 그룹 멤버 누구나 (host = 만든 사람), 현재 모델 유지 |
| 7 | URL 구조 | `/clubs/<id>/meetings/<id>` 만. 기존 `/meetings/<id>`는 제거 (404). 친구들에게는 이번 multi-tenant deploy와 함께 한 번에 안내 예정이라 사전 호환성 redirect 불필요 |
| 8 | 그룹 전환 UI | `/clubs` 목록 페이지 + 그룹 내부에서 상단 드롭다운 |
| 9 | 첫 진입 | 그룹 0개 → onboarding 화면 (**"그룹 만들기" + "초대코드 입력" 두 옵션 모두 노출**). 그룹 1개+ → `/clubs` 항상 거침 (자동 진입 X). 친구 없는 신규 사용자도 그룹 만들기로 시작 가능 |
| 10 | 초대링크 | 그룹당 1개 active, 다회용, 30일 만료, admin이 재발급 가능 |
| 11 | 그룹 정보 | 생성 시 **이름만 필수**. 설명(`description`)은 nullable로 schema에 두고 admin이 `/clubs/<id>/settings`에서 나중에 수정 가능. 표지 이미지는 phase B+ |
| 12 | admin 권한 | single admin + 이양 가능. co-admin/강퇴는 phase B |

## 데이터 모델

### 새 테이블

```sql
-- 그룹
CREATE TABLE clubs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,  -- nullable. 생성 시엔 안 받고, 이후 admin이 settings에서 수정
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- 삭제 정책: clubs 삭제 시 모든 child (club_members, club_invites, meetings 및 그
-- meetings의 attendances/discussion_questions/discussion_files)가 CASCADE로 함께 삭제됨.
-- meetings.club_id의 FK도 ON DELETE CASCADE로 선언 (아래 참조).

-- 멤버십 + 가입 신청 (같은 테이블, role로 구분)
CREATE TYPE club_member_role AS ENUM ('admin', 'member', 'pending');

CREATE TABLE club_members (
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role club_member_role NOT NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (club_id, user_id)
);

CREATE INDEX club_members_user_idx ON club_members(user_id);

-- 초대링크 (그룹당 1개 active이지만, 재발급 이력 위해 row 자체는 여러 개)
CREATE TABLE club_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '30 days'),
  revoked_at TIMESTAMPTZ  -- 재발급 시 이전 invite의 revoked_at 세팅
);

CREATE INDEX club_invites_token_idx ON club_invites(token) WHERE revoked_at IS NULL;
CREATE INDEX club_invites_club_active_idx ON club_invites(club_id) WHERE revoked_at IS NULL;
```

**Invariant**: 한 그룹당 `revoked_at IS NULL AND expires_at > now()` 인 invite row는 최대 1개. 애플리케이션 코드에서 강제 (DB unique partial index로도 가능하나 expires_at 시간 비교가 partial에 안 됨 → 코드에서 강제 + 가끔 정리).

### 기존 테이블 변경

```sql
-- meetings에 club_id 추가 (마이그레이션 단계에서 NOT NULL 강제)
-- ON DELETE CASCADE: 그룹 삭제 시 그 그룹의 모든 모임도 삭제 (attendances/questions은 이미 meetings에 CASCADE)
ALTER TABLE meetings ADD COLUMN club_id UUID REFERENCES clubs(id) ON DELETE CASCADE;
-- (마이그레이션 후) ALTER TABLE meetings ALTER COLUMN club_id SET NOT NULL;
CREATE INDEX meetings_club_id_idx ON meetings(club_id);

-- profiles.approved 제거
ALTER TABLE profiles DROP COLUMN approved;
```

### RLS 재작성 (전면)

핵심 변화: 모든 정책이 "이 user가 이 club의 active member(`role IN ('admin','member')`)인가?" 기준으로 변경.

**도우미 SQL function** (자주 쓰니까 정의):
```sql
CREATE OR REPLACE FUNCTION is_club_member(target_club_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM club_members
    WHERE club_id = target_club_id
      AND user_id = auth.uid()
      AND role IN ('admin', 'member')
  );
$$;

CREATE OR REPLACE FUNCTION is_club_admin(target_club_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM club_members
    WHERE club_id = target_club_id
      AND user_id = auth.uid()
      AND role = 'admin'
  );
$$;
```

**테이블별 정책**:

- `clubs`:
  - SELECT: 자신이 active member(admin/member, pending 제외)인 그룹만
  - INSERT: 인증된 사용자 누구나
  - UPDATE: admin만 (이름/설명 수정)
  - DELETE: admin만
- `club_members`:
  - SELECT: 자신이 active member인 그룹의 모든 member row (pending 포함, admin이 신청자 보려면 필요)
  - INSERT: **RLS로는 직접 금지**. 가입 신청은 token 검증이 필수라 server action(`SECURITY DEFINER` 함수)에서만 우회 INSERT. 그룹 만들기 시 admin row INSERT도 server action에서 처리
  - UPDATE: admin이 그 그룹의 pending → member 승인, 또는 admin↔member 이양 (atomic 트랜잭션)
  - DELETE: 본인 row 삭제 (탈퇴, 단 admin이면 거부 — 이양 또는 그룹 삭제 먼저) OR admin이 다른 멤버 삭제 (강퇴는 phase B지만 RLS 자체는 미리 열어둠)
- `club_invites`: admin만 SELECT/INSERT/UPDATE. token으로 가입 신청 시 server action이 `SECURITY DEFINER` 함수로 우회.
- `meetings`: 그룹 멤버만 SELECT. INSERT/UPDATE/DELETE는 host 또는 admin. → 변경: 기존 "approved" → "is_club_member(club_id)"
- `discussion_questions`, `attendances`, `discussion_file_url`: 같은 패턴, meeting의 club_id 기준

## URL 구조

| URL | 페이지 |
|-----|--------|
| `/` | 진입 라우터 (server component) — 인증 안 됐으면 `/login`, 인증됐는데 그룹 0개면 `/onboarding`, 1개+면 `/clubs`로 server-side redirect |
| `/onboarding` | 그룹 0개 사용자용. **"그룹 만들기" 버튼 + "초대코드 입력" 폼** 두 옵션 모두 노출. token 직접 paste 시 URL 전체 붙여넣어도 token 추출 |
| `/clubs` | 내가 속한 그룹 카드 리스트 |
| `/clubs/new` | 그룹 만들기 폼 (이름 입력). 인증만 확인. 그룹 0개여도 만들기 가능 |
| `/clubs/<id>` | 그룹 홈 — 기존 홈 화면 레이아웃 (다음 모임 카드 등) 재사용 |
| `/clubs/<id>/meetings/new` | 모임 만들기 폼 |
| `/clubs/<id>/meetings/<id>` | 모임 상세 (기존 `/meetings/<id>` 레이아웃 그대로) |
| `/clubs/<id>/meetings/<id>/edit` | 모임 수정 |
| `/clubs/<id>/settings` | 그룹 설정 (admin만) — 이름 + 설명 수정, 초대링크 발급/재발급, 가입 신청 승인/거절, admin 이양, 그룹 삭제 |
| `/join?token=<token>` | 초대링크 진입점. 로그인 안 됐으면 `/login?next=/join?token=...`로 보냄. 로그인 됐으면 그룹 이름 표시 + "가입 신청" 버튼 |

**제거되는 경로** (404 처리, redirect 없음):
- `/meetings/...` 전부 (`/meetings`, `/meetings/<id>`, `/meetings/new`, `/meetings/<id>/edit`)

**기존 `/more`, `/more/profile` 페이지**: 그룹과 무관하니 **`/more` 그대로 유지** (URL 변경 없음). 본인 프로필 수정은 어느 그룹에 있든 같은 페이지.

## 핵심 user flows

### A. 회원가입 (open)
1. 누구나 `/signup`에서 가입 가능 (`profiles.approved` 체크 제거)
2. 가입 직후 `/` 진입 → 그룹 0개 → `/onboarding`으로 자동 이동
3. onboarding에서 **"그룹 만들기" + "초대코드 입력"** 두 옵션 중 선택

### B. 그룹 만들기
1. `/clubs/new` 폼: 이름 입력 (description은 만들 때 안 받음)
2. 인증만 확인 (그룹 0개여도 OK)
3. POST → `clubs` row INSERT + `club_members` (role=admin) INSERT (atomic, 트랜잭션)
4. `/clubs/<new-id>`로 이동
5. 이후 `/clubs/<id>/settings`에서 admin이 description 추가/수정 가능

### C. 초대링크 발급
1. admin이 `/clubs/<id>/settings`의 "초대링크" 섹션 진입
2. 이미 active invite 있으면 그 link 표시 (`https://.../join?token=<token>`) + "복사" / "재발급" 버튼
3. 없으면 "발급" 버튼 → token 생성 (`crypto.randomUUID()` 또는 random base64 16자) + expires_at 30일 + INSERT
4. "재발급" 클릭 시 기존 invite의 `revoked_at = now()` + 새 row INSERT (atomic)

### D. 가입 신청 (두 진입 경로)

**경로 1 — 회원가입 후 onboarding에서 코드 입력 (default)**:
1. 친구가 카톡으로 초대링크/코드 받음
2. `/signup` → 회원가입 → `/onboarding`
3. "초대코드 입력" 폼에 token (또는 URL 전체) 붙여넣기 → 제출
4. server action이 token 검증 후 `/clubs/<id>/join` 같은 신청 페이지로 이동

**경로 2 — 친구 URL 직접 클릭 (편의 경로)**:
1. 친구가 `https://.../join?token=<token>` 보냄
2. 로그인 안 됐으면 `/login?next=/join?token=...` (또는 `/signup?next=...`). 발견 #5의 next 보존 패턴 활용
3. 로그인/가입 완료 후 `/join?token=...`로 자동 복귀
4. token 검증 후 같은 신청 페이지로 이동

**공통 — 신청 단계**:
1. token 검증 (server action, SECURITY DEFINER):
   - invite row 조회 (revoked_at IS NULL AND expires_at > now())
   - 없으면 "만료되었거나 유효하지 않은 링크" 에러
   - 있으면 club_id 추출 → 그룹 이름 + "가입 신청" 버튼 표시
2. "가입 신청" 클릭 → server action이 `club_members` (role=pending) INSERT
3. 이미 pending 또는 멤버면 idempotent 처리 ("이미 신청 완료" 또는 "이미 멤버")
4. 신청 후 사용자에게 "admin 승인 대기 중" 안내 (페이지 또는 toast)

### E. 가입 승인 / 거절
1. admin이 `/clubs/<id>/settings`의 "가입 신청" 섹션에 pending 리스트 표시
2. "승인" → `UPDATE club_members SET role = 'member' WHERE club_id = ? AND user_id = ?`
3. "거절" → `DELETE FROM club_members WHERE club_id = ? AND user_id = ? AND role = 'pending'`

### F. admin 이양
1. admin이 `/clubs/<id>/settings`의 "admin 이양" 섹션 → 멤버 리스트 (role='member'만)
2. 멤버 선택 → 확인 다이얼로그
3. 트랜잭션: 본인 role 'admin' → 'member', 대상 role 'member' → 'admin'

### G. 그룹 전환
- 어느 그룹 페이지에서나 상단 드롭다운: 현재 그룹 이름 표시. 클릭 시 내가 속한 다른 그룹 리스트 + "그룹 목록" 항목 (`/clubs`로 이동)
- 그룹 선택 시 `/clubs/<other-id>`

### H. 모임 보기
- `/clubs/<club-id>/meetings/<meeting-id>` — 기존 `MeetingDetailHeader` + Attendance + DiscussionFileUploader 등 그대로 사용
- RLS가 그룹 멤버 아니면 결과 없음 (`notFound()`)
- 멤버 아닌데 URL 알게 된 사용자: "이 모임은 [그룹이름]의 모임입니다. 가입 신청하시겠어요?" UI는 phase B (지금은 단순 404)

### I. 그룹 탈퇴
- `/clubs/<id>/settings`에서 "그룹 탈퇴" 버튼 (admin이 아닐 때만 노출)
- 본인 club_members row DELETE
- admin은 탈퇴 불가 (먼저 이양하거나 그룹 삭제)
- **attendances는 그대로 유지**: 탈퇴해도 과거 참석 이력은 모임에 남음 (역사 기록). 단 RLS로 탈퇴 후엔 그 모임 자체를 볼 수 없음. 재가입 시 과거 attendances 다시 보임

## 마이그레이션 전략

**단일 마이그레이션 SQL**로 처리 (다운타임 짧게):

```sql
BEGIN;

-- 1. 새 테이블 + enum + 함수 생성 (위 schema 참조)

-- 2. meetings.club_id 추가 (nullable)
ALTER TABLE meetings ADD COLUMN club_id UUID REFERENCES clubs(id);

-- 3. default '부글부글' 그룹 INSERT (created_by = 본인 user id)
-- '<EUNJEONGMUN_USER_ID>' 는 마이그레이션 SQL 파일 작성 시 supabase studio →
-- Authentication → Users에서 EUNJEONGMUN의 실제 UUID로 치환. 하드코딩 의도적
-- (1회성 데이터 마이그레이션이라 일회용)
WITH default_club AS (
  INSERT INTO clubs (name, created_by)
  VALUES ('부글부글', '<EUNJEONGMUN_USER_ID>')
  RETURNING id
)
-- 4. 모든 기존 meetings에 default club_id 세팅
UPDATE meetings SET club_id = (SELECT id FROM default_club);

-- 5. approved=true 사용자 모두 멤버로 (본인은 admin)
INSERT INTO club_members (club_id, user_id, role)
SELECT
  (SELECT id FROM clubs WHERE name = '부글부글' LIMIT 1),
  id,
  CASE WHEN id = '<EUNJEONGMUN_USER_ID>' THEN 'admin' ELSE 'member' END
FROM profiles
WHERE approved = true;

-- 6. meetings.club_id NOT NULL 강제
ALTER TABLE meetings ALTER COLUMN club_id SET NOT NULL;

-- 7. 기존 RLS 정책 drop + 새 정책 적용 (테이블별)

-- 8. profiles.approved 컬럼 drop
ALTER TABLE profiles DROP COLUMN approved;

COMMIT;
```

**리스크**:
- 트랜잭션 중에 어디서든 실패하면 ROLLBACK (그래서 BEGIN/COMMIT)
- 적용 시점에 사용자 in-flight 요청이 새 RLS 정책에 잠시 실패할 수 있음 — Supabase 단일 region이라 sub-second
- 코드 deploy와 SQL 마이그레이션 사이 race: SQL을 코드 deploy **전에** 돌리면 기존 코드가 `profiles.approved` 참조하다 실패. SQL을 **후에** 돌리면 새 코드가 `clubs` 테이블 참조하다 실패. → **둘 다 한 번에**가 어려우니, 호환성을 위해 2단계로:
  1. **1단계 deploy**: 새 코드를 schema 양쪽 다 호환되게 (`approved` 있어도/없어도 동작, `clubs` 있어도/없어도 동작) — 비현실적
  2. **현실적 접근**: 단일 maintenance window (5-10분). 사용자에게 "잠깐 점검 중" 페이지 → SQL 마이그레이션 → 새 코드 deploy → 점검 종료

베타 단계라 maintenance window가 허용됨. 운영 사용자가 늘면 staged migration 필요.

## Phase A scope

### In
- 새 테이블 3개 (`clubs`, `club_members`, `club_invites`) + enum + helper 함수
- `meetings.club_id` 추가 + NOT NULL
- `profiles.approved` 제거
- RLS 전면 재작성
- 마이그레이션 SQL + 데이터 이전
- URL 구조 전면 변경 (`/clubs/<id>/...`)
- 그룹 만들기 / 그룹 설정 (이름+설명 수정) / 초대링크 발급+재발급 / 가입 신청 (onboarding 코드 입력 + URL 직접 클릭 둘 다) / 승인+거절 / admin 이양 / 그룹 탈퇴 / 그룹 삭제
- 그룹 목록 페이지 (`/clubs`) + 상단 드롭다운 + onboarding (그룹 만들기 + 코드 입력 두 옵션)
- 기존 모임/참석/발제문/공유 흐름은 그대로 (URL prefix만 추가)

### Out (phase B+)
- co-admin (여러 명 admin)
- 멤버 강퇴 (admin이 다른 멤버 추방)
- 알림 (admin에게 가입 신청 도착 알림)
- 그룹 검색 / 공개 그룹 디스커버리
- 그룹 표지 이미지 또는 이모지
- 그룹 만들 때 description 함께 입력 (현재는 만든 후 settings에서만 수정)
- `/me/clubs` 같은 본인이 속한 그룹 통합 뷰

## 위험 노트 + 완화

| 위험 | 영향 | 완화 |
|------|------|------|
| RLS 전면 재작성 시 정책 실수 → 데이터 접근 사고 | Critical | 마이그레이션 SQL 적용 전 로컬 supabase에서 전체 시나리오 테스트 (각 role의 SELECT/INSERT/UPDATE/DELETE). server action 단위 테스트(phase 3 작업)로 RLS 회귀 보호 |
| 마이그레이션 중 사용자 in-flight 요청 실패 | Medium | maintenance window 5-10분 + 점검 페이지 (베타라 허용됨). 친구들에게 카톡으로 사전 안내 |
| 기존 `/meetings/<id>` URL 깨짐 | Low | 이번 multi-tenant deploy와 함께 친구들에게 안내 카톡 발송 예정 (사전 안내 없이도 OK) |
| `clubs` 테이블 이름이 SQL reserved word 충돌? | Low | `clubs`는 reserved word 아님 (`groups`만 reserved). 안전 |
| 단일 트랜잭션 마이그레이션이 큰 데이터에서 느림 | Low | 베타라 row 수 작음 (수십~수백). 운영 사용자 늘면 별도 strategy |
| admin이 single인데 잠수 → 그룹 orphan | Low | admin 이양 기능 있음. 정 안 되면 supabase studio에서 수동 |

## Implementation 메모 (plan 단계 참고)

- **PR 분할 전략**: 단일 거대 PR vs 작게 쪼개기. 권장 분할:
  1. PR 1: 새 schema + 마이그레이션 SQL (코드 변경 X, DB만 — 단 RLS는 기존 정책 두고 새 정책 추가만 안전)
  2. PR 2: 새 라우팅 + 그룹 CRUD + onboarding + 그룹 전환 UI
  3. PR 3: 초대링크 발급/재발급 + 가입 신청 + 승인 흐름
  4. PR 4: admin 이양 + 그룹 탈퇴/삭제
  5. PR 5: cleanup — 기존 `/meetings/*` route 제거 + `profiles.approved` drop
- **Server action 위치**: `lib/actions/clubs.ts`, `lib/actions/club-invites.ts`, `lib/actions/club-members.ts` 로 분리
- **Query 위치**: `lib/queries/clubs.ts`
- **token 생성**: `crypto.randomUUID()` (Node 19+ 내장. 추가 의존성 없음)
- **token URL**: `https://book-club-five-nu.vercel.app/join?token=<token>` (subdomain X, query param 사용)
- **단위 테스트** (다음 phase 3와 자연스럽게 연결됨): server action에 권한 케이스 (admin/member/pending/non-member × 각 action) 매트릭스 테스트

## Out of scope (이 spec에서 다루지 않음)

- phase B, C 계획
- Vercel/Supabase 환경변수 변경
- Sentry alert 룰 변경
- 디자인 시스템 변경

## PR 1 Deployment Notes (2026-06-10)

PR 1 (`feat/multi-tenant-schema`) production deploy 후 발견 사항. 다음 phase 작업 시 참고.

### 1. EUNJEONGMUN 실제 production 이메일

spec/plan 초안은 `scone@ignite.co.kr` (회사 이메일)을 가정했지만, 실제 Supabase auth에 등록된 본인 계정은 **`munej26@gmail.com`** (Google OAuth 가입). 데이터 마이그레이션이 production에서 0 rows로 실행됨 — 부글부글 club + 멤버 backfill 모두 실패.

**Production fix**: SQL Editor에서 정확한 이메일(`munej26@gmail.com`)로 수동 INSERT/UPDATE 실행. 결과: 부글부글 club 1개, admin 1명(본인), member 3명(프레쳴/스콘/시나몬), meetings 10개 모두 club_id 채워짐.

**Migration file fix (follow-up commit)**: `supabase/migrations/20260609000002_multi_tenant_data.sql`의 이메일을 `munej26@gmail.com`으로 정정. 단발성 backfill이라 production에 재적용 영향은 없으나 reference + 향후 환경 정확성을 위함.

### 2. `supabase db reset` 순서로 인한 local default club 미생성

`supabase db reset`은 **migrations → seed** 순서로 실행. seed.sql의 사용자가 마이그레이션 시점엔 아직 없어서 `auth.users` lookup이 0 rows. 결과: 로컬에선 부글부글 club 자동 생성 안 됨.

**대안 (필요 시)**:
- 로컬 환경에서 부글부글 club이 필요하면 `supabase db reset` 후 `supabase/migrations/20260609000002_multi_tenant_data.sql`을 psql로 한 번 더 수동 실행
- 또는 PR 2+에서 seed.sql에 default club + 멤버를 직접 INSERT하도록 추가 (마이그레이션이 아닌 seed에 시드 데이터로)

### 3. Production 사용자 이메일 (참고)

- `munej26@gmail.com` — 문은정 (본인, admin)
- `graphpaper07@gmail.com` — 프레쳴 (member)
- `beagentleman7@gmail.com` — 스콘 (member)
- `happy@naver.com` — 시나몬 (member)
- `munej26@naver.com` — auth.users에는 있으나 profile 미생성 (signup 도중 이탈 추정)
