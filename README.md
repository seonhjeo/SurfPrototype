# Surf Prototype

본 개발 전 게임 아이디어와 조작감을 검증하는 가벼운 웹게임 실험 공간입니다.
`성채 공방전`은 유닛 10종 중 5종으로 덱을 만들고 SP로 병력을 소환하는 세로형 1대1 RTS입니다.
AI 대전과 6자리 코드로 참가하는 비공개 PVP를 지원합니다. 맵 4종·날씨 3종, 중립 웨이브와 보스, 자동 전투·스킬을 기획서 기준으로 구현합니다.

## 실행

Node.js **24.x**와 npm을 사용합니다. nvm 사용자는 `nvm install && nvm use`로 `.nvmrc`의 버전을 적용할 수 있습니다.

```sh
npm ci
npm run dev
```

개발 서버는 기본적으로 `http://localhost:5173`에 열리며 Vite 화면과 WebSocket 서버(`/ws`)를 함께 실행합니다.
`PORT=5174 npm run dev`처럼 포트를 바꿀 수 있습니다. Node.js 24의 TypeScript 실행 기능을 사용합니다.

로비에서 `AI와 대전` 또는 `비공개 방 만들기`를 누르면 경기 설정창이 먼저 열립니다. 맵과 날씨를 각각 무작위 또는 고정으로 선택한 뒤 이동 라인·중립 몬스터·미니언·포탑·SP 상자의 ON/OFF와 수량, 투석기·끓는 기름 사용 여부를 정합니다. 맨 아래 SP 획득 항목에서 시작·회복·처치 보상과 내 포탑 파괴 시 받을 SP를 설정합니다. 포탑 파괴 보상은 기본 OFF이며 켜면 파괴된 포탑을 소유한 진영에 개당 1~50 SP를 한 번 지급합니다. 설정 완료 후 준비방으로 이동하며 취소하면 방을 만들지 않습니다.
이동 라인은 0~3개입니다. 포탑 배치 라인 1~3개와 라인당 포탑 1~3개는 이동 라인과 별개로 정하므로 자유 이동에서도 포탑을 설치할 수 있습니다. 기본값은 시작 5 SP·초당 1 SP·자동 획득 한도 50 SP이며 중립 몬스터만 켜져 있습니다. 처치·포탑 파괴·상자 보상은 50을 넘겨 보유할 수 있고, 50 이상에서는 자동 획득만 정지합니다. 소비로 50 미만이 되면 자동 획득을 재개합니다. 상세 수량 범위는 [경기 설정 기획](Docs/기획서/게임모드.md)을 참고하세요.
비공개 방에 코드로 참가하면 방장의 경기 설정을 사용하며, 준비방의 `경기 설정 확인`에서 전체 규칙을 볼 수 있습니다. 재대전에서도 같은 설정을 유지하고 맵·날씨의 무작위 항목만 다시 추첨합니다. 준비방에서 맵·날씨를 보고 유닛을 고르세요.

설정창의 `내 프리셋`에서 현재 설정을 이름으로 저장하고 불러올 수 있습니다. `관리`에서 덮어쓰기·이름 변경·삭제를 하며, 프리셋은 같은 브라우저 프로필과 사이트에 저장되어 새로고침 후에도 유지됩니다. 저장·삭제는 즉시 반영되지만 불러온 경기 설정은 `설정 완료`를 눌러야 적용됩니다. 선택 항목 또는 전체를 JSON으로 내보내 다른 브라우저에서 가져올 수 있고, 같은 이름은 기존 항목을 유지한 채 `(2)`부터 번호를 붙여 추가합니다. 이름은 40자, 목록은 100개, 가져올 파일은 1 MiB까지 지원합니다. [프리셋 기획과 저장 범위](Docs/기획서/로컬설정프리셋.md)를 참고하세요.
양쪽 입장 후 30초가 지나거나 양쪽이 준비하면 빈 슬롯을 중복 없이 채워 전투를 시작합니다.
카드를 누르면 성채 앞에 소환하고, 카드를 아군 전장으로 끌면 놓은 곳에 소환합니다. 경계 밖·성채 위 드롭은 취소됩니다.
성채 파괴 또는 5분 종료 시 체력 비교로 승패를 정합니다. 경기 중 이탈·연결 종료는 패배이며 재접속은 없습니다.

```sh
npm run typecheck
npm run build
npm test
npm run preview
```

`build`는 타입 검사를 포함하며 결과물은 `dist/`입니다. `npm test`는 전투 규칙·WebSocket 방 흐름·서버 기동 대기·화면 보간을 검증합니다.
`npm run preview`는 정적 화면 확인용 서버이며 기본 주소는 `http://127.0.0.1:4173`입니다. 자체 PVP 서버를 제공하지 않습니다.

## 다른 기기에서 PVP 테스트

1. 한 컴퓨터에서 `npm run dev`를 실행합니다. 기본적으로 모든 네트워크 인터페이스에서 연결을 받습니다.
2. 같은 네트워크의 두 기기에서 `http://서버컴퓨터의내부IP:5173`에 접속합니다. 운영체제 방화벽에서 이 포트의 접속이 허용되어야 합니다.
3. 첫 기기에서 비공개 방을 만들고, 두 번째 기기에서 표시된 6자리 코드로 참가합니다.
4. 양쪽에서 덱 선택·준비 후 대전합니다. 상대 덱은 전송하지 않으며 전투 판정·SP·소환은 서버가 검증합니다.

서로 다른 외부 네트워크에서 대전하려면 두 기기가 접근할 수 있는 Node.js 서버가 필요합니다. 공개 구성은 Vercel 화면과 Render WebSocket 서버를 사용합니다.
`npm run build` 후 `npm start`로 화면과 PVP 서버를 함께 실행할 수 있으며 `PORT`로 포트를 지정합니다.
프로덕션 서버에는 `dist/`, `server/`, `src/game/`, `package.json`과 설치된 의존성이 필요합니다.
HTTPS 앞단에서는 WebSocket 업그레이드를 `/ws`로 전달하도록 구성합니다.

화면과 서버를 따로 배포할 경우 빌드 환경에 `VITE_MULTIPLAYER_URL`을 공개 `wss://서버주소/ws`로 설정합니다.
이 값은 공개 접속 주소이며 비밀키가 아닙니다. 서버의 `MULTIPLAYER_ALLOWED_ORIGINS`에는 허용할 화면 출처를 쉼표로 구분해 지정합니다. 출처는 프로토콜·호스트·필요한 포트만 포함하며 경로나 끝 슬래시는 넣지 않습니다.
선택 환경변수는 값 없는 [.env.example](.env.example)에 정리했습니다. `PORT`·서버 출처 제한은 프로세스 환경으로 전달합니다.

## Render WebSocket 서버 배포

Vercel은 화면을 배포하고 Render의 단일 Node.js 24 프로세스가 기존 WebSocket 연결과 방·전투를 관리합니다. 서버가 입장·덱·준비·SP·소환·결과를 검증하며 각 참가자에게 자신의 덱만 전달합니다. 공개 화면은 [surf-prototype.vercel.app](https://surf-prototype.vercel.app/), 게임 서버는 `wss://surf-multiplayer.onrender.com/ws`입니다.

1. 현재 Render 서비스는 대시보드에서 수동 구성했으며 [PR #10](https://github.com/seonhjeo/SurfPrototype/pull/10)의 `main`·`7b61b6f`를 배포했습니다. `Auto-Deploy=On Commit`으로 PR 병합 커밋을 자동 배포합니다. Node.js 24.19.0·Free 단일 인스턴스·Singapore 지역을 사용합니다. 저장소의 `render.yaml`은 이전 작업 브랜치 `0.3.1-private-connection-fix`를 가리키므로 현재 서비스의 배포 브랜치와 다릅니다.
2. Build Command는 `npm ci && npm run build`, 실제 Start Command는 `npm run start`(`npm start`와 같은 스크립트), Health Check Path는 `/healthz`입니다. `server/start.mjs`는 Render가 제공한 `PORT`로 `0.0.0.0`에서 접속을 받습니다. [Render Web Service 설정](https://render.com/docs/web-services)을 참고하세요.
3. 현재 Render의 `MULTIPLAYER_ALLOWED_ORIGINS`는 `https://surf-prototype.vercel.app`만 허용합니다. Preview에서 같은 서버를 테스트하려면 해당 출처를 정확히 추가해야 합니다.
4. [서버 상태 확인](https://surf-multiplayer.onrender.com/healthz)은 HTTP 200과 `{"status":"ok","service":"surf-multiplayer"}`를 반환합니다. 이 경로는 방 상태나 인증 정보를 노출하지 않습니다.
5. Vercel Production의 `VITE_MULTIPLAYER_URL`은 `wss://surf-multiplayer.onrender.com/ws`이며 설정 후 화면을 재배포했습니다. 환경변수만 바꾸면 기존 화면 번들에는 반영되지 않습니다.
6. 공개 화면의 독립된 두 클라이언트에서 방 생성·6자리 코드 참가·준비·소환·결과·재대전을 확인하고 [공개 PVP 배포 개발문서](Docs/개발문서/공개PVP배포.md)에 실제 배포 URL과 검증 범위를 기록합니다.

방은 한 프로세스의 메모리에서 공유하므로 서버를 단일 인스턴스로 운영합니다. 재시작·재배포·절전으로 프로세스가 종료되면 방이 사라집니다. 경기 중 연결 종료는 기존 규칙대로 패배이며 재접속은 제공하지 않습니다.

Render Free는 HTTP 요청이나 기존 WebSocket의 수신 메시지가 15분 동안 없으면 절전하고, 다음 요청이나 새 연결에서 기동하는 데 약 1분이 걸릴 수 있습니다. [Render Free의 절전 제한](https://render.com/docs/free#spinning-down-on-idle)을 참고하세요. 클라이언트는 최초 연결 전 `/healthz`를 확인하며 최대 120초 동안 기동을 기다립니다. 개별 요청 제한은 10초, 재시도 간격은 2초이며 경기 재접속은 추가하지 않습니다.

PVP 화면은 서버 상태 사이의 좌표를 150ms 동안 보간합니다. 전투 판정·SP·소환·승패는 서버 상태를 따르고 AI 대전의 계산은 유지합니다. 최초 공개 PVP 배포에서는 2026-09-30 Node.js 24의 자동 테스트 59개와 타입 검사·프로덕션 빌드가 통과했습니다. 당시 Render와 Vercel의 `main`·`5df7f3a` 배포가 각각 Live·Ready 상태였으며, 세 모드의 공개 WebSocket 방 생성·참가·덱 비공개·전투·소환·이탈을 검증했습니다. 실제 공개 브라우저 두 탭에서도 전투·결과·재대전·상대 나가기 후 승리 화면을 확인했습니다. 서로 다른 기기·네트워크에서는 아직 검증하지 않았습니다. 배포 ID와 상세 흐름은 [공개 PVP 검증 기록](Docs/개발문서/공개PVP배포.md)에 남겼습니다.

모드 설정 리팩터링 후에는 자동 테스트 95/95개·타입 검사·프로덕션 빌드를 통과했고 사용자가 로컬 테스트 완료 후 병합·배포를 요청했습니다. [PR #8](https://github.com/seonhjeo/SurfPrototype/pull/8)의 `main`·`9291655`를 Vercel Production과 Render에 같은 커밋으로 배포했습니다. 세 모드의 공개 WebSocket 규칙 공유·덱 비공개·양쪽 소환·이탈 결과와 실제 Production 브라우저 두 탭의 대전·이탈 승리·콘솔 오류 0을 확인했습니다. 당시 세 모드의 새 기능 OFF·라인 0을 유지했습니다. 상세 배포 ID와 확인 범위는 [당시 Production 검증](Docs/개발문서/공개PVP배포.md#모드-설정-리팩터링-production-검증--2026-09-30)에 기록했습니다.

경기 설정 팝업과 맵·날씨 선택·포탑 소유진영 SP 보상은 사용자 승인 후 [PR #9](https://github.com/seonhjeo/SurfPrototype/pull/9)로 배포했습니다. 2026-10-01 09:42 KST의 `main`·`ab8c4ae`에 [GitHub CI](https://github.com/seonhjeo/SurfPrototype/actions/runs/36797547872)가 성공했고, 같은 커밋의 Vercel Production 배포 SUCCESS와 Render Live를 확인했습니다. 공개 화면과 서버 상태 확인은 HTTP 200입니다. 공개 WebSocket에서 설정 공유·덱 비공개·포탑 소유진영 SP 지급도 확인했습니다. Production 브라우저 두 탭에서 방장 설정 공유·양쪽 소환·성채 자연 파괴·고정 환경 재대전·새 경기 초기화·참가자 이탈 승리와 콘솔 오류/경고 0을 확인했습니다. 배포 ID와 확인 범위는 [경기 설정 Production 검증](Docs/개발문서/공개PVP배포.md#경기-설정-팝업-production-검증--2026-10-01)에 기록합니다. 서로 다른 기기·네트워크·실제 휴대기기 터치는 이번 확인에 포함하지 않습니다.

SP 초과 보유는 사용자 명시 병합·배포 요청에 따라 [PR #10](https://github.com/seonhjeo/SurfPrototype/pull/10)으로 배포했습니다. 2026-10-01 11:31 KST의 `main`·`7b61b6f`에 [GitHub CI](https://github.com/seonhjeo/SurfPrototype/actions/runs/36806248333)가 성공했고, 같은 커밋의 Vercel Production 성공과 Render 배포 성공·Live 로그, 공개 화면·서버 상태 HTTP 200을 확인했습니다. 공개 WebSocket에서 상자 보상으로 69 SP를 보유·유지하고 30 SP 소비 후 39→40으로 자동 획득이 재개됨을 확인했습니다. 자동 획득 OFF는 67 SP를 유지하고 소비 후 37 SP에서도 증가하지 않았습니다. 공개 브라우저에서는 새 SP 도움말과 콘솔 오류/경고 0을 확인했습니다. 이번 공개 브라우저 경기는 실행하지 않았으며, 로컬 AI/PVP 검증과 [SP Production 검증](Docs/개발문서/공개PVP배포.md#sp-초과-보유-production-검증--2026-10-01)의 확인 범위를 구분합니다.

## 모드 설정으로 기능 조합하기

기본 규칙은 `src/game/data.ts`의 `standard.rules`를 사용하고, 경기 설정창의 입력은 `src/game/match-settings.ts`에서 검증해 공통 `ModeRules`로 변환합니다. 기본은 이동 0라인·중립 ON·미니언/성채 무기/포탑/상자 OFF이며 맵·날씨는 각각 무작위입니다. 공통 전투 스탯은 `src/game/mode-settings.ts`, 이동 경로는 `src/game/lanes.ts`에서 관리합니다.

| 설정 | 역할 |
| --- | --- |
| `lanes.count` | 0: 자유 이동, 1~3: 라인 이동·같은 라인 전투 |
| `neutralWaves.enabled`, `neutralWaves.count` | 중립 웨이브 ON/OFF, `null`은 맵 기본·숫자는 지점/진영당 일반 수량 |
| `minions.enabled`, `minions.perLane` | 진영/이동 라인당 일반 1~10마리·매 5회 엘리트 1마리 추가 |
| `fortAttacks.catapult.enabled`, `fortAttacks.oil.enabled` | 성채의 공격 수단을 각각 켜거나 끔 |
| `towers.enabled`, `towers.laneCount`, `towers.count` | 이동 라인과 독립된 배치 1~3라인·진영/배치 라인당 포탑 1~3개 |
| `spBox.enabled`, `spBox.count`, `spBox.respawnDelay` | 중앙 공용 상자 1~3개, 코드의 재생성 `null`은 영구 소멸·숫자는 지연 초 |
| `sp.initial`, `sp.maximum` | 시작 SP·자동 획득 한도(기본 50), 다른 보상은 초과 보유 가능 |
| `sp.passive` | 시간당 획득 여부·초당 획득량, 한도 이상이면 정지·미만이면 한도까지 획득 |
| `sp.summoned`, `sp.minion`, `sp.elite`, `sp.neutral` | 종류별 처치 획득 여부·기본/고정량·코드 배율 |
| `sp.towerLoss` | 공격자와 무관하게 파괴된 포탑 소유진영에 개당 한 번 지급 |
| `MatchSettings.environment` | 맵/날씨 각각 무작위 또는 고정, 재대전은 무작위 항목만 재추첨 |

보상 설정의 `amount: null`은 각 개체의 기존 보상량을 사용합니다. 숫자는 고정 보상으로 대체하며, `multiplier`를 곱합니다. `enabled: false`이면 지급하지 않습니다. `neutral`은 일반 중립과 중립 보스 모두에 적용합니다. SP 상자는 실제로 줄어든 체력에 `spPerDamage`를 곱해 지급하므로 과잉 피해로 보상이 늘어나지 않습니다. 모든 비시간 보상은 자동 획득 한도와 관계없이 전액 가산하고 초과 보유량을 유지합니다.

개발 중 한 경기에서 모든 기능을 확인하는 예:

```ts
const simulation = new Simulation({
  map: 'road', weather: 'sunny',
  decks: { player: ['warrior', 'archer', 'hunter'], enemy: ['warrior', 'archer', 'hunter'] },
  aiSides: ['enemy'],
  rules: {
    lanes: { count: 3 },
    minions: { enabled: true },
    fortAttacks: { catapult: { enabled: true }, oil: { enabled: true } },
    towers: { enabled: true },
    spBox: { enabled: true, respawnDelay: 30 },
    sp: { minion: { enabled: true, amount: 2 } },
  },
});
```

일반 경기는 로비에서 여는 설정창으로 맵·날씨와 기능 ON/OFF·수량/SP를 정합니다. PVP 서버는 허용된 입력을 검증해 전투 규칙은 `room.rules`, 환경 선택 정책은 `room.environmentSettings`로 저장·공유합니다. 재대전은 규칙과 고정 환경을 유지하고 무작위 환경 항목만 다시 추첨합니다. 임의 전투 스탯 재정의는 적용하지 않습니다. 프런트와 게임 서버 모두 같은 코드를 배포해야 합니다.

로컬에서 새 기능을 직접 확인하려면 `npm run dev` 실행 후 `/tests/manual/mode-preview.html?lanes=3`에 접속합니다. `lanes=0`, `1`, `2`, `3`을 바꿔 확인할 수 있습니다. 이 AI 전용 검증 페이지는 시작 SP 40·자동 획득 한도 80, 모든 새 기능 ON·상자 15초 재생성을 사용하며 일반 경기의 기본값이나 Production 빌드를 변경하지 않습니다.

세부 규칙과 위임된 초기 수치는 [게임 모드 기획](Docs/기획서/게임모드.md) 및 연결된 라인·미니언·구조물 문서에서 확인할 수 있습니다.

## 구성

| 위치 | 역할 |
| --- | --- |
| `src/main.ts`, `src/ui.ts` | 앱 시작, 로비·대기방·경기·결과, 입력과 AI/PVP 흐름 |
| `src/game/data.ts` | 유닛·맵·날씨·스킬과 밸런스 수치 |
| `src/game/match-settings.ts`, `src/match-settings-dialog.ts` | 경기 설정 검증·환경 선택과 설정/확인 팝업 |
| `src/match-presets.ts`, `src/match-presets-controls.ts` | 로컬 프리셋 저장·관리와 JSON 가져오기·내보내기 |
| `src/game/simulation.ts` | 브라우저·서버 공용 전투 계산과 AI |
| `src/game/BattleScene.ts` | 연속 좌표 전장과 유닛·성채·효과 렌더링 |
| `src/network.ts`, `server/` | WebSocket 연결, 비공개 방, 서버 전투 판정과 상태 전달 |
| `tests/`, `server/*.test.mjs` | 전투·스킬·환경·방 수명·서버 기동 대기·화면 보간 자동 검증 |
| `src/style.css`, `index.html` | 모바일 세로 화면과 접근성 구조 |
| `public/` | 원본 이름 그대로 배포할 에셋 |
| `AGENTS.md`, `AgentDocs/` | 지침 관리·연결 링크와 분야별 작업 지침 |
| `Docs/agents.md`, `Docs/` | 기획서·개발문서, 개발단위별 완료 체크와 파트별 인덱스 |
| `.github/workflows/ci.yml` | GitHub Actions 타입 검사·빌드 |
| `vercel.json` | Vercel 설치·빌드·출력 설정 |
| `render.yaml` | 단일 Node.js WebSocket 서버의 Render 배포 설정 |

## GitHub → Vercel 배포

저장소: [seonhjeo/SurfPrototype](https://github.com/seonhjeo/SurfPrototype)

- 테스트 주소: [surf-prototype.vercel.app](https://surf-prototype.vercel.app/)
- Vercel 프로젝트: [hoya14 / surf-prototype](https://vercel.com/hoya14/surf-prototype)
- 2026-09-29 검증: GitHub CI, `main` Production 자동 배포, 작업 브랜치 Preview 자동 배포 성공.
- 초기 Preview 확인: [검증용 배포](https://surf-prototype-js6kgsj5u-hoya14.vercel.app)

Vercel 설정은 다음 값을 사용합니다.

| 항목 | 값 |
| --- | --- |
| Framework Preset | Vite |
| Root Directory | 저장소 루트 (`./`) |
| Node.js | 24.x (`package.json` 기준) |
| Install Command | `npm ci` |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Production Branch | `main` |
| Production 빌드 환경변수 | `VITE_MULTIPLAYER_URL=wss://surf-multiplayer.onrender.com/ws` |

Vercel에서 이 저장소를 Import하고 Git 연동을 유지하면 다음 흐름으로 테스트합니다.

Vercel에는 정적 프런트엔드를 배포하고 비공개 PVP 연결은 Render 서버의 `/ws`로 전달합니다. 2026-10-01 `main`·`ab8c4ae`의 Production 배포와 공개 브라우저 두 탭의 대전·재대전을 확인했습니다. 현재 Render 서버는 Production 출처만 허용합니다.

1. 최신 `dev`에서 새 개발 브랜치를 만들고 구현·검증합니다.
2. 구현 후 로컬 서버를 실행하고 브라우저를 팝업해 사용자가 직접 테스트하도록 합니다.
3. 사용자가 테스트를 완료하고 `dev` 병합을 요청한 때에만 병합합니다. 사용한 개발 브랜치는 유지합니다.
4. 승인된 개발사항을 `dev`에 병합·push하면 깃 에이전트가 별도 요청 없이 `dev` → `main` PR을 생성합니다. 같은 열린 PR이 있으면 최신 개발사항으로 갱신합니다.
5. `main`에 대한 직접 push와 직접 merge는 금지합니다. 자동 PR 생성·갱신은 PR 병합 권한을 포함하지 않으며, PR 병합은 사용자가 명시적으로 요청했을 때 수행합니다.

지침·문서만 수정하는 작업은 최신 `dev`에서 직접 작업·커밋하고 `dev`에 push하며 자동 PR은 생성하지 않습니다. 문서만의 PR은 사용자가 별도로 요청했을 때 생성합니다. 문서 변경에도 `main` 직접 push·merge 금지는 동일하게 적용됩니다.
`main` push는 Production, 다른 브랜치 push는 Preview 배포를 유발합니다. Preview는 사용자 로컬 테스트를 대신하지 않습니다.
상세 절차는 [Git·테스트 지침](AgentDocs/GitAndTesting.md)을 따릅니다.

GitHub Actions는 현재 `main` push, PR, 수동 실행에서 `npm ci`와 `npm run build`를 수행합니다. `dev` push 전용 트리거는 아직 없습니다.
배포는 Vercel Git 연동이 담당하며 별도의 Vercel 토큰을 GitHub Secrets에 넣지 않습니다.
**CI와 Vercel은 독립적으로 실행됩니다.** 현재 CI 성공을 강제하는 브랜치 보호나 배포 게이트는 설정하지 않았습니다.
필요해지면 `main` 보호 규칙에 `Typecheck and build`를 필수 검사로 지정합니다.

배포가 실패하면 GitHub Actions와 Vercel Build Logs를 각각 확인합니다. 복구 변경도 개발 브랜치에서 준비하고 [Git·테스트 지침](AgentDocs/GitAndTesting.md)에 따라 반영합니다.

초기화 당시 로컬 HTTPS Git 인증에는 `workflow` 권한이 없어 CI 파일을 GitHub 웹 편집기로 등록했습니다.
일반 코드 push는 정상입니다. `.github/workflows/` 파일을 수정할 때는 GitHub 웹 편집기 또는 workflow 변경 권한을 갖춘 Git 인증을 사용합니다.

## 개발 원칙

- 빠른 반복과 최소한의 구조를 우선합니다. 엔진·백엔드·게임 규칙을 추가할 때는 먼저 범위를 정합니다.
- `node_modules/`, `dist/`, `.vercel/`, `.env*`는 Git에서 제외합니다. 의존성 변경 시 잠금 파일은 함께 커밋합니다.
- 브라우저에서 사용하는 `VITE_*` 환경변수는 사용자에게 노출됩니다. 비밀키를 넣지 않습니다.
- 자동 검증은 타입 검사·빌드·전투 규칙·WebSocket 방 흐름·서버 기동 대기·화면 보간을 포함합니다. 입력·화면 크기·모바일 터치는 브라우저에서 확인합니다.

참고: [Phaser](https://phaser.io/), [Vite 배포](https://vercel.com/docs/frameworks/frontend/vite), [Vercel GitHub 연동](https://vercel.com/docs/git/vercel-for-github), [Node.js 버전](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions), [AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md).
