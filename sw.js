/* ============================================================
 * sw.js — 서비스워커 (오프라인-우선) · B(중2 탐험) 전용 캐시
 *
 * 목적: 운동장에서 와이파이가 끊겨도 게임 화면·문제·이미지·수식이 뜨게 한다.
 *  - 루트(/)에 두고 루트 스코프로 등록(play.html이 ../../modes, ../../core 등 상위 파일을
 *    쓰기 때문). 단 **B 관련 요청만** 가로채고, 그 외(A의 파일 등)는 절대 건드리지 않는다
 *    (respondWith 안 함 → 브라우저 기본 동작). → A에 영향 0.
 *  - stations.json: 네트워크 우선(최신 반영) + 실패 시 캐시.
 *  - 그 외 B 자산·이미지·CDN(KaTeX/jsQR/firebase): 캐시 우선 + 런타임 캐싱.
 * ============================================================ */
const CACHE = 'b1-offline-v2';

// 설치 시 미리 받아둘 핵심 파일(개별 best-effort — 하나 실패해도 설치 계속)
const PRECACHE = [
  'games/B1/play.html',
  'modes/B/engine.js',
  'core/sync.js',
  'firebase-config.js',
  'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js',
  'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css',
  'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js',
  'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js',
];

// 이 SW가 가로챌(=오프라인 지원할) 대상인지 판단. B와 무관하면 false → 통과(A 보호).
function isB(url) {
  const u = new URL(url);
  if (u.origin === self.location.origin) {
    return /\/(games\/B1|modes\/B|core)\//.test(u.pathname)
      || u.pathname.endsWith('/firebase-config.js')
      || u.pathname.endsWith('/qrcode.min.js');
  }
  // 게임에 필요한 외부 CDN(수식·QR)만 캐시. firebase SDK는 캐시하되 연결은 온라인에서만.
  return /cdn\.jsdelivr\.net\/npm\/(katex|jsqr)/.test(u.href)
      || /gstatic\.com\/firebasejs/.test(u.href);
}

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await Promise.allSettled(PRECACHE.map(u => c.add(new Request(u, { cache: 'reload' }))));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;            // 쓰기 요청 통과
  if (!isB(req.url)) return;                    // B 무관(A 등) → 통과(브라우저 기본)

  const url = new URL(req.url);
  const sameOrigin = (url.origin === self.location.origin);

  if (sameOrigin) {
    // 우리 코드·문제·이미지(같은 출처) → 네트워크 우선(항상 최신) → 실패 시 캐시(오프라인)
    e.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        if (fresh && fresh.ok) { const c = await caches.open(CACHE); c.put(req, fresh.clone()); }
        return fresh;
      } catch {
        return (await caches.match(req)) || Response.error();
      }
    })());
  } else {
    // 외부 라이브러리(KaTeX/jsQR/firebase) → 캐시 우선(오프라인 대비) → 없으면 네트워크
    e.respondWith((async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      try {
        const res = await fetch(req);
        if (res && (res.ok || res.type === 'opaque')) { const c = await caches.open(CACHE); c.put(req, res.clone()); }
        return res;
      } catch {
        return cached || Response.error();
      }
    })());
  }
});
