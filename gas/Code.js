/* 학교 캠핑 탐험대 — 스프레드시트 ↔ 사이트 연동 (메인)
 *
 * 메뉴:
 *   🏕️ 탐험대
 *    ├─ 시트 양식 만들기      → 빈 [문제]/[코스]/[설정] 탭 생성
 *    ├─ 사이트에 반영하기      → 시트→JSON 변환 + GitHub 커밋 + Notion 백업
 *    ├─ 미리보기              → 변환 결과만 확인(반영 안 함)
 *    └─ 설정값 확인            → 토큰 등록 상태 점검
 *
 * 토큰은 스크립트 속성(Script Properties)에 저장. 코드에 하드코딩하지 않음.
 *   GITHUB_TOKEN, GITHUB_REPO(예: BetterwithU/school-explorer), GITHUB_BRANCH(기본 main)
 *   NOTION_TOKEN, NOTION_DB_ID (백업 안 쓰면 비워둬도 됨)
 */

const SHEET_QUESTIONS = '문제';
const SHEET_COURSE = '코스';
const SHEET_CONFIG = '설정';
const SHEET_GUIDE = '📖 사용법';

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🏕️ 탐험대')
    .addItem('시트 양식 만들기', 'setupSheets')
    .addSeparator()
    .addItem('사이트에 반영하기', 'publishToSite')
    .addItem('미리보기 (반영 안 함)', 'previewJson')
    .addSeparator()
    .addItem('설정값 확인', 'checkConfig')
    .addToUi();
}

/* ---------------- 시트 양식 생성 ---------------- */
function setupSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();

  setupGuideSheet_(ss);
  setupQuestionsSheet_(ss);
  setupCourseSheet_(ss);
  setupConfigSheet_(ss);

  removeEmptyDefaultSheet_(ss);

  ui.alert('시트 양식을 만들었어요!',
    '[문제] 탭에 문제를 입력하고, [코스] 탭에서 장소-문제를 연결한 뒤\n' +
    '메뉴 → "사이트에 반영하기"를 누르세요.',
    ui.ButtonSet.OK);
}

function setupGuideSheet_(ss) {
  const sh = getOrCreateSheet_(ss, SHEET_GUIDE);
  sh.clear();
  sh.clearFormats();
  sh.setColumnWidth(1, 160);
  sh.setColumnWidth(2, 400);
  sh.setColumnWidth(3, 200);

  const rows = [
    // [행, 열, 텍스트, 병합열수, 배경, 폰트색, 굵기, 크기]
    [1,  1, '🏕️ 학교 캠핑 탐험대 — 사용 가이드', 3, '#1a1a2e', '#ffffff', true,  16],
    [2,  1, '사이트 주소: https://betterwithu.github.io/school-explorer/', 3, '#16213e', '#a8dadc', false, 10],
    [3,  1, '', 3, '#ffffff', '#000000', false, 10],

    [4,  1, '🎮 게임 방식 요약', 3, '#0f3460', '#ffffff', true,  12],
    [5,  1, '① 조를 나눠 각자 다른 순서로 장소를 돌아다닙니다', 3, '#f8f9fa', '#333333', false, 10],
    [6,  1, '② 각 장소의 QR을 스캔해 문제를 풉니다', 3, '#f8f9fa', '#333333', false, 10],
    [7,  1, '③ 모든 미션을 가장 빨리 완주한 조가 우승!', 3, '#f8f9fa', '#333333', false, 10],
    [8,  1, '', 3, '#ffffff', '#000000', false, 10],

    [9,  1, '🔳 QR 개수별 게임 방식', 3, '#0f3460', '#ffffff', true,  12],
    [10, 1, 'QR 1개 (공통)',    2, '#fff3cd', '#856404', true,  10],
    [10, 3, '전원 같은 문제 → 한 명이 풀고 정답 공유 → 각자 입력',  1, '#fff3cd', '#856404', false, 10],
    [11, 1, 'QR 2개 (A+B 조합)', 2, '#d1ecf1', '#0c5460', true,  10],
    [11, 3, 'A 답 + B 답 = 두 글자 합쳐서 입력 (예: 사과)',          1, '#d1ecf1', '#0c5460', false, 10],
    [12, 1, 'QR 3개 (A+B+C 조합)', 2, '#d4edda', '#155724', true,  10],
    [12, 3, 'A+B+C 세 글자 합쳐서 입력 (예: 무지개)',                1, '#d4edda', '#155724', false, 10],
    [13, 1, 'QR 4개 (A+B+C+D 조합)', 2, '#f8d7da', '#721c24', true,  10],
    [13, 3, 'A+B+C+D 네 글자 합쳐서 입력 (예: 나무그늘)',            1, '#f8d7da', '#721c24', false, 10],
    [14, 1, '', 3, '#ffffff', '#000000', false, 10],

    [15, 1, '📝 [문제] 탭 컬럼 설명', 3, '#0f3460', '#ffffff', true,  12],
    [16, 1, 'id',     1, '#e9ecef', '#1a1a2e', true,  10],
    [16, 2, '문제 번호. 조합이면 1A·1B, 공통이면 1처럼 입력', 2, '#e9ecef', '#333333', false, 10],
    [17, 1, '세트',   1, '#e9ecef', '#1a1a2e', true,  10],
    [17, 2, '장소 번호. 같은 세트끼리 한 장소에 배치됨', 2, '#e9ecef', '#333333', false, 10],
    [18, 1, '순번',   1, '#e9ecef', '#1a1a2e', true,  10],
    [18, 2, '조합: A,B,C,D 순서 (이 순서로 글자가 합쳐짐) / 공통: 비워두기', 2, '#e9ecef', '#333333', false, 10],
    [19, 1, '분류',   1, '#e9ecef', '#1a1a2e', true,  10],
    [19, 2, '과목 (수학, 국어, 과학, 사회, 넌센스 등 자유롭게)', 2, '#e9ecef', '#333333', false, 10],
    [20, 1, '난이도', 1, '#e9ecef', '#1a1a2e', true,  10],
    [20, 2, '드롭다운: 쉬움 / 보통 / 어려움', 2, '#e9ecef', '#333333', false, 10],
    [21, 1, '문제',   1, '#e9ecef', '#1a1a2e', true,  10],
    [21, 2, '문제 내용 (이미지 없는 텍스트 문제)', 2, '#e9ecef', '#333333', false, 10],
    [22, 1, '이미지', 1, '#e9ecef', '#1a1a2e', true,  10],
    [22, 2, '(선택) 파일명 예: tent.jpg  또는  http://... 로 시작하는 웹주소', 2, '#e9ecef', '#333333', false, 10],
    [23, 1, '정답',   1, '#e9ecef', '#1a1a2e', true,  10],
    [23, 2, '조합은 1글자씩, 공통은 단어/숫자 전체 (A+B 순서로 자동 합쳐짐)', 2, '#e9ecef', '#333333', false, 10],
    [24, 1, '힌트1~3',1, '#e9ecef', '#1a1a2e', true,  10],
    [24, 2, '(선택) 점점 구체적으로. 최대 3개. 비워도 됨', 2, '#e9ecef', '#333333', false, 10],
    [25, 1, '', 3, '#ffffff', '#000000', false, 10],

    [26, 1, '🚀 사이트 반영 방법', 3, '#0f3460', '#ffffff', true,  12],
    [27, 1, '문제 입력 완료 후', 3, '#f8f9fa', '#333333', false, 10],
    [28, 1, '→ 상단 메뉴  🏕️ 탐험대  →  사이트에 반영하기  클릭', 3, '#fff3cd', '#856404', true,  11],
    [29, 1, '→ 1~2분 후 자동으로 사이트에 반영됩니다', 3, '#f8f9fa', '#555555', false, 10],
    [30, 1, '', 3, '#ffffff', '#000000', false, 10],

    [31, 1, '🖨️ QR코드 인쇄', 3, '#0f3460', '#ffffff', true,  12],
    [32, 1, '사이트 주소/qrcodes.html 접속 → 인쇄 버튼 클릭', 3, '#f8f9fa', '#333333', false, 10],
    [33, 1, 'https://betterwithu.github.io/school-explorer/qrcodes.html', 3, '#e9ecef', '#0c5460', false, 10],
  ];

  rows.forEach(function(r) {
    var row=r[0], col=r[1], text=r[2], merge=r[3], bg=r[4], fg=r[5], bold=r[6], size=r[7];
    if (text === '') return;
    var range = merge > 1
      ? sh.getRange(row, col, 1, merge)
      : sh.getRange(row, col);
    if (merge > 1) range.merge();
    range.setValue(text)
         .setBackground(bg)
         .setFontColor(fg)
         .setFontWeight(bold ? 'bold' : 'normal')
         .setFontSize(size)
         .setWrap(true)
         .setVerticalAlignment('middle');
    if (col === 1 && merge === 3) range.setHorizontalAlignment('center');
  });

  sh.setRowHeight(1, 36);
  sh.setRowHeight(4, 28);
  sh.setRowHeight(9, 28);
  sh.setRowHeight(15, 28);
  sh.setRowHeight(26, 28);
  sh.setRowHeight(28, 32);
  sh.setRowHeight(31, 28);
  sh.setFrozenRows(0);

  // 탭을 맨 앞으로
  ss.setActiveSheet(sh);
  ss.moveActiveSheet(1);
}

function setupQuestionsSheet_(ss) {
  const headers = ['id', '세트', '순번', '분류', '난이도', '문제',
                   '이미지', '정답', '힌트1', '힌트2', '힌트3'];
  const sh = getOrCreateSheet_(ss, SHEET_QUESTIONS);
  writeHeader_(sh, headers);

  // 드롭다운: 순번(C열=3, A~D 또는 비움), 난이도(E열=5)
  setDropdownAllowBlank_(sh, 3, ['A', 'B', 'C', 'D']);
  setDropdown_(sh, 5, ['쉬움', '보통', '어려움']);

  sh.setColumnWidth(6, 340);                        // 문제
  sh.setColumnWidth(7, 180);                        // 이미지
  for (let c = 9; c <= 11; c++) sh.setColumnWidth(c, 200); // 힌트
  sh.setFrozenRows(1);

  sh.getRange('A1').setNote('id 예: 조합이면 1A,1B / 공통이면 2 처럼. 세트 안에서 안 겹치게.');
  sh.getRange('B1').setNote('세트 번호 = 한 장소. 같은 세트의 문제들이 그 장소에 모입니다.');
  sh.getRange('C1').setNote('순번: 조합 문제는 A,B,C,D (이 순서로 글자가 합쳐짐). 공통 문제(QR 1개)면 비워두세요.');
  sh.getRange('G1').setNote('이미지(선택): 파일명만 적으면 됩니다. 예 tent.jpg → images 폴더에 같은 이름으로 올려두세요. 웹주소(http...)를 적어도 됩니다.');
  sh.getRange('H1').setNote('정답. 조합은 한 글자씩(순번 순서로 합쳐짐). 공통은 단어/숫자 전체.');
}

function setupCourseSheet_(ss) {
  const headers = ['세트', '장소이름'];
  const sh = getOrCreateSheet_(ss, SHEET_COURSE);
  writeHeader_(sh, headers);
  sh.setColumnWidth(2, 280);
  sh.setFrozenRows(1);

  sh.getRange('A1').setNote('[문제] 탭의 세트 번호. 이 세트의 A·B QR 2개가 이 장소에 배치됩니다.');
  sh.getRange('B1').setNote('학생에게 보여줄 장소 이름. 예: 운동장 미끄럼틀');
}

function setupConfigSheet_(ss) {
  const sh = getOrCreateSheet_(ss, SHEET_CONFIG);
  sh.clear();
  const rows = [
    ['키', '값'],
    ['title', '학교 캠핑 탐험대'],
    ['subtitle', 'QR을 찾아다니며 미션을 해결하세요!'],
    ['teams', '1조,2조,3조,4조'],
  ];
  sh.getRange(1, 1, rows.length, 2).setValues(rows);
  sh.getRange(1, 1, 1, 2).setFontWeight('bold').setBackground('#1a1a2e').setFontColor('#ffffff');
  sh.setColumnWidth(2, 360);
  sh.setFrozenRows(1);
  sh.getRange('B4').setNote('조 이름을 쉼표(,)로 구분해 적으세요. 예: 1조,2조,3조,4조');
}

/* ---------------- 시트 유틸 ---------------- */
function getOrCreateSheet_(ss, name) {
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

function writeHeader_(sh, headers) {
  sh.clear();
  sh.getRange(1, 1, 1, headers.length).setValues([headers])
    .setFontWeight('bold').setBackground('#1a1a2e').setFontColor('#ffffff');
}

function setDropdown_(sh, col, options) {
  const rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(options, true).setAllowInvalid(false).build();
  sh.getRange(2, col, 999, 1).setDataValidation(rule);
}

// 비워두는 것도 허용하는 드롭다운(공통문제는 순번을 비움)
function setDropdownAllowBlank_(sh, col, options) {
  const rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(options, true).setAllowInvalid(true).build();
  sh.getRange(2, col, 999, 1).setDataValidation(rule);
}

function removeEmptyDefaultSheet_(ss) {
  ['Sheet1', '시트1'].forEach(function (n) {
    const s = ss.getSheetByName(n);
    if (s && s.getLastRow() === 0 && ss.getSheets().length > 1) {
      ss.deleteSheet(s);
    }
  });
}
