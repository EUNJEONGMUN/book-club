# 독서모임 이벤트 관리 웹 MVP — 설계 문서

- **작성일:** 2026-05-31
- **상태:** Draft (브레인스토밍 완료)
- **다음 단계:** Implementation Plan 작성

---

## 1. 개요

독서모임 주최/진행에서 발생하는 반복 업무(일정 안내, 참석 체크, 장소 공지, 발제문 공유, 멤버 관리)를 한 곳에서 처리하기 위한 모바일 우선 반응형 웹 애플리케이션. 단일 독서모임을 위한 비공개 도구로 시작한다.

### 핵심 가치 제안
- **호스트(=발제자):** "다음 모임 정보 + 발제문"을 한 번에 등록하고 공유 부담 감소
- **일반 멤버:** "다음 모임에서 내가 알아야 할 것"이 한 화면에 보임 (책, 일시, 장소, 참석 토글, 발제문)

---

## 2. 범위

### 2.1 In Scope (MVP)
1. 이메일 + 카카오 + 구글 소셜 로그인 (Supabase Auth)
2. 1회용 개인 초대 토큰 기반 가입
3. 모임 등록·수정·삭제 (호스트만)
4. 책 정보 입력 (제목, 저자, 표지 이미지 선택)
5. 모임 일시 등록 및 D-day 계산
6. 모임 장소 등록 (이름/주소/링크 자유 입력 — 오프라인·온라인 모두 지원)
7. 참석 체크 3-state (참석/불참/미정)
8. 발제문 등록·수정·삭제·순서 변경 (호스트만, 5~10개 권장)
9. 멤버 명단 및 활동 이력(총 참석/호스트 횟수)
10. 모바일 최적화 (하단 탭 네비, 터치 타겟 ≥44px)

### 2.2 Out of Scope (MVP 제외)
- 책 선정 투표 기능 (사용자가 명시적으로 제외)
- 발제문에 대한 답변 작성/공유 기능 (답변은 각자 머릿속에 준비)
- 다중 클럽 / 플랫폼화
- 알림(이메일·푸시·카카오톡) — 향후 고려
- 책 자동 검색·메타데이터 조회
- 모임 후기·평점
- 사진 갤러리·모임 후기 아카이브

---

## 3. 사용자 역할

수평적 구조로, 별도 관리자 역할 없음.

| 역할 | 권한 |
|---|---|
| **일반 멤버 (모든 사용자)** | 모임 보기, 본인 참석 토글, 초대 링크 생성, 본인 프로필 수정 |
| **모임 호스트(=발제자)** | 본인이 생성한 모임의 정보·발제문 등록·수정·삭제 |

- 모임을 생성한 사람이 자동으로 그 모임의 호스트가 됨
- 호스트는 모임 단위로 적용되는 컨텍스트성 역할 (영구적 역할 X)
- 발제자 = 호스트로 통합. 즉 모임을 만든 사람이 그 모임의 발제문을 책임짐

---

## 4. 화면 구조

### 4.1 네비게이션

모바일 하단 고정 탭 3개:

| 탭 | 아이콘 | 역할 |
|---|---|---|
| 홈 | 🏠 | 다음 모임 카드 1개 + 빠른 액션 |
| 모임 | 📅 | 다가오는/지난 모임 리스트, 새 모임 등록 |
| 더보기 | ⚙️ | 멤버 명단, 초대, 프로필, 로그아웃 |

### 4.2 화면 트리

```
[로그인 / 가입] (인증 가드 외부)
  └─ /login, /signup?token=<token>

(인증된 사용자 영역)
  ├─ /                        # 🏠 홈
  ├─ /meetings                # 📅 모임 리스트
  │   ├─ /meetings/new        # 모임 등록
  │   └─ /meetings/[id]       # 모임 상세
  │       └─ /meetings/[id]/edit  # 모임 수정 (호스트만)
  └─ /more                    # ⚙️ 더보기
      ├─ /more/profile        # 프로필 편집
      └─ /more/invite         # 초대 링크 관리
```

### 4.3 화면별 핵심 요소

#### 🏠 홈
- **다음 모임 카드** (단 1개, 가장 가까운 미래 모임)
  - 책 표지 + 제목/저자
  - D-day, 일시
  - 장소 (이름 + 링크/주소 진입 버튼)
  - 호스트 이름
  - 참석 토글 3-state
  - "발제문 N개" 진입 버튼
- 모임 없음 빈 상태: 일러스트 + "첫 모임 만들기" CTA

#### 📅 모임 리스트
- 상단: 다가오는 모임 (시간순)
- 하단: 지난 모임 (역시간순, "더보기"로 펼침)
- 우측 상단 `+` (누구나) → 모임 등록 페이지
- 각 카드 탭 → 모임 상세

#### 모임 상세
- 헤더: 책 정보 + 일시 + D-day
- 장소 카드 (지도/링크 진입)
- 호스트 표시
- 참석 현황 (참석 N / 불참 M / 미정 L, 멤버 목록 펼침 가능)
- 발제문 리스트 (번호 매김)
- 호스트만: 모임 정보 수정 / 발제문 추가·편집·삭제·순서 변경
- 호스트만: 모임 삭제 (확인 모달)

#### ⚙️ 더보기
- 내 프로필 (이름·사진·로그아웃)
- 멤버 명단 (카드 리스트: 이름·사진·참석/호스트 횟수)
- 초대 링크 관리 진입

#### /more/invite
- "초대 링크 생성" 버튼
- 내가 만든 초대 리스트 (상태: 진행 중 / 사용됨(누구) / 만료됨)
- 진행 중인 초대는 URL 복사 가능

---

## 5. 데이터 모델

### 5.1 테이블

#### `profiles` (Supabase `auth.users` 확장)
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | UUID, PK, FK→auth.users.id | |
| display_name | text, NOT NULL | |
| avatar_url | text, nullable | Supabase Storage URL |
| joined_at | timestamptz, NOT NULL, default now() | |

#### `meetings`
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | UUID, PK | |
| host_id | UUID, FK→profiles.id, NOT NULL | 모임 생성자 = 호스트 |
| book_title | text, NOT NULL | |
| book_author | text, NOT NULL | |
| book_cover_url | text, nullable | Supabase Storage URL |
| scheduled_at | timestamptz, NOT NULL | |
| location_name | text, NOT NULL | 예: "강남역 스타벅스", "줌" |
| location_url | text, nullable | 지도 링크 또는 줌 URL |
| location_address | text, nullable | |
| created_at | timestamptz, NOT NULL, default now() | |
| updated_at | timestamptz, NOT NULL, default now() | |

인덱스: `scheduled_at` (다음 모임 조회용), `host_id`

#### `attendances`
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | UUID, PK | |
| meeting_id | UUID, FK→meetings.id ON DELETE CASCADE, NOT NULL | |
| user_id | UUID, FK→profiles.id, NOT NULL | |
| status | enum('attending','not_attending','undecided'), NOT NULL | |
| updated_at | timestamptz, NOT NULL, default now() | |

제약: `UNIQUE(meeting_id, user_id)` — 한 모임당 한 멤버 한 행

#### `discussion_questions`
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | UUID, PK | |
| meeting_id | UUID, FK→meetings.id ON DELETE CASCADE, NOT NULL | |
| order_idx | int, NOT NULL | 0부터 시작, 명시적 정렬 |
| content | text, NOT NULL | |
| created_at | timestamptz, NOT NULL, default now() | |

인덱스: `(meeting_id, order_idx)`

#### `invites`
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | UUID, PK | |
| token | text, UNIQUE, NOT NULL | 랜덤 32자 |
| created_by | UUID, FK→profiles.id, NOT NULL | |
| created_at | timestamptz, NOT NULL, default now() | |
| expires_at | timestamptz, NOT NULL, default now() + interval '7 days' | |
| used_by | UUID, FK→profiles.id, nullable | |
| used_at | timestamptz, nullable | |

규칙: `used_by IS NOT NULL` ⇒ 사용된 상태, 재사용 불가

### 5.2 RLS 정책

| 테이블 | 작업 | 정책 |
|---|---|---|
| profiles | SELECT | 인증된 사용자 모두 |
| profiles | UPDATE | 본인 (`id = auth.uid()`) |
| meetings | SELECT | 인증된 사용자 모두 |
| meetings | INSERT | 인증된 사용자, `host_id = auth.uid()` 강제 |
| meetings | UPDATE/DELETE | `host_id = auth.uid()` |
| attendances | SELECT | 인증된 사용자 모두 |
| attendances | UPSERT | 본인 (`user_id = auth.uid()`) |
| discussion_questions | SELECT | 인증된 사용자 모두 |
| discussion_questions | INSERT/UPDATE/DELETE | 해당 meeting의 host (`meeting.host_id = auth.uid()`) |
| invites | SELECT | 본인이 만든 것 (`created_by = auth.uid()`) |
| invites | INSERT | 인증된 사용자, `created_by = auth.uid()` 강제 |
| invites | UPDATE | DB 클라이언트에서 직접 금지. 가입 Server Action에서 service role로 처리 |

### 5.3 주요 쿼리

- **다음 모임 1개:** `SELECT * FROM meetings WHERE scheduled_at >= now() ORDER BY scheduled_at ASC LIMIT 1`
- **다가오는 모임 리스트:** 위와 동일하되 LIMIT 없음
- **지난 모임 리스트:** `WHERE scheduled_at < now() ORDER BY scheduled_at DESC`
- **참석 현황 집계:** `SELECT status, count(*) FROM attendances WHERE meeting_id = ? GROUP BY status`
- **멤버 활동 이력:** `attendances` 카운트(status=attending) + `meetings` 카운트(host_id) per profile

---

## 6. 사용자 흐름

### 6.1 가입 (초대 링크)
1. 초대 링크 클릭 (`/signup?token=...`)
2. 서버: `invites` 조회 → 토큰 검증 (존재/미만료/미사용)
3. 검증 실패 시 에러 페이지 (사유별 메시지)
4. 검증 통과 시 가입 페이지 노출 (이메일·비밀번호 또는 소셜)
5. 가입 완료 시 트랜잭션으로:
   - `profiles` 행 생성 (display_name 입력)
   - `invites.used_by`, `used_at` 업데이트
6. 🏠 홈으로 이동

### 6.2 새 모임 등록 (멤버 누구나)
1. 📅 모임 탭 → `+` 버튼
2. 폼 입력: 책 제목/저자/표지(선택)/일시/장소 이름·주소·링크
3. 제출 → `meetings` 행 생성 (`host_id = auth.uid()`)
4. 모임 상세 페이지로 이동
5. "발제문 추가하기" 안내 배너

### 6.3 발제문 등록 (호스트만)
1. 모임 상세 → 발제문 섹션 → "질문 추가"
2. textarea 입력 → 저장
3. `order_idx = max(order_idx) + 1`로 자동 부여
4. 수정/삭제/순서 변경 가능
5. 가이드 텍스트: "5~10개 권장" (강제 X)

### 6.4 참석 체크 (본인)
1. 🏠 홈 또는 모임 상세에서 토글 3-state
2. 탭 시 즉시 저장 (낙관적 업데이트)
3. 참석 현황 즉시 갱신

### 6.5 초대 링크 생성 (멤버 누구나)
1. ⚙️ 더보기 → 초대 관리
2. "초대 링크 생성" → 1회용 토큰 생성, URL 클립보드 복사
3. 카카오톡 등으로 외부 공유
4. 진행 중인 초대 리스트에서 상태 확인 가능

---

## 7. 기술 아키텍처

### 7.1 스택

| 레이어 | 선택 |
|---|---|
| 프레임워크 | Next.js 15 (App Router) |
| 언어 | TypeScript |
| UI | Tailwind CSS + shadcn/ui |
| 데이터 패칭 | Server Components + Server Actions (기본), 클라이언트 상호작용은 SWR |
| 인증 | Supabase Auth (Email + Google + Kakao OAuth) |
| DB | Supabase Postgres |
| 파일 저장 | Supabase Storage (책 표지, 프로필 사진) |
| 폼 | React Hook Form + Zod |
| 날짜 | date-fns (locale: ko) |
| 토스트 | shadcn `Sonner` |
| 배포 | Vercel |

### 7.2 디렉토리 구조

```
book-club/
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   ├── signup/page.tsx
│   │   └── auth/callback/route.ts
│   ├── (app)/
│   │   ├── layout.tsx            # 하단 탭 네비, 인증 가드
│   │   ├── page.tsx              # 🏠 홈
│   │   ├── meetings/
│   │   │   ├── page.tsx          # 📅 리스트
│   │   │   ├── new/page.tsx
│   │   │   └── [id]/
│   │   │       ├── page.tsx
│   │   │       └── edit/page.tsx
│   │   └── more/
│   │       ├── page.tsx
│   │       ├── profile/page.tsx
│   │       └── invite/page.tsx
│   ├── error.tsx
│   ├── not-found.tsx
│   └── layout.tsx
├── components/
│   ├── ui/                       # shadcn
│   ├── meeting/
│   │   ├── MeetingCard.tsx
│   │   ├── NextMeetingCard.tsx
│   │   ├── AttendanceToggle.tsx        # client
│   │   ├── DiscussionQuestionList.tsx
│   │   └── DiscussionQuestionForm.tsx  # client
│   ├── member/MemberCard.tsx
│   └── layout/BottomNav.tsx
├── lib/
│   ├── supabase/
│   │   ├── server.ts
│   │   ├── client.ts
│   │   └── middleware.ts
│   ├── actions/
│   │   ├── meetings.ts
│   │   ├── attendance.ts
│   │   ├── questions.ts
│   │   └── invite.ts
│   ├── queries/
│   │   ├── meetings.ts
│   │   └── members.ts
│   └── validation/                # Zod 스키마
├── middleware.ts                  # Supabase 세션
└── supabase/
    └── migrations/
        ├── 001_init.sql           # 테이블 + 인덱스
        ├── 002_rls.sql            # RLS 정책
        └── 003_storage_buckets.sql
```

### 7.3 데이터 흐름

```
[Server Component]
  → lib/queries/* (Supabase server client, RLS 적용)
  → 초기 데이터 SSR
  → 클라이언트 컴포넌트로 props 전달

[Client Component] (참석 토글, 발제문 폼 등)
  → Server Action 호출 (lib/actions/*)
  → Supabase server client + RLS
  → revalidatePath / revalidateTag
  → UI 자동 갱신
```

### 7.4 인증 가드
- `middleware.ts`에서 `(app)/*` 전체 보호. 미인증 시 `/login` 리다이렉트
- 페이지 layout에서 `auth.uid()` 확인 + DB 단에서 RLS로 이중 방어

### 7.5 에러 처리
- **Server Actions:** `{ ok: false, error: string }` 반환 → 클라이언트 토스트
- **Server Components 페치 실패:** Next.js `error.tsx` 경계 + 재시도
- **404:** `not-found.tsx` (모임 없음, 잘못된 초대 토큰)
- **권한 위반:** RLS가 차단 → "권한이 없습니다" 안내

### 7.6 테스트 전략 (MVP)
- **단위:** Zod 스키마, 날짜/정렬 유틸 (Vitest)
- **통합:** Supabase 로컬(`supabase start`) + Server Action 호출
- **E2E (1개):** Playwright — "초대 링크 가입 → 모임 등록 → 발제문 추가 → 참석 체크"
- UI 컴포넌트 단위 테스트는 MVP에서 생략

### 7.7 Supabase Storage 버킷

| 버킷 | 용도 | 접근 정책 |
|---|---|---|
| `book-covers` | 책 표지 이미지 | 인증된 사용자 읽기, 모임 호스트가 업로드 |
| `avatars` | 프로필 사진 | 인증된 사용자 읽기, 본인만 자신의 파일 업로드 |

- 파일 경로 규칙: `book-covers/<meeting_id>.<ext>`, `avatars/<user_id>.<ext>`
- 이미지 사이즈 제한: 5 MB
- 허용 확장자: jpg, jpeg, png, webp

### 7.8 모바일 최적화
- viewport: `width=device-width, initial-scale=1, maximum-scale=1`
- 하단 탭 네비 고정 + `safe-area-inset-bottom` 적용
- 터치 타겟 최소 44px
- `next/image`로 책 표지 자동 최적화
- (선택) PWA manifest로 홈 화면 추가 가능

---

## 8. 결정 사항 요약

| 항목 | 결정 | 근거 |
|---|---|---|
| 클럽 모델 | 단일 클럽 (Club 테이블 없음) | YAGNI, MVP 최소화 |
| 역할 | 수평적, 영구 관리자 없음 | 사용자 명시 선택 |
| 호스트 = 발제자 | 모임 생성자 = 그 모임 호스트 | 사용자 명시 선택 |
| 책 선정 | MVP 제외 | 사용자 명시 제외 |
| 발제문 답변 | 사이트에 저장 안 함 | 사용자 명시 선택 |
| 책 ↔ 모임 | 1:1 (모임당 책 1권) | 사용자 명시 선택 |
| 초대 | 1회용 개인 토큰 (7일 만료) | 단일 공유 토큰 대비 보안·추적 향상 |
| 인증 | Email + Google + Kakao | 사용자 명시 선택 |

---

## 9. 향후 확장 (Out of Scope)

- 모임 알림 (Web Push / 카카오톡 알림톡)
- 책 선정 투표
- 발제문 답변 작성·공유
- 모임 후기·사진
- 책 자동 검색 (Aladin/Google Books API)
- 통계 대시보드 (월별 참석률, 가장 활발한 멤버 등)
- 다중 클럽 지원 (Club 테이블 도입, 멤버십 분리)
- 모임 반복 일정 (매주 X요일 자동 생성)
