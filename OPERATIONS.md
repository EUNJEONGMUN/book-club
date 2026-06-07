# 운영 일과 (Operations Runbook)

부글부글 앱의 운영 모니터링 가이드. **체크리스트로 쓰는 게 목적**이라 짧게 유지.

---

## 1. 언제 무엇을 보는가

| 빈도 | 항목 | 시간 | 트리거 |
|---|---|---|---|
| **즉시** | Sentry 알람 메일 도착 | 2분 | 이메일 알림 |
| **매 PR 머지 직후** | 새 에러 모니터링 | 30분 | 머지 액션 |
| **매일 오전** | 신규 이슈 + 트래픽 핵심 숫자 | 5분 | 출근 |
| **매주 (금요일 권장)** | 트렌드 + 회고 | 15분 | 주말 직전 |
| **매월** | 쿼터 / 알람 룰 / 노이즈 | 30분 | 월말 |

각 항목 구체적인 절차는 아래.

---

## 2. 알람 메일 도착 시 (대응 runbook)

이메일 제목이 `[Sentry] ...` 로 오면 클릭 전에 종류 파악.

### A. `[Sentry] New issue: ...` (새 이슈)
1. 메일 안의 **Stack Trace 미리보기** 확인 → 이미 알고 있는 유형이면 무시 OK
2. 처음 보는 에러면 → Sentry 링크 클릭 → [이슈 디버깅 4단계](#3-이슈-디버깅-4단계) 적용
3. 사용자에게 영향 적은 엣지케이스면 Archive, 진짜 버그면 Resolve 전에 fix PR 띄우기

### B. `[Sentry] Regression in: ...` (Regression — **가장 중요**)
**이 알람은 무조건 즉시 보세요**. Resolve한 게 다시 깨졌다는 뜻.

1. 어느 PR에서 깨졌는지 추적
   - 이슈 페이지의 **release** 태그 확인 (`tags` 섹션의 `release: <sha>`)
   - GitHub에서 그 SHA의 PR 찾기
2. Revert 또는 hotfix
3. 같은 에러가 다시 안 뜨는지 24시간 모니터링

> **Spring 비유**: 운영팀의 P1 oncall 콜. 일단 무엇이든 멈추고 본다.

---

## 3. 이슈 디버깅 4단계

Sentry 이슈 페이지 들어가서 **이 4가지만**:

1. **Users / Events 숫자** (우상단) → 영향 규모 = 우선순위
2. **Tags 섹션의 3개**: `environment` (production 여부) / `release` (어느 배포) / `transaction` (어느 endpoint)
3. **Stack Trace 강조줄** (`>` 표시) → 정확한 코드 위치
4. **Breadcrumbs** → 사용자가 거기까지 어떻게 도달했나

다른 섹션(Trace Preview, HTTP Request, Contexts, Highlights 등)은 위 4개로 안 잡힐 때만 백업으로.

---

## 4. PR 머지 직후 (30분)

머지하자마자 Vercel 배포 시작 → 운영에 새 코드 반영 → **이때 새 에러 가장 잘 잡힘**.

- [ ] Vercel Deployments에서 새 배포 Ready 확인
- [ ] 운영 사이트(`book-club-five-nu.vercel.app`) 핵심 흐름 1번 클릭
  - 홈 → 모임 카드 → 모임 상세 → 발제문 다운로드
- [ ] Sentry Issues 탭 — **15~30분 새로고침 1~2회** 새 이슈 떴는지 확인
- [ ] 새 이슈 보이면 즉시 [이슈 디버깅 4단계](#3-이슈-디버깅-4단계)

머지 후 30분 안 보이면 보통 안전. 그 후 새 이슈는 알람으로 알림 옴.

---

## 5. 매일 오전 (5분)

매일 한 번. 출근 직후 커피 마시면서.

### Sentry — Issues 탭
- [ ] 전날~당일 새 이슈 0건이면 OK
- [ ] 1건 이상이면 Users 숫자 보고 우선순위 결정
- [ ] 알람 메일로 이미 본 거면 스킵

URL: https://eunjeongmun.sentry.io/issues/?query=is:unresolved&statsPeriod=1d

### Vercel Web Analytics — 핵심 3숫자
- [ ] **Visitors** 어제 vs 그제 (-50% 이상 떨어지면 의심)
- [ ] **Page Views**가 visitors 대비 너무 적으면 이탈 신호
- [ ] **Pages 카드** 상위 페이지가 평소와 다른지 (갑자기 `/login`만 늘면 onboarding 어딘가 깨졌을 가능성)

URL: https://vercel.com/dashboard → book-club → Analytics

---

## 6. 매주 (15분, 금요일 권장)

### Speed Insights — 추세
- [ ] **Real Experience Score** 지난주 vs 이번주 (90 이상 유지?)
- [ ] **LCP** (Largest Contentful Paint) 2.5s 이내 유지?
- [ ] **INP** 200ms 이내 유지?
- [ ] **CLS** 0.1 이내 유지?
- [ ] 점수 떨어졌으면 **Routes 탭** → 어느 페이지가 원인인지 들여다보기

### Sentry — 일주일 이슈 회고
- 새 이슈 / Regression / Resolve 처리 건수 봄
- 자주 보이는 패턴 있나? → 코드 리팩터링 후보

### Vercel Analytics — 트래픽 패턴
- Routes 변화 추세 — 신규 페이지 잘 발견되는지
- Referrers — 외부 유입 채널 다양화되고 있는지

---

## 7. 매월 (30분, 월말)

### 쿼터 점검
- **Sentry Stats & Usage**: 무료 5,000 events/월. 50% 넘으면 sample rate 더 낮추기
- **Vercel Analytics**: 2,500 events/월
- **Vercel Speed Insights**: 10,000 data points/월

각 도구 대시보드 좌하단/상단 어딘가에 사용량 표시 있음.

### 알람 룰 검토
- 한 달간 한 번도 trigger 안 된 알람은 useless or 너무 까다로움 → 조정
- 너무 자주 trigger되는 알람(noise) → 조건 더 좁히기

### 코드 vs 데이터 매칭
- Sentry MCP로 자주 발생한 이슈 → 다음 달 우선 fix 후보 결정

---

## 8. 위험 신호 패턴 (즉시 봐야 함)

### 빨간 신호 🔴
- Sentry: 같은 에러가 Users 5명 이상 새로 영향 받음 + 빈도 상승
- Vercel Analytics: 갑자기 daily visitors가 평소 30% 이하
- Speed Insights: LCP/INP가 노란색 → 빨간색으로 등급 하락

### 노란 신호 🟡
- Sentry: 새 이슈가 매일 1~2건씩 꾸준히 (점진적 quality 저하)
- Vercel Analytics: 특정 페이지만 갑자기 0 페이지뷰 (라우팅 깨졌을 수도)
- Speed Insights: 점수 하락은 없지만 P95가 P75보다 훨씬 멀어짐 (꼬리가 길어짐 = 일부 환경에서 느려짐)

---

## 9. 빠른 링크

- **Sentry Issues**: https://eunjeongmun.sentry.io/issues/
- **Sentry Alerts**: https://eunjeongmun.sentry.io/alerts/rules/
- **Sentry Stats**: https://eunjeongmun.sentry.io/stats/
- **Vercel Dashboard**: https://vercel.com/dashboard
- **GitHub Actions**: https://github.com/EUNJEONGMUN/book-club/actions

---

## 10. 참고

- Sentry / Vercel 셋업 자체에 대한 설명: `README.md`
- 단계별 진행 기록: `HANDOFF.md`
- 이 문서는 **운영 중 무엇을 어떻게 보는가**만 다룸
