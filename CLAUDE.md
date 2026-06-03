# 학교 캠핑 탐험대 (school explorer)

## 개요
초등학생(1~6학년 혼합)을 위한 QR 기반 보물찾기 게임. GitHub Pages로 배포되는 바닐라 HTML/CSS/JS 정적 사이트.

## 진입 프로토콜
부팅/체크인 매직워드 시 Claude가 첫 응답으로 안내:
- 이곳은 QR 탐험 게임을 만드는 곳
- 게임 구조: 지도(home.html) → 장소 base화면 → QR 스캔 → 문제 → 정답 시 지도로 복귀
- 다음 액션: 수정할 화면/문제/기능을 던지기

## 워크플로우
- 문제·장소 데이터: `course.json`(미션 구조·순서) + `questions.json`(문제·정답)
- 공통 로직: `app.js` / 실시간 동기화: `sync.js`(Firebase, 선택적)
- 화면: home.html(지도) · mission.html(문제) · hq.html(운영본부) · map.html(글자조합) · done.html
- 카메라(QR 스캔)는 HTTPS 필요 → 로컬 테스트는 한계, GitHub Pages 배포 후 실기기 확인

## 결과물 저장
`~/Workspace/99_outputs/school explorer/{YYYY-MM-DD}_{주제}/` (워크스페이스 규칙 준수)

---

## 작업 규칙

### 여러 건 접수 시 자동 todo 모드 (MUST)
한 메시지/연속 메시지로 **2건 이상의 작업 요청**이 들어오면 **자동으로 todo를 쌓는 모드로 진입**한다.
- TodoWrite로 접수 항목을 즉시 누적
- 진행 중인 작업은 중단하지 않고 계속하면서 새 항목을 todo에 추가
- 각 항목 완료 시 todo 상태 갱신
- 이 모드는 작업 중단이 아님 — 누적과 실행을 병행한다

### Git
- push는 사용자 명시적 허락 필수 (commit은 자유)
- 계정: 사용자에게 어느 계정(getbetterwithu / BetterwithU)인지 확인 후 push
