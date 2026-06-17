/* Firebase 설정 — 실시간 HQ 대시보드용.
 *
 * 비워두면(null) 오프라인 모드: 게임은 로컬(localStorage)만으로 정상 동작하고,
 * HQ 대시보드의 '실시간 조 위치'만 비활성화됩니다.
 *
 * 채우는 방법: drafts/firebase-셋업.md 참고
 */
window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyDD1m3-TU8C0JdpisjmCxs9tjDS6dXNJR0",
  authDomain: "school-explorer-8e687.firebaseapp.com",
  databaseURL: "https://school-explorer-8e687-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "school-explorer-8e687",
  storageBucket: "school-explorer-8e687.firebasestorage.app",
  messagingSenderId: "416751678265",
  appId: "1:416751678265:web:21ce62c43ce79f0bda2ee8",
  sessionId: "default"   // 여러 반이 동시에 하면 반마다 다른 값(예: "3학년2반")
};
