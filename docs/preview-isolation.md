# Preview 전용 DB 준비 — 2026-11-08

**Vercel의 신규 Preview용 DB 연결 분리를 완료했다.** 사용자가 수정된 `--resume`을 실행했고 성공 보고서와 관리 화면을 대조했다. 운영 DB 기록·구조·기존 운영 배포는 유지했으며 push/merge/신규 배포는 하지 않았다. 다음은 분리된 설정으로 새 Preview를 배포한 뒤 실제 앱 요청을 검증하는 단계다. 사용자가 push하는 기존 방침을 유지하며 main merge/운영 배포는 승인하지 않는다.

## 분리 완료 확인

최종 보고서는 `.local-backups/preview-isolation-20261108T112238765928Z/vercel-env-20261108T123216739088Z.json`이다. `applied`, `preview_variables_verified`, `production_records_preserved`가 모두 true이고 Production 항목 10개의 ID가 보존됐다. 완료 단계는 공용 항목 6개의 Preview 제외와 테스트 연결 세 변수의 Preview 전용 생성이다. Production 값 쓰기 요청은 0건이다. Secret 원문은 API에서 가려져 **실제 값의 독립적인 전후 대조를 수행한 것은 아니다**.

관리 화면에서도 다음을 확인했다.

- Preview: 새 URL/anon은 Config, service-role은 Secret이며 모두 Preview 전용이다. 공개 URL을 표시해 `https://teecqonbbmsritclbcyc.supabase.co`인 것을 확인했다. 메일 발송 키와 기존 Google 키는 Preview 목록에서 제외됐다.
- Production: 기존 URL/anon/service-role·메일·Google 항목은 기존 ID를 유지하며 Production 전용으로 남았다. 값 재발급/덮어쓰기/삭제를 하지 않았다.
- Sentry 빌드 토큰은 기존 Production/Preview 공용 상태를 유지했다. 자동 Preview 생성과 main 운영 도메인 자동 연결 설정도 원래 상태를 유지했다.

분리 후 운영 DB의 8개 업무 테이블은 최초 기준과 **전체 행이 동일**했고 계정 23개·Storage 파일 14개·운영 마이그레이션01·원본 dump 해시도 유지됐다. 보고서는 `production-preservation-after-separation.json`, 관리 화면 증거는 `preview-final-ui.txt`와 `production-final-ui.txt`다. 새 Preview 배포/그 앱의 실제 요청 검증은 아직 하지 않았다. 이전 Preview에 이미 포함된 운영 연결값은 소급 제거되지 않으므로 기존 접근 보호를 유지한다.

이번 분리 명령은 완료했으므로 다시 실행할 필요가 없다. 이번 작업에 사용한 임시 토큰은 소유자가 폐기할 수 있다. 아래는 중단 진단 및 도구 동작의 기록이다.

## 환경 분리 중단 진단과 수정

첫 실행 보고서는 `vercel-env-20261108T121218703902Z.json`이다. 완료된 요청은 `RESEND_API_KEY`의 `target`을 `[production]`으로 바꾼 PATCH 한 건이다. 값·유형·키 이름을 요청 본문에 보내지 않았다. Supabase 세 변수나 Google 키에는 변경 요청을 보내지 않았다. 관리 화면에서도 메일 키는 Production에 남고 Preview 목록에서만 제외된 것을 확인했다.

사용자가 읽기 전용 `--inspect`를 실행했다. `vercel-inspection-20261108T121648466560Z.json`에서 차이는 해당 메일 키의 **`visibility: null → secret` 한 건**뿐이었다. ID·type·그 밖의 비교 정보는 같다. 원래 10개 Production 변수 모두 API의 `value`가 빈 문자열로 가려져 있었다. 이전 도구가 이 표시 정보와 빈 값의 지문을 묶어 비교해 중단했다. **빈 표시값의 동일함은 실제 비밀값이 동일하다는 검증이 아니다.** 이 한계와 원래 검사 오류를 명시하고 실제 값 검증 완료를 주장하지 않는다.

수정 도구는 직접 scope PATCH를 성공시킨 ID에 대해서만 `type=sensitive`가 유지된 상태의 `visibility: null → secret`을 허용한다. 다른 ID의 표시 변경, 키·유형·ID·불투명 값 지문 변경 등은 계속 거절한다. 검사 조건을 통째로 끄지 않았다. `--inspect`는 HTTP GET만 허용하며, `--apply`는 미해결 실패 보고서가 있으면 인증 전에 거절한다.

당시 사용한 이어하기 명령(완료, 재실행 불필요):

```bash
python3 scripts/separate-preview-env.py --resume
```

`--resume`은 같은 실패 보고서의 실제 읽기 전용 진단이 존재하고, 현재 Production 정보 및 완료된 범위 변경이 그 진단과 일치할 때만 실행한다. 기존 메일 키 작업은 반복하지 않고 원래 계획의 남은 범위 변경과 테스트 키 생성만 한다. 다른 부분 적용/오류는 자동으로 덮어쓰거나 복구하지 않는다. 실제 실패 형태를 재현해 5건의 남은 scope PATCH와 Preview 전용 생성만 나가는 것을 시험했다. Python 전체 **26개 검사 통과**. 이후 사용자의 실제 이어하기 실행도 성공했다.

중단 후 운영 DB의 8개 테이블 전체 행도 첫 기준과 동일했고, 계정 23개·Storage 14개·운영 최신 버전01과 아카이브 해시가 유지됐다. 추가 운영 쓰기/배포는 하지 않았다. 근거는 같은 비공개 폴더의 `production-preservation-after-stop.json`, `visibility-diagnosis-review.json`이다.

## 준비한 테스트 환경

| 항목 | 결과 |
|---|---|
| Supabase 프로젝트 | `book-club-preview` / `teecqonbbmsritclbcyc` |
| 조직·지역 | 기존 무료 조직 `scone` / 서울 `ap-northeast-2` |
| 새 DB 구조 | 빈 프로젝트에 저장소의 마이그레이션 27개 적용, 최신 `20261108000004` |
| 데이터 | 무작위 암호의 시험용 admin/member/pending 계정 3개, 일정 2개, 질문 1개, 초대 1개, 새 PDF 1개 |
| 운영 복사 | 실제 회원·인증 정보·발제 파일·평을 테스트 클라우드로 복사하지 않음 |
| 검증 | 계정별 실제 로그인, 멤버십, 일정 읽기 권한, 익명 접근 차단, 시험 PDF 다운로드 해시 등 **11개 통과** |

로컬 `seed.sql`의 공개 개발 암호를 클라우드에서 사용하지 않았다. 실제 Google 계정·운영 Google 제공자 설정은 변경하지 않았다. Preview의 Google 인증은 아직 설정/검증하지 않았다. 현재 직접 검증한 로그인은 새 시험 계정의 이메일/암호 인증이다.

시험 키·암호·증거는 Git 제외, 권한 600인 `.local-backups/preview-isolation-20261108T112238765928Z/` 아래에 있다. 계정 암호와 service-role 키를 채팅·문서·Git에 넣지 않는다. 원래 로컬 `.env.local`과 Supabase CLI의 운영 프로젝트 연결도 바꾸지 않았다.

## 운영 보존 확인

작업 전후 운영의 clubs/club_members/club_invites/profiles/meetings/discussion_questions/attendances/meeting_reviews **8개 테이블 전체 레코드가 동일**했다. 현재 모임 1개·회원 13명·프로필 20개·일정 11개·질문 67개·참석 92개·평 4개·초대 2개다. Auth 계정 23개, Storage 파일 14개이며 운영 DB 최신 적용 버전은 계속 `20261108000001`이다.

운영 조회는 `read_only: true`와 `transaction_read_only=on`으로 제한했다. 원본 DB 아카이브 SHA-256도 계속 `18c5104cd4413680919fbeb4862e0a8058310ca4b41ec21ab28af9fcdfcbe372`다. 보고서: 위 폴더의 `production-preservation-check.json`, `test-fixtures-verification.json`, `preview-migrations.json`.

## Vercel에서 확인한 제한

당시 기존 URL/anon/service-role은 저장 후 읽을 수 없는 Secret으로 Production/Preview를 공유했다. Edit 화면에서 Environments 선택이 비활성화되어 있었고, Preview 전용 동일 이름을 추가하는 요청은 기존 공용 항목과 충돌해 저장되지 않았다. 이후 소유자 API 도구로 기존 항목의 Preview 적용만 제외하고 새 Preview 전용 항목을 생성해 분리했다. 기존 값을 덮어쓰거나 공용 항목을 삭제하지 않았다.

자동 승인 검토가 범위 불명확한 Vercel 플러그인 연결과 공용 항목 삭제 흐름을 거부했다. 이를 우회하는 브라우저 명령이나 비공개 API 호출은 사용하지 않았다. 미리보기 Branch Tracking 일시 중지는 앞선 UI 저장 하나가 반영된 뒤 원래 켜짐으로 복구했고, 켜짐·Save 비활성 상태를 확인했다. 운영 자동 배포/도메인 설정은 변경하지 않았다.

증거 화면: 위 비공개 폴더의 `vercel-secret-scope.jpg`. 실제 비밀값은 표시되어 있지 않다.

## 계정 소유자가 실행할 환경변수 전용 도구

`scripts/separate-preview-env.py`를 준비했다. 계정 소유자가 [Vercel 토큰 관리](https://vercel.com/account/settings/tokens)에서 `scone’s projects` 안의 `book-club` 프로젝트 범위와 짧은 만료 기간을 가진 임시 API 토큰을 직접 생성해 사용한다. 토큰 자체는 해당 프로젝트의 다른 자원을 관리할 권한을 가질 수 있으므로 이 도구에만 숨김 입력하고 작업 후 본인이 폐기한다. 토큰을 채팅에 보내거나 파일/셸 인자에 넣지 않는다.

아래는 실패 이력이 없는 최초 실행용 명령이다. 현재 작업은 완료했으므로 추가 실행하지 않는다. 프로젝트 폴더에서 본인 터미널로 실행한다:

```bash
python3 scripts/separate-preview-env.py --apply
```

`--apply`를 빼면 API 조회와 계획 저장만 한다. 도구가 허용하는 변경은 다음과 같다.

1. 고정 Vercel 프로젝트 `prj_hKx77tEnplZb6H7gZuvCMKjRyiDE` (`book-club`)인지 확인한다.
2. 공용 Supabase 세 변수 및 메일/Google Secret에서 **Preview 적용만** 제외한다. 기존 Production 항목의 ID·값·유형은 교체하지 않는다. PATCH 요청에는 `target`만 허용한다.
3. 검증된 테스트 프로젝트의 주소·anon·service-role 세 값을 **Preview 전용**으로 추가한다. 키의 JWT 프로젝트/역할도 확인한다. 메일 발송 키와 기존 Google Secret은 Preview에 새로 넣지 않는다.
4. Production 변수들의 ID·유형·표시 정보와 최종 환경 범위를 전후 대조한다. 관측한 Secret 표시 정보 자동 보완만 해당 요청의 ID에 한해 허용한다. 원문 값을 출력/저장하지 않는다. API 응답의 빈 Secret 표시값은 원문 대조로 취급하지 않고, 기존 항목 식별 및 Production 값 쓰기 금지 조건을 유지한다.

삭제·프로젝트 설정·배포 API는 도구에서 거절한다. 인증서는 검증하고 리다이렉트를 따라 토큰을 전달하지 않는다. 토큰은 메모리에서만 사용하며 보고서는 같은 비공개 폴더에 저장한다. 안전 가드·부분 재개 시험을 포함한 Python 전체 26개 통과. 실제 첫 실행·읽기 전용 진단·이어하기까지 완료했다.

성공 시 `Preview settings separated; Production variable records preserved. No deployment created.`와 보고서 경로가 표시된다. Production 값 쓰기 요청은 0건이며 Secret 원문은 가려져 별도 값 대조를 하지 못했다는 안내도 표시한다. 실패하면 보고서를 먼저 확인하고 임의 재실행/공용 변수 삭제/키 재발급을 하지 않는다. 부분 적용 시에도 운영 키를 Preview에 다시 연결해 오류를 숨기지 않는다.

## 연결 분리 후 검증

성공 보고서와 관리 화면에서 Production/Preview의 세 항목이 분리됐는지 확인한다. 운영 도메인과 기존 서비스는 그대로 유지한다. 새 Preview 실제 배포/요청 검증은 그 뒤 진행하며 운영 승격은 하지 않는다. 기존 Preview 배포에 이미 포함된 운영 값은 환경 설정 수정으로 소급 제거되지 않으므로 접근 보호를 유지하고 별도 정리 범위를 결정해야 한다. 실제 Preview 주소가 정해지면 필요한 사이트/OAuth 반환 주소를 그 주소에 맞춰 구성한다.

근거: [Vercel 환경변수 PATCH](https://vercel.com/docs/rest-api/projects/edit-an-environment-variable), [환경별 변수 생성](https://vercel.com/docs/rest-api/projects/create-one-or-more-environment-variables), [기존 배포에 소급되지 않는 환경변수 변경](https://vercel.com/docs/environment-variables).
