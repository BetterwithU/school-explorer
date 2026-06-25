/* ============================================================
 * core/sync.js — 실시간 동기화 (Firebase Realtime DB), 게임 공용
 *
 * - window.FIREBASE_CONFIG 가 채워져 있으면 활성화(온라인), 비면 오프라인.
 * - window.SYNC_SESSION 으로 게임/세션 분리 (예: 'B1'). 없으면 config.sessionId, 그것도 없으면 'default'.
 *   → A(sessions/default)와 B(sessions/B1)가 같은 Firebase 프로젝트에서 충돌 없이 공존.
 * - 오프라인-우선 원칙: 여기 실패해도 게임은 로컬로 정상 동작해야 한다.
 *   따라서 어떤 경우에도 마지막에 BSYNC_READY=true + 'bsync-ready' 이벤트를 쏜다(온/오프 공통).
 *
 * 노출: window.BSync = {
 *   online, sessionId, deviceId,
 *   report(team, data), subscribeTeams(cb),
 *   subscribeGameState(cb), setGameState(on), resetTeams()
 * }
 * config 없거나 init 실패 시 window.BSync 는 만들어지지 않음(online 판단은 !!window.BSync).
 * ============================================================ */
const cfg = window.FIREBASE_CONFIG;
const SESSION = window.SYNC_SESSION || (cfg && cfg.sessionId) || 'default';

function getDeviceId() {
  try {
    let id = localStorage.getItem('bDeviceId');
    if (!id) {
      id = 'd' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
      localStorage.setItem('bDeviceId', id);
    }
    return id;
  } catch {
    return 'd-anon';
  }
}

if (cfg && cfg.apiKey && cfg.databaseURL) {
  try {
    const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js');
    const { getDatabase, ref, set, get, onValue, remove, serverTimestamp } = await import(
      'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js'
    );
    const app = initializeApp(cfg);
    const db = getDatabase(app);
    const deviceId = getDeviceId();
    const base = `sessions/${SESSION}`;

    window.BSync = {
      online: true,
      sessionId: SESSION,
      deviceId,
      // 진행 보고 — 실패해도 조용히 무시(게임 진행에 영향 0)
      report(team, data) {
        if (!team) return;
        // ts는 서버 시계(serverTimestamp) — 기기마다 시계가 달라도 '마지막 확인 시각'이 일관됨.
        set(ref(db, `${base}/teams/${team}/${deviceId}`), { ...data, ts: serverTimestamp() }).catch(() => {});
      },
      // 모든 조의 실시간 상태 구독(② 배정 + HQ 공용)
      subscribeTeams(cb) {
        onValue(ref(db, `${base}/teams`), (snap) => cb(snap.val() || {}));
      },
      // 게임 on/off (HQ 제어용 — B에선 선택적)
      subscribeGameState(cb) {
        onValue(ref(db, `${base}/gameOn`), (snap) => cb(snap.val() === true));
      },
      setGameState(on) {
        return set(ref(db, `${base}/gameOn`), on === true).catch(() => {});
      },
      getGameState() {
        return get(ref(db, `${base}/gameOn`)).then(s => s.val() === true).catch(() => false);
      },
      // 모든 조 진행 기록 삭제(HQ 초기화). gameOn은 건드리지 않음.
      resetTeams() {
        return remove(ref(db, `${base}/teams`)).catch(() => {});
      },
      // ── 수동 개입(override) — HQ가 특정 조를 특정 station으로 강제 배정 ──
      // 라이브 이벤트의 비상 탈출구. play 클라이언트가 다음 내비에서 1회 소비.
      setOverride(team, stationId) {
        if (!team) return Promise.resolve();
        return set(ref(db, `${base}/override/${team}`), stationId == null ? null : stationId).catch(() => {});
      },
      clearOverride(team) {
        if (!team) return Promise.resolve();
        return remove(ref(db, `${base}/override/${team}`)).catch(() => {});
      },
      subscribeOverrides(cb) {
        onValue(ref(db, `${base}/override`), (snap) => cb(snap.val() || {}));
      },
    };
  } catch (e) {
    console.warn('BSync 비활성(초기화 실패) — 오프라인으로 진행:', e && e.message);
  }
}

// 준비 완료 신호 — config 없을 때도(오프라인 판단용) 반드시 발생
window.BSYNC_READY = true;
window.dispatchEvent(new Event('bsync-ready'));
