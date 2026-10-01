# 공개 PVP 배포 개발단위

대응 기획: [로비의 비공개 방과 방 수명](../기획서/화면구성.md), [경기 설정의 비공개 PVP](../기획서/게임모드.md).
Vercel 화면과 Render 단일 WebSocket 서버로 서로 다른 기기의 비공개 PVP를 제공한다. 로그인·6자리 코드·서버 전투 판정·덱 비공개·설정 공유·이탈·재대전 규칙을 유지한다. 날짜별 기록은 당시 구현과 확인 범위의 증거로 보존한다. 2026-10-01에는 경기 설정 팝업·환경 선택·포탑 소유진영 SP 보상·SP 초과 보유에 이어 로컬 설정 프리셋과 JSON 가져오기·내보내기를 공개 배포했다.
최신 [PR #12](https://github.com/seonhjeo/SurfPrototype/pull/12)의 main 커밋은 Vercel Production Ready·Render Live이며 공개 프리셋의 과거 파일 복원·명시적 덮어쓰기·새로고침·v2 JSON 실제 다운로드를 확인했다. Render의 첫 배포는 내부 상태 확인 시간 초과로 실패했으나 같은 커밋·설정의 한 번 재시도로 성공했다. 배포 후 공개 AI/PVP의 자연 종료·재대전·이탈과 콘솔 오류/경고 0을 확인했다. 앞선 PR #11의 양 플랫폼 배포와 대전 결과는 아래 당시 증거로 보존한다.

## Render 단일 WebSocket 서버 배포

- 기획: [비공개 방과 초대 코드](../기획서/화면구성.md#로비), [방 수명](../기획서/화면구성.md#방-수명과-오류-처리--2026-09-30-확정).
- 기존 `server/start.mjs`와 `server/multiplayer.mjs`를 Node.js 24.19.0의 단일 프로세스에서 실행한다. 방과 전투 상태를 메모리에서 공유하므로 복수 인스턴스로 나누지 않는다.
- 현재 서비스는 Render 대시보드에서 수동 구성한 Singapore 지역 Free 단일 Web Service이며 PR #12의 `main`·`0293a4b`을 배포했다. `Auto-Deploy=On Commit`으로 main 커밋을 자동 반영한다. `render.yaml`의 브랜치는 이전 작업 브랜치 `0.3.1-private-connection-fix`로 현재 서비스 설정과 다르다.
- 실제 빌드는 `npm ci && npm run build`, 시작은 `npm run start`, `NODE_VERSION=24.19.0`, 상태 확인은 `/healthz`다. Render가 제공한 `PORT`를 사용해 `0.0.0.0`에서 접속을 받는다.
- `MULTIPLAYER_ALLOWED_ORIGINS=https://surf-prototype.vercel.app`로 Production 출처만 허용한다. Preview 검증은 해당 출처를 별도로 추가해야 한다.
- `/healthz`의 정상 응답과 `/ws`의 WebSocket 연결을 확인한다. 상태 확인 응답에 방·덱·인증 정보를 넣지 않는다.
- 서버 재시작·재배포·절전 시 메모리의 방이 사라진다. 경기 중 연결 종료는 기존 이탈 규칙을 적용하며 재접속을 추가하지 않는다.
- 초기 배포 증거 (`main`의 `5df7f3a`): 서비스 `srv-daubkvdg1s2s73c9ouk0`, 배포 `dep-daubl05g1s2s73c9p1hg`가 50.6초 후 Live 상태로 확인됐다. 공개 WebSocket은 `wss://surf-multiplayer.onrender.com/ws`다.
- 검증: [실제 서버 상태 확인](https://surf-multiplayer.onrender.com/healthz)이 HTTP 200과 `{"status":"ok","service":"surf-multiplayer"}`를 반환했다. 세 모드에서 공개 WebSocket 연결·방 생성·참가·덱 비공개·전투·소환·이탈을 통과했다.
- [x] 개발 완료

## Vercel 화면 연결과 공개 대전 검증

- 기획: [경기 설정과 경기 유지](../기획서/게임모드.md), [비공개 방·게임·결과](../기획서/화면구성.md).
- 최초 공개 배포에서는 Vercel Production의 `VITE_MULTIPLAYER_URL=wss://surf-multiplayer.onrender.com/ws`를 설정하고 `main`의 `5df7f3a`를 재배포했다. 로컬 실행은 같은 출처의 `/ws`를 사용한다.
- 초기 배포 증거: Vercel 배포 `4EpFoupAs8JRaYwaNzJbCnb4abpW`가 8초 후 Ready 상태로 확인됐다. 공개 화면은 [surf-prototype.vercel.app](https://surf-prototype.vercel.app/)이다.
- 독립된 두 클라이언트에서 6자리 방 생성·코드 참가·방 모드 공유·덱 비공개·준비·소환·결과·이탈·재대전을 검증한다. 서로 다른 디바이스·네트워크의 확인 범위를 구분한다.
- 대기방 방장 이탈은 방 종료, 참가자 이탈은 준비·선택 타이머 초기화, 경기 중 이탈은 패배로 처리하는 기존 규칙을 확인한다.
- Render Free는 수신 HTTP 요청이나 기존 WebSocket 메시지가 15분 없으면 절전하며 다음 요청·새 연결에서 기동하는 데 약 1분이 걸릴 수 있다. [공식 절전 제한](https://render.com/docs/free#spinning-down-on-idle).
- 클라이언트는 최초 연결 전에 `/healthz`를 확인하고 최대 120초 동안 기동을 기다린다. 개별 요청 제한은 10초, 재시도 간격은 2초다. 이 대기는 최초 연결에만 적용하며 경기 재접속을 추가하지 않는다.
- PVP 화면은 좌표를 150ms 동안 보간한다. 전투 판정·SP·소환·승패는 서버 상태를 따르고 AI 대전 계산은 유지한다.
- 구현 검증: 2026-09-30 Node.js 24에서 자동 테스트 59개·타입 검사·프로덕션 빌드가 통과했다. 기존 전투·WebSocket 48개, 상태 확인과 기동 대기 4개, 화면 보간 7개를 포함한다.
- 로컬 브라우저 두 클라이언트(`http://localhost:5192`)의 생성·참가·준비·양쪽 전투·소환·상대 나가기 후 승리 화면을 확인했다.
- 공개 WebSocket 자동 흐름 검증에서 기본·자동획득 금지·처치획득 금지의 세 모드별 방 생성·참가·덱 비공개·전투 시작·소환·기권 결과를 통과했다.
- 공개 대기방에서 방장 이탈 시 양쪽 방 종료·코드 무효화, 참가자 이탈 시 방장 준비 해제·타이머 초기화·상대 연결 해제·같은 코드 재입장을 확인했다.
- 공개 WebSocket 정상 대전은 25.83초에 `fort-destroyed`로 종료하며 양쪽 결과가 같았다. 방장 재대전 요청을 상대에게 표시하고 참가자 동의 후 같은 코드·모드 유지, 양쪽 덱·준비·재대전 상태 초기화와 새 30초 타이머를 확인했다. 다시 양쪽 준비 후 새 경기의 경과 1초 미만·양쪽 SP 5·유닛 0을 확인했다. 오류 메시지 없이 테스트 방과 연결을 정리했다.
- 실제 공개 브라우저 두 탭에서 방 `914772` 생성·참가 → 시간 만료 후 덱 자동 보충·경기 시작 → 양쪽 전사 소환 → 성채 파괴로 무승부 결과를 확인했다.
- 양쪽 다시 대전 선택 후 같은 방 코드와 새 늪 맵의 대기방 → 양쪽 전사 선택·준비 완료 → 새 경기·양쪽 소환 → 참가자 나가기 후 방장 승리 화면까지 확인했다.
- 확인 범위: 한 브라우저의 독립된 두 탭과 공개 WebSocket 클라이언트다. 서로 다른 기기·네트워크 및 실제 15분 절전 후 최초 기동 대기 시간은 아직 검증하지 않았다.
- 배포·에이전트 검증 완료는 사용자 로컬 테스트나 `dev`·`main` 병합 요청을 대신하지 않는다.
- [x] 개발 완료

## 모드 설정 리팩터링 Production 검증 — 2026-09-30

- 사용자 로컬 테스트 완료와 명시적인 `dev` 병합·배포 요청 후 [PR #8](https://github.com/seonhjeo/SurfPrototype/pull/8)을 병합했다. Production 커밋은 `9291655de441e1426ab270e1960b097b2f4acb86`이며 기존 세 모드의 새 기능 OFF·라인 0을 유지한다.
- 구현 검증은 Node.js 24의 자동 테스트 95/95개·타입 검사·프로덕션 빌드 통과다. PR과 병합된 main의 GitHub `Typecheck and build` CI도 SUCCESS로 확인했다.
- Vercel Production 배포 `AeRoLrh9Dc1KLg4K5b3JtsxeVTyo`, GitHub 배포 `6756122773`의 커밋이 위 main SHA와 같고 배포 완료/SUCCESS다. 공개 고정 주소 [surf-prototype.vercel.app](https://surf-prototype.vercel.app/)는 HTTP 200이며 [고유 배포 URL](https://surf-prototype-i6dhm8oxu-hoya14.vercel.app)도 기록한다.
- Render 서비스 `srv-daubkvdg1s2s73c9ouk0`는 main을 추적하며 `Auto-Deploy=On Commit`이다. 배포 `dep-dauddp2vcj2c73eotak0`가 45.6초 후 같은 main SHA의 Live 상태로 확인됐다. 서비스 설정을 변경하지 않았다.
- 배포된 공개 WebSocket에서 기본·자동획득 금지·처치획득 금지 세 모드를 확인했다. `room.rules`는 각 로컬 preset과 동일하고 양쪽의 모드·규칙이 같았다. 상대 덱 비공개, 구조물 없음, 경기 시작, 양쪽 사냥꾼 소환, 참가자 이탈 후 방장 승리를 확인했으며 오류는 없었다.
- 실제 Production 브라우저 두 탭에서 기본 모드 방 `410332`, 성 도로·맑음 환경을 사용했다. 방장 전사·참가자 궁수 선택과 준비, 양쪽 소환, 경기 경과 약 22초에 참가자 이탈 후 방장 승리와 성채 HP 874/874를 확인했다. 양쪽 콘솔 오류는 0건이었다.
- 확인 범위는 공개 서버의 WebSocket 클라이언트와 한 브라우저의 독립된 두 탭이다. 서로 다른 기기·네트워크, 실제 휴대기기 터치와 장기 밸런스 검증은 이번 확인에 포함하지 않는다. 앞선 `5df7f3a` 배포와 대전·재대전 기록은 당시 결과로 보존한다.

## 경기 설정 팝업 Production 검증 — 2026-10-01

- 사용자 PR 검토와 명시적인 배포 요청 후 [PR #9](https://github.com/seonhjeo/SurfPrototype/pull/9)를 2026-10-01 09:42:58 KST에 병합했다. Production 커밋은 `ab8c4ae90967894f0874a826400177680ceedee2`다. [main의 GitHub CI](https://github.com/seonhjeo/SurfPrototype/actions/runs/36797547872)가 SUCCESS다.
- 배포 전 로컬 검증은 자동 테스트 117/117개·타입 검사 포함 빌드 통과다. 기존 Phaser 번들 크기 500 KB 경고만 남았으며 [구현 검증](게임모드.md#환경-선택과-포탑-파괴-보상-검증--2026-10-01)을 따른다.
- Vercel Production 배포 `64Wk33jgsehftSz1Y9MzbxzJCNfk`, GitHub 배포 `6773372853`은 위 main SHA와 같고 bot/API 기준 completed·SUCCESS다. 완료 시각은 2026-10-01 09:43:15 KST다. [고정 공개 URL](https://surf-prototype.vercel.app/)과 [고유 배포 URL](https://surf-prototype-4bujr9w2i-hoya14.vercel.app)을 확인했으며 고정 URL은 HTTP 200이다.
- Render 서비스 `srv-daubkvdg1s2s73c9ouk0`의 배포 `dep-dauqp4psrm7s73ba6fgg`가 45.4초 후 같은 main SHA의 Live 상태다. [상태 확인](https://surf-multiplayer.onrender.com/healthz)은 HTTP 200이며 공개 WebSocket은 `wss://surf-multiplayer.onrender.com/ws`다.
- 공개 WebSocket에서 기본 무작위 설정의 방 생성·양쪽 규칙/환경 공유·상대 덱 비공개·시작 SP 5·전투·참가자 이탈 승리를 확인했다. 성 도로 고정/무작위 날씨와 무작위 맵/비 고정의 혼합 정책도 양쪽에 같았다.
- 숲·안개 고정·이동 0라인·포탑 3배치 라인×라인당 2개(양 진영 총 12개)·상자 2개·소유 포탑 파괴 보상 9 SP의 생성/공유/양쪽 소환을 확인했다. 다른 SP 획득을 끈 조건에서 약 2.733초에 참가자 포탑 파괴 후 소유 참가자의 SP가 40→49, 공격한 방장은 0을 유지했다. 양 클라이언트 상태가 같았으며 1초 뒤에도 중복 지급이 없었다. 테스트 방·연결을 모두 정리했다.
- 실제 Production 브라우저의 독립 두 탭에서 방 `513168`의 숲·비 고정, 이동 0라인·포탑 배치 2라인×라인당 1개·포탑 소유진영 파괴 보상 7 SP가 양쪽에 같음을 확인했다. 전사/궁수 선택·양쪽 준비·실제 소환 뒤 약 1분 50초에 방장 성채 0·참가자 성채 910으로 자연 종료했다.
- 양쪽 재대전 선택 후 고정 환경·규칙을 읽기 전용 설정에서 확인하고 새 덱 선택·준비로 전투를 시작했다. 표시 시간 04:59·SP 5·양 성채 HP 1,000으로 초기화했으며 약 7초 후 참가자 이탈로 방장 승리와 종료 사유를 확인했다. 두 탭의 콘솔 오류·경고는 0건이며 테스트 방은 정리했다.
- 공개 브라우저 확인은 한 브라우저의 독립된 두 탭과 공개 서버 연결이다. 서로 다른 기기·네트워크, 실제 휴대기기 터치와 장기 사용자 밸런스는 확인하지 않았다. 실제 사용자 밸런스 개발단위는 미완료로 유지하며 과거 배포 기록은 당시 증거로 보존한다.

## SP 초과 보유 Production 검증 — 2026-10-01

- 사용자 명시 병합·배포 요청에 따라 [PR #10](https://github.com/seonhjeo/SurfPrototype/pull/10)을 2026-10-01 11:31:32 KST에 병합했다. Production 커밋은 `7b61b6f1c69082d7bc6345ed1de0aec37272dde3`이며 [main의 GitHub CI](https://github.com/seonhjeo/SurfPrototype/actions/runs/36806248333)는 SUCCESS다. 사용자 로컬 테스트의 수행 보고가 있었다고 해석하지 않는다.
- 배포 전 자동 테스트 125/125개·타입 검사 포함 빌드와 로컬 AI/PVP 브라우저 검증을 통과했다. [구현 당시 검증](SP.md#sp-초과-보유-구현-검증--2026-10-01)의 공개 배포 미확인은 그 시점의 범위다.
- Vercel Production 배포 `FQ9t5v5654gPhA5wNLKnkfJEh348`, GitHub 배포 `6774749112`는 위 main SHA와 같고 2026-10-01 11:31:52 KST에 SUCCESS다. [고정 공개 URL](https://surf-prototype.vercel.app/)은 HTTP 200이며 [고유 배포 URL](https://surf-prototype-crald982u-hoya14.vercel.app)도 확인했다.
- Render 서비스 `srv-daubkvdg1s2s73c9ouk0`의 [배포 `dep-dausc1dg1s2s73d0chf0`](https://dashboard.render.com/web/srv-daubkvdg1s2s73c9ouk0/deploys/dep-dausc1dg1s2s73d0chf0)는 같은 main SHA로 53.2초 뒤 성공(`Deploy succeeded`)했고 새 Primary URL의 Live 로그를 확인했다. 완료 시각은 2026-10-01 11:32:27 KST이며 이후 [서버 상태 확인](https://surf-multiplayer.onrender.com/healthz)은 HTTP 200·정상 응답이다.
- 공개 WebSocket의 별도 두 방에서 양쪽 시작 SP 50과 실제 HP 200 상자 파괴 보상을 확인했다. 회복 ON은 보상 후 69 SP→1초 보존→기사단장 소환 비용 30 소비 후 39 SP→1초 뒤 40 SP로 회복을 재개했다. 회복 OFF는 보상 후 67 SP→1초 보존→같은 비용 소비 후 37 SP→1초 뒤 37 SP를 유지했다.
- 각 시점 양 클라이언트의 서버 SP 스냅샷이 일치하고 상대 덱은 비공개였으며 오류는 0건이었다. 참가자 이탈 후 방장 승리를 확인하고 생성한 테스트 방·연결을 모두 정리했다.
- 실제 Production 브라우저에서 자동 SP 획득 도움말의 `50 미만 회복·다른 보상 50 초과 가능` 안내와 콘솔 오류/경고 0건을 확인했다. 이번 공개 브라우저의 실제 경기는 실행하지 않았으며 AI/PVP 경기·375×667 초과 SP HUD 확인은 배포 전 로컬 브라우저 검증이다.
- 서로 다른 기기·네트워크, 실제 휴대기기 터치·사용자 로컬 테스트의 수행 여부와 장기 사용자 밸런스는 확인하지 않았다. 전체 54개 개발단위 중 53개 완료이며 실제 사용자 밸런스 단위는 미완료로 유지한다. 앞선 공개 배포 기록은 당시 증거로 보존한다.

## 로컬 설정 프리셋 Production 검증 — 2026-10-01

- 사용자의 명시적인 `dev` push·`main` PR 병합·배포 요청에 따라 [PR #11](https://github.com/seonhjeo/SurfPrototype/pull/11)을 2026-10-01 12:57:51 KST에 병합했다. Production 커밋은 `de8b6035872cde468794f9193def8a0c80e5c50c`다. 사용자 로컬 테스트 수행 보고가 있었다고 해석하지 않는다.
- [PR의 GitHub CI](https://github.com/seonhjeo/SurfPrototype/actions/runs/36812847496)와 Vercel Preview가 SUCCESS였고, 병합 뒤 [main의 GitHub CI](https://github.com/seonhjeo/SurfPrototype/actions/runs/36812909259)는 12:58:10 KST에 SUCCESS다. 배포 전 Node.js 24.19의 자동 테스트 140/140개·타입 검사·빌드는 [구현 당시 검증](로컬설정프리셋.md#로컬-설정-프리셋-구현-검증--2026-10-01)이며 이번 Production 검증과 구분한다.
- [Vercel 배포 `HRQxbp9k5J5DoTY5cgUDHsNYvpuM`](https://vercel.com/hoya14/surf-prototype/HRQxbp9k5J5DoTY5cgUDHsNYvpuM)은 위 main SHA의 Production·Latest·Ready다. GitHub 배포 `6775806642`는 12:58:03 KST에 SUCCESS였으며 [고정 공개 URL](https://surf-prototype.vercel.app/)은 HTTP 200이다. [고유 배포 URL](https://surf-prototype-npc50m93r-hoya14.vercel.app)도 확인했다.
- Render 서비스 `srv-daubkvdg1s2s73c9ouk0`의 [배포 `dep-dautkg5g1s2s73d1prvg`](https://dashboard.render.com/web/srv-daubkvdg1s2s73c9ouk0/deploys/dep-dautkg5g1s2s73d1prvg)는 Auto-Deploy로 같은 main SHA를 반영해 40.3초 뒤 `Deploy succeeded`와 `Your service is live` 로그를 확인했다. 완료 시각은 12:58:33 KST이며 [서버 상태 확인](https://surf-multiplayer.onrender.com/healthz)은 HTTP 200·정상 JSON 응답이다.
- 실제 공개 브라우저에서 처음 저장 목록이 비어 있음을 확인한 뒤 기존 JSON 파일을 가져왔다. 같은 파일을 반복해 가져오면 `숲 비 20SP (2)`를 추가했으며 새로고침 후 숲·비·시작 20 SP 프리셋을 불러와 복원했다.
- 공개 방 `130321`을 만들고 다른 탭에서 참가했다. 양쪽의 읽기 전용 전체 설정이 같았으며 양쪽 유닛 선택·준비·소환 후 소비한 SP 15 표시를 확인했다.
- 경기 경과 `00:42`에 방장 성채 0·참가자 성채 575 HP로 자연 종료했고 양쪽 패배/승리 결과가 일치했다. 양쪽 재대전 선택 뒤 최초 설정과 양쪽 읽기 전용 설정이 모두 같음을 확인했다.
- 새 덱 선택·준비로 시작한 재대전은 표시 시간 `04:59`·양 성채 1,000 HP·SP 20으로 초기화됐다. 참가자가 `나가기`를 누른 뒤 방장의 승리·상대 이탈 사유를 확인했다. 방장은 로비로 복귀하고 참가자 탭을 닫아 테스트 방과 연결을 정리했다.
- 두 탭의 콘솔 오류·경고는 0건이며 공개 화면 증거는 `/tmp/surf-presets-production.png`다. 이번 공개 사이트에서 파일 내보내기의 실제 다운로드는 재실행하지 않았다. 내보내기는 배포 전 로컬 Chrome의 1,515바이트 JSON 다운로드/가져오기 및 자동 테스트의 선택/전체 내보내기로 검증했다.
- 확인 범위는 한 브라우저의 독립된 두 탭과 공개 서버 연결이다. 서로 다른 기기·네트워크, 실제 기기 터치·한국어 IME·브라우저 재시작·장기 사용자 밸런스·사용자 로컬 테스트 수행 여부는 확인하지 않았다. 전체 58개 중 57개 개발 완료이며 실제 사용자 밸런스 단위는 미완료로 유지한다.

## 프리셋 버전 변환 Production 검증 — 2026-10-01

- 사용자의 명시적인 main PR 병합·배포 완료 요청에 따라 [PR #12](https://github.com/seonhjeo/SurfPrototype/pull/12)를 2026-10-01 14:23:09 KST에 병합했다. main 커밋은 `0293a4b71fffc90dded325c12965e4411e7518f9`다. 사용자 로컬 테스트 완료 보고가 있었다고 해석하지 않는다.
- 배포 전 최종 dev `63b10ef41223a8103ee8eb649979cc16816752d3`에서 Node.js 24.19.0의 `npm test` 154/154개(실패·건너뛰기 0개)와 `npm run build`의 전체 타입 검사·프로덕션 빌드가 종료 코드 0으로 통과했다. 기존 500 KB 청크 경고만 남았다. 로그는 `/tmp/surf-preset-migrations-release-tests.log`와 `/tmp/surf-preset-migrations-release-build.log`다. 앞선 기능 구현 단계의 32개 부분 검증과 PR #11 배포의 140개 검증과 구분한다.
- [PR의 CI](https://github.com/seonhjeo/SurfPrototype/actions/runs/36819427019)와 Vercel Preview `8xN4DFrEsv3fyaXSarACVimo1vqS`가 SUCCESS였다. [main CI](https://github.com/seonhjeo/SurfPrototype/actions/runs/36819515799)는 동일 main SHA에서 14:23:24 KST에 SUCCESS다.
- [Vercel Production 배포 `GggsYV1ptX1ZgbNG9XANDaab3mjS`](https://vercel.com/hoya14/surf-prototype/GggsYV1ptX1ZgbNG9XANDaab3mjS)는 동일 main SHA의 Ready다. GitHub 배포 `6776860711`은 14:23:35 KST에 SUCCESS이며 [고유 URL](https://surf-prototype-ij0sakujo-hoya14.vercel.app)을 확인했다. [공개 고정 URL](https://surf-prototype.vercel.app/)을 새로 열어 `index-DSPa14Ab.js` 자산을 확인했다.
- Render 첫 배포 `dep-dauusfg473hc73a62dj0`는 14:23:28 KST에 빌드가 성공했으나 15분 21초 뒤 14:38:31 KST에 `Deploy failed`·`TimedOut`으로 종료됐다. 내부 `healthz`의 성공 응답 대기 시간 초과다. 14:38:57의 `npm start`와 14:39:01의 localhost:10000 시작 로그는 늦은 기동 증거이며 성공 배포로 해석하지 않는다.
- 배포 담당은 같은 main SHA와 기존 서비스 설정으로 `Deploy latest commit`을 한 번 재시도했다. [재시도 `dep-dauv4m8jo6nc73eoklu0`](https://dashboard.render.com/web/srv-daubkvdg1s2s73c9ouk0/deploys/dep-dauv4m8jo6nc73eoklu0)는 14:40:41 KST 시작·14:41:03 빌드 성공 후 `Deploy succeeded`·Live로 확인됐다. 소스 링크의 전체 SHA가 위 main 커밋과 일치하고 14:41:18 서버 시작·14:41:21 localhost:10000·14:41:27 `Your service is live` 로그를 확인했다. Live 뒤 공개 `/healthz`는 HTTP 200·status ok이며 화면 증거는 `/private/tmp/surf-render-pr12-live.jpg`다. 추가 재배포·설정 변경은 없으며 아래 공개 AI/PVP 검증을 이어서 완료했다.
- 기동 지연 진단으로 메인 에이전트가 현재 프로덕션 `dist`와 Node.js 24.19.0에서 `server/start.mjs`를 임시 PORT 5175로 실행했다. 로컬 `/healthz`의 HTTP 200·정상 JSON과 종료 코드 0을 확인하고 SIGTERM으로 정리했으며 기존 5174 서버는 유지했다. 이번 main에서 서버 코드는 바뀌지 않았다. 이 로컬 진단은 공개 Render 배포 성공의 증거로 사용하지 않는다.
- 메인 에이전트는 공개 브라우저의 기존 v1 숲·비·20 SP 프리셋 두 항목 유지와 불러오기를 확인했다. `/tmp/surf-migration-v1-ui.json`의 구버전 항목(숲·비·27 SP·포탑 OFF/수량 3/배치 라인 2)을 가져올 때 기존 편집본 20 SP는 유지됐고 불러오기에서 27/3/2를 복원했다.
- 시작 37 SP로 명시적 덮어쓰기 → 새로고침 → 비공개 방 설정창 불러오기에서 숲·비·37/3/2를 복원했다. settingsVersion 999 파일은 오류를 안내하며 목록 3개와 현재 편집본 37 SP를 보존했다. 콘솔 오류·경고는 0건이며 `/tmp/surf-presets-migration-production.png` 화면 증거를 저장·검토했다.
- 배포 담당은 Chrome에서 `PR12 다운로드 검증`(숲·비·30 SP)을 새로 저장한 뒤 선택 내보내기를 실행했다. `/Users/jeongseonho/Downloads/surf-preset (1).json`은 14:26:10 KST에 실제 생성됐고 1,542바이트였다. 문서 version 2·항목 settingsVersion 1·이름·환경·시작 SP 일치를 확인했다. 다운로드 이벤트 대기의 시간 초과와 실제 파일 다운로드 성공을 구분한다.
- 양 플랫폼 배포 완료 뒤 공개 AI 대전에서 숲·비·시작 30 SP, 전사·궁수 소환과 전투를 확인했다. 경기 경과 `00:27`에 성채 파괴로 자연 종료한 패배 결과를 확인했으며 다시 대전은 숲·비·30 SP를 유지하고 준비 상태를 초기화했다. 새 경기 소환 후 `나가기`로 로비에 돌아와 정리했다.
- 공개 PVP 방 `473054`의 독립된 Chrome 두 클라이언트에서 숲·비·시작 30 SP의 동일 설정과 양쪽 소환·전투 동기화를 확인했다. 경기 경과 `00:45`에 성채가 자연 파괴돼 방장은 HP 326/0의 승리, 참가자는 0/326의 패배로 양쪽 결과가 일치했다.
- 재대전 신청 대기와 상대 신청 알림 뒤 같은 방의 덱 선택·준비 30초 및 숲·비·30 SP 유지를 확인했다. 새 경기는 표시 시간 `04:59`·양쪽 성채 1,000 HP·30 SP로 초기화됐다. 재소환 후 참가자가 나가 로비로 돌아갔고 방장은 `상대가 경기를 떠났습니다` 사유의 승리를 확인한 뒤 로비로 복귀했다. 14:50 KST에 종료된 방 `473054`의 재참가는 `초대 코드에 해당하는 방이 없습니다`로 거부돼 방 제거를 확인했다. 생성한 Chrome 게임 탭 3개를 닫아 테스트 방과 연결을 정리하고 기존 사용자·메인 에이전트 탭을 유지했다.
- AI·PVP 방장·참가자 콘솔의 오류·경고는 모두 0건이며 공개 전체 흐름 검증은 14:50 KST에 완료했다. 화면 증거는 `/private/tmp/surf-pr12-ai-result.jpg`, `/private/tmp/surf-pr12-pvp-result-host.jpg`, `/private/tmp/surf-pr12-pvp-result-guest.jpg`, `/private/tmp/surf-pr12-pvp-leave.jpg`, `/private/tmp/surf-pr12-pvp-cleanup.jpg`다. 전체 59개 개발단위 중 58개 완료와 기존 실제 사용자 밸런스 1개 미완료를 유지한다. 확인 범위는 공개 서비스의 한 컴퓨터 브라우저와 독립 클라이언트이며 서로 다른 기기·네트워크, 실제 기기 터치·한국어 IME·브라우저 재시작·장기 부하/밸런스·사용자 로컬 테스트 수행 여부는 미확인이다.

[README의 배포 절차](../../README.md#render-websocket-서버-배포) · [Render Web Service 설정](https://render.com/docs/web-services) · [개발문서 인덱스](index.md)
