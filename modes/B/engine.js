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

  /* ---------- 데이터 로드 ---------- */
  async function loadStations(path) {
    const res = await fetch(path, { cache: 'no-store' });
    if (!res.ok) throw new Error('stations.json 로드 실패: ' + res.status);
    const data = await res.json();
    // 방어: 형태 보정
    data.meta = data.meta || {};
    data.stations = Array.isArray(data.stations) ? data.stations : [];
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
    // 비어 있으면 조 수를 station 수에 맞춰 임시 생성(유동 — 실제론 HQ/설정에서)
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
  function teamRoute(data, teamName) {
    const ids = data.stations.map(s => s.id);
    const n = ids.length;
    if (n === 0) return [];
    const base = shuffledBase(ids);
    const teams = teamList(data);
    const idx = teams.indexOf(teamName);
    const offset = idx >= 0
      ? Math.round((idx * n) / Math.max(teams.length, 1)) % n
      : hashSeed(teamName) % n;
    return base.slice(offset).concat(base.slice(0, offset));
  }

  /* ---------- 진행상태 (localStorage) ---------- */
  function storageKey(teamName) { return STORAGE_PREFIX + (teamName || 'anon'); }

  function startGame(data, teamName) {
    const route = teamRoute(data, teamName);
    const p = {
      team: teamName,
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
    try { p = JSON.parse(localStorage.getItem(storageKey(teamName))); } catch (e) { return null; }
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
    try { localStorage.setItem(storageKey(p.team), JSON.stringify(p)); } catch (e) {}
  }
  function clearProgress(teamName) {
    try { localStorage.removeItem(storageKey(teamName)); } catch (e) {}
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

  // 오프라인 폴백: 안 간 곳 중 '실내' 우선 배정(거기서 와이파이 재접속 → 추적 재개).
  // 실내가 다 끝났으면 안 간 아무 곳. 루트 순서 유지 → 결정적.
  function nextTargetOffline(data, p) {
    const unv = p.route.filter(id => !p.solved[id]);
    if (!unv.length) return null;
    const indoor = unv.find(id => { const s = stationById(data, id); return s && s.indoor; });
    return stationById(data, indoor != null ? indoor : unv[0]);
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
    const unvisited = p.route.filter(id => !p.solved[id]); // 루트 순서 유지(동률 tiebreak)
    if (!unvisited.length) return null;
    if (!liveTeams) return nextTargetOffline(data, p); // 오프라인 폴백(실내 우선)
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

  // HQ/배정용 보고 페이로드
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
    };
  }

  /* ---------- 노출 ---------- */
  window.BEngine = {
    loadStations, stationById, winNeed, teamList,
    teamRoute, startGame, loadProgress, saveProgress, clearProgress,
    solvedCount, isWin, currentStationId, markSolved,
    checkAnswer, normalize,
    hintsRemaining, useHint,
    nextTarget, nextTargetOffline, nextTargetSmart, setTarget, reportPayload, aggregateTeamRecord,
    // 내부 유틸도 테스트용으로 노출
    _hashSeed: hashSeed,
  };
})();
