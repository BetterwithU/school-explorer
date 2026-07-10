/* ============================================================
 * roster.js — 반 명단(roster) 파싱·저장 공통 모듈
 *
 * 양식: CSV/XLSX 첫 행 헤더 [반, 번호, 이름] (또는 영문 class,no,name).
 * 입력 3종: CSV 텍스트 / XLSX 파일(SheetJS) / 구글시트 공개 링크.
 * 저장: localStorage 'b1_rosters' = { "2반": [{no,name}], ... } (상비 명단).
 *   ⚠️ 미성년 실명 — 로컬 보관. Firebase 올릴 땐 @snu 교사 전용 경로로(최종 단계).
 * 노출: window.BRoster
 * ============================================================ */
(function () {
  const LS = 'b1_rosters';

  // --- CSV 파싱 (간단·견고: 따옴표 미지원 단순 CSV. 헤더 자동 인식) ---
  function parseCSV(text) {
    const rows = String(text || '').replace(/\r/g, '').split('\n').map(r => r.trim()).filter(Boolean);
    if (!rows.length) return [];
    // 헤더 인식(견고): '이름/name/성명'은 학생 데이터 값에 안 나오므로 부분일치로 헤더 판정.
    // '반/번호/class/no'는 "2반"처럼 데이터 값에 섞여 나오므로 셀 전체가 정확히 그 단어일 때만 헤더로 인정.
    // (안 그러면 헤더 없는 명단의 첫 행 "2반,1,김민준"을 헤더로 오인해 1번 학생을 유실함)
    const head = rows[0].split(',').map(c => c.trim().toLowerCase());
    const isHeaderCell = c => /이름|name|성명/.test(c) || /^(반|학년반|class|번호|no|number)$/i.test(c);
    const hasHeader = head.some(isHeaderCell);
    const ci = {
      cls: head.findIndex(c => /반|class/.test(c)),
      no:  head.findIndex(c => /번호|no|number/.test(c)),
      name: head.findIndex(c => /이름|name/.test(c)),
    };
    const body = hasHeader ? rows.slice(1) : rows;
    const out = [];
    body.forEach(line => {
      const cols = line.split(',').map(c => c.trim());
      let cls, no, name;
      if (hasHeader && ci.name >= 0) {
        cls = ci.cls >= 0 ? cols[ci.cls] : '';
        no = ci.no >= 0 ? cols[ci.no] : '';
        name = cols[ci.name];
      } else {
        // 헤더 없으면 3열=[반,번호,이름] 또는 2열=[번호,이름] 또는 1열=[이름]
        if (cols.length >= 3) { [cls, no, name] = cols; }
        else if (cols.length === 2) { [no, name] = cols; cls = ''; }
        else { name = cols[0]; cls = ''; no = ''; }
      }
      if (name) out.push({ cls: cls || '', no: no || '', name });
    });
    return out;
  }

  // --- XLSX 파싱 (SheetJS 필요; 없으면 에러) ---
  async function parseXLSX(file) {
    if (!window.XLSX) throw new Error('XLSX 라이브러리(SheetJS)가 로드되지 않았습니다.');
    const buf = await file.arrayBuffer();
    const wb = window.XLSX.read(buf, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const csv = window.XLSX.utils.sheet_to_csv(ws);
    return parseCSV(csv);
  }

  // --- 구글시트 공개 링크 → CSV export → 파싱 ---
  async function parseGoogleSheet(url) {
    const m = String(url).match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (!m) throw new Error('구글시트 링크 형식이 아닙니다.');
    const gidM = String(url).match(/[#&?]gid=(\d+)/);
    const gid = gidM ? gidM[1] : '0';
    const csvUrl = `https://docs.google.com/spreadsheets/d/${m[1]}/export?format=csv&gid=${gid}`;
    const res = await fetch(csvUrl);
    if (!res.ok) throw new Error('구글시트를 읽지 못했습니다. "링크가 있는 모든 사용자 보기"로 공개됐는지 확인하세요.');
    return parseCSV(await res.text());
  }

  // --- 저장소 ---
  function loadAll() { try { return JSON.parse(localStorage.getItem(LS)) || {}; } catch { return {}; } }
  function saveAll(map) { localStorage.setItem(LS, JSON.stringify(map)); }
  function classNames() { return Object.keys(loadAll()); }
  function getClass(cls) { return loadAll()[cls] || []; }
  function removeClass(cls) { const m = loadAll(); delete m[cls]; saveAll(m); }

  // 반 이름 정규화: CSV의 반 값이 순수 숫자면 "반"을 붙인다("1"→"1반"). 이미 "반"이 있으면 그대로.
  function normClass(cls) {
    const s = String(cls || '').trim();
    return /^\d+$/.test(s) ? s + '반' : s;
  }

  // 파싱 결과를 반별로 묶어 저장. rows의 cls가 비면 fallbackClass로.
  function saveRows(rows, fallbackClass) {
    const map = loadAll();
    const byClass = {};
    rows.forEach(r => {
      const cls = normClass(r.cls || fallbackClass || '미분류');
      (byClass[cls] = byClass[cls] || []).push({ no: r.no || '', name: r.name });
    });
    Object.keys(byClass).forEach(cls => { map[cls] = byClass[cls]; });
    saveAll(map);
    return Object.keys(byClass);
  }

  // 명단을 이름 배열로(드롭다운용). 번호 있으면 "번호. 이름"으로 정렬.
  function nameList(rows) {
    const list = (rows || []).slice();
    list.sort((a, b) => (parseInt(a.no, 10) || 999) - (parseInt(b.no, 10) || 999));
    return list.map(r => r.no ? `${r.no}. ${r.name}` : r.name);
  }

  // Fisher-Yates 셔플
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
  }

  // rows 배열을 랜덤 2인 짝으로 구성. 홀수면 마지막 조만 3인.
  // 반환: [{team:"1조", members:["1. 김민준","2. 이서연"]}, ...]
  function pairUp(rows) {
    if (!rows || !rows.length) return [];
    const names = shuffle(rows.map(r => r.no ? `${r.no}. ${r.name}` : r.name));
    const pairs = [];
    let i = 0;
    while (i < names.length) {
      const left = names.length - i;
      const size = left === 1 ? 1 : left === 3 ? 3 : 2;
      pairs.push({ team: `${pairs.length + 1}조`, members: names.slice(i, i + size) });
      i += size;
    }
    return pairs;
  }

  window.BRoster = {
    parseCSV, parseXLSX, parseGoogleSheet,
    loadAll, saveAll, classNames, getClass, removeClass, saveRows, nameList,
    shuffle, pairUp,
    SAMPLE_CSV: '반,번호,이름\n2반,1,김민준\n2반,2,이서연\n2반,3,박지호\n',
  };
})();
