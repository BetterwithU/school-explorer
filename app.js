/* 학교 캠핑 탐험대 — 공통 로직 (협력형 2인 QR)
 * - 한 미션 = 한 세트(set). 세트마다 A·B 두 문제. 둘의 답을 합쳐야 정답(combined).
 * - 조별 세트 순서 셔플(결정적, 라틴방진) → 동선 충돌 0 + 조마다 다른 순서.
 * - 진행상태 localStorage 저장/복구(유실 방지).
 */

const STORAGE_KEY = 'schoolExplorer';
const DEV_KEY = 'schoolExplorerDev';

/* ---------- 개발자 모드 판정 (운영자 전용) ----------
 * ?dev=1을 한 번이라도 만나면 sessionStorage에 고정 → 페이지를 넘어가도 그 탭 안에서 유지.
 * 학생은 이 URL(?dev=1)을 절대 받지 않으므로(QR엔 ?q=만 들어감) 평소엔 항상 false → 학생 동작 불변.
 * 세션 한정이라 탭을 닫으면 자동 해제(학생 기기 잔존 방지).
 */
function isDev() {
  try {
    if (new URLSearchParams(location.search).get('dev') === '1') {
      sessionStorage.setItem(DEV_KEY, '1');
    }
    return sessionStorage.getItem(DEV_KEY) === '1';
  } catch { return false; }
}

// DEV 끄기 (운영자가 기기 정리할 때)
function devOff() {
  try { sessionStorage.removeItem(DEV_KEY); } catch {}
}

/* ---------- 데이터 로드 ---------- */
async function loadData() {
  const [course, questions] = await Promise.all([
    fetch('course.json').then(r => r.json()),
    fetch('questions.json').then(r => r.json()),
  ]);
  return { course, questions };
}

function findQuestion(questions, id) {
  return questions.find(q => String(q.id) === String(id));
}

// QR로 들어온 문제 id(예 "1A","2")로 그 세트의 미션을 찾음
function missionByQuestionId(course, qid) {
  return course.missions.find(m => (m.qids || []).indexOf(qid) !== -1);
}

function missionBySet(course, setNo) {
  return course.missions.find(m => m.set === setNo);
}

// 세트의 QR 개수
function missionQrCount(mission) {
  return (mission.qids || []).length;
}

/* ---------- 결정적 셔플 (세트 단위) ----------
 * 조 이름 시드 → 같은 조는 늘 같은 순서, 조마다 다른 순서.
 * 라틴방진(회전): 공통 기준순서를 만들고 조마다 시작점을 균등 분산.
 * → 모든 시점에 조들이 서로 다른 세트(장소)에 위치(동선 충돌 0).
 */
function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 조 이름으로 세트(set 번호) 순서를 결정적으로 생성
function teamMissionOrder(course, teamName) {
  const sets = course.missions.map(m => m.set);
  const n = sets.length;
  const teams = course.teams;
  const idx = teams.indexOf(teamName);

  // 1) 공통 기준 순서(base)
  const base = sets.slice();
  const rng = mulberry32(hashSeed('BASE:' + sets.join(',')));
  for (let i = base.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [base[i], base[j]] = [base[j], base[i]];
  }

  // 2) 조마다 시작 오프셋 균등 분산
  const offset = idx >= 0
    ? Math.round((idx * n) / teams.length) % n
    : hashSeed(teamName) % n;

  // 3) 회전 → 이 조의 세트 순서
  return base.slice(offset).concat(base.slice(0, offset));
}

/* ---------- 진행상태 (localStorage) ---------- */
// course를 넘기면, 저장된 order가 현재 미션 구성과 다를 때 자동 보정한다.
// (미션을 추가·변경해도 이미 게임을 시작한 플레이어 화면이 옛 order에 박제되지 않도록)
function loadProgress(course) {
  let p;
  try {
    p = JSON.parse(localStorage.getItem(STORAGE_KEY)) || null;
  } catch {
    return null;
  }
  if (p && course && p.team) {
    const curOrder = teamMissionOrder(course, p.team);
    const same = Array.isArray(p.order)
      && p.order.length === curOrder.length
      && p.order.every((s, i) => s === curOrder[i]);
    if (!same) {
      // solved/answers 등 진행 기록은 유지하고 order만 현재 기준으로 교체.
      // step은 아직 안 푼 첫 칸으로 재계산.
      p.order = curOrder;
      p.step = curOrder.findIndex(s => !p.solved || !p.solved[s]);
      if (p.step === -1) p.step = curOrder.length;
      saveProgress(p);
    }
  }
  return p;
}

function saveProgress(p) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
}

function clearProgress() {
  localStorage.removeItem(STORAGE_KEY);
}

// 새 게임 시작: 조 이름 받아 진행상태 초기화
function startGame(course, teamName) {
  const order = teamMissionOrder(course, teamName); // 세트 번호 배열
  const p = {
    team: teamName,
    order,          // 이 조가 도는 세트 순서 [3,1,4,...]
    step: 0,        // 현재 몇 번째 세트(0-based)
    solved: {},     // { set: true }
    answers: {},    // { set: "입력한 합본답" }
    finaleSolved: false, // 최종 글자조합 미션 해결 여부
  };
  saveProgress(p);
  return p;
}

// 현재 가야 할 세트 번호. 다 끝났으면 null
function currentSet(p) {
  if (p.step >= p.order.length) return null;
  return p.order[p.step];
}

// 정답(합본) 처리 → 다음 세트로
function markSolved(p, setNo, answer) {
  p.solved[setNo] = true;
  if (answer !== undefined) p.answers[setNo] = answer;
  if (p.order[p.step] === setNo) p.step += 1;
  saveProgress(p);
  return p;
}

function isAllDone(p) {
  return p.step >= p.order.length;
}

/* ---------- 정답 채점 (합본 비교) ----------
 * A·B 어느 쪽을 찍든, 두 사람이 합친 "두 글자"를 입력 → combined와 비교.
 * 공백 무시. 한글이라 대소문자는 무관하지만 통일 위해 normalize.
 */
function normalizeAnswer(s) {
  return String(s).trim().toLowerCase().replace(/\s+/g, '');
}

// question.combined(합본 정답)와 입력값 비교
function checkCombined(question, input) {
  const correct = normalizeAnswer(question.combined);
  const given = normalizeAnswer(input);
  return given === correct;
}

/* ---------- clue 모드 채점 (분산 힌트형) ----------
 * 각 QR은 서로 다른 단서(clue)만 보여주고, 정답은 미션 전체가 공유(mission.answer).
 * 어느 QR에서 입력하든 mission.answer와 비교 → 모두 같은 정답.
 */
function checkMissionAnswer(mission, input) {
  if (!mission || !mission.answer) return false;
  // answer는 문자열 또는 배열(복수 정답: 하나라도 맞으면 정답)
  const answers = Array.isArray(mission.answer) ? mission.answer : [mission.answer];
  const given = normalizeAnswer(input);
  return answers.some(a => a !== '' && given === normalizeAnswer(a));
}

/* ---------- 멀티미디어 ----------
 * question.media: [{ type: "image"|"youtube"|"audio", url }]
 * 구버전 question.image(문자열)도 하위호환 지원.
 */
function questionMedia(question) {
  if (Array.isArray(question.media)) {
    return question.media.filter(m => m && m.type && m.url);
  }
  if (question.image) return [{ type: 'image', url: question.image }];
  return [];
}

// 유튜브 URL/ID → 임베드 주소
function youtubeEmbed(url) {
  const s = String(url).trim();
  if (!s) return '';
  // 이미 임베드면 그대로
  if (s.indexOf('/embed/') !== -1) return s;
  let id = '';
  const m1 = s.match(/[?&]v=([\w-]{6,})/);          // watch?v=ID
  const m2 = s.match(/youtu\.be\/([\w-]{6,})/);      // youtu.be/ID
  const m3 = s.match(/\/shorts\/([\w-]{6,})/);       // shorts/ID
  if (m1) id = m1[1]; else if (m2) id = m2[1]; else if (m3) id = m3[1];
  else if (/^[\w-]{6,}$/.test(s)) id = s;            // 순수 ID
  return id ? 'https://www.youtube.com/embed/' + id : '';
}

// media 배열 → HTML 문자열 (mission.html에서 사용)
function renderMediaHtml(media) {
  return (media || []).map(m => {
    if (m.type === 'image') {
      return `<div class="q-media" style="display:flex;justify-content:center;align-items:center;margin-bottom:16px"><img src="${m.url}" alt="문제 이미지" style="max-height:220px;max-width:60%;height:auto;width:auto;border-radius:6px;border:1px solid rgba(100,65,20,0.3)" onerror="this.parentElement.style.display='none'"></div>`;
    }
    if (m.type === 'youtube') {
      const src = youtubeEmbed(m.url);
      if (!src) return '';
      return `<div class="q-media q-video"><iframe src="${src}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>`;
    }
    if (m.type === 'audio') {
      if (!m.url) return '';
      return `<audio class="q-media q-audio" controls preload="none" src="${m.url}"></audio>`;
    }
    return '';
  }).join('');
}

/* ---------- 최종 글자조합 미션 ----------
 * 미션마다 course.missions[].piece(암호 글자 1개)를 무순서로 수집.
 * 모든 미션을 풀면(8개) 흩어진 글자를 조합해 course.finale.answer 맞히기.
 */

// 지금까지 푼 미션의 암호 글자 목록(원래 set 순)
function collectedPieces(course, p) {
  return course.missions
    .filter(m => p.solved[m.set] && m.piece)
    .map(m => m.piece);
}

// 전체 암호 글자 수
function totalPieces(course) {
  return course.missions.filter(m => m.piece).length;
}

// 흩어진 글자(조마다 결정적으로 다른 순서) — 최종 미션 표시용
function scrambledPieces(course, p) {
  const arr = collectedPieces(course, p);
  const rng = mulberry32(hashSeed('PIECES:' + (p.team || '')));
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// 최종 미션 차례인가? (모든 장소 미션 완료 + 아직 조합 안 풂)
function isFinalePending(course, p) {
  return isAllDone(p) && !p.finaleSolved;
}

// 최종 조합 정답 비교
function checkFinale(course, input) {
  const ans = course.finale && course.finale.answer ? course.finale.answer : '';
  return ans !== '' && normalizeAnswer(input) === normalizeAnswer(ans);
}

// 최종 미션 해결 처리
function markFinaleSolved(p) {
  p.finaleSolved = true;
  saveProgress(p);
  return p;
}

/* ---------- 실시간 진행 보고 (HQ 대시보드용) ----------
 * window.SchoolExplorerSync(sync.js)가 있으면 Firebase로 보고, 없으면 조용히 무시(오프라인).
 * 보고 실패는 게임 진행에 절대 영향 주지 않음.
 */
function reportProgress(course, p) {
  try {
    if (!p || !p.team || !window.SchoolExplorerSync) return;
    const total = p.order.length;
    const cur = currentSet(p);
    const m = cur != null ? missionBySet(course, cur) : null;
    const placeName = p.finaleSolved
      ? '🏆 보물 발견'
      : isAllDone(p)
        ? '🧩 최종 조합 미션'
        : m ? m.placeName : '-';
    window.SchoolExplorerSync.report(p.team, {
      step: p.step,
      total,
      solvedCount: Object.keys(p.solved).length,
      placeName,
      finaleSolved: !!p.finaleSolved,
    });
  } catch (e) {
    /* 무시 */
  }
}

/* ---------- 게임 on/off 게이트 (모든 학생 화면 공통) ----------
 * 게임이 켜지기 전(off)엔 어떤 화면이든 '즐거운 캠핑' 안내만 보이고
 * 게임 관련 UI는 일절 노출하지 않는다.
 * - DEV 또는 오프라인(Firebase 미설정)이면 게이트 없이 통과(운영자 테스트/로컬).
 * - 게임 상태가 실시간으로 바뀌면 화면도 즉시 전환.
 * onOpen: 게임이 켜졌을 때 실제 화면을 그리는 콜백.
 */
function campScreenHtml() {
  // 이미지를 화면 높이에 맞춰(max-height) 항상 한 화면에 들어오게 — 어떤 기기에서도 안 잘림.
  return `<div class="camp-screen" style="min-height:100dvh;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:16px;box-sizing:border-box">
    <img src="images/camping.webp" alt="즐거운 아빠 캠핑"
      style="max-width:min(340px,88vw);max-height:78dvh;width:auto;height:auto;border-radius:12px;box-shadow:3px 4px 18px rgba(40,20,5,0.3)">
    <p style="margin-top:14px;font-size:1.1rem;font-weight:800;color:#5c2e05">⛺ 즐거운 캠핑 되세요!</p>
  </div>`;
}

// 게이트 적용. 게임 off면 화면 전체(body)를 캠핑으로 덮어 게임 관련 요소를 모두 숨긴다.
let __gameGateBound = false;
function gateGameOn(onOpen, targetEl) {
  const showCamp = () => {
    // panel 컨테이너 안쪽만 캠핑 화면으로 교체한다.
    // (예전엔 document.body 전체를 덮어 #subtitle/#panel을 파괴 → 게임 off→on 전환 시
    //  onOpen()이 사라진 DOM을 참조해 TypeError로 멈추고 캠핑 화면에 갇히는 버그가 있었음.)
    const el = targetEl || document.getElementById('panel') || document.body;
    el.innerHTML = campScreenHtml();
    const sub = document.getElementById('subtitle');
    if (sub) sub.textContent = '';   // 대기 중엔 게임 부제 숨김
  };
  const apply = () => {
    const s = window.SchoolExplorerSync;
    const dev = (typeof isDev === 'function') && isDev();
    if (dev || !s || !s.online) { onOpen(); return; }   // DEV/오프라인은 통과
    if (!__gameGateBound) {
      __gameGateBound = true;
      s.subscribeGameState((on) => { if (on) onOpen(); else showCamp(); });
    }
  };
  if (window.SYNC_READY) apply();
  else window.addEventListener('sync-ready', apply, { once: true });
}
