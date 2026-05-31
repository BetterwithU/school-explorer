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

  setupQuestionsSheet_(ss);
  setupCourseSheet_(ss);
  setupConfigSheet_(ss);

  removeEmptyDefaultSheet_(ss);

  ui.alert('시트 양식을 만들었어요!',
    '[문제] 탭에 문제를 입력하고, [코스] 탭에서 장소-문제를 연결한 뒤\n' +
    '메뉴 → "사이트에 반영하기"를 누르세요.',
    ui.ButtonSet.OK);
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
