/* Firebase 설정 — 실시간 HQ 대시보드용.
 *
 * 비워두면(null) 오프라인 모드: 게임은 로컬(localStorage)만으로 정상 동작하고,
 * HQ 대시보드의 '실시간 조 위치'만 비활성화됩니다.
 *
 * 채우는 방법: drafts/firebase-셋업.md 참고
 */
window.FIREBASE_CONFIG = null;

/* ↓↓↓ Firebase 콘솔에서 받은 값으로 위 줄을 아래처럼 교체하세요 ↓↓↓
window.FIREBASE_CONFIG = {
  apiKey: "AIza...........................",
  authDomain: "your-project.firebaseapp.com",
  databaseURL: "https://your-project-default-rtdb.firebaseio.com",
  projectId: "your-project",
  appId: "1:000000000000:web:xxxxxxxxxxxx",
  sessionId: "default"   // 여러 반이 동시에 하면 반마다 다른 값(예: "3학년2반")
};
*/
