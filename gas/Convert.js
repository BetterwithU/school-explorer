/* 시트 → JSON 변환 로직 (가변 QR: 공통 1개 ~ 조합 N개)
 * 사이트의 app.js / mission.html 이 기대하는 구조에 맞춤.
 *   questions.json: [{id,set,slot,category,difficulty,question,hints[],answer,combined}]
 *   course.json:    {title,subtitle,teams[],missions:[{set,placeName,mode,qids[]}]}
 *
 * [문제] 탭: id(예 1A 또는 2), 세트(1), 순번(A/B/C/D 또는 비움=공통),
 *            분류, 난이도, 문제, 정답, 힌트1~3
 *   - 한 세트에 행 1개(순번 비움) → 공통문제(mode=common), combined=그 답.
 *   - 한 세트에 행 N개(순번 A,B,C..) → 조합(mode=combo), combined=순번순 정답 이어붙임.
 */

const DIFF_MAP = { '쉬움': 'easy', '보통': 'medium', '어려움': 'hard' };

function buildJson_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const questions = readQuestions_(ss);
  const course = readCourse_(ss, questions);
  return { questions: questions, course: course };
}

function readQuestions_(ss) {
  const sh = ss.getSheetByName(SHEET_QUESTIONS);
  if (!sh) throw new Error('[문제] 탭이 없습니다. 먼저 "시트 양식 만들기"를 실행하세요.');
  const values = sh.getDataRange().getValues();
  if (values.length < 2) throw new Error('[문제] 탭에 입력된 문제가 없습니다.');

  const header = values[0].map(String);
  const col = name => header.indexOf(name);
  const idx = {
    id: col('id'), set: col('세트'), slot: col('순번'),
    category: col('분류'), difficulty: col('난이도'), question: col('문제'),
    image: col('이미지'),
    answer: col('정답'), h1: col('힌트1'), h2: col('힌트2'), h3: col('힌트3'),
  };

  const out = [];
  const seen = {};
  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    const id = String(row[idx.id] || '').trim();
    const question = String(row[idx.question] || '').trim();
    if (id === '' && question === '') continue;

    if (!id) throw new Error(`[문제] ${r + 1}행: id(예 1A, 2)가 비었어요.`);
    if (seen[id]) throw new Error(`[문제] id "${id}"가 중복됩니다 (${r + 1}행).`);
    seen[id] = true;
    if (!question) throw new Error(`[문제] ${id}: 문제 내용이 비었어요.`);

    const setNo = Number(row[idx.set]);
    if (!setNo || isNaN(setNo)) throw new Error(`[문제] ${id}: 세트 번호가 숫자가 아니에요.`);

    const slot = String(row[idx.slot] || '').trim().toUpperCase(); // A/B/C/D 또는 ''
    const answer = String(row[idx.answer] || '').trim();
    if (!answer) throw new Error(`[문제] ${id}: 정답이 비었어요.`);

    const hints = [row[idx.h1], row[idx.h2], row[idx.h3]]
      .map(v => String(v || '').trim()).filter(v => v !== '');

    // 이미지: 파일명이면 images/ 접두, http(s) URL이면 그대로
    let image = idx.image >= 0 ? String(row[idx.image] || '').trim() : '';
    if (image && !/^https?:\/\//i.test(image) && image.indexOf('images/') !== 0) {
      image = 'images/' + image;
    }

    out.push({
      id: id,
      set: setNo,
      slot: slot,
      category: String(row[idx.category] || '').trim(),
      difficulty: DIFF_MAP[String(row[idx.difficulty]).trim()] || 'easy',
      question: question,
      image: image,
      hints: hints,
      answer: answer,
      combined: '', // 아래에서 채움
    });
  }
  if (out.length === 0) throw new Error('[문제] 탭에 유효한 문제가 없습니다.');

  // 세트별로 묶어 합본정답(combined) 생성
  const bySet = {};
  out.forEach(q => { (bySet[q.set] = bySet[q.set] || []).push(q); });
  Object.keys(bySet).forEach(s => {
    const group = bySet[s];
    if (group.length === 1) {
      // 공통문제: 순번 비어 있어야 자연스러움. combined = 그 답
      group[0].combined = group[0].answer;
    } else {
      // 조합: 순번(A,B,C..) 순서로 정렬 후 정답 이어붙임
      group.forEach(q => {
        if (!q.slot) throw new Error(`세트 ${s}: 문제가 ${group.length}개인데 "${q.id}"의 순번(A/B/C..)이 비었어요.`);
      });
      group.sort((a, b) => a.slot.localeCompare(b.slot));
      // 순번 중복 검사
      const slots = group.map(q => q.slot);
      if (new Set(slots).size !== slots.length)
        throw new Error(`세트 ${s}: 순번이 중복돼요 (${slots.join(',')}).`);
      const combined = group.map(q => q.answer).join('');
      group.forEach(q => q.combined = combined);
    }
  });

  return out;
}

function readCourse_(ss, questions) {
  // 세트별 문제 묶기(순번 정렬된 qids)
  const bySet = {};
  questions.forEach(q => { (bySet[q.set] = bySet[q.set] || []).push(q); });

  const cfg = readConfig_(ss);
  const teams = String(cfg.teams || '1조,2조,3조,4조')
    .split(',').map(s => s.trim()).filter(Boolean);

  const sh = ss.getSheetByName(SHEET_COURSE);
  if (!sh) throw new Error('[코스] 탭이 없습니다. 먼저 "시트 양식 만들기"를 실행하세요.');
  const values = sh.getDataRange().getValues();
  const header = values[0].map(String);
  const ci = { set: header.indexOf('세트'), name: header.indexOf('장소이름') };

  const missions = [];
  const seenSet = {};
  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    const setRaw = row[ci.set];
    const placeName = String(row[ci.name] || '').trim();
    if (setRaw === '' && placeName === '') continue;

    const setNo = Number(setRaw);
    if (!setNo || isNaN(setNo)) throw new Error(`[코스] ${r + 1}행: 세트 번호가 숫자가 아니에요.`);
    if (seenSet[setNo]) throw new Error(`[코스] 세트 ${setNo}가 중복됩니다.`);
    seenSet[setNo] = true;

    const group = bySet[setNo];
    if (!group || group.length === 0)
      throw new Error(`[코스] 세트 ${setNo}: [문제] 탭에 해당 세트 문제가 없어요.`);

    // 순번 순으로 qids 정렬
    const sorted = group.slice().sort((a, b) => (a.slot || '').localeCompare(b.slot || ''));
    missions.push({
      set: setNo,
      placeName: placeName || ('세트' + setNo),
      mode: sorted.length === 1 ? 'common' : 'combo',
      qids: sorted.map(q => q.id),
    });
  }
  if (missions.length === 0) throw new Error('[코스] 탭에 미션이 없습니다.');

  return {
    title: cfg.title || '학교 캠핑 탐험대',
    subtitle: cfg.subtitle || '',
    teams: teams,
    missions: missions,
  };
}

function readConfig_(ss) {
  const sh = ss.getSheetByName(SHEET_CONFIG);
  const cfg = {};
  if (!sh) return cfg;
  const values = sh.getDataRange().getValues();
  for (let r = 1; r < values.length; r++) {
    const k = String(values[r][0] || '').trim();
    if (k) cfg[k] = String(values[r][1] || '').trim();
  }
  return cfg;
}
