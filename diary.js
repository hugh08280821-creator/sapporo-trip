/* 여행 앨범 — 사진은 이 휴대폰(IndexedDB)에만 저장하고, 콜라주도 휴대폰 안에서 바로 만듦 */
(() => {
  'use strict';

  const A = window.APP;
  const { esc, toast, openSheet, closeSheet, askConfirm } = A;
  const $ = (s, el = document) => el.querySelector(s);
  const MAX_IN_COLLAGE = 9;
  const st = {
    day: null, busy: null, urls: new Map(), photos: [],
    picking: false, picked: new Set(),
    scope: 'day', style: 'mosaic', stamp: true, seed: 1, collageUrl: null, collageBlob: null,
  };

  /* ---------------- 저장소 (IndexedDB) ---------------- */
  let dbp;
  function openDB() {
    if (!dbp) {
      dbp = new Promise((res, rej) => {
        const r = indexedDB.open('sapporo-diary', 1);
        r.onupgradeneeded = () => {
          r.result.createObjectStore('photos', { keyPath: 'id' });
          r.result.createObjectStore('diaries', { keyPath: 'key' });
        };
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
    }
    return dbp;
  }
  async function tx(store, mode, fn) {
    const db = await openDB();
    return new Promise((res, rej) => {
      const t = db.transaction(store, mode);
      const req = fn(t.objectStore(store));
      t.oncomplete = () => res(req ? req.result : undefined);
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error);
    });
  }
  const dbAll = (s) => tx(s, 'readonly', (o) => o.getAll());
  const dbPut = (s, v) => tx(s, 'readwrite', (o) => o.put(v));
  const dbDelMany = (s, keys) => tx(s, 'readwrite', (o) => { keys.forEach((k) => o.delete(k)); return null; });

  async function load() {
    st.photos = (await dbAll('photos')).sort((a, b) => (a.date + a.time + a.added).localeCompare(b.date + b.time + b.added));
    // 브라우저가 저장 공간을 함부로 지우지 않도록 요청
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  }

  /* ---------------- 사진 정보(EXIF) 읽기 ---------------- */
  async function readExif(file) {
    try {
      const v = new DataView(await file.slice(0, 256 * 1024).arrayBuffer());
      if (v.getUint16(0) !== 0xffd8) return {};
      let off = 2;
      while (off < v.byteLength - 10) {
        const marker = v.getUint16(off);
        if ((marker & 0xff00) !== 0xff00) break;
        if (marker === 0xffe1 && v.getUint32(off + 4) === 0x45786966) return parseTiff(v, off + 10);
        off += 2 + v.getUint16(off + 2);
      }
    } catch { /* 정보 없는 사진 */ }
    return {};
  }
  function parseTiff(v, t) {
    const le = v.getUint16(t) === 0x4949;
    const u16 = (o) => v.getUint16(t + o, le);
    const u32 = (o) => v.getUint32(t + o, le);
    const ifd = (o) => {
      const tags = {};
      for (let i = 0, n = u16(o); i < n; i++) {
        const e = o + 2 + i * 12;
        tags[u16(e)] = { count: u32(e + 4), off: e + 8 };
      }
      return tags;
    };
    const ascii = (tag) => {
      const at = tag.count > 4 ? u32(tag.off) : tag.off;
      let s = '';
      for (let i = 0; i < tag.count - 1; i++) s += String.fromCharCode(v.getUint8(t + at + i));
      return s;
    };
    const out = {};
    const ifd0 = ifd(u32(4));
    if (ifd0[0x8769]) {
      const ex = ifd(u32(ifd0[0x8769].off));
      const dt = ex[0x9003] || ex[0x9004];
      if (dt) out.dateTime = ascii(dt);
    }
    if (!out.dateTime && ifd0[0x0132]) out.dateTime = ascii(ifd0[0x0132]);
    return out;
  }

  /* ---------------- 사진 줄이기 ---------------- */
  async function decode(blob) {
    if ('createImageBitmap' in window) {
      try { return await createImageBitmap(blob, { imageOrientation: 'from-image' }); } catch { /* 아래 방식으로 */ }
    }
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = () => rej(new Error('decode'));
      img.src = URL.createObjectURL(blob);
    });
  }
  async function shrink(blob, max, quality) {
    const src = await decode(blob);
    const s = Math.min(1, max / Math.max(src.width, src.height));
    const c = document.createElement('canvas');
    c.width = Math.round(src.width * s);
    c.height = Math.round(src.height * s);
    c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
    if (src.close) src.close();
    const out = await new Promise((res) => c.toBlob(res, 'image/jpeg', quality));
    return { blob: out, w: c.width, h: c.height };
  }

  async function addFiles(files) {
    const list = [...files].filter((f) => f.type.startsWith('image/') || /\.(heic|heif|jpe?g|png)$/i.test(f.name));
    if (!list.length) return;
    st.busy = `사진 ${list.length}장을 정리하는 중…`;
    render();
    let ok = 0, fail = 0;
    for (const f of list) {
      try {
        const ex = await readExif(f);
        let date = '', time = '';
        const m = ex.dateTime && ex.dateTime.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2})/);
        if (m) { date = `${m[1]}-${m[2]}-${m[3]}`; time = `${m[4]}:${m[5]}`; }
        else if (f.lastModified) {
          const d = new Date(f.lastModified);
          date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(d);
          time = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
        }
        const dayIdx = DAYS.findIndex((d) => d.date === date);
        const img = await shrink(f, 1600, 0.85);
        if (!img.blob) throw new Error('shrink');
        await dbPut('photos', {
          id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
          day: dayIdx >= 0 ? dayIdx : st.day,
          date, time, w: img.w, h: img.h, blob: img.blob, skip: false, added: Date.now(),
        });
        ok++;
      } catch { fail++; }
    }
    await load();
    st.busy = null;
    resetCollage();
    render();
    toast(fail ? `${ok}장 저장 · ${fail}장은 열 수 없었어요` : `사진 ${ok}장을 저장했어요`);
  }

  async function deletePhotos(ids) {
    await dbDelMany('photos', ids);
    ids.forEach((id) => { if (st.urls.has(id)) { URL.revokeObjectURL(st.urls.get(id)); st.urls.delete(id); } });
    await load();
    resetCollage();
    render();
    toast(`사진 ${ids.length}장을 지웠어요`);
  }

  /* ---------------- 콜라주 ---------------- */
  // 같은 seed면 같은 배치가 나오는 난수 (「다시 섞기」를 누를 때만 바뀜)
  function rng(seed) {
    let s = seed >>> 0 || 1;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }
  function spread(arr, n) {
    if (arr.length <= n) return arr;
    return Array.from({ length: n }, (_, i) => arr[Math.round((i * (arr.length - 1)) / (n - 1))]);
  }
  function collagePhotos() {
    const usable = st.photos.filter((p) => !p.skip);
    if (st.scope === 'trip') {
      const per = DAYS.map((_, i) => usable.filter((p) => p.day === i));
      const quota = Math.max(1, Math.floor(MAX_IN_COLLAGE / per.filter((d) => d.length).length || 1));
      return per.flatMap((d) => spread(d, quota)).slice(0, MAX_IN_COLLAGE);
    }
    return spread(usable.filter((p) => p.day === st.day), MAX_IN_COLLAGE);
  }

  // 칸 배치(가로·세로 0~1 비율). 사진 수마다 두 가지 모양 중 seed로 하나를 고름
  const R3 = 1 / 3;
  const LAYOUTS = {
    1: [[[0, 0, 1, 1]]],
    2: [[[0, 0, 1, 0.5], [0, 0.5, 1, 0.5]], [[0, 0, 0.5, 1], [0.5, 0, 0.5, 1]]],
    3: [[[0, 0, 1, 0.56], [0, 0.56, 0.5, 0.44], [0.5, 0.56, 0.5, 0.44]], [[0, 0, 0.6, 1], [0.6, 0, 0.4, 0.5], [0.6, 0.5, 0.4, 0.5]]],
    4: [[[0, 0, 0.5, 0.5], [0.5, 0, 0.5, 0.5], [0, 0.5, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5]],
      [[0, 0, 1, 0.6], [0, 0.6, R3, 0.4], [R3, 0.6, R3, 0.4], [2 * R3, 0.6, R3, 0.4]]],
    5: [[[0, 0, 0.5, 0.5], [0.5, 0, 0.5, 0.5], [0, 0.5, R3, 0.5], [R3, 0.5, R3, 0.5], [2 * R3, 0.5, R3, 0.5]],
      [[0, 0, 0.62, 0.6], [0.62, 0, 0.38, 0.3], [0.62, 0.3, 0.38, 0.3], [0, 0.6, 0.5, 0.4], [0.5, 0.6, 0.5, 0.4]]],
    6: [[[0, 0, 0.5, R3], [0.5, 0, 0.5, R3], [0, R3, 0.5, R3], [0.5, R3, 0.5, R3], [0, 2 * R3, 0.5, R3], [0.5, 2 * R3, 0.5, R3]],
      [[0, 0, 0.66, 0.5], [0.66, 0, 0.34, 0.25], [0.66, 0.25, 0.34, 0.25], [0, 0.5, R3, 0.5], [R3, 0.5, R3, 0.5], [2 * R3, 0.5, R3, 0.5]]],
    7: [[[0, 0, 0.6, 0.4], [0.6, 0, 0.4, 0.4], [0, 0.4, R3, 0.3], [R3, 0.4, R3, 0.3], [2 * R3, 0.4, R3, 0.3], [0, 0.7, 0.5, 0.3], [0.5, 0.7, 0.5, 0.3]]],
    8: [[[0, 0, 0.5, 0.34], [0.5, 0, 0.5, 0.34], [0, 0.34, R3, 0.33], [R3, 0.34, R3, 0.33], [2 * R3, 0.34, R3, 0.33], [0, 0.67, R3, 0.33], [R3, 0.67, R3, 0.33], [2 * R3, 0.67, R3, 0.33]]],
    9: [[0, 1, 2].flatMap((r) => [0, 1, 2].map((c) => [c * R3, r * R3, R3, R3])),
      [[0, 0, 0.5, 0.4], [0.5, 0, 0.5, 0.4], [0, 0.4, R3, 0.3], [R3, 0.4, R3, 0.3], [2 * R3, 0.4, R3, 0.3], [0, 0.7, 0.25, 0.3], [0.25, 0.7, 0.25, 0.3], [0.5, 0.7, 0.25, 0.3], [0.75, 0.7, 0.25, 0.3]]],
  };

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
    else ctx.rect(x, y, w, h);
  }
  function drawCover(ctx, img, x, y, w, h) {
    const s = Math.max(w / img.width, h / img.height);
    const sw = w / s, sh = h / s;
    ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h);
  }
  function stampText() {
    const fmt = (d) => d.date.slice(5).replace('-', '.');
    if (st.scope === 'trip') return `${DAYS[0].date.slice(0, 4)}.${fmt(DAYS[0])} – ${fmt(DAYS[DAYS.length - 1])}  SAPPORO`;
    return `${DAYS[st.day].date.replace(/-/g, '.')}  SAPPORO`;
  }

  // 사진 방향(가로/세로)과 칸 모양이 비슷하게 짝짓기
  function assign(cells, imgs, rand, W, H) {
    const pool = [...imgs].sort(() => rand() - 0.5);
    return cells.map(([cx, cy, cw, ch]) => {
      const cellWide = (cw * W) / (ch * H) >= 1;
      let k = pool.findIndex((im) => (im.width >= im.height) === cellWide);
      if (k < 0) k = 0;
      return [cx, cy, cw, ch, pool.splice(k, 1)[0]];
    });
  }

  function drawMosaic(ctx, imgs, W, H, rand) {
    ctx.fillStyle = '#f6f1e7';
    ctx.fillRect(0, 0, W, H);
    const pad = 40, gap = 14, bottom = st.stamp ? 86 : pad;
    const variants = LAYOUTS[imgs.length];
    const cells = variants[Math.floor(rand() * variants.length)];
    const iw = W - pad * 2, ih = H - pad - bottom;
    for (const [cx, cy, cw, ch, img] of assign(cells, imgs, rand, iw, ih)) {
      const x = pad + cx * iw + gap / 2, y = pad + cy * ih + gap / 2;
      const w = cw * iw - gap, h = ch * ih - gap;
      ctx.save();
      roundRect(ctx, x, y, w, h, 16);
      ctx.clip();
      drawCover(ctx, img, x, y, w, h);
      ctx.restore();
    }
    if (st.stamp) {
      ctx.fillStyle = '#4a5468';
      ctx.font = '600 30px Georgia, "Times New Roman", serif';
      ctx.textAlign = 'right';
      ctx.fillText(stampText(), W - pad - 6, H - 34);
    }
  }

  function drawPolaroid(ctx, imgs, W, H, rand) {
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#efe6d6');
    g.addColorStop(1, '#e4d7c3');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    const n = imgs.length;
    const top = 40, bottom = st.stamp ? 100 : 40;
    // 사진이 가장 크게 들어가는 열 수를 고르고, 살짝 겹치도록 키움
    const fit = (k) => Math.min(((W - 60) / k) * 0.98, (H - top - bottom) / Math.ceil(n / k) / 1.18);
    const cols = [1, 2, 3].reduce((best, k) => (fit(k) > fit(best) ? k : best), 1);
    const rows = Math.ceil(n / cols);
    const cellW = (W - 60) / cols, cellH = (H - top - bottom) / rows;
    const size = fit(cols) * 1.06;
    imgs.forEach((img, i) => {
      const r = Math.floor(i / cols), c = i % cols;
      const inRow = Math.min(cols, n - r * cols);
      const rowOffset = ((cols - inRow) * cellW) / 2;
      const cx = 30 + rowOffset + c * cellW + cellW / 2 + (rand() - 0.5) * cellW * 0.12;
      const cy = top + r * cellH + cellH / 2 + (rand() - 0.5) * cellH * 0.1;
      const frameW = size, frameH = size * 1.18, border = size * 0.06;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(((rand() - 0.5) * 14 * Math.PI) / 180);
      ctx.shadowColor = 'rgba(40, 30, 20, .28)';
      ctx.shadowBlur = 18;
      ctx.shadowOffsetY = 6;
      ctx.fillStyle = '#fffdf8';
      ctx.fillRect(-frameW / 2, -frameH / 2, frameW, frameH);
      ctx.shadowColor = 'transparent';
      drawCover(ctx, img, -frameW / 2 + border, -frameH / 2 + border, frameW - border * 2, frameW - border * 2);
      ctx.restore();
    });
    if (st.stamp) {
      ctx.fillStyle = '#6b5a45';
      ctx.font = 'italic 600 34px Georgia, "Times New Roman", serif';
      ctx.textAlign = 'center';
      ctx.fillText(stampText(), W / 2, H - 42);
    }
  }

  function drawFilm(ctx, imgs, W, H, rand) {
    ctx.fillStyle = '#1c1b1a';
    ctx.fillRect(0, 0, W, H);
    const n = imgs.length;
    const strips = n <= 3 ? 1 : 2;
    const per = Math.ceil(n / strips);
    const order = [...imgs].sort(() => rand() - 0.5);
    const top = 50, bottom = st.stamp ? 100 : 50;
    const stripW = strips === 1 ? W * 0.62 : (W - 120) / 2;
    for (let s = 0; s < strips; s++) {
      const x0 = strips === 1 ? (W - stripW) / 2 : 40 + s * (stripW + 40);
      const frames = order.slice(s * per, s * per + per);
      ctx.fillStyle = '#0d0d0c';
      ctx.fillRect(x0, top - 20, stripW, H - top - bottom + 40);
      // 필름 구멍
      ctx.fillStyle = '#2b2a28';
      for (let y = top - 6; y < H - bottom + 10; y += 34) {
        roundRect(ctx, x0 + 10, y, 18, 14, 3); ctx.fill();
        roundRect(ctx, x0 + stripW - 28, y, 18, 14, 3); ctx.fill();
      }
      const fh = (H - top - bottom) / per;
      frames.forEach((img, i) => {
        const fx = x0 + 42, fy = top + i * fh + 8, fw = stripW - 84, fhh = fh - 16;
        drawCover(ctx, img, fx, fy, fw, fhh);
      });
    }
    if (st.stamp) {
      ctx.fillStyle = '#e8b04a';
      ctx.font = '600 30px "Courier New", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(stampText(), W / 2, H - 42);
    }
  }

  async function makeCollage() {
    const list = collagePhotos();
    if (!list.length) { toast('콜라주에 넣을 사진이 없어요'); return; }
    st.busy = '콜라주를 만드는 중…';
    render();
    try {
      const imgs = await Promise.all(list.map((p) => decode(p.blob)));
      const W = 1080, H = 1350;
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      const ctx = c.getContext('2d');
      const rand = rng(st.seed * 7919 + list.length);
      ({ mosaic: drawMosaic, polaroid: drawPolaroid, film: drawFilm })[st.style](ctx, imgs, W, H, rand);
      imgs.forEach((im) => im.close && im.close());
      const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.92));
      if (st.collageUrl) URL.revokeObjectURL(st.collageUrl);
      st.collageBlob = blob;
      st.collageUrl = URL.createObjectURL(blob);
    } catch {
      toast('콜라주를 만들지 못했어요');
    }
    st.busy = null;
    render();
  }
  function resetCollage() {
    if (st.collageUrl) URL.revokeObjectURL(st.collageUrl);
    st.collageUrl = null;
    st.collageBlob = null;
  }

  async function saveCollage() {
    if (!st.collageBlob) return;
    const name = `sapporo-${st.scope === 'trip' ? 'trip' : DAYS[st.day].date}-${st.style}.jpg`;
    const file = new File([st.collageBlob], name, { type: 'image/jpeg' });
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: '삿포로 여행 콜라주' }); return; }
    } catch (e) { if (e.name === 'AbortError') return; }
    const a = document.createElement('a');
    a.href = st.collageUrl;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    toast('사진을 저장했어요');
  }

  /* ---------------- 화면 ---------------- */
  function urlOf(p) {
    if (!st.urls.has(p.id)) st.urls.set(p.id, URL.createObjectURL(p.blob));
    return st.urls.get(p.id);
  }

  function render() {
    const view = $('#view');
    if (!view || !/^#\/diary/.test(location.hash)) return;
    if (st.day == null) {
      const cur = DAYS.findIndex((d) => d.date === new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(new Date()));
      st.day = cur >= 0 ? cur : 0;
    }
    const dayPhotos = st.photos.filter((p) => p.day === st.day);
    const busy = !!st.busy;
    const inCollage = collagePhotos().length;
    const tabs = DAYS.map((d, i) => {
      const n = st.photos.filter((p) => p.day === i).length;
      return `<button class="daytab" role="tab" aria-selected="${i === st.day}" data-dday="${i}"><b>${esc(d.label)}</b><span>${esc(d.dateLabel)}</span><em>${n ? `사진 ${n}장` : '사진 없음'}</em></button>`;
    }).join('');
    const grid = dayPhotos.map((p) => {
      const picked = st.picked.has(p.id);
      return `<button class="ph${p.skip ? ' skip' : ''}${st.picking ? ' picking' : ''}${picked ? ' picked' : ''}" data-photo="${p.id}" aria-pressed="${picked}" aria-label="사진 ${esc(p.time)}">
        <img src="${urlOf(p)}" alt="" loading="lazy">
        ${p.time ? `<span class="ph-time">${esc(p.time)}</span>` : ''}
        ${st.picking ? `<span class="ph-check">${picked ? '✓' : ''}</span>` : p.skip ? '<span class="ph-skip">콜라주 제외</span>' : ''}
      </button>`;
    }).join('');
    const chip = (key, val, label) => `<button class="chip" data-cset="${key}" data-val="${val}" aria-pressed="${st[key] === val}">${label}</button>`;

    view.innerHTML = `
      <div class="hero"><h2>📸 여행 앨범</h2>
        <p>찍은 사진을 올리면 날짜별로 정리하고, 예쁜 콜라주 한 장으로 만들어 드려요. 사진은 이 휴대폰에만 저장돼요.</p></div>
      <div class="daytabs" role="tablist">${tabs}</div>
      ${st.picking ? `<div class="pick-bar">
          <span><b>${st.picked.size}장</b> 골랐어요</span>
          <button class="btn small" data-pick-all>${st.picked.size === dayPhotos.length && dayPhotos.length ? '선택 해제' : '이 날 전부'}</button>
          <button class="btn small danger-fill" data-pick-del ${st.picked.size ? '' : 'disabled'}>지우기</button>
          <button class="btn small" data-pick-cancel>취소</button>
        </div>` : `<div class="btn-row">
          <label class="btn primary ${busy ? 'is-disabled' : ''}">📷 사진 올리기<input type="file" accept="image/*" multiple hidden data-upload ${busy ? 'disabled' : ''}></label>
          <button class="btn" data-pick-start ${dayPhotos.length ? '' : 'disabled'}>🗑 골라서 지우기</button>
        </div>`}
      ${busy ? `<div class="busy"><span class="spin" aria-hidden="true"></span>${esc(st.busy)}</div>` : ''}
      ${dayPhotos.length
        ? `<p class="small muted" style="margin:12px 0 8px">${st.picking ? '지울 사진을 눌러 고르세요.' : `사진 ${dayPhotos.length}장 · 사진을 누르면 크게 보거나, 다른 날로 옮기거나, 콜라주에서 뺄 수 있어요.`}</p><div class="photo-grid">${grid}</div>`
        : `<div class="empty card" style="margin-top:12px"><div style="font-size:36px">📷</div><h3>${esc(DAYS[st.day].label)} 사진이 아직 없어요</h3><p class="muted">찍은 날짜를 보고 알아서 날짜별로 나눠 넣어 드려요.</p></div>`}

      <h2 class="section-title">🎨 콜라주 만들기</h2>
      <div class="card stack collage-card">
        <div><div class="small muted">무엇으로</div><div class="filters">${chip('scope', 'day', `${esc(DAYS[st.day].label)} 사진`)}${chip('scope', 'trip', '여행 전체')}</div></div>
        <div><div class="small muted">모양</div><div class="filters">${chip('style', 'mosaic', '🧩 모자이크')}${chip('style', 'polaroid', '📷 폴라로이드')}${chip('style', 'film', '🎞 필름')}</div></div>
        <label class="stamp-toggle"><input type="checkbox" data-stamp ${st.stamp ? 'checked' : ''}> 날짜 넣기</label>
        <div class="btn-row">
          <button class="btn gold" data-collage ${busy || !inCollage ? 'disabled' : ''}>🎨 ${st.collageUrl ? '다시 만들기' : '만들기'}</button>
          <button class="btn" data-shuffle ${busy || !st.collageUrl ? 'disabled' : ''}>🔀 다시 섞기</button>
        </div>
        <p class="small muted" style="margin:0">${inCollage ? `사진 ${inCollage}장이 들어가요 (최대 ${MAX_IN_COLLAGE}장, 많으면 골고루 골라요).` : '먼저 사진을 올려 주세요.'}</p>
        ${st.collageUrl ? `<img class="collage-preview" src="${st.collageUrl}" alt="만든 콜라주">
          <button class="btn primary" data-csave style="width:100%">💾 사진첩에 저장 · 카톡 공유</button>` : ''}
      </div>
      <p class="small muted" style="margin-top:20px">💡 홈 화면에 추가해서 쓰면 사진이 더 안전하게 보관돼요. 만든 콜라주는 저장해 두세요.</p>`;
  }

  function openPhoto(id) {
    const p = st.photos.find((x) => x.id === id);
    if (!p) return;
    openSheet(`<div class="d-head"><div class="cat">📷 ${esc(DAYS[p.day] ? DAYS[p.day].label : '')}</div>
        <h2 id="sheet-title">${esc(p.time || '사진')}</h2></div>
      <img class="ph-big" src="${urlOf(p)}" alt="">
      <div class="small muted" style="margin:14px 0 6px">다른 날로 옮기기</div>
      <div class="btn-row three">${DAYS.map((d, i) => `<button class="btn small ${i === p.day ? 'on' : ''}" data-pmove="${p.id}" data-to="${i}">${esc(d.label)}</button>`).join('')}</div>
      <div class="btn-row" style="margin-top:10px">
        <button class="btn" data-pskip="${p.id}">${p.skip ? '콜라주에 다시 넣기' : '콜라주에서 빼기'}</button>
        <button class="btn danger-text" data-pdel="${p.id}">사진 지우기</button>
      </div>
      <button class="btn primary" data-close-sheet style="width:100%;margin-top:10px">닫기</button>`);
  }

  /* ---------------- 이벤트 ---------------- */
  document.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-dday],[data-photo],[data-pmove],[data-pskip],[data-pdel],[data-pick-start],[data-pick-all],[data-pick-del],[data-pick-cancel],[data-cset],[data-collage],[data-shuffle],[data-csave]');
    if (!t || t.disabled) return;
    if (t.dataset.dday != null) {
      st.day = Number(t.dataset.dday); st.picked.clear();
      if (st.scope === 'day') resetCollage();
      render(); return;
    }
    if (t.dataset.photo) {
      if (st.picking) {
        if (st.picked.has(t.dataset.photo)) st.picked.delete(t.dataset.photo); else st.picked.add(t.dataset.photo);
        render();
      } else openPhoto(t.dataset.photo);
      return;
    }
    if (t.dataset.pmove) {
      const p = st.photos.find((x) => x.id === t.dataset.pmove);
      p.day = Number(t.dataset.to);
      await dbPut('photos', p);
      closeSheet(); await load(); resetCollage(); render(); toast(`${DAYS[p.day].label}로 옮겼어요`);
      return;
    }
    if (t.dataset.pskip) {
      const p = st.photos.find((x) => x.id === t.dataset.pskip);
      p.skip = !p.skip;
      await dbPut('photos', p);
      closeSheet(); resetCollage(); render(); toast(p.skip ? '콜라주에서 뺐어요' : '콜라주에 다시 넣었어요');
      return;
    }
    if (t.dataset.pdel) {
      const id = t.dataset.pdel;
      if (await askConfirm('이 사진을 지울까요? 휴대폰 사진첩의 원본은 그대로 있어요.', '지우기', true)) await deletePhotos([id]);
      return;
    }
    if (t.hasAttribute('data-pick-start')) { st.picking = true; st.picked.clear(); render(); return; }
    if (t.hasAttribute('data-pick-cancel')) { st.picking = false; st.picked.clear(); render(); return; }
    if (t.hasAttribute('data-pick-all')) {
      const ids = st.photos.filter((p) => p.day === st.day).map((p) => p.id);
      if (st.picked.size === ids.length) st.picked.clear(); else ids.forEach((id) => st.picked.add(id));
      render(); return;
    }
    if (t.hasAttribute('data-pick-del')) {
      const ids = [...st.picked];
      if (await askConfirm(`사진 ${ids.length}장을 지울까요? 휴대폰 사진첩의 원본은 그대로 있어요.`, `${ids.length}장 지우기`, true)) {
        st.picking = false; st.picked.clear();
        await deletePhotos(ids);
      }
      return;
    }
    if (t.dataset.cset) {
      st[t.dataset.cset] = t.dataset.val;
      if (st.collageUrl) makeCollage(); else render();
      return;
    }
    if (t.hasAttribute('data-collage')) { makeCollage(); return; }
    if (t.hasAttribute('data-shuffle')) { st.seed += 1; makeCollage(); return; }
    if (t.hasAttribute('data-csave')) saveCollage();
  });
  document.addEventListener('change', (e) => {
    if (e.target.matches('[data-upload]')) { addFiles(e.target.files); e.target.value = ''; }
    if (e.target.matches('[data-stamp]')) { st.stamp = e.target.checked; if (st.collageUrl) makeCollage(); }
  });

  window.DIARY = {
    async show() { await load(); render(); },
  };
  // app.js가 먼저 그린 첫 화면이 앨범이라면 여기서 채우기
  if (/^#\/diary/.test(location.hash)) window.DIARY.show();
})();
