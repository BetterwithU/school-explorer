# 게임세트(sets) 추가 방법

이 폴더는 게임의 **문제 데이터**를 세트별로 담습니다. 화면(play/hq/admin 등)은 공용 1벌이고, 여기 데이터만 세트별로 늘립니다.

```
sets/
  index.json        ← 세트 목록(드롭다운·오프라인 캐시가 읽음)
  B1/
    stations.json   ← 문제·정답·힌트·이미지 경로
    images/         ← 문제·단서 이미지
  B2/ ...           ← 새 세트
```

## ⚠️ 중요 — 정적 사이트(GitHub Pages)의 현실
새 세트는 **git push 해야 실제로 배포**됩니다.
- 브라우저(출제 빌더)에서 만든 파일은 **내 컴퓨터에만** 저장됩니다.
- 학생이 들어오는 GitHub Pages에는 **commit & push 한 것만** 올라갑니다.
- 즉 "새 세트 만들기 = 폴더 추가 + push"입니다.

## 새 세트(예: B2) 추가 절차
1. `sets/B1` 폴더를 통째로 복사해 `sets/B2`로 이름 변경
2. `sets/B2/stations.json` 내용을 새 문제로 교체
   - 또는 출제 빌더를 `출제.html?set=B2`로 열어 편집(폴더 연결 시 `sets/B2/`에 저장)
3. 새 이미지는 `sets/B2/images/`에 넣고, stations.json의 `questionImage`/`cluePhoto`를 `images/파일명`(상대경로)으로 적기
4. `index.json`에 한 줄 추가:
   ```json
   { "id": "B2", "title": "세트 제목", "count": 문제수, "need": 우승조건 }
   ```
5. **git commit & push** — 이래야 학생이 접속 가능
6. 개발자 페이지(admin.html)를 새로고침하면 드롭다운에 B2가 뜸 → 배정

## 이미지 경로 규칙
- 상대경로(`images/Q1.jpg`) → 자동으로 `sets/{세트}/images/Q1.jpg`로 해석됨
- 절대 URL(`https://...`)·`data:` → 그대로 사용
