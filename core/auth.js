/* ============================================================
 * core/auth.js — 학교 구글 계정(@snu.ms.kr) 로그인 게이트 (게임 공용)
 *
 * - window.FIREBASE_CONFIG 필요. sync.js와 '같은 Firebase 앱'을 공유(guarded init)
 *   → 로그인하면 DB 쓰기/읽기에도 자동으로 인증 토큰이 실려 보안규칙을 통과한다.
 * - @snu.ms.kr 도메인만 허용. 그 외 계정은 즉시 로그아웃 + 거부.
 *
 * 노출: window.BAuth = {
 *   configured,            // FIREBASE_CONFIG 있으면 true
 *   DOMAIN,                // '@snu.ms.kr'
 *   user(),                // 현재 로그인 사용자(도메인 OK) 또는 null
 *   domainOK(email),
 *   isAdmin(email),        // 교사(운영자) 화이트리스트인지 — 대시보드/개발자페이지/출제 게이트용
 *   ADMINS,                // 교사 이메일 목록(UI 판별용 — 진짜 권한은 database.rules.json이 강제)
 *   signIn(),              // 구글 팝업 로그인 → 도메인 검사 (실패 시 throw 'DOMAIN')
 *   signOut(),
 *   onChange(cb),          // 로그인 상태 변경(도메인 OK인 user 또는 null)
 * }
 * 준비되면 window.BAUTH_READY=true + 'bauth-ready' 이벤트.
 *
 * ⚠️ 교사 추가/제거: 아래 ADMINS 배열 + database.rules.json 의 동일 목록을 함께 수정 후 git push.
 *    UI(여기)는 편의이고, 실제 데이터 보호는 보안규칙이 강제한다.
 * ============================================================ */
const cfg = window.FIREBASE_CONFIG;
const DOMAIN = '@snu.ms.kr';
// 교사(운영자) 화이트리스트 — database.rules.json 과 반드시 동일하게 유지.
const ADMINS = ['june_wook@snu.ms.kr', 'snumsmaths@snu.ms.kr', 'sw@snu.ms.kr'];
const isAdmin = (email) => !!email && ADMINS.includes(String(email).toLowerCase());

if (cfg && cfg.apiKey) {
  try {
    const { initializeApp, getApps, getApp } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js');
    const { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut,
            setPersistence, browserLocalPersistence } =
      await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js');

    const app = getApps().length ? getApp() : initializeApp(cfg);  // sync.js와 앱 공유
    const auth = getAuth(app);
    // 로그인 지속성 명시(로컬 = 새로고침·재접속해도 세션 유지) → "접속할 때마다 로그인" 방지.
    try { await setPersistence(auth, browserLocalPersistence); }
    catch (e) { console.warn('[BAuth] setPersistence 실패(세션 유지 안 될 수 있음):', e && (e.code || e.message)); }
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ hd: 'snu.ms.kr' });   // 학교 도메인 계정 우선 표시

    let curUser = null;
    const domainOK = (email) => !!email && email.toLowerCase().endsWith(DOMAIN);

    window.BAuth = {
      configured: true, DOMAIN, ADMINS,
      user() { return curUser; },
      domainOK, isAdmin,
      async signIn() {
        const res = await signInWithPopup(auth, provider);
        if (!domainOK(res.user.email)) { await signOut(auth); throw new Error('DOMAIN'); }
        return res.user;
      },
      signOut() { return signOut(auth); },
      onChange(cb) {
        onAuthStateChanged(auth, (u) => {
          curUser = (u && domainOK(u.email)) ? u : null;
          // 진단: 인증 상태 전이를 콘솔에 남긴다(로그인 반복 원인 추적용).
          console.info('[BAuth] authState:', u ? (u.email + (curUser ? '' : ' (도메인 불일치)')) : 'null(비로그인/미복원)');
          cb(curUser);
        });
      },
    };
  } catch (e) {
    console.warn('BAuth 비활성(초기화 실패):', e && e.message);
  }
}

// config 없거나 실패 시: '로그인 미구성' 스텁(게임은 오프라인으로 동작)
if (!window.BAuth) {
  window.BAuth = {
    configured: false, DOMAIN, ADMINS,
    user() { return null; }, domainOK() { return false; }, isAdmin,
    signIn() { return Promise.reject(new Error('NO_CONFIG')); },
    signOut() { return Promise.resolve(); },
    onChange(cb) { cb(null); },
  };
}
window.BAUTH_READY = true;
window.dispatchEvent(new Event('bauth-ready'));
