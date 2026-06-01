# 🛰️ Firebase 실시간 HQ 셋업 가이드

운영본부(HQ) 대시보드에서 **각 조의 실시간 위치/진행**을 보려면 Firebase Realtime Database 연결이 필요합니다.
**무료**이고, 한 번만 설정하면 됩니다. (설정 전에도 게임·순서표는 정상 동작 — 실시간만 꺼져 있을 뿐)

---

## 0. 개념 한 줄
각 학생 폰이 미션을 풀 때마다 진행을 Firebase에 보고 → HQ([hq.html](../hq.html))가 실시간으로 읽어 표시.

---

## 1. Firebase 프로젝트 만들기 (5분)

1. https://console.firebase.google.com 접속 → 구글 로그인
2. **프로젝트 추가** → 이름 입력(예: `school-explorer`) → 만들기 (애널리틱스는 꺼도 됨)

## 2. Realtime Database 만들기

1. 왼쪽 메뉴 **빌드 → Realtime Database** → **데이터베이스 만들기**
2. 위치: `asia-southeast1`(싱가포르) 등 가까운 곳
3. 보안 규칙: **테스트 모드로 시작** 선택 (아래 4번에서 다시 손봄)

## 3. 웹 앱 등록 → config 복사

1. 프로젝트 개요 옆 **⚙️ → 프로젝트 설정**
2. 아래 **내 앱**에서 **웹(`</>`)** 아이콘 클릭 → 앱 닉네임 입력 → 등록
3. 표시되는 `firebaseConfig` 객체를 복사
4. 프로젝트의 [firebase-config.js](../firebase-config.js) 를 열어 아래처럼 채우기:

```js
window.FIREBASE_CONFIG = {
  apiKey: "AIza...",
  authDomain: "school-explorer.firebaseapp.com",
  databaseURL: "https://school-explorer-default-rtdb.firebaseio.com",  // ★ 꼭 있어야 함
  projectId: "school-explorer",
  appId: "1:...:web:...",
  sessionId: "default"
};
```

> ⚠️ `databaseURL` 이 config에 안 보이면, Realtime Database 페이지 상단의 주소(`https://...firebaseio.com`)를 직접 넣으세요. 이게 없으면 연결이 안 됩니다.

## 4. 보안 규칙 (게임용 — 간단)

Realtime Database → **규칙** 탭에서:

```json
{
  "rules": {
    "sessions": {
      ".read": true,
      ".write": true
    }
  }
}
```

> 민감정보가 없고 단기 게임용이라 공개로 둡니다. **게임이 끝나면** `.read`/`.write` 를 `false` 로 바꿔 닫아두세요.

## 5. 확인

1. 사이트를 다시 열고(배포 or 로컬 서버), 학생 화면에서 조를 선택·문제를 풀어봄
2. [hq.html](../hq.html) 열기 → **📡 실시간 조별 진행** 에 그 조가 나타나면 성공 🎉

---

## 여러 반이 동시에 할 때

`firebase-config.js` 의 `sessionId` 를 반마다 다르게 주면 데이터가 섞이지 않습니다.
- 3학년 2반: `sessionId: "3-2"`
- 3학년 3반: `sessionId: "3-3"`

HQ는 같은 `sessionId` 의 조들만 보여줍니다.

---

## 동작 원리 (참고)

- 보고 경로: `sessions/{sessionId}/teams/{조이름}/{기기ID}` = `{step, total, placeName, solvedCount, finaleSolved, ts}`
- 한 조를 여러 폰이 진행하므로, HQ는 그 조의 **가장 앞선 기기** 기준으로 진척을 표시합니다.
- 코드: [sync.js](../sync.js) (보고·구독), [app.js](../app.js) 의 `reportProgress()` (보고 호출)
