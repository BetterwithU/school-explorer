/* 실시간 진행 동기화 (Firebase Realtime Database)
 * - firebase-config.js 에서 window.FIREBASE_CONFIG 를 채우면 활성화됩니다.
 * - 비어 있으면 '오프라인' — 게임은 로컬(localStorage)만으로 정상 동작합니다.
 * - 셋업 방법: drafts/firebase-셋업.md
 *
 * 노출: window.SchoolExplorerSync = { online, sessionId, report(team,data), subscribe(cb) }
 *       config 없으면 SchoolExplorerSync 는 만들어지지 않음.
 *       준비되면 'sync-ready' 이벤트 발생(온/오프라인 공통).
 */
const cfg = window.FIREBASE_CONFIG;

function getDeviceId() {
  try {
    let id = localStorage.getItem('seDeviceId');
    if (!id) {
      id = 'd' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
      localStorage.setItem('seDeviceId', id);
    }
    return id;
  } catch {
    return 'd-anon';
  }
}

if (cfg && cfg.apiKey && cfg.databaseURL) {
  try {
    const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js');
    const { getDatabase, ref, set, get, onValue, remove } = await import(
      'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js'
    );
    const app = initializeApp(cfg);
    const db = getDatabase(app);
    const SESSION = cfg.sessionId || 'default';
    const deviceId = getDeviceId();

    window.SchoolExplorerSync = {
      online: true,
      sessionId: SESSION,
      report(team, data) {
        if (!team) return;
        set(ref(db, `sessions/${SESSION}/teams/${team}/${deviceId}`), { ...data, ts: Date.now() }).catch(() => {});
      },
      subscribe(cb) {
        onValue(ref(db, `sessions/${SESSION}/teams`), (snap) => cb(snap.val() || {}));
      },
      // 게임 on/off 상태 — HQ가 켜기 전엔 QR 스캔 시 '캠핑' 안내만 보임
      subscribeGameState(cb) {
        onValue(ref(db, `sessions/${SESSION}/gameOn`), (snap) => cb(snap.val() === true));
      },
      setGameState(on) {
        return set(ref(db, `sessions/${SESSION}/gameOn`), on === true).catch(() => {});
      },
      getGameState() {
        return get(ref(db, `sessions/${SESSION}/gameOn`)).then(s => s.val() === true).catch(() => false);
      },
      // 모든 조의 진행 기록 삭제 (HQ 초기화용). 게임 on/off 상태는 건드리지 않음.
      resetTeams() {
        return remove(ref(db, `sessions/${SESSION}/teams`)).catch(() => {});
      },
    };
  } catch (e) {
    console.warn('Firebase 동기화 비활성(초기화 실패):', e && e.message);
  }
}

// 준비 완료 신호 — config 없을 때도 발생(hq가 오프라인 판단용)
window.SYNC_READY = true;
window.dispatchEvent(new Event('sync-ready'));
