# 현재 상태 — 단일 부글부글 전환 (2026-11-08)

최신 2026-11-09 실행 절차 준비(운영 미접속): 사용자가 흐름 요약 후 다음 준비를 요청했다. 운영 변경/점검/배포/main 병합 금지를 유지하며 **오프라인 입력 검사와 실행 체크리스트**까지만 준비했다. `scripts/prepare-single-club-cutover.py`는 고정 프로젝트/클럽, Preview565의 앱·설정·전체 migration 파일 목록과 바이트, 리허설1d3b0ba의 도구, 02→03→04 해시, 실제 백업·자료19개, 40/92·296·23 보고서를 대조해 `.local-backups/cutover-plan-20261108T155653242038Z/plan.json` 생성 및 `--verify` 재검증 성공. 네트워크/DB/비밀값 조회·SQL·배포 기능 없음. 기존 온라인 manifest는 바꾸지 않고 최종 백업으로 승격 거절. 로컬 계획은 승인 토큰/전자서명/실시간 차단 근거/SQL 실행기가 아니며 execution_allowed/production_ready=false 고정. 입력 변경 시 이 도구가 실패할 뿐 실제 SQL 실행을 강제로 막는 운영 실행기는 아직 아님. 안전 단위 검사35개 통과(기존29+신규6). docs/production-execution-checklist.md에 남은 준비·승인 후6단계/중단 기준·쓰기 재개 전후 복구 경계 정리; single-club-cutover.md의 낡은 게이트웨이/DB·Storage 전체 덮어쓰기 설명을 실제 시험한 public 범위 복구로 수정. **다음 구현은 관리형 Preview에서 시험할 대상/단계 확인 실행 경로**이며 아직 수행 안 함. 실제 운영 승인/점검 시간/당일 최종 DB+public복구덤프+모든파일백업복원은 남아 있다. 이번엔 운영/Preview/기존로컬DB/원본백업 변경0, 새 네트워크 접속0. 앱·마이그레이션 그대로, 로컬 커밋 가능/push 사용자 직접.

최신 2026-11-09 KST 쓰기 차단·복구 조사 완료(운영 미적용): 사용자 요청은 운영에서 쓸 실제 방법 확인이며 **운영DB/배포변경 금지·데이터보존 최우선** 유지. 권장 후보는 앱 점검 화면+임시 BEFORE STATEMENT 거절 트리거. `session_user`가 직접 postgres인 운영자만 허용하므로 서비스-role/RLS우회/SECURITY DEFINER에서도 HTTP DB로그인역할을 기준으로 차단한다. 공식 Supabase managed-schema trigger 허용 기능이며 전용 유지보수 기능이 보증됐다는 주장은 아님.

운영에는 GET 및 Management API `read_only:true` SELECT만 사용했다. 권한은 public/auth/storage45개중41개TRIGGER 가능, 제외4개는 auth/storage마이그레이션이력 및 비활성벡터테이블2개. S3enabled=true/vector=false/진행MPU와parts=0조회. Supabase UI 세션만료로 owner로그인요청→'로그인할게요'답변후실제로로그인확인. 탭18 settings/general읽기만, Save disabled, pause/restart/upgrade안누름. UI는Auth2.197.0/REST14.18/DB17.11.0.003, Storage버전없음. 기존 service-role을API에서메모리로만읽고 **GET Auth admin/users 1건 및 Storage bucket목록**후pg_stat_activity READONLY조회하여 실제로그인역할Auth=supabase_auth_admin/Storage=supabase_storage_admin(PostgreSQL application_name `Supabase Storage API 1.89.13`)/REST=authenticator확인. 키저장·출력없음. 세션생성/로그인/갱신/수정요청안함. 최종운영13개테이블 기존기록이13:50기준과동일, source dump와사전manifest자료19개(실파일14개)해시그대로. 운영mutation0/배포0/Preview DB변경0. 증거 `.local-backups/write-barrier-audit-20261108T141720527220Z/`의 capabilities/config-redacted/live-service-principals/final-preservation/verification-summary.json; 포인터 write-barrier-audit-current.json. `production_ready=false` 유지.

로컬 새Docker컨테이너만 시험: 신규 `scripts/write-barrier-sql.py`는 runtime_verified/single_club_rehearsal만 허용하고 기본 운영 DB명 postgres 거절(생성SQL도 현재DB·session_user검사). 직접 운영 실행 도구가 아님. `scripts/local-write-barrier.mjs` + `verify-local-service-flow.py --write-barrier-rehearsal --write-barrier-matching-services` 최종 **40흐름+92원본보존/파일14** 통과. 같은 Auth2.197.0/REST14.18/Storage1.89.13 공식이미지 별도pull·내부네트워크 사용, 기존로컬서비스교체/로컬.env수정없음. REST/SDF RPC/AdminAuth생성삭제·로그인/refresh/수정, 표준파일교체삭제/기존서명URL, TUS·S3신규/기존분할ID의진행·완료·취소차단, 읽기·전체DBdump복원·해제후같은토큰/URL/업로드재개성공. 차단전후 모든DB행과파일백엔드바이트일치. 최종 `.local-backups/local-write-barrier-20261108T153144751004Z/verification-report.json`, browser-report.json이란내부파일명이나이시험은브라우저UI가아닌실제HTTP/SQL/S3시험. source이미지와preservedchecks보고서참조. localStoragev1.60은prod의partialuniqueindex와안맞아기본upload42P10실패(차단통과로계산안함);호환공식1.84.32로검증후실제운영버전1.89.13확인해일치버전으로최종재검증. 새fs-xattr API setAttribute를기존set과호환처리. 원본백업수정안함. Docker새이미지만캐시에남고시험컨테이너/네트워크/복사앱정리확인.

`verify-production-restore.py --postgres-rehearsal --write-barrier-rehearsal` 최종 **296검사** `.local-backups/production-restore-verified-20261108T153150952866Z/verification-report.json`. 구DB에guard→02/03/04 COMMIT직전새테이블guard+동일Tx이력등록→원본보존→**쓰기를재개하기전**구앱구조·RLS/Storage정책·버전이력복구→guard해제. 처음public스키마rename복구는supabase_admin DEFAULTACL재생성권한부족으로실패해제품아닌로컬복구안을고침. 최종은**public스키마OID/defaultACL보존**, 앱테이블/함수/enum/seq만cutover_failed_public으로이동→frozen public전용덤프를DEFAULTACL TOC제외하여postgres로복구. Auth/Storage데이터그대로, Storage정책원상복구, 실패이력copy후신규3버전만라이브ledger정리,원래24이력보존. 실패변환데이터도비공개정확보존. 기존Realtime대상/API NOTIFY reload schema확인. 원본49COPY/2seq/14파일도검증. public/defaultACL관리형권한상승없이실행. 복구SQL/원시행은ignored폴더Mode600. 쓰기재개후이방식즉시복원금지, 새기록보존/병합계획먼저.

Python 안전회귀29개통과. 새원격배포/ProductionSQLexecutor/push 없음. 다음준비는 운영실행용 대상/단계확인장치와관리형Preview사전시험(권장), 진행HTTP본문종료·다른postgres관리도구중지·점검시간/담당자·최종중단DB/파일백업복원·별도운영승인. local은PG17.6(운영17.11계열)/파일백엔드(운영관리형객체저장소)이므로그차이와운영에서차단직접시험안한범위를명시. protocol ID진행/재개는시험했으나guardcommit시이미본문전송중인HTTP강제종료를시험했다고주장금지. 실제원격업무중단은전혀없음. docs/single-club-cutover.md의2026-11-09절이최신이며아래'지원문의필수/수단미확정'기록은이전상태. 문의/외부메시지는전송안함. 로컬커밋가능,push는사용자직접/mainmerge·운영DB/배포금지계속.

최신 운영 준비(운영 미접속): 사용자 요청으로 다음 안전 준비를 수행했다. `scripts/verify-maintenance-bridge.mjs`가 구 운영 커밋378cc2e+기존점검패치만 새ignored복사본에 적용하고 외부통신차단+가짜loopbackAuth API로 next build --webpack 및 18개실제HTTP(업무/OAuth/API/가상Action/RSC/변경메서드)503/no-store/retry60, 백엔드호출0, 점검해제200+가짜Auth양성대조 등 총23검사통과. Sentry /monitoring은SDK가미들웨어를건너뛰는기존예외라전URL503주장금지. 정적자원도예외. 첫시도/두번째검사의Sentry404·SSR클라이언트로그인표시가정오류는검증기기대값을수정했고제품코드변경없음;최종 .local-backups/maintenance-bridge-20261108T140830800Z/verification-report.json. `scripts/verify-readonly-freeze-limit.py`는 새내부Docker(DB/REST/helper,외부통신/공개포트없음)에합성canary만만들어DB읽기전용기본값on뒤에도기존연결/일반로그인BEGIN READWRITE/실제PostgREST PATCH쓰기가성공함을재현. .local-backups/freeze-limit-20261108T140555088161Z/verification-report.json. 임시서버/복사본/컨테이너/네트워크정리완료,기존로컬DB수정없음. 공식SupabaseKB 2026-11-04 전용유지보수모드없음/softfreeze한계,NetworkRestrictions는DB만이며Auth/REST/Storage API제외를확인. **운영쓰기차단수단은아직미확정**,상상한게이트웨이가준비된것처럼문서쓰지않도록 cutover step2수정. 다음필수관문은원래API도메인Auth/REST/RPC/Storage·service-role/진행업로드쓰기차단+관리자백업읽기를지원할실제수단/플랜지원여부확인및별도시험. 지원문의용항목을docs/single-club-cutover.md끝에준비,실제문의전송안함(명시권한없음). 원본dump및사전manifest자료19개(원본파일14개)해시/크기동일,앱/의존성/마이그레이션은Preview565동일. 종합 .local-backups/cutover-preparation-20261108T141111811264Z/verification-summary.json production_ready=false. 이번turn 운영/테스트Supabase·Vercel연결/변경/배포/점검활성화없음. 원래온라인백업을최종백업이라고간주금지. docs preflight/cutover/readiness/PR갱신. 로컬문서·준비도구커밋가능,push사용자직접/운영DB·배포·mainmerge금지계속유지.

최신 Preview Google 완료: 소유자가 새 클라이언트를 직접 발급하고 Downloads의 JSON 경로만 제공했다. 파일 내용은 메모리에서 검증/사용, 운영 Google ID와 다른 신규 ID·고정/브랜치 Preview 원본2개·테스트 Supabase callback1개를 확인. `.local-backups/preview-google-configuration-20261108T135048313280Z/configure-test-google.py --apply`가 테스트 teecqonbbmsritclbcyc에만 Auth PATCH1회(제공자/ID/Secret/nonce생략false/site_url브랜치/허용callback·next변형4개)를 보냈다. 최초 비밀키 원문readback 가정으로 비교실패했으나 재쓰기/재발급 없음. 조회값은 원문 및 단순SHA256과 달라 원문검증 주장금지; 실제OAuth성공으로 기능확인. 최종 `final-verification.json`은 Google실제연결true/운영config전체지문동일/테스트기타설정동일/운영쓰기0. 브랜치 Preview 새탭17에서 Google버튼→기존 소유자Google SSO/승인 재사용으로 계정선택·추가동의 없이 `/signup?next=%2Fmeetings%2F57e...` 도착. 화면이메일은 새testAuth계정과일치, reload세션/가입전모임차단도확인. 이름완료/승인/회원권한부여는안함. 초기기록31개테이블 기존행보존, 허용변화는 testAuth사용자+1/Googleidentity+1뿐. 테스트현재Auth4/프로필3/회원3/일정3/파일1, 운영Auth23/일정11/파일14와dump해시그대로. 원래immutable Preview멤버탭13/15 세션건드리지않고 새Google탭17 markDeliverable. 현재탭은가입이름화면이며정상. 증거folder포인터 .local-backups/preview-google-current.json, 원시before/after에실데이터있어Git제외유지. google-login-verified.jpg와browser-google-report.json,google-preservation-report.json 참조. 아래발급대기는이전상태. 다음 운영준비는 외부Auth/REST/RPC/Storage 쓰기차단의 구체수단검증과최종중단백업절차이며 운영DB/배포/mainmerge계속금지. push는사용자직접, 문서수정만로컬커밋가능. Kakao/Gemini미설정, Google가입승인이후회원흐름은미실행.

최신 Preview Google 사전 점검: 테스트 teecqonbbmsritclbcyc의 Google은 false/ID·Secret없음, site_url localhost3000/uri_allow_list빈값. 로컬 Google ID는 운영과 동일했다. CUA로 Google Cloud book-club-498111의 클라이언트 목록에서 기존 운영 book-club 웹 클라이언트 1개만 확인. 새 book-club-preview 웹 클라이언트 입력 양식(고정/브랜치 Preview 원본 2개, 테스트 Supabase /auth/v1/callback 1개)을 탭16에 준비하고 **만들기 누르지 않음**, markHandoff. 소유자에게 직접 만들기·JSON 다운로드 후 파일경로만 답하도록 비동기 질문 중(인증정보 채팅금지). 발급/테스트 Supabase 설정/실제 Google 로그인은 아직 미완료이며 기존 운영 클라이언트·공통 동의화면·운영 Auth를 변경하지 않았다. 전후 운영13/테스트18개 테이블 비교대상 동일, Auth config 전체 지문 동일, 원본 dump 해시 동일. 테스트는 사용자 추가 일정 포함 현재3개, 초기화 금지. 증거 .local-backups/preview-google-20261108T133657043756Z/, 포인터 .local-backups/preview-google-current.json. auth-config-baseline.json은 안전 요약/지문만, before/after-records는 비공개. google-client-ready.jpg는 Secret 없는 입력화면이다. 다음은 소유자 JSON 경로를 받아 신규 ID가 운영과 다르고 승인 URI가 테스트만인지 검증→테스트 프로젝트만 고정 대상 PATCH→prod config/records 재대조→브랜치 Preview 로그인으로 owner 직접 인증. 현재 immutable Preview에 사용자 탭15의 새 일정 ae0cb301-b995-4de2-88a3-b527945b2134가 있어 세션/일정 변경 금지. mainmerge/운영DB변경/운영배포금지, push사용자직접 유지. 상세 docs/hosted-preview-verification.md의 Google 사전점검 절.

최신 실제 Preview 완료: 사용자가 직접 `git push -u origin codex/single-club-transition`을 실행했다. 원격 작업브랜치=565c6cea6fb9e5e9a3447ee46ea8f6a22ed023dd, main=378cc2e 유지. Vercel dpl_2Z2S2TfsiEXnpgHMrALxXpD7ejuB, Preview/Ready, 고정 https://book-club-2kuklxtnz-scone-s-projects.vercel.app (브랜치 https://book-club-git-codex-single-club-transition-scone-s-projects.vercel.app). IAB 탭13에 새 Preview를 열고 관리자/멤버/대기 시험계정으로 실제 브라우저22개확인 완료: 로그인/잘못된암호안내/새로고침세션/과거모임/실제클릭PDF한글이름+597바이트해시/권한404/대기차단/기존URL/로그아웃/next목적지유지. 실제관찰Auth resource는 teecqonbbmsritclbcyc.supabase.co 하나. 직접스크립트검사는Vercel인증보호로막혀우회안함(번들검증미실행). 다운로드waitForEvent는타임아웃이나실제파일저장확인; Downloads의 미리보기-테스트.pdf,(1),(2) 모두시험PDF일치하고새로생성됨. 계정암호는비공개fixture파일을메모리로만읽어사용,실회원데이터복사없음. 업무변경버튼은누르지않음. 사후 운영13/테스트18개테이블 비교대상업무/보관/마이그레이션/계정ID·암호해시·identity/Storage행 모두동일(정상로그인시각·세션행제외). 원본dump해시유지. 운영Vercel도기존main378cc/Ready/book-club-five-nu 유지. 로컬tsc/단위66통과. 증거 .local-backups/hosted-preview-20261108T131327152820Z/{browser-report,preservation-report,browser-download-verification,member-download-verification}.json, verified-preview.jpg 등. 로컬재현기준도구는그폴더preservation-check.py before|after(일회성파일이미있어재실행전경로조정필요),공개요약 docs/hosted-preview-verification.md. 탭13은일반멤버시험계정으로지난모임에로그인한상태로deliverable유지. **Preview Google제공자/허용반환주소·Kakao/Gemini는미설정/미검증**. 다음은필요한Preview제공자설정과외부쓰기차단수단시험·최종중단백업준비. mainmerge/운영DB변경/운영배포금지유지. 이후문서커밋만로컬에추가하며push는사용자직접이라는방침유지. 아래'새Preview미실행'기록은이전상태다.

최신 완료: 사용자가 --resume 실행 성공을 보고했고 `.local-backups/preview-isolation-20261108T112238765928Z/vercel-env-20261108T123216739088Z.json`을 실제 확인했다. applied/preview_variables_verified/production_records_preserved=true, Production 기존10개ID유지, 값쓰기0, 신규배포없음. Secret원문검증=false 한계 유지. Vercel 새로고침으로 Preview에 testDB URL/anon Config·service-role Secret 3개가 Preview전용, Production에는 기존 DB/메일/Google 항목이 Production전용임을 확인했다. Preview공개URL을 표시해 https://teecqonbbmsritclbcyc.supabase.co 를 확인했고 실제비밀값은 펼치지 않았다. 메일/Google프로덕션키 Preview제외, Sentry토큰공유와 자동배포설정은기존유지. 운영DB8개테이블모든행 최초기준동일,Auth23/Storage14/운영마이그레이션01/원본dump해시동일(`production-preservation-after-separation.json`). UI증거 preview-final-ui.txt,production-final-ui.txt. **신규 Preview DB 연결 분리 선행조건은 완료**다. 기존Preview배포의 옛값은소급제거안됨, 접근보호유지. 새Preview배포/앱요청검증은미실행. push는사용자직접한다는방침유지,mainmerge/운영배포계속금지. 다음은분리된Preview배포후앱검증과 외부쓰기차단수단시험(운영아직미구성). 이번임시토큰은소유자폐기가능. docs/preview-isolation.md 최신. 아래중단/재개대기기록은이전상태다.

최신 환경 분리 오류 진단: 사용자가 소유자 API토큰을 숨김 입력해 첫 --apply를 실행했고 `.local-backups/preview-isolation-20261108T112238765928Z/vercel-env-20261108T121218703902Z.json`에서 RESEND_API_KEY의 Preview 제외 한 건 뒤 보존 비교로 중단됐다. DB키/Google키 변경은 아직 없다. --inspect 추가 후 사용자가 실행했고 `vercel-inspection-20261108T121648466560Z.json` 저장 확인: 차이는 해당 Resend ID의 visibility null→secret 한 건뿐. 모든 기존 API value는 빈 문자열(실제 비밀값 읽기 불가)이었다. 기존 도구가 표시정보/빈값지문을 실제 보존과 혼동한 점을 인정하고 수정했다. 새 --resume은 해당 실패의 GET-only 진단과 최신 상태/완료 scope를 대조한 후 해당 ID의 sensitive null→secret 보완만 허용하고 나머지 요청을 이어간다. 일반 --apply는 미해결 실패 있으면 차단한다. 토큰은 계속 비저장/소유자 입력. 실제 실패 형태 재현을 포함 Python26개 통과. 운영 8개 업무 테이블 전체 행 동일, Auth23/Storage14/마이그레이션01/원본dump해시 유지(`production-preservation-after-stop.json`). 소유자에게 `python3 scripts/separate-preview-env.py --resume` 실행을 비동기로 요청했다(결과 대기). 운영 값 PATCH/운영DB쓰기/배포/push 없음. Secret 원문 동일함을 직접 검증했다고 주장하지 않는다. 상세 docs/preview-isolation.md 최신. 아래의 'API 인증 대기/미실행' 문구는 첫 실행 전 기록이다.

최신 Preview 분리 작업: 사용자가 별도 테스트 DB/Preview 연결 분리를 명시 승인했고 운영 연결/기록 유지·운영 배포 금지를 재확인했다. 무료 조직에 `book-club-preview` (`teecqonbbmsritclbcyc`) 생성, 빈 DB에 27개 마이그레이션 적용. 실제 데이터 복사 없이 무작위 암호의 시험 계정 admin/member/pending 3개·일정 2개·질문/초대·새 PDF 1개를 만들고 실제 Auth/REST/Storage 검사 11개 통과. 운영 8개 업무 테이블은 전후 모든 행 동일, 계정23/파일14/운영마이그레이션01/원본dump해시 유지. 증거 `.local-backups/preview-isolation-20261108T112238765928Z/`, 포인터 `.local-backups/preview-isolation-current.json`. **Vercel 연결은 아직 공용이며 분리 완료가 아니다.** Secret Edit의 Environments가 disabled, Preview 동일명 추가는 충돌로 거부. 자동 검토가 플러그인(범위불명확) 및 공용항목 Delete 흐름을 거부하여 우회하지 않았다. Preview Branch Tracking은 일시 off가 반영됐지만 on으로 원상복구했고 확인했다. Production 변수/배포 설정·운영 DB·push/merge/deploy 변경 없음. 사용자는 기존 Vercel API토큰이 없다고 답했다. `scripts/separate-preview-env.py`는 소유자가 임시 팀 토큰을 getpass로 입력해 실행하도록 준비했다: scope-only PATCH로 Production 값/ID 보존, Preview에만 테스트 키 생성, 삭제/배포/Production 값 쓰기 차단. 6개 안전 가드 포함 Python21개 통과. 실제 API실행은 인증 대기. 임시토큰을 직접 생성하고 `python3 scripts/separate-preview-env.py --apply` 숨김 입력 실행 가능한지 비동기 질문을 보냈다(답 대기). `docs/preview-isolation.md`가 최신 안내. 이전 '미리보기 분리' 계획을 완료로 오인하지 않는다. 아직 push 금지, 실제 Preview 배포도 없음. Google Preview는 미설정이며 시험 이메일 로그인만 검증했다. 새 토큰은 채팅/파일/인자/로그에 받지 않는다.

최신 운영 준비 점검: Vercel 로그인 후 읽기 전용으로 실제 환경을 확인했다. Supabase URL/anon/service-role, Resend와 Google 변수는 Production/Preview 공용이다. Preview 자동 Branch Tracking, main 운영 배포+도메인 자동 연결이 켜져 있고 Vercel Authentication Standard Protection도 켜져 있다. 설치된 프로젝트 Integration은 없다. 원격 설정 변경/배포/push 없음. **Preview 운영 연결을 분리하기 전에는 현재 작업을 push하지 않는다.** 운영 DB는 `supabase_read_only_user`/읽기 전용으로 역할·소유권·supautils 정책 허용과 최신 버전01을 조회했다. 비밀값 조회/저장/출력 없이 이름·범위만 확인했다. 운영과 같은 비슈퍼유저 postgres로 오프라인 복원본의 02→03→04 실행과 228개 보존 검사 통과. 증거 `.local-backups/production-restore-verified-20261108T111156832783Z/verification-report.json`, 카탈로그 `.local-backups/production-permissions-20261108T111012472185Z/catalog-audit.json`. 검증 도구에 `--postgres-rehearsal` 추가. README의 모든 환경 동일 설정/앱 push 후 DB 적용 안내를 수정했다. 상세 `docs/deployment-readiness-audit.md`. 다음은 승인된 범위에서 Preview만 별도 시험 DB/메일/OAuth로 분리하는 작업이며 아직 원격 변경 승인/실행 전이다. 이후 실제 외부 쓰기 차단 수단을 확정·시험해야 한다. 운영 전환은 계속 금지. 아래는 이전 단계 기록이며 최신 상태는 이 문단과 해당 문서를 우선한다.

Google 실제 인증 결과 확인 완료: 사용자가 “이름 입력·가입 안내가 보여요”라고 답했고, IAB 탭 6의 실제 `/signup`과 인증된 이름 입력 화면을 읽기 전용으로 확인했다. 새 로컬 Auth 사용자 1명/Google identity 1개가 생성됐고 프로필/멤버십은 아직 없다. 동일 제공자 식별자가 운영 백업의 기존 관리자 identity와 일치하며 운영 프로필과 관리자 역할도 보존되어 있다. 원래 로컬 모임/회원/파일/보관 기록 및 기존 인증 ID·비밀번호 해시·Google subject는 그대로다. 운영 dump 해시도 동일. 증거 `.local-backups/google-oauth-check-20261108T103306740995Z/google-login-preservation.json`. 이름 등록·가입 승인·계정 삭제는 수행하지 않았다. 운영 DB 접속/설정·Google 콘솔·push·배포 변경 없음. 아래의 Google 인증 대기 문구는 이전 단계 기록이다. 최신 범위는 `docs/google-oauth-check.md`를 우선한다.

현재 Google 단계: 사용자에게 실제 계정 선택/동의 가능 여부를 물었고 “네, 직접 진행할게요” 답을 받았다. 로컬 Google client ID/secret은 실제 형식으로 설정되어 있고 반환 주소는 `http://127.0.0.1:54321/auth/v1/callback`이다. 실제 동의/최종 화면 결과는 아직 대기 중이며 Google 성공으로 기록하지 않는다. 로컬 앱을 `pnpm dev`로 재시작했다(실행 세션 46700). 사용자 Google 인증 코드가 dev 요청 로그에 있을 수 있으므로 이 세션의 원시 출력을 무심코 읽거나 출력하지 않는다. IAB 탭 6에 `http://localhost:3000/login?next=%2Fmeetings%2F20000000-0000-0000-0000-000000000002`를 열고 사용자가 직접 인증하도록 안내했다. 완료 결과 질문도 비동기로 요청했다.

콜백의 코드 교환 오류 무시 문제와 제어문자 next 주소의 외부 이동 가능성을 보완했다. 로그인 실패/취소는 안내와 원래 내부 목적지를 유지한다. 단위 전체 66개·타입 검사·별도 복사본 운영 빌드 통과. `.local-backups/google-oauth-check-20261108T103306740995Z/`에 기존 17개 테이블 스냅샷/현재 보존 결과와 빌드 로그가 있다. 현재 원래 기록/인증 ID·비밀번호 해시는 보존됐고 새 Google 계정/identity는 아직 관찰하지 않았다. 사용자가 완료하면 UI와 전후 보존을 다시 확인해야 한다. 상세 `docs/google-oauth-check.md`. 운영 DB/설정·Google 콘솔·push·배포 변경 없음.

최신 후속: 별도 복원 DB + 실제 로컬 Auth/REST/Storage + 앱/Playwright로 이메일 로그인, 잘못된 비밀번호, refresh token, 새로고침, 로그아웃, 역할별 이동, 기존 자료 6개 클릭 다운로드와 전체 파일 14개 HTTP 해시를 검증했다. 18개 흐름·92개 보존 검사 통과. 기존 23개 계정·identity·비밀번호 해시, 모든 기존 앱/보관/파일 객체 행, 원래 로컬 DB 17개 테이블과 dump/manifest는 유지됐다. 임시 계정 4개만 별도 복원본에 추가했다. Storage 기동 시 내부 storage.migrations 해시 1건만 재계산됐으며 ID/이름/시각/80개 건수는 동일했다. 외부 통신이 없는 내부 Docker 네트워크와 localhost 게이트웨이를 사용했고 모든 시험 서비스/앱/네트워크는 정리했다. 운영 연결 없음. 요약 `docs/local-service-flow-verification.md`, 원시 보고서 `.local-backups/local-service-flow-20261108T100907061916Z/verification-report.json`, 재현 `python3 -B scripts/verify-local-service-flow.py`. 실제 Google 계정 외부 인증은 미실행이며 운영 역할·배포 환경·쓰기 차단·최종 백업 검증은 계속 남아 있다.

최신 진행: 실제 운영 아카이브 `.local-backups/production-dump-20261108T052113760121Z/database.dump`의 격리 복원·전환 데이터 보존 검증을 완료했다. 운영 연결 없이 `--network none`인 별도 로컬 컨테이너에서 전체 복원, 아카이브 원본 49개 COPY 블록·시퀀스 2개·RLS 정의·파일 14개를 대조하고 두 번째 복원 DB에 02→03→04를 적용해 모든 기존 기록 보존을 확인했다. 226개 검사 통과. 실제 사용 중인 로컬 DB 17개 테이블도 전후 동일했다. 모든 시험 컨테이너는 정리했고 원래 백업/manifest는 유지했다. 생성 당시 manifest의 restore_verified=false를 고치지 않고 옆에 restore-verification.json을 추가했다. 최종 원시 보고서는 `.local-backups/production-restore-verified-20261108T053618984183Z/verification-report.json`, 공개 가능한 요약은 `docs/production-restore-verification.md`, 재현 도구는 `scripts/verify-production-restore.py`다. 역할은 비밀번호 없는 로컬 정의로 초기화했으며 스키마 예행연습은 격리 DB의 supabase_admin으로 수행했다. 실제 운영 역할 권한·Auth/OAuth·파일 HTTP 서비스 검증과 쓰기 중단 후 최종 백업은 남아 있다. 운영 DB/설정·push·배포는 계속 변경하지 않았다.

아래의 “운영 덤프/복원 미실행” 문구들은 이전 단계 당시의 기록이며 최신 상태는 위 문단을 우선한다.

백업 도구 두 번째 후속 수정: 사용자의 접속은 성공했지만 `PGOPTIONS`의 적용을 가정한 읽기 전용 확인에서 중단됐다. 명시적 `BEGIN READ ONLY` 안에서 상태·DB·부글부글 ID를 JSON 확인하고 롤백하도록 수정했다. `pg_dump` 자체의 읽기 전용 트랜잭션을 사용하고 잠금 대기 제한은 `--lock-wait-timeout=5s`로 지정한다. 로컬 새 임시 DB에서 기본 off → 트랜잭션 on, 쓰기 차단, 덤프·목록·복원, 원본/복원 기록 일치를 끝까지 검증했고 안전 가드 단위 테스트 9개 통과. 운영 데이터/역할/기본 설정은 변경하지 않았다. 실제 운영 덤프는 사용자 터미널에서 같은 명령으로 다시 실행해야 한다.

백업 도구 후속 수정: 사용자가 실행 시 연결 오류를 보고했고, 비밀번호 없이 재현한 결과 시스템 CA에 Supabase 루트가 없어 TLS 인증서 검증이 실패한 것이었다. `scripts/certificates/`에 공식 공개 CA를 추가하고 백업 도구가 검증된 파일을 임시 로컬 컨테이너 경로로 전달하도록 수정했다. `verify-full`과 읽기 전용 옵션은 유지했다. `--diagnose`로 실제 운영 경로의 TLS/호스트 검증을 통과했고 비밀번호 인증/전체 덤프는 아직 사용자 터미널 입력이 필요하다. 원시 오류를 숨기되 원인별 한국어 메시지를 제공한다.

운영 반영 준비: `codex/single-club-transition` 브랜치로 분리했다. 기준은 원격 main `378cc2e`이며 구 로컬 HEAD와 파일 내용은 동일하다. 운영 읽기 전용 API에서 `transaction_read_only=on`을 확인한 후 46개 테이블의 레코드 및 파일 14개를 `.local-backups/production-readonly-20261108T045110487853Z/`에 사전 복사하고 해시를 검증했다. 이 사본은 전체 DB 덤프/복원 검증을 대신하지 않는다. 조회된 자동 백업은 0개, PITR 비활성화다. 사용자는 기존 DB 비밀번호를 보관하고 있다. 본인 터미널에서 `python3 scripts/production-db-dump.py`를 실행해 숨김 입력할 수 있도록 준비했으며 실제 운영 덤프는 아직 실행 전이다. 상세 결과와 다음 순서는 `docs/production-preflight.md`, 미등록 PR 초안은 `docs/single-club-pr.md`다. 이 준비 작업은 운영 데이터·권한·설정 변경, push·배포를 하지 않았다. 이후에도 전체 아카이브·파일의 격리 복원 검증과 외부 쓰기 차단 검증 전에는 운영 전환하지 않는다.

1·2·3단계 화면/서버/DB 전환과 이전 구조 정리·회귀 검증을 로컬에서 완료했다. 운영 DB에는 2단계 전환을 적용하지 않았고 배포도 보류 상태다. 과거 기록의 "다음 단계"보다 이 문단과 README·docs/bootstrap.md를 우선한다.

데이터 보존이 최우선이다. 기존 로컬/운영 데이터를 초기화하거나 보관 스키마를 삭제하지 않는다. 승인된 멤버·관리자 권한과 계정·일정 ID·초대코드·파일 경로를 유지한다. 복구 가능한 DB/Storage 백업은 Git에서 제외한 `.local-backups`에 있다.

현재 코드: `lib/auth/membership.ts`, `lib/actions/club.ts`, `lib/services`, `lib/queries/club.ts`. 기존 `/clubs/…` 주소는 호환 연결만 제공한다. DB 구조는 `club_settings`·`members`·`invites`, 원래 테이블은 비공개 `legacy_multiclub`에 보관한다. 데이터 이동 전후 비교·복원·실패 롤백·빈 DB 초기 설치를 검증했다.

통합 테스트는 고정 로컬 컨테이너에서 매 시험을 롤백한다. 과거 다중 그룹 테스트 원본(`.ts.legacy`)은 실행하지 않는다. 기존 `resetDb` 방식도 사용하지 않는다. 최종 단위 31개·DB 통합 52개·조회 전용 브라우저 4개, 타입 검사와 빌드가 통과했다. `.local-backups/phase3-before.json`과 비교해 현재·보관 17개 테이블의 기존 레코드 및 계정 식별·인증 정보가 보존된 것을 확인했다. 화면 테스트는 기존 기록을 읽으며 회원·일정·참석·한줄 평을 수정하지 않는다. 보존 비교: `node scripts/check-local-records.mjs snapshot|compare .local-backups/파일명.json`.

추가 보완: 마이그레이션 04로 과거 참석 DB 우회 차단, 보관본의 외부 FK 분리 및 쓰기 거절을 적용했다. 03의 대상 선택은 검증된 UUID 기준으로 변경했다. 대표 데이터(실제 PDF·한글 파일명·세 공개 방식의 평·탈퇴/대기 사용자·OAuth identity·초대 만료/취소) 리허설 19개 검증을 통과했다. 최종 단위 39개·DB 통합 60개·브라우저 4개 및 빌드 통과. `hardening-before.json` 대비 현재/보관 17개 테이블 보존을 확인했다.

운영 절차는 `docs/single-club-cutover.md`, 구 버전 호환 점검 패치는 `scripts/maintenance-bridge.patch`다. 앱 점검 모드는 준비했지만 운영 게이트웨이에서 Auth/REST/Storage 직접 쓰기를 막는 설정은 아직 실행하지 않았다. 이 검증 전에는 운영 전환하지 않는다. 운영 배포·DB 변경은 계속 보류한다.

---

아래는 2026년 6월 당시의 학습·작업 기록이며 현재 동작 설명이 아니다.

# HANDOFF — 부글부글 앱 단단하게 만들기 (운영 안정성 트랙)

## Goal

사용자(`EUNJEONGMUN`)는 Java/Spring 백엔드 경력 + 현재 C/Nonstop Net24 환경 근무자. **첫 웹앱(Next.js 16 + Supabase + Vercel)을 만들어 운영까지 배포 완료**. SQL 기본기·Git PR 흐름은 익숙하지만 **프론트(React/Next/Node)는 약함**. 앞으로 8주에 걸쳐 앱을 단단하게 만들면서 자연스럽게 프론트/운영 역량을 보강하는 게 목표.

전체 로드맵 (단계별, 각 ~1주):
1. ✅ **관찰 도구 셋업** (Sentry + Vercel Analytics + Speed Insights) — **완료**
2. ✅ **CI/CD 안전망** (GitHub Actions + main 브랜치 보호) — **완료**
3. ✅ **Server Action 단위 테스트** (인프라 + 보안 핵심 3개 / 12 케이스 완료) — 다음 PR에서 나머지 action 확장
4. **React/Next 멘탈 모델 정리** (RSC vs Client, 'use client' 점검, Next 튜토리얼)
5. **E2E 핵심 흐름 확장** (Playwright 1개 → 5개 시나리오)
6. **DB 최적화** (`EXPLAIN ANALYZE`, 인덱스, RLS 회귀 점검)

## Current Progress

### 앱 자체
모든 기능 + 보안 가드 + 모바일 UX 최적화 + 운영 관찰 도구 통합까지 main에 push 되어 Vercel 배포 완료.

### 학습 트랙 (현재 위치)
**단계 1, 2, 3 (첫 PR) 완료.** 단계 3은 인프라 + 보안 핵심 3개 action (12 케이스) 까지 완료. 다음 PR에서 나머지 action 확장 예정.

#### 단계 1에서 깐 것
- **Sentry** (`@sentry/nextjs` v10.56.0)
  - Browser / Server / Edge 3개 환경 SDK init
  - `app/global-error.tsx` 최상위 에러 바운더리
  - Source map 자동 업로드 (`SENTRY_AUTH_TOKEN` Vercel 환경변수)
  - Session Replay + Tracing 활성화
  - Sentry MCP 서버 (`.mcp.json`) — Claude Code가 Sentry 이슈 직접 조회 가능
  - 운영 검증 끝 (스택트레이스 원본 파일명 매핑까지 확인)
- **Vercel Web Analytics** (`@vercel/analytics` v2.0.1) — 페이지뷰 / 방문자 / 인기 페이지 / Referrer
- **Vercel Speed Insights** (`@vercel/speed-insights` v2.0.0) — Web Vitals (LCP/INP/CLS/FCP/FID/TTFB) 측정
  - 첫 측정 결과: **Real Experience Score 96 (Great)** — 거의 모두 녹색, FCP만 노란색(2.23s)

#### 관련 커밋 (단계 1)
- `eb9abcd` chore(sentry): set up error monitoring via @sentry/nextjs wizard
- `f0e27e3` chore(sentry): remove example test pages after production verification
- `a2e7fff` chore(analytics): wire Vercel Web Analytics and Speed Insights
- `663fc9e` chore(sentry): rename project to book-club, tune sample rates, document token

#### 단계 2에서 깐 것 (이번 세션 후반)
- `.github/workflows/ci.yml` — PR + push to main 트리거. pnpm install, tsc --noEmit, vitest run. Node 22 LTS, concurrency cancel-in-progress
- **main 브랜치 보호 룰 (GitHub Rulesets)** — Require PR, Require status check `Typecheck & Unit Tests`, Block force pushes, Restrict deletions. **본인도 우회 못 함** (admin bypass 없음)
- PR 워크플로로 전환 — 실제 PR #1 (`docs(handoff): mark phase 2 complete`)을 만들어 검증. 머지 후 SHA 정렬도 표준 절차 (`git reset --hard origin/main`) 완료

#### 관련 커밋 (단계 2)
- `b379388` ci: add GitHub Actions workflow for typecheck and unit tests
- `d9df123` docs(handoff): mark phase 2 (CI/CD) complete (#1) — **첫 PR squash merge**

#### 단계 1/2 사이 — 관찰 도구 사용법 학습 (이번 세션 후반)
**셋업이 아니라 사용법** 익히기. 깔아둔 도구가 무용지물이 되지 않도록.

**Sentry 깊게 다룬 것**:
- Issues 탭 컬럼 의미 (Users / Events / Age / Trend) + 우선순위 판단 룰
- 이슈 상세 페이지의 **디버깅 4단계 recipe**: Users·Events → Tags 3개(env/release/transaction) → Stack Trace 강조줄 → Breadcrumbs
- 다른 섹션(Highlights / Trace Preview / HTTP Request / Contexts / Activity)은 99% 무시 가능. 1% 까다로운 케이스의 백업
- Alert 시스템: 기본 "high priority issues" 알람 외에 **Regression alert** (production only) 직접 셋업 + 테스트 메일 수신으로 채널 검증
- 테스트 에러 4개 Resolve 처리 → 깨끗한 상태

**관련 커밋**:
- `377c8e6` docs(operations): add operations runbook for daily/weekly monitoring (#3) — **OPERATIONS.md** 신규 문서

#### 운영 테스트 시범 (이번 세션, 2026-06-07)

OPERATIONS.md의 매일/매주 루틴 전에, **OPERATIONS.md가 만든 도구가 실제로 동작하는지 검증**하기 위해 12개 시나리오를 직접 PC + 모바일에서 실행. **이 과정 자체가 운영 안정성 학습의 핵심**이 됨 — 단순 테스트 통과가 아니라, 발견사항을 묶음 PR로 처리하는 흐름까지 한 사이클 완성.

**시나리오 (T1~T12, 12/12 통과)**: PC 로그인 → 모임 생성 (책 검색, 날짜/시간, 장소) → 제출 → PDF 업로드 → Gemini 추출 → 검수 저장 → 수정 → 공유 → 참석 토글 → 모바일 핵심 흐름 → 정리

**발견 사항 처리**:
| # | 처리 | PR |
|---|------|----|
| #1 (날짜/시간 input 간격, cosmetic) | 머지 | PR #7 |
| #2 (검색 헤더 바, cosmetic) | 머지 | PR #7 |
| #3, #4 (Gemini 페이지번호/순서 보존) | 즉시 머지 | PR #5 (`1710e30`) |
| #5 (공유 링크 `?next=` 보존, UX 회귀) | 머지 | PR #7 |
| #6 (모임 상세 Attendance 복원, UX) | **기각** — IA 결정(RSVP 홈 카드 한 곳) 유지 | - |
| #7 (Sentry catch 관찰성 구멍, 긴급) | 즉시 단독 머지 | PR #6 (`4efceb0`) |
| #8 (백그라운드 추출 결과 휘발, UX 회귀) | **유보** — 디자인 옵션 결정 필요 | - |
| #9 (Gemini 503 시 catch-all 메시지) | 진단 완료 → #10 으로 fix | - |
| #10 (Gemini 503 전용 안내 메시지) | 머지 | PR #7 |

**핵심 학습 순간**: 발견 #7 fix (catch에 `Sentry.captureException` 한 줄 추가)가 5분 후 발견 #9 진단을 가능하게 함. catch swallow → unknown → fix → 같은 사고 stack trace + breadcrumb 확보 → Gemini 503 transient임 확정. 운영 관찰성의 가치가 실시간으로 증명된 사례.

**관련 머지 commit**:
- `4efceb0` fix(discussion): capture extract failures in Sentry + console (PR #6) — 발견 #7 긴급 단독 fix
- `<PR #7 squash sha>` fix: post-ops-test bundle — UX polish, auth ?next= preservation, 503 retry copy — 발견 #1/#2/#5/#10 + Suspense bailout 후속 fix

**OPERATIONS.md 내용**:
- 즉시/PR직후 30분/매일 5분/매주 15분/매월 30분 체크리스트
- 알람 메일 도착 시 대응 runbook (New issue vs Regression)
- 이슈 디버깅 4단계 recipe
- 위험 신호 패턴 (빨간 신호 / 노란 신호)
- 빠른 링크 모음

#### 단계 3 진행 (이번 세션, 2026-06-12) — 첫 PR

`docs/superpowers/specs/2026-06-11-server-action-tests-design.md` 디자인 기반.

**완료**:
- 통합 테스트 인프라 (vitest config, dotenv, setup mocks, admin/auth/seed helpers)
- 보안 핵심 3개 action 12 케이스 (discussion-files host 가드 / approveMember RLS / applyToClub invite token)
- CI는 변경 없음 (로컬 전용)

**부수 발견 (다음 PR 후보)**:
- `approveMember`: 비-admin 호출 시 ok=true (UPDATE 0 rows). 화면에 "승인 완료" 노출 가능. action에 row count 검증 추가 필요.
- `applyToClub`: SQL 함수 `status` 필드 무시 → 이미 member여도 "신청됨" 메시지. action에서 status 분기 필요.

**다음 PR 후보**:
- 나머지 9+개 action 확장 (rotateInvite, transferAdmin, leaveClub, deleteClub, updateClub, createClub, createMeeting, updateMeeting, attendance toggle, ...)
- 위 부수 발견 2건 fix

#### Sentry 프로젝트 정보 (최신)
- Org slug: `eunjeongmun`
- Project slug: `book-club` (rename 완료)
- DSN: `https://fce608438305676ee890456c8c911d6d@o4511517199368192.ingest.us.sentry.io/4511517223026688` (Project ID 기반이라 rename 후에도 그대로 동작)
- Sentry MCP URL: `https://mcp.sentry.dev/mcp/eunjeongmun/book-club`

## What Worked

### 기술적 접근
- **Sentry wizard 자동 셋업**: `pnpm dlx @sentry/wizard@latest -i nextjs`. OAuth 로그인으로 DSN 자동 fetch + 모든 init 파일 + `next.config.ts` 래핑 + Vercel 환경변수 안내까지 한 방
- **운영 검증 절차**: 로컬 `pnpm dev` → `/sentry-example-page` → 에러 발생 → Sentry 대시보드 확인 → push → 운영에서 동일 절차 → 스택트레이스에 원본 파일명 확인 → 테스트 페이지 삭제
- **Vercel Analytics 자동 활성화**: 별도 토글 없이 패키지 + 컴포넌트 마운트 + 첫 데이터 도착하면 자동. "Enable" 버튼 찾지 말 것
- **`curl` + `grep`으로 운영 HTML 직접 검사**: Network 탭에서 안 잡힐 때 `curl -sL [url] | grep -i analytics`로 컴포넌트가 RSC payload에 들어갔는지 1초만에 확인 가능

### 협업 흐름
- **Spring/Logback 비유**: 거의 모든 새 개념에 비유 anchor 제공 → 학습 속도 크게 향상 (Sentry=Logback+APM, DSN=appender 주소, Source map=stack trace 복원, Web Vitals=APM p75 응답시간, GitHub Actions=Jenkins+Gerrit, Alert=oncall PagerDuty)
- **수동 push 분리**: 사용자가 commit은 위임하지만 push는 직접 — 운영 반영 직전 검토 시간 확보 (사용자가 명시적으로 그렇게 요청함)
- **TaskCreate로 다단계 작업 추적**: Sentry 5단계 + Analytics 4단계 + CI/CD 4단계 + Sentry 사용법 5단계를 task로 분해 → 진행 상황 시각화
- **두 시나리오로 룰셋 검증**: (1) main에 직접 push 시도 → 거절 확인. (2) PR → CI → squash merge → 정상 흐름. 룰셋 셋업 후 이 두 가지로 검증하는 패턴이 강력함
- **"많은 정보 vs 봐야 할 것" 압축**: 사용자가 "정보가 너무 많네요. 제가 주로 봐야할 것들만 알려주세요"라고 명시. → Sentry 이슈 페이지의 ~10개 섹션을 **4단계 recipe**로 압축한 게 결정적. 처음 학습할 땐 도구의 모든 기능 나열 대신 "이 순서로만 보세요" 패턴이 훨씬 유효
- **알람 채널 검증의 표준 절차**: (a) Alert list에서 룰 등록 확인 → (b) 룰 상세에서 저장된 조건 확인 → (c) Send Test Notification으로 실제 채널 검증. 마지막 (c)가 "운영팀의 oncall 콜 테스트"에 해당. 셋업 후 즉시 검증하는 습관 권장
- **TaskCreate 12개 시나리오로 시범 진행**: T1~T12 각각 한 줄 description으로 만든 후 in_progress/completed 토글. 시범 중 끊겨도 재개 가능 + 발견 사항을 누적 PR 목록으로 관리. 다른 학습자에게 권장 패턴
- **Atomic commit per 발견 + squash merge**: 한 PR 안에서 발견별로 commit 분리 (#1, #2, #10, #5 각 commit). 작업 중 진행 추적 명확 + 머지 시 squash로 어차피 합쳐짐. 학습자 입장에서 PR 구성 단계 보이기 좋음
- **Rebase로 commit 제거 후 영향 검증 절차**: 발견 #6 commit을 `git rebase --onto <parent> <commit> <branch>`로 깔끔 제거. 후속 검증 4단계: (a) `git diff main HEAD -- <원래 파일>` 빈 출력 확인 (b) working tree clean (c) 각 commit이 자기 파일만 건드림 확인 (d) `git range-diff`로 rebase된 commit이 원본과 동일한지 확인. 이 절차로 push 전 안전 보장
- **발견 #7 → #9 진단 사례**: 운영 관찰성의 가치가 같은 세션 안에서 한 사이클로 증명됨. catch에 `Sentry.captureException` + `console.error` 한 줄 추가하는 fix가 그 후 같은 에러의 stack trace + breadcrumb 확보로 직결. Spring 환경의 "catch 안 비우기" 원칙이 Next.js / Sentry 환경에서도 그대로 적용됨을 학습

## What Didn't Work (Don't Repeat)

### 기술적 시행착오
- **Claude Code `!` 접두사로 인터랙티브 CLI 실행 시도**: `pnpm dlx @sentry/wizard`가 `ERR_TTY_INIT_FAILED`로 즉사. `!`는 TTY 없는 백그라운드 bash라 `@clack/prompts` 같은 TUI 라이브러리 못 띄움. **인터랙티브 명령은 사용자가 직접 자기 터미널에서 돌려야 함** (memory에 `feedback_interactive_cli`로 저장됨)
- **Sentry wizard의 `pnpm-workspace.yaml` placeholder 버그**: wizard가 `allowBuilds:` 섹션에 `'@sentry/cli': set this to true or false`라는 문자열을 그대로 박아놓음. 다음 `pnpm add` 단계가 invalid value로 깨짐. 수동으로 `true`로 고치고 wizard 재실행해야 했음. 다음에 또 만나면 즉시 패치
- **Vercel 배포 "Initializing" 7분 stuck**: 첫 push 후 Vercel deployment가 Initializing에서 멈춤. 수동 Redeploy 트리거했더니 새 거가 Queued로 들어가 큐가 막힘. **해결**: 멈춘 거 Cancel → 큐 풀림 → 자동 재배포 시작
- **DevTools Network에서 `vercel`로 필터링**: Analytics는 `_vercel/insights/*` 경로라 "vercel" 검색하면 Vercel Toolbar/Feedback 위젯이 잡히고 정작 Analytics는 안 잡힘. **`insights` 또는 `_vercel` (underscore 포함)로 필터링해야 함**
- **Network 탭에서 안 잡힌다고 비활성화로 결론짓기**: 컴포넌트가 HTML에 들어가 있고 Vercel endpoint도 200이면 정상 동작 중. 사용자가 페이지 hydration 직전이나 다른 페이지에서 캡처했을 가능성. **대시보드의 데이터 도착이 ground truth** — 실제로 데이터 도착 확인됨

### 운영 시행착오
- **테스트 페이지 운영 노출 위험 인지**: wizard가 생성한 `/sentry-example-page` + `/api/sentry-example-api`는 공개 URL이라 누구나 에러를 의도적으로 발생시켜 Sentry 쿼터 소진 가능. 검증 끝나면 별도 커밋으로 삭제 (이번 세션 `f0e27e3`)

### CI/CD 시행착오
- **Status check 이름 mismatch (display name vs job ID)**: 워크플로의 `jobs.verify.name: Typecheck & Unit Tests`가 PR에 표시되는 check 이름이고, GitHub branch protection의 required status check도 그 display name을 매치해야 함. 처음에 job ID `verify`를 등록했더니 영원히 "Expected — Waiting for status to be reported"로 머무름. **Rule의 required check 이름은 PR Checks 섹션에 실제로 보이는 이름과 정확히 같아야 함**. 입문자가 거의 다 한 번씩 밟는 함정
- **HANDOFF.md outdated 가능성**: 이전 HANDOFF에서 "단계 3에서 vitest 깔자"라고 적었는데 사실 **vitest와 playwright는 이미 셋업되어 있었음** (validation 단위 테스트 3개, e2e 1개). 다음 세션은 단계 3을 "vitest 도입" 대신 **"Server Action 테스트로 확장"**으로 봐야 함
- **CI에 `pnpm build` 없음 → prerender 에러 Vercel preview에서야 잡힘**: 이번 세션 PR #7에서 `useSearchParams`를 client에서 추가했는데 `pnpm tsc --noEmit` + vitest는 통과. Vercel preview deploy가 처음으로 `useSearchParams() should be wrapped in a suspense boundary` 에러 잡음 → 추가 commit으로 Suspense 감싸기 fix. 교훈: **typecheck ≠ build**. dynamic API (useSearchParams, cookies, headers) 추가 시 PR 전 로컬 `pnpm build` 1회 권장. CI workflow에 `pnpm build` 추가 검토 가치 있음 (메모리 `feedback_local_build_before_pr`로 저장)
- **server action catch가 exception 통째로 삼킴 → 운영 진단 불가**: 단계 1 셋업 단계에 들어가 있던 `extractQuestionsFromPdf`의 catch가 `'발제문 추출에 실패했습니다.'`만 반환하고 `e`를 버려서, 실제 Gemini 503 발생 시 Sentry/Vercel logs 둘 다 비어있어 진단 1시간 지체. `console.error(e) + Sentry.captureException(e)` 두 줄 추가가 5분 후 같은 사고에서 stack trace 확보 → 즉시 원인 확정. 다음 세션에서 `lib/actions/**` 다른 catch들도 같은 패턴인지 grep 1회 권장 (메모리 `feedback_no_catch_swallow`로 저장)

## Next Steps

### 즉시 (다음 세션 시작 시)

**A. 단계 3 확장 (나머지 server action + 부수 발견 2건 fix) ← 주력**

첫 PR에서 인프라 + 보안 핵심 3개 (12 케이스) 완료. 다음 PR 타깃:
- 나머지 action: rotateInvite, transferAdmin, leaveClub, deleteClub, updateClub, createClub, createMeeting, updateMeeting, attendance toggle 등
- UX 버그 2건: approveMember가 비-admin에도 ok=true 리턴, applyToClub가 이미-member에 "신청됨"
- 패턴은 첫 PR과 동일 (`tests/integration/actions/*.test.ts` 추가만)

**B. 발견 #8 처리 (백그라운드 추출 결과 휘발, UX 회귀)**

이번 세션에서 발견되었지만 디자인 옵션 결정 필요해서 유보. 옵션:
- (a) `beforeunload` 가드로 사용자에게 경고
- (b) candidates를 DB에 임시 저장 → 재진입 시 복원 (schema 변경 필요)
- (c) 추출 중 navigation 차단 (UX 손상)

세션 시작 시 옵션 결정 → fix → PR. 단계 3 작업 사이의 짧은 휴식 같은 작업으로 적합.

**C. CI 워크플로에 `pnpm build` 추가 검토**

이번 세션에서 `useSearchParams` Suspense bailout이 Vercel preview에서야 잡힘. CI 워크플로(`.github/workflows/ci.yml`)에 `pnpm build` 단계 추가하면 다음 PR부터 같은 패턴 미리 차단. 단점: CI 소요 시간 증가 (현재 30초 → 1-2분 예상). 가치 판단 후 적용.

**D. Vercel Analytics / Speed Insights 사용법 (보충, 선택)**

지난 세션에 셋업했지만 사용법 학습 안 함. 단계 3 진행 중 짬짬이 5~10분씩 다뤄도 OK. OPERATIONS.md의 "매일 5분 루틴"으로 실습.

### 단계 4 이후 (다음 단계들)
- **단계 4 (React/Next 멘탈 모델)**: RSC vs Client, `'use client'` 점검, Next.js 캐시 계층 (`revalidatePath`/`revalidateTag`)
- **단계 5 (E2E 확장)**: 이미 `tests/e2e/main-flow.spec.ts` 1개 있음. 4개 더 추가 (회원가입, 모임 생성, 발제문 업로드, 공유)
- **단계 6 (DB 최적화)**: `EXPLAIN ANALYZE`, 인덱스 회귀 점검, RLS 정책 audit

### 학습 포인트 (다음 세션이 자연스럽게 다룰 것)
- **Next.js 캐시 계층**: ISR / `revalidatePath` / `revalidateTag` — 모임 수정 후 홈 카드 stale 가능
- **Supabase 통합 테스트 패턴**: 로컬 Docker 컨테이너에 시드 → 진짜 SQL 실행 → 정리. mocking보다 적합
- **Server Action 테스트의 함정**: cookies()/headers() 등 Next 런타임 의존성 → vitest mocking 필요

## 사용자 컨텍스트 (다음 에이전트가 알아야 할 것)

- **언어**: 한국어 응답 선호
- **백엔드 경력**: Java/Spring, 현재 C + Nonstop Net24 (트랜잭션 시스템)
- **SQL**: 기본 이상 (조인·인덱스·정규화 이해)
- **Git**: PR 흐름 익숙. **commit은 위임 OK, push는 본인이 직접 함** (이번 세션에서 명시)
- **프론트**: 처음 (React/Next/Node 학습 중)
- **Supabase/Vercel**: 이번 프로젝트로 처음 접함
- **AI 도구**: deep-interview·code-review·Sentry MCP 사용 경험
- **응답 스타일 선호**: 단계별 + Spring/SQL 비유 + 학습 포인트 명시 + 핵심만 짚기
- **트러블슈팅 스타일**: 막히면 스크린샷을 빠르게 제공 → 진단이 매우 빠르게 진행됨. 이 흐름 유지할 것
- **Bash 도구로 인터랙티브 CLI 절대 호출하지 말 것**: `!` 접두사도 안 됨. 사용자 본인 터미널 안내

## 핵심 파일/문서

### 기존
- `README.md` — Gemini·Kakao·IA·보안 가드 + `SENTRY_AUTH_TOKEN` 명시 완료
- `OPERATIONS.md` — **운영 일과 runbook (이번 세션 신규)**. 매일/주간/월간 체크리스트 + 알람 대응
- `.env.example` — 환경변수 템플릿
- `.omc/specs/deep-interview-meeting-detail-ia.md` — IA 리팩터링 결정 기록
- `lib/actions/discussion-files.ts` — 보안 가드 참고
- `lib/queries/meetings.ts` — `getNextMeeting`
- `components/meeting/MeetingHeaderMenu.tsx` — 3단 공유 폴백

### 단계 1에서 추가됨
- `instrumentation-client.ts`, `instrumentation.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts` — Sentry SDK 초기화 (각 파일에서 `tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1`)
- `app/global-error.tsx` — 최상위 에러 바운더리 (Sentry capture)
- `app/layout.tsx` — `<Analytics />` + `<SpeedInsights />` 마운트 (`</body>` 직전)
- `next.config.ts` — `withSentryConfig` 래퍼 (`project: "book-club"`, source map 업로드, tunnelRoute `/monitoring`)
- `.mcp.json` — Sentry MCP 서버 정의 (`book-club` slug, Claude Code 통합)
- `.env.sentry-build-plugin` — `SENTRY_AUTH_TOKEN` (gitignored, Vercel에도 등록 완료)
- `pnpm-workspace.yaml` — `allowBuilds: '@sentry/cli': true` 추가

### 단계 2에서 추가됨
- `.github/workflows/ci.yml` — CI 워크플로 (Node 22 LTS, pnpm 11)
- **GitHub Rulesets (main 보호)** — 코드 외부에 셋업됨. PR 강제, status check `Typecheck & Unit Tests` 필수, force push 금지, deletion 금지

### 이미 셋업되어 있던 것 (HANDOFF가 outdated였음)
- `vitest.config.ts` + `tests/setup.ts`
- `tests/lib/validation/*.test.ts` — zod schema 검증 (3 파일, 12 테스트)
- `playwright.config.ts`
- `tests/e2e/main-flow.spec.ts` — E2E 1개

## 메모리 (자동 참조됨)

- `feedback_interactive_cli`: 인터랙티브 CLI는 `!` 접두사로 못 돌림. 사용자 본인 터미널에 안내
- `feedback_local_build_before_pr`: PR 전 `pnpm build` 1회. tsc/CI는 prerender 에러 못 잡음
- `feedback_no_catch_swallow`: server action catch는 반드시 `console.error` + `Sentry.captureException`. exception 통째로 삼키지 말 것

## 환경

- macOS, zsh
- pnpm 11.5.0
- Node v26.0.0 (매우 신상 — Sentry instrumentation에서 `DEP0205 module.register() deprecated` 경고 발생하지만 동작은 정상)
- Next.js 16.2.6, React 19.2
- 로컬 Supabase Docker 컨테이너 (포트 54323 Studio)
- 운영: Vercel icn1 (서울) + Supabase Cloud + Sentry US
- Branch 정책: **PR + CI 통과 강제** (main 직접 push 차단됨). 작업은 feature branch → PR → Squash merge
- 운영 URL: `https://book-club-five-nu.vercel.app/`
