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
