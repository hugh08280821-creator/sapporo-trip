// 오프라인에서도 일정·맛집 정보를 볼 수 있도록 캐시
const VERSION = 'sapporo-v16';
const SHELL = [
  './', 'index.html', 'style.css', 'app.js', 'diary.js', 'data.js', 'extra.js', 'manifest.webmanifest', 'icon.svg',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
];

self.addEventListener('install', (e) => {
  // 새 버전을 받을 때는 브라우저 캐시를 건너뛰고 서버에서 바로 받기
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== 'tiles').map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // 지도 타일: 한 번 본 곳은 저장해 두고 재사용
  if (url.hostname.endsWith('tile.openstreetmap.org')) {
    e.respondWith(
      caches.open('tiles').then(async (c) => {
        const hit = await c.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) c.put(req, res.clone());
        return res;
      })
    );
    return;
  }

  // 앱 파일: 네트워크 우선(최신 정보), 안 되면 캐시.
  // 같은 사이트 파일은 브라우저 캐시(GitHub Pages는 10분)를 쓰지 말고 서버에 바뀌었는지 확인
  const same = url.origin === location.origin;
  const net = same ? fetch(req.mode === 'navigate' ? req.url : req, { cache: 'no-cache' }) : fetch(req);
  e.respondWith(
    net
      .then((res) => {
        if (res.ok && (url.origin === location.origin || SHELL.includes(req.url))) {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('index.html')))
  );
});
