# Tauri 마이그레이션 계획

## 목표

Next.js 로컬 웹앱을 macOS 메뉴바 상주 Tauri 앱으로 대체한다.

- 터미널에서 `npm run dev`를 켜 둘 필요가 없다. 로그인하면 자동으로 실행되고 메뉴바에 상주한다.
- 화면 잠김과 깨어남 이벤트를 앱이 직접 받아 WallpaperAgent를 재시작한다. launchd로 띄우던 wake watcher를 앱에 흡수한다.
- 슬롯 교체, 백업, 복원, 선택, 정규화(HEVC) 동작은 지금과 똑같이 유지한다.

## 확정된 결정

| 항목 | 결정 | 이유 |
|---|---|---|
| 백엔드 | `lib/*`를 Rust(Tauri 커맨드)로 재작성 | 약 500줄의 fs·ffmpeg 실행·plist 처리. Node를 묶지 않아도 되고, 이벤트 처리까지 한 프로세스에서 한다 |
| 프런트 | Vite + React | 서버 기능이 필요 없다. 컴포넌트와 CSS는 그대로 옮긴다 |
| 웹 버전 | Tauri로 대체한 뒤 Next 제거 | 코드베이스를 하나로 유지한다. LAN 접속(`ALLOWED_DEV_ORIGINS`)은 없어진다 |
| ffmpeg | 앱에 포함(LGPL 빌드 sidecar). brew로 설치한 ffmpeg가 있으면 그것을 우선 사용 | 오픈소스로 다른 사람이 쓰므로 따로 설치하지 않아도 되게 한다. 인코딩은 `hevc_videotoolbox`라 GPL 구성요소가 필요 없다 |
| 배포 | GitHub Releases에 .dmg, 우선 미서명 | Developer ID 서명과 공증은 Apple Developer 계정이 생기면 CI에 추가한다. 그때까지 README에 '그래도 열기' 방법을 안내한다. App Sandbox 불가: `~/Library/...` 쓰기와 `killall`이 필요하다 |
| 설정 | 앱 내 설정 화면 | 사용자가 `.env`를 수정할 수 없다. 라이브러리 폴더는 폴더 선택 대화상자로 추가·삭제한다 |

## 구조

```
src/                    Vite + React (기존 app/components 이동)
src-tauri/
  src/
    main.rs             앱 부팅, 트레이, autostart, 이벤트 리스너 등록
    config.rs           설정 로드 (lib/config.ts)
    paths.rs            파일명 검증 (lib/paths.ts)
    mapping.rs          슬롯 → 원본 매핑 (lib/mapping.ts)
    codec.rs            ffprobe 메타데이터 + mtime 캐시 (lib/codec.ts)
    transcode.rs        ffmpeg 인자 생성 (lib/transcode.ts)
    slots.rs            적용·백업·복원·재적용 (lib/slots.ts)
    wallpaper.rs        Index.plist assetID 읽기·쓰기, 재시작 (lib/wallpaper.ts)
    library.rs          목록·이름 변경·삭제·가져오기 (lib/library.ts)
    jobs.rs             백그라운드 재인코딩 (lib/jobs.ts)
    watcher.rs          잠김·깨어남 이벤트 → 재시작 (scripts/wake-watcher.swift)
```

## API 라우트 → Tauri 커맨드

| 지금 | 커맨드 | 비고 |
|---|---|---|
| `GET /api/library` | `list_library` | |
| `PATCH /api/library/file` | `rename_library_file` | |
| `DELETE /api/library/file` | `delete_library_file` | |
| `POST /api/library/upload` | `import_files(paths)` | 업로드 대신 경로를 받아 복사. 드래그앤드롭은 Tauri drag-drop 이벤트, 선택은 dialog 플러그인 |
| `GET /api/library/stream`, `/api/slots/stream` | 없음 | asset 프로토콜 + `convertFileSrc`. Range 요청을 지원하고, `lib/stream.ts`는 삭제한다 |
| `GET /api/slots` | `get_slots` | |
| `POST /api/slots/apply` | `apply_to_slot` | |
| `POST /api/slots/reapply` | `reapply_all` | |
| `POST /api/slots/restore` | `restore_slot` | |
| `POST /api/slots/select` | `set_selected_slot` | python3 대신 `plist` 크레이트 사용 |

변환 진행 상황은 3초 폴링 대신 `library-changed` 이벤트로 프런트에 알린다.

## 설정과 데이터

- `.env.local` 대신 앱 설정 파일(`~/Library/Application Support/<app id>/config.json`)을 쓴다. 항목은 `libraryDirs`, `backupDir`, `ffmpegPath`. 설정 화면에서 편집하고, 처음 실행했을 때 라이브러리 폴더가 없으면 `~/Movies`를 기본값으로 쓰고 설정 화면으로 안내한다.
- `data/slots.json`은 같은 폴더로 옮긴다. 처음 실행할 때 기존 `data/slots.json`이 있으면 가져온다. 이걸 빠뜨리면 복원 정보가 사라진다.
- ffmpeg 탐지 순서: 설정의 `ffmpegPath` → brew(`/opt/homebrew/bin`, `/usr/local/bin`; GUI 앱은 셸 PATH를 물려받지 않으므로 명시적으로 확인) → 번들된 sidecar.
- asset 프로토콜 scope에는 라이브러리 폴더와 aerial 슬롯 폴더만 넣는다.

## 네이티브 기능

- **이벤트**: `com.apple.screenIsLocked`(distributed notification)와 `NSWorkspace` `didWake`/`screensDidWake`를 받으면 1초 뒤 `killall WallpaperAgent`. 여러 이벤트가 겹치면 한 번만 실행한다. 지금 Swift watcher와 같은 동작이고, objc2 계열 크레이트로 구현한다.
- **트레이 메뉴**: 창 열기 / 지금 잠금화면 슬롯 표시 / 모두 재적용 / 종료.
- **autostart**: `tauri-plugin-autostart`(macOS LaunchAgent).
- 기존 launchd helper(`com.aerial-manager.wakewatcher`)는 앱 첫 실행 때 제거를 안내한다. 같이 돌면 재시작이 두 번 일어난다.

## PR 분할

각 PR이 끝나도 앱은 동작하는 상태를 유지한다. Next는 5번까지 그대로 둔다.

1. **스캐폴드**: `src-tauri/`와 Vite 프런트를 만든다. Next가 계속 동작하도록 컴포넌트는 옮기지 않고 `app/page.tsx`를 그대로 렌더링한다(이동은 6번에서). 데이터 없이 창만 뜬다.
   - 확인: `npm run tauri dev`로 기존과 같은 UI가 뜬다.
2. **Rust 코어(순수 함수)**: config, paths, mapping, transcode, codec 파싱. 기존 vitest 테스트(`config`, `mapping`, `transcode`, `status`, `library`)를 Rust 단위 테스트로 옮긴다. `stream`은 asset 프로토콜로 대체되므로 삭제한다.
   - 확인: `cargo test`, 기존 테스트 케이스와 1:1 대응.
3. **커맨드 + 프런트 연결**: slots, wallpaper, library 커맨드. fetch를 invoke로, 미리보기를 asset 프로토콜로 바꾼다. slots.json 이전도 여기서 한다.
   - 확인: 실제 슬롯에 적용, 복원, 선택해서 기존 웹과 결과 파일이 같은지(ffprobe) 비교한다.
4. **가져오기, 백그라운드 변환, 설정 화면**: dialog와 drag-drop으로 가져오기, jobs, 이벤트 알림. 라이브러리 폴더와 백업 폴더를 고르는 설정 화면.
   - 확인: AV1 파일을 가져오면 변환 상태가 표시되고 끝나면 ready가 된다. 설정에서 폴더를 추가하면 라이브러리에 바로 반영된다.
5. **네이티브**: watcher, 트레이, autostart, 기존 launchd helper 정리.
   - 확인: 잠그면 WallpaperAgent pid가 바뀌고, 로그아웃했다 로그인하면 앱이 자동으로 실행된다.
6. **정리**: Next, `app/`, `lib/`, `scripts/` wake helper, `.env.example`, `ALLOWED_DEV_ORIGINS`를 삭제한다. README와 CHANGELOG를 고치고 버전을 맞춘다(지금 `package.json`은 0.1.0으로 CHANGELOG와 어긋나 있다).
7. **ffmpeg 번들과 릴리스 자동화**: LGPL ffmpeg/ffprobe를 sidecar로 넣고 라이선스 고지를 포함한다. 태그(`v*`)를 올리면 GitHub Actions가 macOS .dmg를 빌드해 Release에 올린다. README에 설치 방법(미서명 앱 여는 법)을 쓴다.
   - 확인: brew ffmpeg가 없는 환경(CI 러너)에서 빌드한 앱으로 영상을 슬롯에 적용할 수 있다. 태그를 올리면 Release에 .dmg가 올라간다.

## 리스크와 미해결

- **objc2 바인딩**: distributed notification을 쓰는 예제가 적다. 막히면 5번에서 Swift watcher를 sidecar로 묶는 쪽으로 물러선다.
- **미리보기 코덱**: WKWebView는 HEVC .mov를 재생할 수 있어서 지금보다 나아진다. AV1은 macOS·하드웨어에 따라 다르며, 지금처럼 변환 후 보여 준다.
- **큰 파일 가져오기**: 업로드(메모리 버퍼) 대신 파일 복사라서 오히려 개선된다.
- **서명과 Gatekeeper**: 미서명 앱은 다운로드하면 실행이 막혀서, 사용자가 시스템 설정 → 개인정보 보호 및 보안에서 '그래도 열기'를 눌러야 한다. 사용자 이탈 요인이므로 Apple Developer 계정이 생기면 바로 서명·공증을 추가한다.
- **ffmpeg 바이너리 출처**: LGPL + VideoToolbox 구성의 arm64/x86_64 빌드가 필요하다. 신뢰할 만한 배포본이 없으면 CI에서 소스로 빌드한다(`--disable-gpl --enable-videotoolbox`). 7번 시작 전에 정한다.
- **ffmpeg 라이선스 의무**: LGPL 바이너리를 별도 실행 파일로 넣으면 MIT 앱과 같이 배포할 수 있다. 다만 라이선스 전문, 사용한 소스 버전과 빌드 옵션을 함께 제공해야 한다.
