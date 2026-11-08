# 실제 Preview 로그인·파일 검증 — 2026-11-08

분리된 테스트 DB를 사용하는 Vercel Preview에서 실제 브라우저 검증을 완료했다. 기존 운영 DB 전환·운영 배포·main 병합은 하지 않았다. 이번 단계에서는 애플리케이션 코드를 수정할 필요가 없었다.

## 검증 대상

- 사용자가 직접 push한 브랜치: `codex/single-club-transition`.
- 배포 커밋: `565c6cea6fb9e5e9a3447ee46ea8f6a22ed023dd`.
- Vercel 배포: `dpl_2Z2S2TfsiEXnpgHMrALxXpD7ejuB`, **Preview / Ready**.
- 검증한 고정 주소: https://book-club-2kuklxtnz-scone-s-projects.vercel.app
- 브랜치 주소: https://book-club-git-codex-single-club-transition-scone-s-projects.vercel.app
- 테스트 Supabase: `teecqonbbmsritclbcyc` (`book-club-preview`). 실제 운영 정보는 복사하지 않았다.

브랜치 주소는 이후 push 때 다른 배포를 가리킬 수 있다. 위 고정 주소와 커밋이 이번 검증의 기준이다. Vercel 접근 보호를 유지했고 새로운 토큰 발급이나 우회 설정 없이 기존 로그인 브라우저로 접근했다.

## 실제 브라우저 확인 — 22개 통과

| 흐름 | 확인한 결과 |
|---|---|
| 연결 분리 | 로그인 화면의 이름은 `부글부글 · 미리보기`. 브라우저에서 실제 관찰한 Auth 요청은 테스트 프로젝트의 `/auth/v1/token`으로 향함 |
| 관리자 로그인 | 새 시험 관리자 계정으로 로그인 후 홈·다음 일정·지난 모임·멤버 목록·승인 대기 목록 조회 성공 |
| 일반 멤버 로그인 | 잘못된 비밀번호 거절 및 오류 안내, 정상 로그인, 새로고침 후 세션 유지, 원래 요청한 모임으로 이동 성공 |
| 파일 | 관리자와 일반 멤버가 화면의 PDF 링크를 각각 클릭해 실제 파일 다운로드. 한글 파일명과 597바이트 PDF의 SHA-256이 시험 원본과 일치 |
| 권한 | 일반 멤버의 관리자 전용 신청자 페이지는 404. 대기 계정은 로그인 후 대기 화면으로 이동하고 모임 페이지 진입도 대기 화면으로 복귀 |
| 기존 주소·로그아웃 | 시험 모임의 `/clubs/{id}/meetings/{id}`는 같은 일정의 새 주소로 연결. 로그아웃 후 보호된 일정은 로그인 화면으로 이동 |

세 시험 계정은 앞 단계에서 만든 무작위 암호의 admin/member/pending 계정이다. 승인·거절·탈퇴·관리자 이양·초대 재발급·일정/질문/참석/평 저장·파일 업로드/삭제는 실행하지 않았다. 검증 후 브라우저는 **일반 멤버 시험 계정**으로 지난 모임을 조회하는 상태다. 운영 계정으로 로그인한 것이 아니다.

다운로드 완료 이벤트 관찰 API는 시간 초과됐지만 실제 첫 클릭 파일은 Downloads 폴더에 저장되어 있었다. 생성 시각·파일명·바이트 해시를 확인했다. 브라우저의 링크 다운로드 기능으로 받은 추가 사본도 같았고, 일반 멤버의 실제 클릭으로 받은 파일까지 별도로 확인했다. 관찰 도구 문제를 애플리케이션 다운로드 실패로 기록하지 않는다. 시험에서 생성된 `미리보기-테스트.pdf`, `(1)`, `(2)` 사본은 Downloads에 남겼으며 기존 사용자 파일을 삭제하지 않았다.

인증 없는 외부 요청으로 배포 스크립트를 내려받으려는 보조 검사는 접근 보호에 막혔다. 우회하지 않았고 번들의 키 포함 여부/비밀키 미노출을 독립적으로 검증했다고 주장하지 않는다. 실제 브라우저가 관찰한 Supabase 리소스의 호스트는 테스트 프로젝트 하나였으며, 서버가 반환한 모임·회원 정보도 시험 기록과 일치했다.

## 데이터 보존

시험 전후 Supabase Management API의 `read_only: true`, 서버의 `transaction_read_only=on`으로 기준과 결과를 수집했다. 운영 13개·테스트 18개, 총 **31개 테이블의 비교 대상 기록이 일치**했다.

- public 업무 테이블 전체 행, 테스트의 `legacy_multiclub` 보관본 전체 행, 마이그레이션 이력, Storage 객체/버킷 메타데이터가 동일하다.
- Auth 사용자의 ID·이메일·암호 해시·생성/확인 시각·사용자 메타데이터와 identity의 제공자 식별/정보를 대조했다. 정상 로그인으로 바뀌는 최근 로그인 시각·identity 갱신 시각과 세션/refresh-token 행은 보존 비교에서 제외했다.
- 운영은 계속 모임 1개·회원 13명·일정 11개·질문 67개·참석 92개·평 4개·Auth 사용자/identity 각각 23개·파일 14개다. 운영 DB 최신 적용 버전은 계속 `20261108000001`이다.
- 원래 운영 dump SHA-256은 계속 `18c5104cd4413680919fbeb4862e0a8058310ca4b41ec21ab28af9fcdfcbe372`다.

Vercel 운영 화면도 기존 `book-club-five-nu.vercel.app`, main 커밋 `378cc2e07321fe88d66178fe29cef2dfb4f5a027`, Ready 상태를 유지했다. 추가 push/운영 승격·운영 DB 쓰기 요청은 하지 않았다. 로컬 타입 검사와 단위 66개도 통과했다.

## 증거와 남은 범위

Git 제외·권한 600인 `.local-backups/hosted-preview-20261108T131327152820Z/`에 `browser-report.json`(22개), `preservation-report.json`(31개 테이블), `browser-download-verification.json`, `member-download-verification.json`, 관찰한 인증 요청 주소, 스크린샷과 운영 배포 확인 기록을 보관한다. 사용자 비밀번호·운영 키를 보고서에 출력하지 않았다. 원시 보존 스냅샷은 암호 해시와 기존 기록을 포함하므로 비공개로 유지한다.

초기 22개 Preview 검증은 **이메일/암호 로그인과 핵심 조회·권한·다운로드**다. 이후 실제 Preview의 Google 로그인도 아래 절차로 검증했다. Kakao/Gemini 시험 설정은 아직 구성하지 않았다. Google의 기존 로컬 검증 결과와 이번 실제 Preview 검증을 구분한다.

### Preview Google 로그인 — 테스트 연결·실제 인증 검증 완료

사전 읽기 전용 점검에서 테스트 프로젝트의 Google 제공자는 비활성화, Client ID/Secret은 없음, Site URL은 `http://localhost:3000`, 추가 반환 주소는 빈 값이었다. 로컬 Google Client ID는 운영에서 쓰는 것과 같았다. Google Cloud `book-club-498111` 프로젝트에는 운영과 일치하는 기존 `book-club 웹 클라이언트` 하나만 있었다. 기존 클라이언트나 운영 로그인 설정은 수정하지 않았다.

새 `book-club-preview` 웹 클라이언트 양식을 준비한 뒤 소유자가 직접 생성하고 JSON을 다운로드했다. JSON은 로컬 파일에서 읽어 검증했으며 새 Client ID가 운영과 다르고, JavaScript 원본은 위 고정 Preview·브랜치 주소 두 개, 승인된 리디렉션 URI는 **테스트 전용** `https://teecqonbbmsritclbcyc.supabase.co/auth/v1/callback` 하나뿐임을 확인했다. Client Secret은 채팅·로그·Git·보고서에 기록하지 않았고 Vercel이나 기존 로컬 환경변수도 수정하지 않았다. Google 프로젝트의 기존 동의 화면은 공유하며 별도의 동의 화면·권한 변경은 요청하지 않았다.

고정된 테스트 프로젝트에만 Auth 설정 PATCH 1회를 보냈다. Google 제공자를 켜고 새 Client ID/Secret을 연결했으며 nonce 검사 생략은 false로 유지했다. Site URL은 브랜치 Preview 주소, 허용 반환 주소는 두 Preview의 정확한 `/auth/callback` 경로와 `next` 쿼리 변형 네 개다. 호스트 와일드카드·운영 URL은 추가하지 않았다. 방법은 [Supabase Google 로그인 문서](https://supabase.com/docs/guides/auth/social-sign-in/auth-google)와 [반환 URL 문서](https://supabase.com/docs/guides/auth/redirect-urls)를 기준으로 한다.

첫 저장 후 비교 도구는 API의 비밀키 조회값이 원문이라고 가정해 전체 일치 검사에서 중단됐다. 비밀키 조회값만 입력 원문과 달랐으며 단순 SHA-256 가정으로도 확인되지 않았다. 재저장·키 재발급은 하지 않았다. 원문을 읽어 독립 검증했다고 주장하지 않고 실제 Google 인증 성공으로 연결이 작동함을 검증했다. 나머지 요청한 다섯 설정은 모두 일치했고, 테스트의 관련 없는 Auth 설정과 운영 Auth 전체 지문은 동일했다. 최초 검사 보고서는 그대로 남기고 `final-verification.json`에 최종 결과와 제한을 분리해 기록했다.

브랜치 Preview의 새 탭에서 실제 `Google로 계속하기`를 클릭했다. 이미 소유자가 로그인·승인한 Google 브라우저 상태가 재사용되어 계정 선택·추가 동의 화면 없이 인증 후 `/signup?next=%2Fmeetings%2F57e15624-e1b9-48b6-9601-2ff293b2d75a`로 복귀했다. 이름 입력 화면에 표시된 계정은 테스트 DB의 새 Google 인증 계정과 일치했다. 새로고침 후에도 인증 상태가 유지되고, 가입 전 계정의 모임 직접 접근은 같은 이름 입력 화면으로 돌아왔다. 이름의 `완료`·가입 신청·회원 승인·권한 부여는 실행하지 않았다. 첫 테스트 Google 계정에는 프로필·회원 기록이 없으므로 이 화면은 정상이다. 기존 운영 계정 ID나 권한을 복사하지 않았다. 원래 고정 Preview의 멤버 로그인 탭도 변경하지 않았다.

설정 전후에는 운영 13개·테스트 18개 테이블의 비교 대상 기록이 모두 동일했다. Google 인증 후에는 **테스트 Auth 사용자 1개·Google identity 1개 생성만** 확인했으며, 기존 모든 비교 대상 기록은 보존됐다. 운영은 계속 Auth 23개·일정 11개·파일 14개이며, 테스트는 Auth 4개·프로필/회원 각각 3개·일정 3개·파일 1개다. 사용자가 추가한 시험 일정도 유지했고 초기화하지 않았다. 운영 Auth 설정 전체 지문과 원본 dump 해시도 최종 대조에서 동일했다. 운영 DB 쓰기·운영 배포·main 병합은 실행하지 않았다.

사전 점검 증거는 Git 제외 `.local-backups/preview-google-20261108T133657043756Z/`, 실제 연결·인증 증거는 `.local-backups/preview-google-configuration-20261108T135048313280Z/`의 `final-verification.json`, `google-preservation-report.json`, `browser-google-report.json`, `google-login-verified.jpg` 등에 보관한다. 이번 최종 화면의 리소스 목록에는 Supabase 요청이 남아 있지 않아 브라우저 네트워크 목적지를 별도 관찰했다고 주장하지 않는다. 대상은 테스트에만 생성된 Google identity와 화면 계정의 일치, 운영·테스트 보존 대조로 확인했다. Google 계정의 이름 등록·가입 승인 이후 전체 회원 이용 흐름은 이번 Google 검증 범위에 포함하지 않는다.

운영 전환 전에는 외부 Auth/REST/RPC/Storage 쓰기를 실제로 차단할 수 있는 수단의 확정·검증과, 쓰기 중단 시점의 최종 DB/파일 백업·복원 검증이 계속 필요하다. 구체적인 운영 전환은 별도 승인 범위다. 기존 Preview에 포함된 옛 운영 연결은 소급 제거된 것이 아니며 접근 보호를 유지한다.
