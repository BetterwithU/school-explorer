/* ============================================================
 * modes/B — 게임 엔진 (B: 중2 탐험 레이스)
 *
 * 설계 원칙 (합의됨):
 *  - 오프라인-우선(offline-first): 핵심 플레이(스캔→문제→채점→이동)는 전부 로컬.
 *    네트워크는 "되면 좋은 보정"일 뿐, 끊겨도 게임은 안 멈춘다.
 *  - ① 결정적 루트 = 뼈대(항상 동작, 충돌 분산 내장).  ← 본 파일에서 구현
 *  - ② 실시간 동적 배정 = 보정(WiFi 좋을 때만). ← 다음 단계(assignment.js / sync 연동) TODO
 *  - N문항 주도: stations.json의 문항 수(N)에서 우승조건·루트가 전부 파생.
 *
 * 이 파일은 "순수 로직"만 담는다(화면 없음). play.html이 이걸 불러 쓴다.
 * 노출: window.BEngine = { ...함수들 }
 * ============================================================ */
(function () {
  'use strict';

  const STORAGE_PREFIX = 'b1_progress_'; // 조별 진행키 접두 (게임/세션 단위로 분리 가능)

  /* ---------- 게임세트(set) 다중화 헬퍼 ----------
   * 세션키 {mode}__{set}__{class}__r{seq} 의 2번째 토큰 = 게임세트(B1/B2/…).
   * 화면은 set을 ?set= 또는 ?session= 에서 뽑아 sets/{set}/stations.json 을 로드한다. */
  function resolveSet() {
    let s = null;
    try {
      const p = new URLSearchParams(location.search);
      s = p.get('set');
      if (!s) {
        const sess = p.get('session') || '';
        const m = sess.match(/^(?:login|open|test)__([A-Za-z0-9]+)__/);
        if (m) s = m[1];
      }
    } catch {}
    // 안전: 영숫자만(경로 주입 방지). 없으면 기본 B1(과도기 — 단일 세트 호환).
    if (!s || !/^[A-Za-z0-9]+$/.test(s)) s = 'B1';
    return s;
  }
  function setBase(setId) { return 'sets/' + (setId || resolveSet()) + '/'; }

  // 세션 모드(login/open/test) 추출 — 진행키 분리에 사용(test 리허설이 login 채점을 오염하지 않게).
  function resolveMode() {
    try {
      const sess = new URLSearchParams(location.search).get('session') || '';
      const m = sess.match(/^(login|open|test)__/);
      if (m) return m[1];
    } catch {}
    return 'play';
  }

  // 이미지 경로 정규화: 절대 URL/data:는 그대로, 상대경로는 세트 폴더 기준으로 prefix.
  function resolveImg(path, setId) {
    if (!path) return '';
    if (/^(https?:)?\/\/|^data:/.test(path)) return path; // 절대 URL · 프로토콜상대 · data URI
    return setBase(setId) + String(path).replace(/^\.?\//, '');
  }

  /* ---------- 데이터 로드 ----------
   * setId 주면 sets/{setId}/stations.json 로드(권장). 안 주면 path 그대로(과도기 호환). */
  async function loadStations(pathOrSet) {
    const setId = (pathOrSet && /^[A-Za-z0-9]+$/.test(pathOrSet)) ? pathOrSet : null;
    const path = setId ? setBase(setId) + 'stations.json' : (pathOrSet || setBase() + 'stations.json');
    const res = await fetch(path, { cache: 'no-store' });
    if (!res.ok) throw new Error('stations.json 로드 실패(' + path + '): ' + res.status);
    const data = await res.json();
    data.meta = data.meta || {};
    data.stations = Array.isArray(data.stations) ? data.stations : [];
    data.__set = setId || resolveSet();  // 이미지 정규화·진행키에 쓰일 세트 식별자
    return data;
  }

  function stationById(data, id) {
    return data.stations.find(s => String(s.id) === String(id)) || null;
  }

  // 우승 조건: meta.need 우선, 없으면 N-3(최소 1)
  function winNeed(data) {
    const n = data.stations.length;
    const need = data.meta && data.meta.need;
    if (need == null || need === '' || isNaN(+need)) return Math.max(1, n - 3);
    return Math.min(+need, n); // N 초과 방지
  }

  function teamList(data) {
    const t = data.meta && data.meta.teams;
    if (Array.isArray(t) && t.length) return t.slice();
    // 비어 있으면 조 수를 station 수에 맞춰 임시 생성(유동 — 실제론 대시보드/설정에서)
    return [];
  }

  /* ---------- 결정적 셔플 (라틴방진 회전) ----------
   * A의 teamMissionOrder와 같은 원리:
   *  - 공통 base 순서를 시드로 한 번 만들고
   *  - 조마다 시작 오프셋을 균등 분산 → 모든 시점에 조들이 서로 다른 station에 위치.
   * 조 목록이 비어 있어도(teamList 없음) 조 이름 해시로 안전하게 동작.
   */
  function hashSeed(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // 순수 랜덤 base 순서: 실내/실외 구분 없이 전체를 결정적으로 섞는다(원본 불변).
  // 조별 offset 회전과 결합 → 모든 조가 서로 다른 지점에서 시작해 자연 분산(라틴방진).
  function shuffledBase(ids) {
    const base = ids.slice();
    const rng = mulberry32(hashSeed('BASE:' + ids.join(',')));
    for (let i = base.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [base[i], base[j]] = [base[j], base[i]];
    }
    return base;
  }

  // ① 결정적 루트: 이 조가 도는 station id 순서 (전체 N개; 우승은 need개째에서 판정)
  // start:true 스테이션(교실)은 모든 조 공통으로 맨 앞 고정 → 다같이 출발, 나머지만 조별 분산.
  function teamRoute(data, teamName) {
    const startIds = data.stations.filter(s => s.start).map(s => s.id);
    const ids = data.stations.filter(s => !s.start).map(s => s.id);
    const n = ids.length;
    if (n === 0) return startIds.slice();
    const base = shuffledBase(ids);
    const teams = teamList(data);
    const idx = teams.indexOf(teamName);
    const offset = idx >= 0
      ? Math.round((idx * n) / Math.max(teams.length, 1)) % n
      : hashSeed(teamName) % n;
    return startIds.concat(base.slice(offset), base.slice(0, offset));
  }

  // URL의 전체 세션 키(login__B1__c1__r03) — 회차·반까지 포함. 없으면 null.
  function resolveSession() {
    try { return new URLSearchParams(location.search).get('session') || null; } catch { return null; }
  }

  /* ---------- 진행상태 (localStorage) ---------- */
  // 진행키 = 전체 세션(회차·반 포함) + 조. → 회차가 다르면(r02 vs r03) 진행이 완전 분리되어
  // "새 회차 = 자동으로 깨끗한 새 시작". 세션이 없으면(과도기) mode+set로 폴백.
  function storageKey(teamName, setId, mode) {
    const sess = resolveSession();
    const scope = sess ? sess : ((mode || resolveMode()) + '_' + (setId || resolveSet()));
    return STORAGE_PREFIX + scope + '_' + (teamName || 'anon');
  }

  function startGame(data, teamName) {
    const route = teamRoute(data, teamName);
    const p = {
      team: teamName,
      set: data.__set || resolveSet(),  // 이 진행이 속한 게임세트
      mode: resolveMode(),              // login/open/test — 진행키 분리용
      route,            // 전체 station id 순서 [3,1,4,...]
      step: 0,          // 현재 몇 번째(0-based)
      solved: {},       // { stationId: true }
      answers: {},      // { stationId: "입력답" }
      hintsUsed: 0,     // 누적 힌트 사용 수(예산 차감)
      currentTarget: null, // 지금 향하는 station id(② 배정 결과; 한 leg 동안 고정)
      startedAt: Date.now(),
      wonAt: null,      // 우승(need 달성) 시각
    };
    saveProgress(p);
    return p;
  }

  function loadProgress(data, teamName) {
    let p = null;
    try { p = JSON.parse(localStorage.getItem(storageKey(teamName, data.__set, resolveMode()))); } catch (e) { return null; }
    if (!p) return null;
    // 루트가 현재 station 구성과 다르면 보정(문항 추가/변경 대비) — 진행기록은 유지
    const cur = teamRoute(data, teamName);
    const same = Array.isArray(p.route) && p.route.length === cur.length
      && p.route.every((s, i) => String(s) === String(cur[i]));
    if (!same) {
      p.route = cur;
      p.step = cur.findIndex(s => !p.solved || !p.solved[s]);
      if (p.step === -1) p.step = cur.length;
      saveProgress(p);
    }
    return p;
  }

  function saveProgress(p) {
    try { localStorage.setItem(storageKey(p.team, p.set, p.mode), JSON.stringify(p)); } catch (e) {}
  }
  function clearProgress(teamName, setId, mode) {
    try { localStorage.removeItem(storageKey(teamName, setId, mode)); } catch (e) {}
  }

  /* ---------- 진행/판정 ---------- */
  function solvedCount(p) { return Object.keys(p.solved || {}).length; }

  function isWin(data, p) {
    return solvedCount(p) >= winNeed(data);
  }

  // 현재 가야 할(=다음 풀) station id. 루트에서 아직 안 푼 첫 칸.
  // ※ 이건 ① 결정적 루트 기준. ②(동적 배정)가 켜지면 nextTargetByAssignment가 덮어쓴다.
  function currentStationId(p) {
    if (!p.route) return null;
    for (let i = 0; i < p.route.length; i++) {
      if (!p.solved[p.route[i]]) return p.route[i];
    }
    return null; // 전부 풀음
  }

  // 정답 처리 → step 전진, 우승 판정
  function markSolved(data, p, stationId, answer) {
    p.solved[stationId] = true;
    if (answer !== undefined) p.answers[stationId] = answer;
    // step = 안 푼 첫 칸으로 재계산(루트 무관하게 견고)
    let s = p.route.findIndex(id => !p.solved[id]);
    p.step = s === -1 ? p.route.length : s;
    if (!p.wonAt && isWin(data, p)) p.wonAt = Date.now();
    p.currentTarget = null; // 이 leg 완료 → 다음 진입 시 재배정
    saveProgress(p);
    return p;
  }

  /* ---------- 스킵(어려운 문제 패스) ----------
   * 남은 스킵 수: meta.skipBudget(없으면 N-need = 버릴 수 있는 여유분). 조 전체 공유.
   * 스킵 = 그 station을 route 맨 뒤로 보냄(안 풀면 나중에 다시 만남) + 예산 차감.
   * 교실(start)은 스킵 불가(관문). */
  function skipBudget(data) {
    const b = data.meta && data.meta.skipBudget;
    if (b == null || b === '' || isNaN(+b)) return Math.max(0, data.stations.length - winNeed(data));
    return Math.max(0, +b);
  }
  function skipsRemaining(data, p) {
    return Math.max(0, skipBudget(data) - (p.skipsUsed || 0));
  }
  function canSkip(data, p, stationId) {
    const st = stationById(data, stationId);
    if (!st || st.start) return false;              // 교실은 스킵 불가
    if (p.solved[stationId]) return false;          // 이미 푼 곳
    return skipsRemaining(data, p) > 0;
  }
  // 스킵 실행: 성공 시 true. route에서 해당 id를 맨 뒤로 이동 + 예산 차감 + 목적지 해제.
  function skipStation(data, p, stationId) {
    if (!canSkip(data, p, stationId)) return false;
    const i = p.route.indexOf(stationId);
    if (i >= 0) { p.route.splice(i, 1); p.route.push(stationId); }
    p.skipsUsed = (p.skipsUsed || 0) + 1;
    p.justSkipped = stationId;                       // 다음 1회 배정에서 이 곳 제외(바로 재배정 방지)
    let s = p.route.findIndex(id => !p.solved[id]);
    p.step = s === -1 ? p.route.length : s;
    p.currentTarget = null;                          // 다음 진입 시 재배정
    saveProgress(p);
    return true;
  }

  /* ---------- 채점 ---------- */
  function normalize(s) {
    return String(s == null ? '' : s).trim().toLowerCase().replace(/\s+/g, '');
  }
  // 정답은 문자열 또는 배열(복수정답). 하나라도 맞으면 정답.
  function checkAnswer(station, input) {
    if (!station) return false;
    const ans = Array.isArray(station.answer) ? station.answer : [station.answer];
    const g = normalize(input);
    return ans.some(a => a !== '' && a != null && g === normalize(a));
  }

  /* ---------- 힌트 예산 ---------- */
  // 남은 힌트 수. meta.hintBudget이 null/없으면 무제한(Infinity).
  function hintsRemaining(data, p) {
    const budget = data.meta && data.meta.hintBudget;
    if (budget == null || budget === '' || isNaN(+budget)) return Infinity;
    return Math.max(0, +budget - (p.hintsUsed || 0));
  }
  // 힌트 1개 사용(예산 차감). 성공 시 true.
  function useHint(data, p) {
    if (hintsRemaining(data, p) <= 0) return false;
    p.hintsUsed = (p.hintsUsed || 0) + 1;
    saveProgress(p);
    return true;
  }

  /* ---------- 내비게이션(사진 단서) ----------
   * 다음 목적지 station을 돌려준다. cluePhoto가 있으면 사진으로, 없으면 place 텍스트로.
   * ②(동적 배정)는 추후 여기서 currentStationId 대신 배정 결과를 쓰도록 교체.
   */
  function nextTarget(data, p) {
    const id = currentStationId(p);
    if (id == null) return null;
    return stationById(data, id);
  }

  // start(교실) 관문: 아직 안 푼 start 스테이션이 있으면 그걸 먼저 반환.
  // 교실 공통문제를 풀기 전엔 어떤 배정 로직도 다른 곳으로 못 보낸다.
  function pendingStart(data, p) {
    const s = data.stations.find(st => st.start && !p.solved[st.id]);
    return s || null;
  }

  // 방금 스킵한 곳을 후보에서 제외(바로 재배정 방지). 그것만 남았으면 어쩔 수 없이 포함.
  function excludeSkipped(unv, p) {
    if (p.justSkipped == null) return unv;
    const filtered = unv.filter(id => id !== p.justSkipped);
    return filtered.length ? filtered : unv;
  }

  // 오프라인 폴백: 루트순(순수 랜덤) 첫 미방문지로 배정 → 결정적, 실내/실외 구분 없음.
  // (과거엔 '실내 우선'이라 실내를 다 돌아야 실외가 열렸음 — 랜덤 분산과 충돌해 제거.)
  function nextTargetOffline(data, p) {
    const gate = pendingStart(data, p);
    if (gate) return gate;                       // 교실 먼저(관문)
    const unv = excludeSkipped(p.route.filter(id => !p.solved[id]), p);
    p.justSkipped = null;                        // 1회 소비
    if (!unv.length) return null;
    return stationById(data, unv[0]);            // 루트순 첫 미방문(랜덤 순서 그대로)
  }

  /* ---------- ② 실시간 동적 배정 ----------
   * WiFi 양호 시: 다른 조의 currentTarget을 읽어 "가장 한산한 미방문 station"을 배정.
   * 실패/오프라인(liveTeams 없음) 시: 루트순 첫 미방문(=①)으로 폴백 → 게임 안 멈춤.
   * 동률은 '이 조의 루트 순서'로 깸 → 조마다 루트가 달라 자연 분산(결정적, 무작위 없음).
   * liveTeams 형태: { teamName: { deviceId: { step, currentTarget, ... } } }
   */
  // 한 조의 여러 기기 기록 중 가장 앞선(step 큰) 것
  function aggregateTeamRecord(teamData) {
    const arr = Object.values(teamData || {});
    if (!arr.length) return null;
    return arr.reduce((a, b) => ((b.step || 0) > (a.step || 0) ? b : a));
  }

  function nextTargetSmart(data, p, liveTeams) {
    const gate = pendingStart(data, p);
    if (gate) return gate;                       // 교실 관문: 풀기 전엔 무조건 교실로
    if (!liveTeams) return nextTargetOffline(data, p); // 오프라인 폴백(루트순 랜덤; justSkipped 처리 포함)
    const unvisited = excludeSkipped(p.route.filter(id => !p.solved[id]), p); // 루트 순서 유지(동률 tiebreak)
    p.justSkipped = null;                        // 1회 소비
    if (!unvisited.length) return null;
    // 다른 조의 목적지 혼잡도 집계
    const occ = {};
    for (const team in liveTeams) {
      if (team === p.team) continue;
      const rec = aggregateTeamRecord(liveTeams[team]);
      const tgt = rec && rec.currentTarget;
      if (tgt != null && tgt !== '') occ[tgt] = (occ[tgt] || 0) + 1;
    }
    // 최소 혼잡 미방문지(동률이면 이 조의 루트순 먼저)
    let best = unvisited[0], bestOcc = Infinity;
    for (const id of unvisited) {
      const o = occ[id] || 0;
      if (o < bestOcc) { bestOcc = o; best = id; }
    }
    return stationById(data, best);
  }

  // 지금 향하는 목적지 고정/해제 (한 leg 동안 사진이 안 바뀌게)
  function setTarget(p, stationId) {
    p.currentTarget = (stationId == null) ? null : stationId;
    saveProgress(p);
    return p;
  }

  // 대시보드/배정용 보고 페이로드
  function reportPayload(data, p) {
    const tgt = (p.currentTarget != null) ? stationById(data, p.currentTarget) : null;
    return {
      step: p.step,
      solvedCount: solvedCount(p),
      total: p.route.length,
      need: winNeed(data),
      currentTarget: (p.currentTarget != null) ? p.currentTarget : '',
      placeName: tgt ? (tgt.place || '-') : (isWin(data, p) ? '🏆 복귀' : '-'),
      wonAt: p.wonAt || null,
      myName: p.myName || '',
      partnerName: p.partnerName || '',
      email: p.email || '',
    };
  }

  /* ---------- 노출 ---------- */
  window.BEngine = {
    loadStations, stationById, winNeed, teamList,
    teamRoute, startGame, loadProgress, saveProgress, clearProgress,
    solvedCount, isWin, currentStationId, markSolved,
    checkAnswer, normalize,
    hintsRemaining, useHint,
    skipBudget, skipsRemaining, canSkip, skipStation,
    nextTarget, nextTargetOffline, nextTargetSmart, setTarget, reportPayload, aggregateTeamRecord,
    // 게임세트 다중화 헬퍼
    resolveSet, resolveMode, setBase, resolveImg,
    // 내부 유틸도 테스트용으로 노출
    _hashSeed: hashSeed,
  };
})();
