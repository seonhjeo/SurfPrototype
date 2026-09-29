# 프로젝트 목적과 기술 구성

## 목적과 범위

- Surf는 본 개발 전에 게임 아이디어와 조작감을 빠르게 검증하는 웹게임 프로토타입이다.
- 짧은 구현·실행·피드백 주기를 우선한다. 요청 범위를 넘는 범용 프레임워크나 복잡한 계층을 만들지 않는다.
- 게임 규칙, 엔진 선택, 대상 기기 등 결과에 영향을 주는 모호한 사항은 사용자에게 질문한다. 독립적으로 진행 가능한 작업은 계속한다.
- 사용자와의 소통과 프로젝트 설명은 한국어를 기본으로 한다.

## 기술 구성과 명령

- 원격 저장소: `https://github.com/seonhjeo/SurfPrototype.git`.
- 개발 기준 브랜치는 `dev`, Vercel Production 브랜치는 `main`이다. 작업 절차는 [Git·테스트 지침](GitAndTesting.md)을 따른다.
- Phaser 4 + Vite 8 + TypeScript 7, Node.js 24.x, npm을 사용한다. 버전의 기준은 `package.json`과 `package-lock.json`이다.
- `npm ci`: 잠금 파일 기준 설치. `npm run dev`: 로컬 개발. `npm run typecheck`: 타입 검사.
- `npm run build`: 타입 검사 후 `dist/`에 배포 빌드 생성. `npm run preview`: 빌드 결과 확인.
- `src/main.ts`: 게임 시작과 브라우저 연결. `src/game/`: Phaser 씬·게임 로직. `public/`: 정적 에셋.
- `vercel.json`: Vercel 빌드 설정. `.github/workflows/ci.yml`: GitHub Actions 검증.
- 실행·배포 설정 변경 시 `README.md`의 해당 설명도 갱신한다.
