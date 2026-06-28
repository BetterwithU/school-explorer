/* ============================================================
 * teacher-gate.js — 교사 전용 화면 게이트 (출제/QR/시뮬 등 운영 도구)
 *
 * <script src="../../firebase-config.js"></script>
 * <script type="module" src="../../core/auth.js"></script>
 * <script src="teacher-gate.js"></script>  ← 이 한 줄로 페이지를 가린다.
 *
 * 화이트리스트 교사(@snu.ms.kr 등록계정)만 내용 표시. UI 차단이며,
 * 실제 데이터 보호는 database.rules.json 이 강제한다.
 * ============================================================ */
(function () {
  // 전체를 덮는 잠금 오버레이
  const ov = document.createElement('div');
  ov.id = 'teacherGate';
  ov.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#0f1424;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:32px;font-family:"Apple SD Gothic Neo","Malgun Gothic",sans-serif;color:#e6eefc';
  ov.innerHTML = `
    <div style="font-size:2.4rem;margin-bottom:12px">🔒</div>
    <h2 style="color:#c4b5fd;margin-bottom:8px">교사 전용 화면</h2>
    <p style="color:#8b9bb4;font-size:0.88rem;line-height:1.6;max-width:380px">등록된 교사 계정(@snu.ms.kr)으로 로그인해야 합니다.</p>
    <button id="tgLogin" style="margin-top:18px;background:#2e74c4;color:#fff;border:none;padding:12px 22px;border-radius:11px;font-weight:800;font-size:1rem;cursor:pointer">🔑 학교 구글 로그인</button>
    <div id="tgFb" style="margin-top:12px;color:#ff8a9c;font-size:0.85rem"></div>`;
  document.addEventListener('DOMContentLoaded', () => document.body.appendChild(ov));
  if (document.body) document.body.appendChild(ov);

  const remove = () => { const e = document.getElementById('teacherGate'); if (e) e.remove(); };
  const fbMsg = (m) => { const e = document.getElementById('tgFb'); if (e) e.textContent = m; };

  const apply = () => {
    const A = window.BAuth;
    if (!A || !A.configured) { remove(); return; }  // 로컬/미구성 → 통과(데이터 보호는 규칙)
    A.onChange(u => {
      if (u && A.isAdmin(u.email)) remove();
      else if (u) fbMsg('교사로 등록되지 않은 계정입니다: ' + u.email);
    });
    const wire = () => {
      const b = document.getElementById('tgLogin');
      if (!b) { setTimeout(wire, 100); return; }
      b.onclick = async () => {
        fbMsg('');
        try { const u = await A.signIn(); if (!A.isAdmin(u.email)) { fbMsg('교사로 등록되지 않은 계정입니다.'); await A.signOut(); } }
        catch (e) { fbMsg(e.message === 'DOMAIN' ? '학교 계정(@snu.ms.kr)만 가능합니다.' : '로그인 실패'); }
      };
    };
    wire();
  };
  if (window.BAUTH_READY) apply(); else window.addEventListener('bauth-ready', apply, { once: true });
})();
