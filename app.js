/* 학교 캠핑 탐험대 — 공통 로직 (협력형 2인 QR)
 * - 한 미션 = 한 세트(set). 세트마다 A·B 두 문제. 둘의 답을 합쳐야 정답(combined).
 * - 조별 세트 순서 셔플(결정적, 라틴방진) → 동선 충돌 0 + 조마다 다른 순서.
 * - 진행상태 localStorage 저장/복구(유실 방지).
 */

const STORAGE_KEY = 'schoolExplorer';

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
function loadProgress() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || null;
  } catch {
    return null;
  }
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
    notes: {},      // { qid: "내 답 메모" } — 채점 무관, 기억 보조
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

/* ---------- QR별 "내 답 메모" (채점 무관, 기억 보조) ----------
 * 협력 미션에서 각자 알아낸 개별 답을 QR(qid)별로 저장.
 * 같은 QR을 다시 찍으면 적어둔 메모가 그대로 보임.
 */
function getNote(p, qid) {
  return (p.notes && p.notes[qid]) || '';
}

function saveNote(p, qid, text) {
  if (!p.notes) p.notes = {};
  p.notes[qid] = text;
  saveProgress(p);
  return p;
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
