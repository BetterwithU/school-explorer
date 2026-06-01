# 🔧 tools — Notion 변환 파이프라인

Notion DB의 문제·코스를 게임용 `questions.json` / `course.json` 으로 변환합니다.
(스키마 설계는 [../drafts/notion-스키마.md](../drafts/notion-스키마.md) 참고)

## 준비물

1. **Notion 통합(integration)** 만들고 토큰 발급 → 문제 DB·코스 DB에 "연결(공유)"
2. 두 DB의 **DB ID** (Notion DB URL의 32자리 부분)

## 로컬에서 실행

```bash
# Windows PowerShell
$env:NOTION_TOKEN="ntn_xxx"
$env:QUESTIONS_DB_ID="문제DB_ID"
$env:COURSE_DB_ID="코스DB_ID"
node tools/notion-to-json.mjs

# macOS / Linux
NOTION_TOKEN=ntn_xxx QUESTIONS_DB_ID=... COURSE_DB_ID=... node tools/notion-to-json.mjs
```

→ 루트의 `questions.json`, `course.json` 이 새로 생성됩니다. (Node 18+ 필요, 외부 의존성 없음)

생성 후 git 커밋·push 하면 GitHub Pages가 자동 배포합니다.

## 자동화 (GitHub Action)

`.github/workflows/notion-sync.yml` 이 **수동 트리거(workflow_dispatch)** 로 동작합니다.

1. GitHub 저장소 → **Settings → Secrets and variables → Actions** 에 등록:
   - `NOTION_TOKEN`
   - `QUESTIONS_DB_ID`
   - `COURSE_DB_ID`
2. **Actions 탭 → "Notion → 사이트 반영" → Run workflow** 클릭
3. 변환 결과가 자동 커밋되고 사이트가 갱신됩니다.

> 정기 자동 동기화를 원하면 워크플로에 `schedule:`(cron)을 추가하세요. 기본은 안전하게 수동만 켜져 있습니다.

## 메타·최종정답 바꾸기

게임 제목·조 목록·최종 보물 정답(`운동장큰은행나무`)은 현재 `notion-to-json.mjs` 상단의 `META` 상수에 있습니다. 바꾸려면 그 부분만 수정 후 다시 실행하세요. (Notion에서 관리하고 싶으면 설정 페이지 파싱으로 확장 가능)
