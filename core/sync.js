/* ============================================================
 * core/sync.js — 실시간 동기화 (Firebase Realtime DB), 게임 공용
 *
 * - window.FIREBASE_CONFIG 가 채워져 있으면 활성화(온라인), 비면 오프라인.
 * - 세션 분리: URL ?session= 우선 → 없으면 window.SYNC_SESSION → 그것도 없으면 null(오프라인).
 *   세션 키는 {mode}__{gameSet}__{class}__{seq} 형식의 ASCII 머신키(예: login__B1__c2__r01).
 *   mode prefix(login__/open__/test__)가 보안규칙·게임모드의 단일 출처. open__/test__는 DB 미사용.
 *   ⚠️ 'default' 무음폴백 제거: 세션이 없으면 조용히 엉뚱한 방으로 가지 않고 온라인 동기화를 끈다.
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

// 세션 키 결정: URL ?session= 우선, 없으면 window.SYNC_SESSION. 무음 'default' 폴백 없음.
function resolveSession() {
  let s = null;
  try { s = new URLSearchParams(location.search).get('session'); } catch {}
  if (!s) s = window.SYNC_SESSION || null;
  if (!s) return null;
  // ASCII 머신키만 허용(한글/특수문자/Firebase 금지문자 차단). 형식 어긋나면 무효 처리.
  if (!/^(login|open|test)__[A-Za-z0-9_]+$/.test(s)) {
    console.warn('[BSync] 세션 키 형식이 올바르지 않습니다(무시):', s);
    return null;
  }
  return s;
}
const SESSION = resolveSession();
// open__/test__ 모드는 DB를 쓰지 않는다(로컬 완결). login__ 만 온라인 동기화 대상.
const ONLINE_MODE = !!SESSION && /^login__/.test(SESSION);

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

if (cfg && cfg.apiKey && cfg.databaseURL && ONLINE_MODE) {
  try {
    const { initializeApp, getApps, getApp } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js');
    const { getDatabase, ref, set, get, onValue, remove, serverTimestamp } = await import(
      'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js'
    );
    const { getAuth } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js');
    const app = getApps().length ? getApp() : initializeApp(cfg);  // auth.js와 같은 앱 공유
    const db = getDatabase(app);
    const dbAuth = getAuth(app);   // 보안규칙(teams 소유권)이 요구하는 uid 출처
    const deviceId = getDeviceId();
    const base = `sessions/${SESSION}`;

    window.BSync = {
      online: true,
      sessionId: SESSION,
      deviceId,
      // 진행 보고 — 실패해도 조용히 무시(게임 진행에 영향 0)
      report(team, data) {
        if (!team) return;
        const uid = dbAuth.currentUser && dbAuth.currentUser.uid;
        if (!uid) return;  // 로그인(uid) 없으면 보고 안 함 — 보안규칙이 uid 소유권을 요구.
        // ts는 서버 시계(serverTimestamp) — 기기마다 시계가 달라도 '마지막 확인 시각'이 일관됨.
        set(ref(db, `${base}/teams/${team}/${deviceId}`), { ...data, uid, ts: serverTimestamp() }).catch(() => {});
      },
      // 모든 조의 실시간 상태 구독(② 배정 + 대시보드 공용)
      subscribeTeams(cb) {
        onValue(ref(db, `${base}/teams`), (snap) => cb(snap.val() || {}));
      },
      // 모든 조 상태를 1회 신선하게 재조회(게임종료 스냅샷용 — LIVE 캐시 race 방지)
      getTeamsOnce() {
        return get(ref(db, `${base}/teams`)).then(s => s.val() || {}).catch(() => ({}));
      },
      // 게임 결과 영구저장 — sessions/와 분리된 results/{session}. 초기화·덮어쓰기와 무관하게 보존.
      saveResults(rows) {
        return set(ref(db, `results/${SESSION}`), { rows, endedAt: serverTimestamp() }).catch((e) => { throw e; });
      },
      // 현재 로그인 교사의 Firebase ID 토큰(시트 웹앱이 서버측 검증) — 없으면 null.
      getIdToken() {
        return dbAuth.currentUser ? dbAuth.currentUser.getIdToken() : Promise.resolve(null);
      },
      // 게임 on/off (대시보드 제어용 — B에선 선택적)
      subscribeGameState(cb) {
        onValue(ref(db, `${base}/gameOn`), (snap) => cb(snap.val() === true));
      },
      setGameState(on) {
        return set(ref(db, `${base}/gameOn`), on === true).catch(() => {});
      },
      getGameState() {
        return get(ref(db, `${base}/gameOn`)).then(s => s.val() === true).catch(() => false);
      },
      // 모든 조 진행 기록 삭제(대시보드 초기화). gameOn은 건드리지 않음.
      resetTeams() {
        return remove(ref(db, `${base}/teams`)).catch(() => {});
      },
      // ── 수동 개입(override) — 대시보드가 특정 조를 특정 station으로 강제 배정 ──
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
      // ── 공지/소집 메시지 (대시보드 → 전체 학생, 거의 실시간) ──
      // 대시보드가 announce에 쓰면, 구독 중인 모든 play 클라이언트가 즉시 받는다.
      // text가 비면(null) 배너 해제. end=true면 게임 강제 종료(학생 화면 마감).
      sendAnnounce(text, end) {
        const payload = (text == null && !end) ? null
          : { text: text || '', end: end === true, ts: serverTimestamp() };
        return set(ref(db, `${base}/announce`), payload).catch(() => {});
      },
      subscribeAnnounce(cb) {
        onValue(ref(db, `${base}/announce`), (snap) => cb(snap.val() || null));
      },
    };
  } catch (e) {
    console.warn('BSync 비활성(초기화 실패) — 오프라인으로 진행:', e && e.message);
  }
}

/* ---------- BStore: 세션과 무관한 공용 저장소 ----------
 * 배정이력(assignments/)·짝(sessions/{session}/pairs)을 PC 간 공유하기 위한 창구.
 * BSync는 login__ 세션이 있어야 생기지만, admin(배정 화면)은 세션이 없다.
 * BStore는 config만 있으면(세션 불필요) 항상 초기화 → admin·play·hq 공용.
 * 실명(짝 이름)이 서버에 올라가지만, database.rules.json이 접근을 강제:
 *   - assignments/: 교사(@snu 화이트리스트)만 read/write
 *   - sessions/{session}/pairs: 교사 write, @snu 로그인 학생 read(자기 반 조 목록 표시용)
 */
if (cfg && cfg.apiKey && cfg.databaseURL) {
  try {
    const { initializeApp, getApps, getApp } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js');
    const { getDatabase, ref, set, get, remove, serverTimestamp } = await import(
      'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js'
    );
    const app = getApps().length ? getApp() : initializeApp(cfg);
    const db = getDatabase(app);

    window.BStore = {
      online: true,
      // ── 배정 짝(pairs) — 특정 세션에 묶임. 학생 크롬북에서도 읽힘 ──
      savePairs(session, pairs) {
        if (!session || !pairs) return Promise.resolve();
        return set(ref(db, `sessions/${session}/pairs`), pairs).catch((e) => { throw e; });
      },
      getPairs(session) {
        if (!session) return Promise.resolve(null);
        return get(ref(db, `sessions/${session}/pairs`)).then(s => s.val() || null).catch(() => null);
      },
      // ── 배정 이력(assignments) — 전역. 교사만. PC 넘나들며 회차관리 ──
      saveAssignment(session, meta) {
        if (!session) return Promise.resolve();
        return set(ref(db, `assignments/${session}`), { ...meta, ts: serverTimestamp() }).catch((e) => { throw e; });
      },
      getAssignments() {
        return get(ref(db, 'assignments')).then(s => s.val() || {}).catch(() => ({}));
      },
      removeAssignment(session) {
        if (!session) return Promise.resolve();
        return remove(ref(db, `assignments/${session}`)).catch(() => {});
      },
    };
  } catch (e) {
    console.warn('BStore 비활성(초기화 실패):', e && e.message);
  }
}

// 세션/모드 진단 (디버깅용 — 어떤 방에 붙었는지/오프라인인지 명확히)
if (!SESSION) console.info('[BSync] 세션 없음 → 오프라인(로컬) 진행');
else if (!ONLINE_MODE) console.info('[BSync] %s 모드 → DB 미사용(로컬 완결)', SESSION.split('__')[0]);
else if (!window.BSync) console.info('[BSync] %s → 온라인 모드지만 Firebase 미구성/실패 → 오프라인', SESSION);

// 준비 완료 신호 — config 없을 때도(오프라인 판단용) 반드시 발생
window.BSYNC_READY = true;
window.dispatchEvent(new Event('bsync-ready'));
