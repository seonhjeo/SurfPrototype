# GitHub CI와 Vercel 배포 지침

- GitHub Actions는 코드 검증을 담당하고, Vercel Git 연동은 Preview·Production 배포를 담당한다.
- `main`은 Vercel Production 브랜치다. `dev`와 개발 작업 브랜치는 Preview 배포 대상으로 사용한다.
- 배포 여부와 무관하게 [Git·테스트 지침](GitAndTesting.md)의 사용자 테스트 및 병합 제한을 따른다.
- Vercel Preview는 사용자가 요청한 로컬 브라우저 테스트를 대체하지 않는다.
- GitHub CI와 Vercel 자동 배포는 별개다. CI 성공이 배포를 자동으로 차단하거나 허용한다고 가정하지 않는다.
- 현재 `.github/workflows/ci.yml`은 `main` push, Pull Request, 수동 실행에서 타입 검사와 빌드를 수행한다. `dev` push 전용 트리거는 아직 없다.
- 브랜치 운영 지침을 바꾸는 것만으로 CI 트리거·브랜치 보호·Vercel 설정이 자동 변경되었다고 보고하지 않는다.
- 배포·설정 변경은 URL, 빌드 결과 등 실제 증거로 확인한다.
- 초기 환경의 HTTPS Git 인증에는 `workflow` 권한이 없어 CI 파일을 GitHub 웹 편집기로 등록했다.
- `.github/workflows/` 파일을 수정할 때는 GitHub 웹 편집기 또는 workflow 변경 권한을 갖춘 Git 인증을 사용한다. 일반 코드 push는 정상이다.
- 실제 실행·빌드 명령, URL, 배포 설정은 [README](../README.md)를 참고한다.
