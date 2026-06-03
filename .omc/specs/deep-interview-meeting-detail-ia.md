# Deep Interview Spec: 모임 상세 페이지 IA 리팩터링 — 발제문 중심 + 헤더 햄버거 메뉴

## Metadata
- Interview ID: meeting-detail-ia-2026-06-03
- Rounds: 8 (Round 0 topology + 8 Q&A)
- Final Ambiguity Score: ~14%
- Type: brownfield
- Generated: 2026-06-03
- Threshold: 0.2
- Threshold Source: default
- Initial Context Summarized: no
- Status: PASSED

## Clarity Breakdown
| Dimension | Score | Weight | Weighted |
|-----------|-------|--------|----------|
| Goal Clarity | 0.90 | 0.35 | 0.315 |
| Constraint Clarity | 0.80 | 0.25 | 0.200 |
| Success Criteria | 0.85 | 0.25 | 0.213 |
| Context Clarity | 0.85 | 0.15 | 0.128 |
| **Total Clarity** | | | **0.856** |
| **Ambiguity** | | | **0.144 (14%)** |

## Topology

| Component | Status | Description | Coverage / Deferral Note |
|---|---|---|---|
| 헤더 햄버거 메뉴 | active | 모임 상세 헤더 우측 "…" 메뉴로 호스트 액션 통합 | 메뉴 항목: 모임 정보 수정 / 모임 삭제 / 공유. 하단 MeetingActions 제거 |
| 발제문 IA | active | 상세 페이지를 발제문(자료 + 질문) 중심으로 재구성 | 참석 토글/현황 섹션 제거 |
| 홈 탭 참석 | active | 다음 모임 카드에 AttendanceToggle + AttendanceSummary 동시 노출 | 기존 AttendanceSummary 디자인 유지, 위치만 이동 |
| 공유 (신규) | active | 헤더 메뉴 "공유" → 현재 페이지 링크 복사 | navigator.clipboard + toast 알림 |

## Goal

호스트가 모임 상세 페이지에서 보는 "수정" 버튼이 모임 정보 수정인지 발제문 수정인지 헷갈리는 문제를 해결한다. 동시에 상세 페이지의 주인공을 **발제문(자료 + 질문)** 으로 재정의하고, 참석 관련 기능(토글, 누가 올지)은 홈 탭의 다음 모임 카드로 이전한다. 호스트 메타데이터 액션(수정/삭제/공유)은 상세 헤더 우측 "…" 메뉴로 통합한다.

## Constraints

- 기존 발제 자료(PDF) 업로드/Gemini 추출 기능은 유지 (수정 없음)
- 기존 발제 질문 CRUD(추가/편집/삭제) 기능은 유지 (수정 없음)
- 기존 `/meetings/[id]/edit` 페이지는 그대로 유지 (헤더 메뉴 "모임 정보 수정"이 이 페이지로 이동)
- 모바일 우선 UX 유지
- 비호스트는 "…" 메뉴를 보지 않는다 (호스트 전용)
- 홈 탭의 다음 모임 카드는 한 개만 존재 (`getNextMeeting()` 결과)

## Non-Goals

- 발제문/발제 질문 기능 자체의 변경 (PDF 파싱, 마크다운, 미리보기 등 그대로)
- 모임 정보 수정 폼(`/edit`)의 디자인 변경
- 과거/완료된 모임에 대한 별도 UI 추가
- 새로운 알림/푸시 기능 추가
- 인증/권한 모델 변경

## Acceptance Criteria

### 모임 상세 페이지 (`/meetings/[id]`)
- [ ] 페이지에서 `AttendanceToggle`이 제거됨
- [ ] 페이지에서 `AttendanceSummary`가 제거됨
- [ ] 페이지 하단의 `MeetingActions` (수정/삭제 버튼)가 제거됨
- [ ] `MeetingDetailHeader` 우측에 호스트일 때만 보이는 "…" 메뉴(드롭다운/팝오버) 추가됨
- [ ] "…" 메뉴 항목: **모임 정보 수정 / 모임 삭제 / 공유** (정확히 이 3개, 이 순서)
- [ ] "모임 정보 수정" 클릭 → `/meetings/[id]/edit` 로 이동
- [ ] "모임 삭제" 클릭 → 기존 삭제 다이얼로그 그대로 노출
- [ ] "공유" 클릭 → `navigator.clipboard.writeText(현재 페이지 URL)` 실행 + toast로 "링크가 복사되었습니다" 표시
- [ ] 페이지 본문: 헤더 → 발제 자료 → 발제 질문 목록 → (호스트일 때) + 질문 추가 폼 — 이 순서
- [ ] 비호스트가 페이지를 봐도 동일한 발제문 콘텐츠가 그대로 보임 (편집 가능 액션만 가려짐)

### 홈 탭 (`/`)
- [ ] `NextMeetingCard`에 `AttendanceSummary` 컴포넌트가 추가됨 (`AttendanceToggle` 아래)
- [ ] 기존 `AttendanceSummary` 디자인/마크업 그대로 사용 (재사용)
- [ ] 다음 모임이 없을 때(`next == null`)는 카드 자체가 안 나오므로 영향 없음

### 회귀(Regression)
- [ ] PDF 업로드/제거, Gemini 추출, 질문 CRUD 모두 기존대로 동작
- [ ] `/edit` 페이지에서 모임 정보 수정/취소 동작 그대로
- [ ] `getMeetingDetail` 쿼리에서 `attendances` 데이터는 여전히 fetch되어 홈 카드에서 사용 가능 (홈은 `getNextMeeting`에서 attendances를 join해야 할 수 있음 — 구현 시 확인)

## Assumptions Exposed & Resolved

| Assumption | Challenge | Resolution |
|---|---|---|
| 별도 "발제문 수정" 버튼이 필요할 것이다 | 사실은 인라인 ✏️ 편집이 이미 있어서 추가 버튼은 중복 | 추가 버튼 만들지 않음. 헤더 메뉴로 정리 |
| 발제문을 별도 페이지로 분리해야 한다 | 상세 페이지의 본래 역할이 무엇이냐 | "상세 페이지 = 발제문 페이지"로 재정의. 별도 페이지 추가 불필요 |
| 페이지 하단에 수정/삭제 버튼이 있어야 한다 (Contrarian) | 시각적 노이즈 + 라벨 모호성 발생 원인 | 헤더 우측 "…" 메뉴로 숨김 |
| 참석 체크/현황은 상세에서 해야 한다 | 사용자 행동 흐름은 홈에서 시작 | 참석 관련은 홈 카드로 통합 |
| 공유는 후속 작업 | 메뉴 항목으로 보이면서 동작 안 하면 어색함 | 이번에 같이 구현 (링크 복사 한 줄짜리) |

## Technical Context

### 기존 코드 위치
- 모임 상세 페이지: `app/(app)/meetings/[id]/page.tsx`
- 헤더 컴포넌트: `components/meeting/MeetingDetailHeader.tsx`
- 제거 대상: `components/meeting/MeetingActions.tsx` (또는 헤더로 흡수 후 제거)
- 이동 대상: `components/meeting/AttendanceSummary.tsx`, `AttendanceToggle.tsx`
- 홈 카드: `components/meeting/NextMeetingCard.tsx`
- 홈 페이지: `app/(app)/page.tsx`
- 모임 수정 페이지(유지): `app/(app)/meetings/[id]/edit/page.tsx`
- 쿼리: `lib/queries/meetings.ts` (`getNextMeeting`이 attendances를 join해야 할 수 있음)

### UI 패턴
- "…" 메뉴는 shadcn의 Dropdown 또는 Popover 사용 (이미 `dialog`는 있음 — `components/ui/`에서 확인 필요)
- `MoreVertical` (lucide-react) 아이콘 사용

### 의존성
- 새 라이브러리 불필요 (기본 Clipboard API + sonner toast 이미 있음)

## Ontology (Key Entities)

| Entity | Type | Fields | Relationships |
|---|---|---|---|
| Meeting | core domain | id, book_title, book_author, scheduled_at, host_id, location_name, discussion_file_url, discussion_file_name | host: Profile, questions: DiscussionQuestion[], attendances: Attendance[] |
| DiscussionFile | supporting | url, name, isPdf | belongs_to Meeting |
| DiscussionQuestion | supporting | id, content, order_idx | belongs_to Meeting |
| Attendance | supporting | meeting_id, profile_id, status(올/안올/미정) | belongs_to Meeting, belongs_to Profile |
| HomeCard | UI surface | meeting, myStatus, attendances | renders Meeting + Attendance |
| MeetingDetailPage | UI surface | meeting, isHost | renders Meeting + DiscussionFile + DiscussionQuestion[] |
| HeaderMenu (신규) | UI surface | items: [수정, 삭제, 공유] | belongs_to MeetingDetailPage (host only) |
| ShareAction (신규) | feature | url, copy-to-clipboard | invoked from HeaderMenu |

## Ontology Convergence

| Round | Entity Count | New | Changed | Stable | Stability Ratio |
|-------|---|---|---|---|---|
| 1 | 4 | 4 | - | - | N/A |
| 2 | 4 | 0 | 0 | 4 | 100% |
| 3 | 5 | 1 (HomeCard) | 0 | 4 | 80% |
| 4 | 6 | 1 (HeaderMenu) | 0 | 5 | 83% |
| 5 | 6 | 0 | 0 | 6 | 100% |
| 6 | 6 | 0 | 0 | 6 | 100% |
| 7 | 7 | 1 (ShareAction) | 0 | 6 | 86% |
| 8 | 8 | 1 (DiscussionFile/Question 분리 명시) | 0 | 7 | 88% |

## Interview Transcript

<details>
<summary>Full Q&A (8 rounds)</summary>

### Round 0
**Q:** 구성요소 토폴로지 확인 — 버튼 라벨 + 발제문 IA 2개로 진행해도 될까요?
**A:** 맞아요, 2개로 진행

### Round 1
**Q:** 참여자가 모임 상세 페이지에서 주로 무엇을 쓸 것 같아요?
**A:** 발제문을 읽고 준비하는게 더 중요. 참석 체크/현황은 홈 탭에서 보이는 게 더 좋겠다
**Ambiguity:** 60% (Goal: 0.5, Constraints: 0.3, Criteria: 0.1, Context: 0.7)

### Round 2
**Q:** "참석 체크를 홈 탭으로" 이야기는 이번 작업에 포함시킬까요?
**A:** 이번에 같이 하기
**Ambiguity:** ~50% — 새 컴포넌트(홈 탭 참석) 토폴로지에 추가

### Round 3
**Q:** 홈 카드에서 참석 현황(누가 올지)도 보이고 싶으세요?
**A:** 네, 홈 카드에서 다 보기
**Ambiguity:** 40%

### Round 4 (Contrarian Mode)
**Q:** 호스트의 모임 정보 수정은 어떻게 접근하면 좋을까요? (꼭 별도 버튼이 있어야 할까?)
**A:** 상단 헤더 옆 … 메뉴로 숨기기
**Ambiguity:** 32%

### Round 5
**Q:** 홈 카드의 참석 현황을 어떻게 보여주면 좋을까요?
**A:** 현재 디자인 유지
**Ambiguity:** 26%

### Round 6 (Simplifier Mode)
**Q:** 헤더 우측 "…" 메뉴에 들어갈 항목을 선택해주세요 (다중 선택)
**A:** 모임 정보 수정, 모임 삭제, 공유
**Ambiguity:** 22%

### Round 7
**Q:** "공유" 메뉴 항목은 어떻게 처리할까요?
**A:** 이번 작업에서 구현 (링크 복사)
**Ambiguity:** 18%

### Round 8
**Q:** 리팩터링 후 상세 페이지(호스트 보는 화면)가 [헤더 → 발제 자료 → 질문 목록 → + 질문 추가] 구성이면 완성일까요?
**A:** 네, 이 구성
**Ambiguity:** 14% ✅

</details>
