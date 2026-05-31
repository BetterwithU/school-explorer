/* 사이트 반영 + 백업 + 설정 점검
 * GitHub Contents API로 questions.json / course.json 커밋 → GitHub Pages 자동 배포.
 * Notion은 토큰이 있을 때만 백업(미러).
 */

/* ---------------- 메뉴 액션 ---------------- */
function publishToSite() {
  const ui = SpreadsheetApp.getUi();
  let data;
  try {
    data = buildJson_();
  } catch (e) {
    ui.alert('입력 오류', String(e.message || e), ui.ButtonSet.OK);
    return;
  }

  const props = PropertiesService.getScriptProperties();
  const repo = props.getProperty('GITHUB_REPO');
  const token = props.getProperty('GITHUB_TOKEN');
  if (!repo || !token) {
    ui.alert('설정 필요',
      'GitHub 연동 설정이 없습니다.\n메뉴 → "설정값 확인"에서 GITHUB_TOKEN, GITHUB_REPO를 등록하세요.',
      ui.ButtonSet.OK);
    return;
  }

  const confirm = ui.alert('사이트에 반영할까요?',
    `문제 ${data.questions.length}개 · 미션 ${data.course.missions.length}개를\n${repo} 에 반영합니다.`,
    ui.ButtonSet.OK_CANCEL);
  if (confirm !== ui.Button.OK) return;

  try {
    const branch = props.getProperty('GITHUB_BRANCH') || 'main';
    githubPutFile_(repo, token, branch, 'questions.json',
      JSON.stringify(data.questions, null, 2), '문제 업데이트 (시트 반영)');
    githubPutFile_(repo, token, branch, 'course.json',
      JSON.stringify(data.course, null, 2), '코스 업데이트 (시트 반영)');
  } catch (e) {
    ui.alert('GitHub 반영 실패', String(e.message || e), ui.ButtonSet.OK);
    return;
  }

  // Notion 백업 (선택)
  let notionMsg = '';
  const nToken = props.getProperty('NOTION_TOKEN');
  const nDb = props.getProperty('NOTION_DB_ID');
  if (nToken && nDb) {
    try {
      const n = notionBackup_(nToken, nDb, data.questions);
      notionMsg = `\nNotion 백업: ${n}건 동기화`;
    } catch (e) {
      notionMsg = '\n⚠️ Notion 백업 실패: ' + (e.message || e);
    }
  }

  ui.alert('반영 완료!',
    `GitHub에 커밋했어요. 1~2분 후 사이트에 반영됩니다.${notionMsg}`,
    ui.ButtonSet.OK);
}

function previewJson() {
  const ui = SpreadsheetApp.getUi();
  try {
    const data = buildJson_();
    const sample = data.questions.slice(0, 2);
    ui.alert('미리보기',
      `문제 ${data.questions.length}개 · 미션 ${data.course.missions.length}개 · 조 ${data.course.teams.length}개\n\n` +
      `[문제 예시]\n${JSON.stringify(sample, null, 2).slice(0, 1500)}`,
      ui.ButtonSet.OK);
  } catch (e) {
    ui.alert('입력 오류', String(e.message || e), ui.ButtonSet.OK);
  }
}

function checkConfig() {
  const ui = SpreadsheetApp.getUi();
  const p = PropertiesService.getScriptProperties();
  const mask = v => v ? (v.slice(0, 4) + '••••(등록됨)') : '❌ 없음';
  ui.alert('설정값 확인',
    'GITHUB_TOKEN: ' + mask(p.getProperty('GITHUB_TOKEN')) + '\n' +
    'GITHUB_REPO: ' + (p.getProperty('GITHUB_REPO') || '❌ 없음') + '\n' +
    'GITHUB_BRANCH: ' + (p.getProperty('GITHUB_BRANCH') || 'main (기본)') + '\n' +
    'NOTION_TOKEN: ' + mask(p.getProperty('NOTION_TOKEN')) + '\n' +
    'NOTION_DB_ID: ' + (p.getProperty('NOTION_DB_ID') || '(백업 안 함)'),
    ui.ButtonSet.OK);
}

/* ---------------- GitHub Contents API ---------------- */
function githubPutFile_(repo, token, branch, path, content, message) {
  const base = 'https://api.github.com/repos/' + repo + '/contents/' + path;
  const headers = {
    'Authorization': 'Bearer ' + token,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  // 기존 파일 sha 조회(있으면 업데이트, 없으면 신규)
  let sha = null;
  const getRes = UrlFetchApp.fetch(base + '?ref=' + encodeURIComponent(branch),
    { method: 'get', headers: headers, muteHttpExceptions: true });
  if (getRes.getResponseCode() === 200) {
    sha = JSON.parse(getRes.getContentText()).sha;
  }

  const payload = {
    message: message,
    content: Utilities.base64Encode(content, Utilities.Charset.UTF_8),
    branch: branch,
  };
  if (sha) payload.sha = sha;

  const putRes = UrlFetchApp.fetch(base, {
    method: 'put', headers: headers, contentType: 'application/json',
    payload: JSON.stringify(payload), muteHttpExceptions: true,
  });
  const code = putRes.getResponseCode();
  if (code !== 200 && code !== 201) {
    throw new Error('GitHub ' + path + ' 실패 (HTTP ' + code + '): ' +
      putRes.getContentText().slice(0, 300));
  }
}

/* ---------------- Notion 백업 ----------------
 * DB에 같은 id가 있으면 갱신, 없으면 생성. 단순 미러.
 * DB 속성 가정: 제목="문제"(title), "id"(number), "정답"(rich_text), "분류"(rich_text)
 */
function notionBackup_(token, dbId, questions) {
  const headers = {
    'Authorization': 'Bearer ' + token,
    'Notion-Version': '2022-06-28',
    'Content-Type': 'application/json',
  };
  let count = 0;
  questions.forEach(function (q) {
    // 기존 페이지 검색
    const queryRes = UrlFetchApp.fetch(
      'https://api.notion.com/v1/databases/' + dbId + '/query',
      { method: 'post', headers: headers, muteHttpExceptions: true,
        payload: JSON.stringify({ filter: { property: 'id', number: { equals: q.id } } }) });
    let pageId = null;
    if (queryRes.getResponseCode() === 200) {
      const results = JSON.parse(queryRes.getContentText()).results;
      if (results && results.length) pageId = results[0].id;
    }

    const properties = {
      '문제': { title: [{ text: { content: q.question.slice(0, 1900) } }] },
      'id': { number: q.id },
      '정답': { rich_text: [{ text: { content: String(q.answer) } }] },
      '분류': { rich_text: [{ text: { content: String(q.category || '') } }] },
    };

    if (pageId) {
      UrlFetchApp.fetch('https://api.notion.com/v1/pages/' + pageId,
        { method: 'patch', headers: headers, muteHttpExceptions: true,
          payload: JSON.stringify({ properties: properties }) });
    } else {
      UrlFetchApp.fetch('https://api.notion.com/v1/pages',
        { method: 'post', headers: headers, muteHttpExceptions: true,
          payload: JSON.stringify({ parent: { database_id: dbId }, properties: properties }) });
    }
    count++;
  });
  return count;
}
