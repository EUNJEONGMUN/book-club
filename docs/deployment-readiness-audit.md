# 운영 실행 권한·배포 환경 점검 — 2026-11-08

후속 완료: 별도 무료 `book-club-preview` DB 생성, 구조 27개 적용, 시험 계정·PDF의 11개 흐름 검증과 운영 8개 테이블 보존 확인에 이어 Vercel의 신규 Preview 연결 분리도 완료했다. 이후 사용자가 작업 브랜치를 push했고 실제 Preview의 이메일 로그인·조회·권한·다운로드 22개 확인과 운영/테스트 기록 보존 대조를 통과했다. 운영 DB 변경/운영 배포는 하지 않았다. 최신 결과는 `docs/hosted-preview-verification.md`, 연결 분리 기록은 `docs/preview-isolation.md`를 우선하며 아래 표는 분리 전 점검 기록이다.

운영 DB는 읽기 전용으로 조회했고 Vercel은 설정 화면만 열었다. 운영 데이터·역할·환경변수·배포 설정을 변경하지 않았다. Git push/merge/배포도 하지 않았다. 비밀값을 펼치거나 복사하지 않고 변수 이름과 적용 범위만 확인했다.

## 확인 결과

| 항목 | 현재 확인된 상태 | 반영 전 조치 |
|---|---|---|
| Supabase URL / anon / service-role 키 | 세 변수 모두 하나의 `Production and Preview` 항목으로 공유. Preview 목록에서도 같은 항목을 확인 | 기존 항목을 Production 전용으로 유지하고 Preview에는 별도 검증 프로젝트의 세 값을 함께 지정 |
| Preview 자동 배포 | Branch Tracking 켜짐. 다른 환경에 배정되지 않은 모든 브랜치 대상 | 분리 전에는 현재 작업 브랜치를 push하지 않음. 분리 작업 동안 자동 Preview를 일시 중단하는 방안도 별도 승인 후 적용 |
| Production 자동 배포 | main 대상, 운영 도메인 자동 연결 켜짐 | 전체 새 앱을 먼저 main에 넣지 않음. 구 앱 호환 점검 브리지와 보호된 후보 배포·승격 순서를 별도로 준비 |
| 배포 접근 보호 | Vercel Authentication 켜짐, Standard Protection. 공유 링크 없음, 자동화 우회 secret 목록 없음 | 보호 유지. 이 설정은 Preview가 사용하는 DB를 분리하지 않으며 Supabase 직접 접속도 차단하지 않음 |
| Preview 메일 | `RESEND_API_KEY`도 Production/Preview 공용 | Preview에서는 실제 발송 키를 제외. 별도 실험 수신자/발송 계정이 검증되기 전에는 발송하지 않음 |
| Preview 사이트·외부 API | `NEXT_PUBLIC_SITE_URL`, Kakao, Gemini는 Production 전용 | 검증용 사이트 주소/허용된 OAuth 반환 주소를 먼저 준비. 책·장소·AI 기능을 검증하려면 시험 범위에 맞는 별도 설정 필요 |
| Google 환경변수 | client ID/secret 항목 Production/Preview 공용 | 실제 OAuth 제공자 설정은 Supabase Auth에서 관리. 별도 검증 Supabase의 반환 주소를 확인하고 불필요한 Vercel secret 복사 금지 |
| Vercel 프로젝트 연동 | 프로젝트 Integrations 화면에 `No Integrations Installed` | 현재 화면에서 Supabase 자동 동기화 연동은 확인되지 않음 |
| GitHub CI | 타입·단위 검사만 실행 | CI 성공을 DB 전환 완료로 취급하지 않음 |
| 실제 운영 앱 | `book-club-five-nu.vercel.app`, Ready, main `378cc2e07321fe88d66178fe29cef2dfb4f5a027` | 새 앱은 아직 미배포. 구 앱의 동작을 유지 |

확인 화면: [환경변수](https://vercel.com/scone-s-projects/book-club/settings/environment-variables), [Production](https://vercel.com/scone-s-projects/book-club/settings/environments/production), [Preview](https://vercel.com/scone-s-projects/book-club/settings/environments/preview), [접근 보호](https://vercel.com/scone-s-projects/book-club/settings/deployment-protection). 기존 배포에 이미 포함된 값까지 환경변수 수정으로 소급 제거된다고 가정하지 않는다. 과거 Preview도 별도로 접근·수명 정책을 확인해야 한다.

## DB 실행 권한과 로컬 재검증

Supabase Management API의 `read_only: true` 조회에서 실제 실행자는 `supabase_read_only_user`, `transaction_read_only=on`이었다. 이 API 역할을 마이그레이션 실행자로 사용하지 않는다. 임시 로그인 역할 발급이나 생산 DB의 DDL 시험은 하지 않았다.

운영 카탈로그에서 앱 테이블·함수와 마이그레이션 스키마의 소유자는 `postgres`다. `postgres`는 슈퍼유저가 아니지만 DB/schema 생성 권한과 기존 앱 객체 소유권이 있다. Storage 테이블 소유자는 `supabase_storage_admin`이며, `supautils.policy_grants`가 `postgres`의 `storage.objects` 정책 관리를 허용한다. 관리형 Storage 소유자를 바꾸거나 새 권한을 추가할 필요가 있다는 증거는 없다. service-role 키의 RLS 우회는 구조 변경 실행 권한과 다르므로 Vercel 실행 환경에 DB 비밀번호/CLI 토큰을 추가하지 않는다.

미적용 버전은 계속 02→03→04이고 운영 최신 이력은 `20261108000001`이다. 카탈로그 결과는 비공개 `.local-backups/production-permissions-20261108T111012472185Z/catalog-audit.json`에 저장했다.

앞선 슈퍼유저 복원 시험을 보완해, 별도 오프라인 컨테이너의 두 번째 복원 DB를 **비슈퍼유저 `postgres`** 소유로 만들고 앱 객체 소유자와 Storage 소유권 부재를 확인했다. 이 복원본에만 `supautils`와 `storage.objects` 정책 관리 허용을 구성했다. 02→03→04를 `postgres`로 실행하고 **228개 검사를 통과**했다. 원본 49개 데이터 블록·계정/identity·기존 기록·시퀀스 2개·정책·파일 14개 해시, 전환 후 보존본과 원래 로컬 DB의 기록을 대조했다. 실제 사용 중인 로컬 DB는 초기화하지 않았고 임시 컨테이너는 정리했다.

증거: `.local-backups/production-restore-verified-20261108T111156832783Z/verification-report.json`. 원본 아카이브 SHA-256은 계속 `18c5104cd4413680919fbeb4862e0a8058310ca4b41ec21ab28af9fcdfcbe372`다. 이는 운영 권한 설정을 참고한 로컬 리허설이며, 운영에서 실제 구조 변경을 실행한 결과는 아니다. 복원 역할은 비밀번호 없는 로컬 역할 정의를 사용했다. 전환 전 실제 실행 연결의 사용자/대상/권한은 다시 확인한다.

재현:

```bash
python3 -B scripts/verify-production-restore.py \
  --backup .local-backups/production-dump-20261108T052113760121Z \
  --records .local-backups/production-readonly-20261108T045110487853Z \
  --postgres-rehearsal
```

## 다음 작업과 완료 기준

1. **Preview 연결 분리부터 적용한다.** 원격 설정 변경 승인을 받은 뒤 Production의 기존 세 값은 유지하고, Preview에만 별도 Supabase 프로젝트의 주소·anon·service-role 키를 같은 묶음으로 설정한다. 유료 리소스 생성은 별도 범위이며, 실회원/Auth/비공개 평/파일을 클라우드 시험 DB에 복사하지 않는다. 새 시험 데이터로 검증한다. Preview 메일 발송은 끄고 로그인 반환 주소도 분리한다.
2. 새 Preview가 운영 Supabase에 요청하지 않는지 확인하고 Production 연결과 현재 서비스가 유지되는지 조회로 점검한다. 과거 Preview의 운영 연결도 남아 있을 수 있으므로 접근 보호를 유지하고 필요 시 별도 정리 계획을 세운다. 키를 재발급하거나 기존 운영 배포를 재배포하지 않는다.
3. 운영 전환 중 Auth/REST/RPC/Storage와 외부 관리 도구의 쓰기를 막는 **실제로 적용 가능한 수단**을 확정하고 로컬/검증 환경에서 차단과 복구를 시험한다. 현재는 미구성이다. Vercel 점검 화면·배포 인증·방화벽만으로 Supabase 공개 주소의 요청까지 막을 수 있다고 가정하지 않는다. 검증 가능한 차단 수단이 없으면 전환을 진행하지 않는다.
4. 이후 별도 운영 반영 승인과 점검 시간 확정 후에만 최종 쓰기 중단·DB/Storage 백업·복원 검증·전환·비교·재개를 수행한다. 상세는 `docs/single-club-cutover.md`를 따른다.

이 단계에서 완료한 것은 읽기 전용 점검과 로컬 권한 리허설이다. 환경 분리·외부 쓰기 차단·운영 전환은 아직 완료되지 않았다.

근거: [Vercel 환경별 변수](https://vercel.com/docs/environment-variables), [배포 환경](https://vercel.com/docs/deployments/environments), [Supabase 관리형 소유권](https://supabase.com/docs/guides/platform/permissions), [supautils 정책 관리 허용](https://github.com/supabase/supautils#table-ownership-bypass).
