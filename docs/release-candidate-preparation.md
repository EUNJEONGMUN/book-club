# 배포·복구 후보 소스 준비 — 2026-11-09

**후보 소스 3개와 로컬 빌드/응답 검증을 완료했다. 실제 Vercel 후보 배포는 만들지 않았다.** 운영/테스트 DB 접속·변경, 환경변수 변경, 점검 활성화, push/main 병합·배포는 하지 않았다. Vercel은 기존 관리 화면을 읽기만 했다.

## 현재 운영 기준점

Vercel 관리 화면에서 다음을 다시 확인했다. 비밀값을 펼치거나 설정을 저장하지 않았다.

| 항목 | 읽기 전용으로 확인한 값 |
|---|---|
| 현재 운영 배포 | `dpl_6CfNuZiDymJQPjdqN2Z9KeeG2Zxn`, Ready |
| 소스 | `main`, `378cc2e07321fe88d66178fe29cef2dfb4f5a027` |
| 고정 배포 주소 | `https://book-club-foa9xir5g-scone-s-projects.vercel.app` |
| 운영 도메인 | `https://book-club-five-nu.vercel.app` |
| 자동 반영 | main 추적 및 Production 도메인 자동 연결 켜짐 |
| 보호 | Vercel Authentication 켜짐, Standard Protection. 공유 링크·자동화 우회 키 목록 비어 있음 |
| 빌드 | Next.js, 명령 덮어쓰기 없음, Node `24.x`, Basic 빌드 머신 |
| 플랜·보존 정책 표시 | Hobby, Production 배포 보존 30일. 과거 배포가 항상 복구 대상으로 남는다고 가정하지 않음 |

현재 배포를 확인한 주소는 [Deployment Details](https://vercel.com/scone-s-projects/book-club/6CfNuZiDymJQPjdqN2Z9KeeG2Zxn)다. 날짜가 지난 관찰값이므로 실제 실행 직전에 현재 도메인/배포 ID/환경 적용 범위를 다시 확인한다. 고정 배포 주소는 기준점이며 DB 복구를 대신하지 않는다.

## 준비한 후보

| 후보 | 고정 소스 | 필요한 DB 상태 | 배포별 `MAINTENANCE_MODE` |
|---|---|---|---|
| `maintenance-bridge` | 구 운영 소스 + 검증한 점검 패치 2파일 | 구/신 구조 모두에서 DB 접속 전에 점검 응답 | `1` |
| `single-club-app` | 검증한 Preview `565c6ce`와 같은 소스 | 02→03→04 전환 완료 | `0` |
| `recovery-app` | 구 운영 소스 + 같은 점검 패치 | 구 구조·원본 데이터 복구 완료 | `0` |

점검/복구 후보의 **소스 아카이브는 동일**하지만 배포별 모드와 사용 시점이 다르다. 복구 앱을 새 DB 구조에 연결해 서비스를 재개하지 않는다. 원래 구 소스의 별도 아카이브도 함께 보관했다.

각 패키지는 앱·컴포넌트·라이브러리·정적 파일과 빌드 설정만 담는다. `.env*`, `.vercel`, `.git`, `.next`, `node_modules`, 도구·백업·회원 기록은 제외한다. SQL 3개는 앱 패키지 밖의 `database-migrations/`에 순서·해시를 고정해 별도 보관하며 앱 빌드가 SQL을 실행하지 않는다. source tar와 각 파일의 크기/SHA-256을 대조한다. 경로 이탈·심볼릭 링크·중복 파일·후보의 모드/DB 상태/환경 불일치는 거절한다.

## 로컬 검증

- 기존에 설치된 **Node 24.16.0**, Next **16.2.6**의 기본 `next build`(Turbopack)로 **3개 모두 빌드 통과**. Vercel과 Node의 주 버전 및 빌드 명령을 맞췄으며 Linux/Vercel에서 실제 빌드한 결과와 동일한 바이너리라고 주장하지 않는다.
- **23개 확인 통과:** 점검 후보의 503/no-store/Retry-After, 인증 쿠키 모양의 합성 입력·OAuth 반환·변경 요청의 백엔드 호출 차단, 복구/새 앱의 점검 해제 로그인 화면과 합성 Auth 호출 양성 대조, 새 앱 점검 전환, 전체 소스/백업 무결성.
- Python 안전 검사 **48개 통과**(기존44+소스 패키지 검사4). 앱/DB 마이그레이션은 변경하지 않았다.
- 빌드 환경에는 실제 키를 전달하지 않았다. 환경변수는 명시한 합성 값만 사용하고, Supabase 주소는 새 localhost 가짜 응답 서버이며 기존 로컬 Supabase도 아니다. Node의 외부 연결 거절 장치를 적용했다.
- 의존성은 작업 디렉터리 안에 별도 APFS 사본으로 준비했다. 원래 의존성·전역 Node 기본값은 변경하지 않았고, 빌드 작업 폴더·`.next` 결과물·임시 서버는 정리했다. **운영에 올릴 바이너리를 만든 것이 아니다.**

증거 폴더는 `.local-backups/release-candidates-20261109T143843928389Z/`다. `manifest.json`은 소스 고정 시점의 입력 목록이고 빌드 완료 근거는 그 해시를 참조하는 `candidate-verification.json`이다. `sources/`의 후보 tar 3개, `baseline-source.tar.gz`, SQL 3개, 빌드 로그와 비밀값 없는 `vercel-readonly-observation.json`도 보관한다. `deployment-specification.json`에는 각 소스 해시·고정 프로젝트/팀·Production 환경·도메인 미연결·모드·필요 DB 상태를 실행 불가인 검토용으로 묶었고 `tested-tool-sha256.json`에 확인한 도구를 기록했다. 이전 온라인 운영 백업과 관리형 337개 시험·정리 결과의 증거도 재대조했다.

재현(새 로컬 패키지만 생성하며 배포하지 않음):

```bash
python3 -B scripts/prepare-release-candidates.py
/opt/homebrew/opt/node@24/bin/node scripts/verify-release-candidates.mjs .local-backups/release-candidates-생성시각
python3 -B scripts/prepare-release-candidates.py --verify .local-backups/release-candidates-생성시각
```

생성한 폴더 하나당 빌드 검사는 한 번 수행하고 실패 결과도 보관한다. 입력/도구를 고친 뒤에는 새 폴더를 생성한다. 기본 Node가 26이므로 위처럼 이미 설치된 Node24 실행 파일을 지정했다.

## 승인 후 배포 경로

아래는 **아직 실행하지 않은 계획**이다. 후보 생성도 Production 환경의 새 배포를 만드는 변경이므로 별도 승인 전 실행하지 않는다.

1. 사용자가 실제 운영 실행을 승인한 후, 소스 패키지와 각 환경을 재검토한다. 대상은 기존 Vercel 프로젝트 `prj_hKx77tEnplZb6H7gZuvCMKjRyiDE`, 팀 `scone-s-projects`다. 다른 프로젝트 생성이나 main push로 후보를 만들지 않는다.
2. 각 소스는 **Production 환경에서 새로 빌드하되 도메인 연결을 건너뛰는 방식**을 사용한다. `vercel deploy --project <고정 프로젝트 ID> --scope scone-s-projects --prod --skip-domain`이 검토한 경로다. `--skip-domain`은 현재 켜진 자동 도메인 연결 설정에도 우선하며, 이후 별도 승격으로 연결한다. [Vercel CLI 설명](https://vercel.com/docs/cli/deploy#skip-domain).
3. 모드는 해당 배포의 빌드/실행 양쪽에 `--build-env MAINTENANCE_MODE=1 --env MAINTENANCE_MODE=1` 또는 각각 `0`으로 지정하는 계획이다. 기존 Production 변수 10개를 덮어쓰거나 모드를 프로젝트 공용 값으로 바꾸지 않는다. 운영 Supabase 연결은 기존 Production 범위를 사용한다. 테스트 Preview 결과물/변수나 로컬 더미 값으로 빌드한 결과를 운영에 alias/`--prebuilt`로 올리지 않는다. [빌드·실행 환경 옵션](https://vercel.com/docs/cli/deploy#build-env), [승격 시 환경 차이](https://vercel.com/docs/deployments/promoting-a-deployment).
4. 생성 후 새 배포의 ID·고정 URL·소스/모드·Production 환경·도메인 미연결을 확인하고 **로그아웃 상태에서 생성 URL의 Vercel 접근 보호**를 확인한다. Standard Protection은 운영 도메인을 제외한 생성 주소를 보호하는 설정이다. 기존 쿠키/공유 링크 때문에 보호 확인을 통과했다고 착각하지 않는다. [보호 범위](https://vercel.com/docs/deployment-protection#standard-protection).
5. 점검·전환·데이터 비교·재개 순서는 운영 체크리스트를 따른다. 이 시간에는 main push/merge와 다른 운영 도구 사용도 멈춰 자동 도메인 교체를 방지한다. 아직 미승격인 복구 후보도 미리 ID를 기록한다.

**Hobby의 즉시 롤백은 직전 Production 배포로 제한된다.** 점검 브리지와 새 앱을 순차 승격한 뒤 원래 운영 ID가 여러 단계 전이 되면, 그 ID로 바로 돌아갈 수 있다고 계획하지 않는다. 그래서 아직 승격하지 않은 구 구조 호환 `recovery-app` 후보를 따로 준비한다. 실패 시 점검/DB 차단 유지 → 원래 앱 구조·원본 데이터 복구 확인 → 복구 후보 승격 → 확인 후 재개의 순서다. 비용이 드는 플랜 변경이나 실제 롤백/승격은 하지 않았다. [Hobby 롤백 제한](https://vercel.com/docs/cli/rollback#usage).

## 사용자 세션 확인의 경계

운영 도메인의 로그인 쿠키가 새 후보 호스트로 자동 공유된다고 가정하지 않는다. 후보 URL에서 새로 Google 로그인하거나 차단 중인 Auth를 풀어 검사하는 절차를 임의로 추가하지 않는다. 이번 로컬 확인은 합성 쿠키·가짜 Auth 서버의 응답 검증이며 실제 운영 관리자 로그인 검사가 아니다.

당일에는 후보의 빌드/보호·DB 보존 비교를 먼저 확인하고, 실제 기존 회원 세션은 **동일한 운영 도메인에서 새 앱으로 주소 전환한 직후, DB 쓰기 차단을 유지한 상태에서** 확인하는 절차가 필요하다. 주소 전환 자체도 별도 승인된 점검 구간 안에서만 한다. 유효한 관리자 세션이 없거나 조회 검사가 실패하면 저장을 풀어 로그인 시험을 진행하지 않고 점검을 유지한다. 이 확인과 쓰기 재개를 같은 단계로 취급하지 않는다.

## 다음으로 남은 준비

후보의 **소스 준비와 로컬 확인**은 완료했다. 운영 연결용 실행 경로와 단계 확인, 같은 차단 구간의 최종 DB/public 복구용/캐시 우회 파일 백업·복원 증거 연결은 아직 남아 있다. 이를 정리한 뒤 점검 시간·담당자·별도 운영 승인을 확정한다. `production_ready=false`, `execution_allowed=false`를 유지한다.
