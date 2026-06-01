#!/usr/bin/env node
/*
 * Notion → questions.json / course.json 변환 (A3)
 *
 * 사용법:
 *   NOTION_TOKEN=ntn_xxx QUESTIONS_DB_ID=xxx COURSE_DB_ID=xxx node tools/notion-to-json.mjs
 *
 * - 의존성 없음 (Node 18+ 내장 fetch 사용)
 * - 게임 사이트(HTML/JS)는 그대로. 이 스크립트가 데이터 파일만 다시 만든다.
 * - 스키마 설계: drafts/notion-스키마.md 참고
 */

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const TOKEN = process.env.NOTION_TOKEN;
const QUESTIONS_DB = process.env.QUESTIONS_DB_ID;
const COURSE_DB = process.env.COURSE_DB_ID;
const NOTION_VERSION = '2022-06-28';

/* 게임 메타 — Notion에서 관리하려면 설정 페이지 파싱으로 확장 가능.
 * 지금은 상수로 두고, finale.answer 등만 가끔 바꾸면 됨. */
const META = {
  title: '학교 캠핑 탐험대',
  subtitle: 'QR을 찾아 미션을 해결하고 보물을 찾아라!',
  teams: ['1조', '2조', '3조', '4조'],
  finale: {
    answer: '운동장큰은행나무',
    title: '마지막 미션 · 보물 암호 조합',
    prompt: '미션마다 모은 글자 8개를 모두 조합하면, 보물이 숨겨진 장소가 드러나요!',
    reveal: '보물은 그곳에 숨겨져 있어요. 선생님께 가서 "우리 조 보물 찾았어요!"라고 외치세요!',
  },
};

if (!TOKEN || !QUESTIONS_DB || !COURSE_DB) {
  console.error('❌ 환경변수 NOTION_TOKEN, QUESTIONS_DB_ID, COURSE_DB_ID 가 필요합니다.');
  process.exit(1);
}

async function queryAll(dbId) {
  const results = [];
  let cursor;
  do {
    const res = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Notion-Version': NOTION_VERSION,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(cursor ? { start_cursor: cursor, page_size: 100 } : { page_size: 100 }),
    });
    if (!res.ok) throw new Error(`Notion query 실패 (${dbId}): ${res.status} ${await res.text()}`);
    const data = await res.json();
    results.push(...data.results);
    cursor = data.has_more ? data.next_cursor : null;
  } while (cursor);
  return results;
}

/* 속성 추출 헬퍼 */
const P = {
  title: (props, key) => (props[key]?.title || []).map((t) => t.plain_text).join('').trim(),
  text: (props, key) => (props[key]?.rich_text || []).map((t) => t.plain_text).join('').trim(),
  number: (props, key) => props[key]?.number ?? null,
  select: (props, key) => props[key]?.select?.name ?? '',
  url: (props, key) => props[key]?.url ?? '',
};

function buildQuestions(pages) {
  return pages
    .map((pg) => {
      const p = pg.properties;
      const mediaType = P.select(p, '미디어유형');
      const mediaUrl = P.url(p, '미디어URL') || P.text(p, '미디어URL');
      const media = mediaType && mediaType !== '없음' && mediaUrl ? [{ type: mediaType, url: mediaUrl }] : [];
      const hints = ['hint1', 'hint2', 'hint3'].map((k) => P.text(p, k)).filter(Boolean);
      return {
        id: P.title(p, 'id'),
        set: P.number(p, 'set'),
        slot: P.select(p, 'slot'),
        category: P.select(p, 'category'),
        difficulty: P.select(p, 'difficulty') || 'normal',
        question: P.text(p, 'question'),
        media,
        hints,
        answer: P.text(p, 'answer'),
        combined: P.text(p, 'combined'),
      };
    })
    .filter((q) => q.id)
    .sort((a, b) => a.set - b.set || String(a.id).localeCompare(String(b.id)));
}

function buildCourse(coursePages, questions) {
  const bySet = {};
  for (const q of questions) (bySet[q.set] ||= []).push(q);

  const missions = coursePages
    .map((pg) => {
      const p = pg.properties;
      const set = Number(P.title(p, 'set'));
      const qs = (bySet[set] || []).slice().sort((a, b) => String(a.slot).localeCompare(String(b.slot)));
      const qids = qs.map((q) => q.id);
      return {
        set,
        placeName: P.text(p, 'placeName'),
        mode: qids.length === 1 ? 'common' : 'combo',
        qids,
        piece: P.text(p, 'piece'),
      };
    })
    .filter((m) => m.set >= 1)
    .sort((a, b) => a.set - b.set);

  return { ...META, missions };
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const [qPages, cPages] = await Promise.all([queryAll(QUESTIONS_DB), queryAll(COURSE_DB)]);
const questions = buildQuestions(qPages);
const course = buildCourse(cPages, questions);

// 가벼운 검증
const warn = [];
for (const m of course.missions) {
  if (!m.placeName) warn.push(`set ${m.set}: placeName 비어있음`);
  if (!m.piece) warn.push(`set ${m.set}: piece(보물 글자) 비어있음`);
  if (!m.qids.length) warn.push(`set ${m.set}: 연결된 문제 없음`);
}
const pieceCount = course.missions.filter((m) => m.piece).length;
const ansLen = [...(META.finale.answer || '')].length;
if (pieceCount !== ansLen) warn.push(`보물 글자 수(${pieceCount}) ≠ 최종 정답 글자 수(${ansLen})`);

writeFileSync(join(ROOT, 'questions.json'), JSON.stringify(questions, null, 2) + '\n', 'utf8');
writeFileSync(join(ROOT, 'course.json'), JSON.stringify(course, null, 2) + '\n', 'utf8');

console.log(`✅ questions.json (${questions.length}문제), course.json (${course.missions.length}장소) 생성 완료`);
if (warn.length) {
  console.warn('⚠️  점검 필요:');
  warn.forEach((w) => console.warn('   - ' + w));
}
