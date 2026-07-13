/* 게임 결과 → 구글시트 기록 웹앱 URL.
 * Apps Script(시트 바인딩) 웹앱 배포 주소. 교사 토큰 검증은 서버(Apps Script)에서 하므로
 * 이 URL이 공개돼도 무단 기록은 안 된다(교사 화이트리스트 토큰 필요).
 * 새로 배포해 URL이 바뀌면 여기만 갱신. */
window.RESULTS_SHEET_WEBAPP = 'https://script.google.com/macros/s/AKfycbxOKMa7aQOp4Od3gTqc_4Ap0pUxfqivnQ-mFH8WuAgEOCQSVGwyvuPCL4BkbPs5SH9G_A/exec';

/* 결과가 기록되는 구글시트(교사가 성적 확인) — 개발자페이지·대시보드의 '결과 시트' 버튼이 이 주소로 연다. */
window.RESULTS_SHEET_URL = 'https://docs.google.com/spreadsheets/d/178ArLrX0X5pjQPbR6EpWwtYYIFcxxetQsZfNzIHcIoQ/edit?gid=2111944019#gid=2111944019';
