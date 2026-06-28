/* ============================================================
 * 게임 결과 → 구글시트 자동 기록 (Apps Script 웹앱)
 *
 * 대시보드에서 "게임 종료" 시 결과를 POST 받아 '결과' 시트에 기록한다.
 * - 시트·헤더 자동 생성(교사가 시트 구조 몰라도 됨)
 * - 멱등: 같은 session은 기존 행을 지우고 다시 기록(종료 두 번 눌러도 중복 없음)
 * - 인증: Firebase ID 토큰 검증 → 등록된 교사(@snu 화이트리스트)만 기록 가능
 * - CORS: 클라이언트는 text/plain 으로 보냄(프리플라이트 회피)
 * ============================================================ */

var FIREBASE_API_KEY = 'AIzaSyDD1m3-TU8C0JdpisjmCxs9tjDS6dXNJR0';
var ADMINS = ['june_wook@snu.ms.kr', 'snumsmaths@snu.ms.kr', 'sw@snu.ms.kr'];
var SHEET_NAME = '결과';
var HEADERS = ['종료시각', '세션', '게임세트', '반', '회차', '모드', '조', '내이름', '짝이름', '이메일', '클리어수', '전체', '우승조건', '완주', '완주시각'];

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);   // text/plain 본문 = JSON 문자열
    // 1) 인증: Firebase ID 토큰 검증
    var email = verifyIdToken(body.idToken);
    if (!email || ADMINS.indexOf(email.toLowerCase()) === -1) {
      return json({ ok: false, error: '교사 인증 실패' });
    }
    // 2) 형태 검증
    var rows = body.rows;
    if (!Array.isArray(rows) || !rows.length) return json({ ok: false, error: '결과 행이 없습니다' });
    if (rows.length > 200) return json({ ok: false, error: '행이 너무 많습니다' });
    var session = String(body.session || rows[0].session || '');
    if (!session) return json({ ok: false, error: 'session 누락' });

    // 3) 시트·헤더 준비
    var ss = SpreadsheetApp.getActive();
    var sh = ss.getSheetByName(SHEET_NAME);
    if (!sh) { sh = ss.insertSheet(SHEET_NAME); }
    if (sh.getLastRow() === 0) { sh.appendRow(HEADERS); sh.setFrozenRows(1); }

    // 4) 멱등: 이 session의 기존 행 삭제(중복 방지)
    deleteRowsForSession(sh, session);

    // 5) 행 추가
    var out = rows.map(function (r) {
      return [
        r.endedAt ? new Date(r.endedAt) : new Date(),
        r.session || session, r.gameSet || '', r.className || '', r.seq || '', r.mode || '',
        r.team || '', r.myName || '', r.partnerName || '', r.email || '',
        num(r.solvedCount), num(r.total), num(r.need),
        r.won ? '완주' : '', r.wonAt ? new Date(r.wonAt) : ''
      ];
    });
    sh.getRange(sh.getLastRow() + 1, 1, out.length, HEADERS.length).setValues(out);

    return json({ ok: true, saved: out.length, sheet: SHEET_NAME });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

// GET — 배포 확인용(브라우저로 URL 열면 상태 표시)
function doGet() {
  return json({ ok: true, service: '게임 결과 기록', time: new Date().toISOString() });
}

// Firebase ID 토큰 → 이메일(검증 통과 시). 실패 시 null.
function verifyIdToken(idToken) {
  if (!idToken) return null;
  try {
    var res = UrlFetchApp.fetch(
      'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + FIREBASE_API_KEY,
      { method: 'post', contentType: 'application/json', payload: JSON.stringify({ idToken: idToken }), muteHttpExceptions: true }
    );
    var data = JSON.parse(res.getContentText());
    if (data.users && data.users[0] && data.users[0].email) {
      return data.users[0].emailVerified !== false ? data.users[0].email : data.users[0].email;
    }
  } catch (e) {}
  return null;
}

function deleteRowsForSession(sh, session) {
  var last = sh.getLastRow();
  if (last < 2) return;
  var vals = sh.getRange(2, 2, last - 1, 1).getValues();  // B열=세션
  for (var i = vals.length - 1; i >= 0; i--) {
    if (String(vals[i][0]) === session) sh.deleteRow(i + 2);
  }
}

function num(v) { var n = parseInt(v, 10); return isNaN(n) ? 0 : n; }
function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
