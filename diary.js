/* 여행기 — 사진은 이 휴대폰(IndexedDB)에만 저장하고, 글을 쓸 때만 여행기 서버로 보냄 */
(() => {
  'use strict';

  const A = window.APP;
  const { esc, toast, openSheet, closeSheet } = A;
  const $ = (s, el = document) => el.querySelector(s);
  const API = (TRIP.diaryApi || '').replace(/\/$/, '');
  const st = { day: null, busy: null, urls: new Map(), photos: [], diaries: {} };

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
  const dbDel = (s, k) => tx(s, 'readwrite', (o) => o.delete(k));

  async function load() {
    st.photos = (await dbAll('photos')).sort((a, b) => (a.date + a.time + a.added).localeCompare(b.date + b.time + b.added));
    st.diaries = Object.fromEntries((await dbAll('diaries')).map((d) => [d.key, d]));
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
    const rationals = (tag) => {
      const at = u32(tag.off);
      return [0, 1, 2].map((i) => u32(at + i * 8) / u32(at + i * 8 + 4));
    };
    const out = {};
    const ifd0 = ifd(u32(4));
    if (ifd0[0x8769]) {
      const ex = ifd(u32(ifd0[0x8769].off));
      const dt = ex[0x9003] || ex[0x9004];
      if (dt) out.dateTime = ascii(dt);
    }
    if (!out.dateTime && ifd0[0x0132]) out.dateTime = ascii(ifd0[0x0132]);
    if (ifd0[0x8825]) {
      const g = ifd(u32(ifd0[0x8825].off));
      if (g[2] && g[4]) {
        const la = rationals(g[2]), lo = rationals(g[4]);
        let lat = la[0] + la[1] / 60 + la[2] / 3600;
        let lng = lo[0] + lo[1] / 60 + lo[2] / 3600;
        if (g[1] && v.getUint8(t + g[1].off) === 0x53) lat = -lat; // 'S'
        if (g[3] && v.getUint8(t + g[3].off) === 0x57) lng = -lng; // 'W'
        if (Number.isFinite(lat) && Number.isFinite(lng) && (lat || lng)) { out.lat = lat; out.lng = lng; }
      }
    }
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
    return new Promise((res) => c.toBlob(res, 'image/jpeg', quality));
  }
  const toBase64 = (blob) => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1]);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(blob);
  });

  function nearestPlace(lat, lng) {
    let best = null, bd = Infinity;
    for (const p of [HOTEL, ...PLACES]) {
      const d = A.haversine({ lat, lng }, p);
      if (d < bd) { bd = d; best = p; }
    }
    return best && bd < 300 ? best.id : null;
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
        if (ex.dateTime) {
          const m = ex.dateTime.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2})/);
          if (m) { date = `${m[1]}-${m[2]}-${m[3]}`; time = `${m[4]}:${m[5]}`; }
        }
        if (!date && f.lastModified) {
          const d = new Date(f.lastModified);
          date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(d);
          time = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
        }
        const dayIdx = DAYS.findIndex((d) => d.date === date);
        const blob = await shrink(f, 1600, 0.85);
        if (!blob) throw new Error('shrink');
        const rec = {
          id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
          day: dayIdx >= 0 ? dayIdx : st.day,
          date, time,
          lat: ex.lat, lng: ex.lng,
          placeId: ex.lat ? nearestPlace(ex.lat, ex.lng) : null,
          memo: '',
          blob,
          added: Date.now(),
        };
        await dbPut('photos', rec);
        ok++;
      } catch { fail++; }
    }
    await load();
    st.busy = null;
    render();
    toast(fail ? `${ok}장 저장 · ${fail}장은 열 수 없었어요` : `사진 ${ok}장을 저장했어요`);
  }

  /* ---------------- 여행기 서버 ---------------- */
  const familyCode = () => { try { return localStorage.getItem('sp_familyCode') || ''; } catch { return ''; } };
  async function callApi(path, body) {
    const res = await fetch(API + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Family-Code': familyCode() },
      body: JSON.stringify(body || {}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `오류(${res.status})`);
    return data;
  }

  // 사진이 많으면 하루 흐름이 고르게 담기도록 골고루 고르기
  function spread(arr, n) {
    if (arr.length <= n) return arr;
    return Array.from({ length: n }, (_, i) => arr[Math.round((i * (arr.length - 1)) / (n - 1))]);
  }
  async function photoPayload(p) {
    const small = await shrink(p.blob, 1024, 0.8);
    const place = p.placeId && A.byId[p.placeId] ? A.byId[p.placeId].name_ko : '';
    return { data: await toBase64(small), time: p.time, place, memo: p.memo };
  }

  async function writeDay(dayIdx) {
    const photos = spread(st.photos.filter((p) => p.day === dayIdx), 12);
    if (!photos.length) { toast('먼저 사진을 올려 주세요'); return; }
    st.busy = `${DAYS[dayIdx].label} 일기를 쓰고 있어요… (30초~1분)`;
    render();
    try {
      const plan = A.planDay(dayIdx).map((it) => (it.place && A.byId[it.place] ? A.byId[it.place].name_ko : it.title)).filter(Boolean).join(', ');
      const out = await callApi('/diary', {
        mode: 'day',
        trip: `${TRIP.title} (${TRIP.subtitle})`,
        day: { label: DAYS[dayIdx].label, date: DAYS[dayIdx].dateLabel, plan },
        photos: await Promise.all(photos.map(photoPayload)),
      });
      await dbPut('diaries', { key: `day${dayIdx}`, title: out.title, body: out.body, captions: out.captions, photoIds: photos.map((p) => p.id), at: Date.now() });
      toast('일기가 완성됐어요 📔');
    } catch (e) {
      toast(e.message || '일기를 쓰지 못했어요');
    }
    await load();
    st.busy = null;
    render();
  }

  async function writeEssay() {
    const diaries = DAYS.map((d, i) => st.diaries[`day${i}`] && { label: d.label, title: st.diaries[`day${i}`].title, body: st.diaries[`day${i}`].body }).filter(Boolean);
    if (!diaries.length) { toast('하루 일기를 먼저 하나 이상 써 주세요'); return; }
    const photos = DAYS.flatMap((_, i) => spread(st.photos.filter((p) => p.day === i), 3)).slice(0, 10);
    st.busy = '여행 전체 에세이를 쓰고 있어요… (1분 정도)';
    render();
    try {
      const out = await callApi('/diary', {
        mode: 'essay',
        trip: `${TRIP.title} (${TRIP.subtitle})`,
        diaries,
        photos: await Promise.all(photos.map(photoPayload)),
      });
      await dbPut('diaries', { key: 'essay', title: out.title, body: out.body, captions: out.captions, photoIds: photos.map((p) => p.id), at: Date.now() });
      toast('에세이가 완성됐어요 📖');
    } catch (e) {
      toast(e.message || '에세이를 쓰지 못했어요');
    }
    await load();
    st.busy = null;
    render();
  }

  /* ---------------- 화면 ---------------- */
  function urlOf(p) {
    if (!st.urls.has(p.id)) st.urls.set(p.id, URL.createObjectURL(p.blob));
    return st.urls.get(p.id);
  }

  function diaryHTML(key, label) {
    const d = st.diaries[key];
    if (!d) return '';
    const byPid = Object.fromEntries(st.photos.map((p) => [p.id, p]));
    const figs = (d.photoIds || []).map((id, i) => {
      const p = byPid[id];
      if (!p) return '';
      const cap = (d.captions || []).find((c) => c.index === i + 1);
      return `<figure><img src="${urlOf(p)}" alt="" loading="lazy">${cap ? `<figcaption>${esc(cap.caption)}</figcaption>` : ''}</figure>`;
    }).join('');
    return `<article class="diary card">
      <div class="cat">${esc(label)}</div>
      <h3>${esc(d.title)}</h3>
      <div class="diary-body">${esc(d.body).split(/\n{2,}/).map((para) => `<p>${para.replace(/\n/g, '<br>')}</p>`).join('')}</div>
      ${figs ? `<div class="diary-photos">${figs}</div>` : ''}
      <div class="btn-row three">
        <button class="btn small" data-dshare="${key}">📤 공유</button>
        <button class="btn small" data-dcopy="${key}">📋 글 복사</button>
        <button class="btn small" data-drewrite="${key}">다시 쓰기</button>
      </div>
    </article>`;
  }

  function render() {
    const view = $('#view');
    if (!view || !/^#\/diary/.test(location.hash)) return;
    if (st.day == null) {
      const cur = DAYS.findIndex((d) => d.date === new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(new Date()));
      st.day = cur >= 0 ? cur : 0;
    }
    const dayPhotos = st.photos.filter((p) => p.day === st.day);
    const ready = !!API;
    const hasCode = !!familyCode();
    const busy = !!st.busy;
    const tabs = DAYS.map((d, i) => {
      const n = st.photos.filter((p) => p.day === i).length;
      return `<button class="daytab" role="tab" aria-selected="${i === st.day}" data-dday="${i}"><b>${esc(d.label)}</b><span>${esc(d.dateLabel)}</span><em>${n ? `사진 ${n}장` : '사진 없음'}${st.diaries[`day${i}`] ? ' · 📔' : ''}</em></button>`;
    }).join('');
    const grid = dayPhotos.map((p) => `<button class="ph" data-photo="${p.id}" aria-label="사진 ${esc(p.time)}">
        <img src="${urlOf(p)}" alt="" loading="lazy">
        ${p.time ? `<span class="ph-time">${esc(p.time)}</span>` : ''}
        ${p.memo ? '<span class="ph-memo">✎</span>' : ''}
      </button>`).join('');

    view.innerHTML = `
      <div class="hero"><h2>📔 우리의 여행기</h2>
        <p>여행하면서 찍은 사진을 올리고 「일기 쓰기」를 누르면 AI가 그날의 일기를 써 줘요. 사진은 이 휴대폰에만 저장돼요.</p></div>
      ${!ready ? '<div class="tip">여행기 서버를 준비하고 있어요. 사진은 지금 올려 두면 돼요.</div>' : ''}
      ${ready && !hasCode ? `<div class="card stack code-card">
          <b>🔒 가족 비밀번호</b>
          <p class="small muted" style="margin:0">일기를 쓰려면 한 번만 입력하면 돼요. (자녀에게 받은 비밀번호)</p>
          <form class="code-form" data-code-form><input name="code" type="password" autocomplete="off" placeholder="비밀번호" required><button class="btn primary small" type="submit">확인</button></form>
        </div>` : ''}
      <div class="daytabs" role="tablist" style="margin-top:14px">${tabs}</div>
      <div class="btn-row">
        <label class="btn primary ${busy ? 'is-disabled' : ''}">📷 사진 올리기<input type="file" accept="image/*" multiple hidden data-upload ${busy ? 'disabled' : ''}></label>
        <button class="btn gold" data-write-day ${busy || !dayPhotos.length || !ready || !hasCode ? 'disabled' : ''}>✍️ ${st.diaries[`day${st.day}`] ? '일기 다시 쓰기' : '일기 쓰기'}</button>
      </div>
      ${busy ? `<div class="busy"><span class="spin" aria-hidden="true"></span>${esc(st.busy)}</div>` : ''}
      ${dayPhotos.length
        ? `<p class="small muted" style="margin:12px 0 8px">사진 ${dayPhotos.length}장 · 사진을 누르면 한 줄 메모를 남길 수 있어요. 메모가 있으면 일기가 더 생생해져요.${dayPhotos.length > 12 ? ' (일기에는 12장을 골고루 골라 써요)' : ''}</p><div class="photo-grid">${grid}</div>`
        : `<div class="empty card" style="margin-top:12px"><div style="font-size:36px">📷</div><h3>${esc(DAYS[st.day].label)} 사진이 아직 없어요</h3><p class="muted">찍은 날짜를 보고 알아서 날짜별로 나눠 넣어 드려요.</p></div>`}
      <div style="margin-top:16px">${diaryHTML(`day${st.day}`, `${DAYS[st.day].label} · ${DAYS[st.day].dateLabel}`)}</div>

      <h2 class="section-title">📖 여행 전체 에세이</h2>
      ${st.diaries.essay ? diaryHTML('essay', '2박 3일 여행 에세이') : `<div class="card stack">
          <p style="margin:0" class="small muted">하루 일기를 바탕으로 3일의 여행을 하나의 이야기로 엮고, 결혼기념일 메시지로 마무리해요.</p>
          <button class="btn gold" data-write-essay ${busy || !ready || !hasCode || !Object.keys(st.diaries).some((k) => k.startsWith('day')) ? 'disabled' : ''}>📖 에세이 쓰기</button>
        </div>`}
      <p class="small muted" style="margin-top:20px">💡 홈 화면에 추가해서 쓰면 사진이 더 안전하게 보관돼요. 완성된 여행기는 「공유」로 카톡에 보내 두세요.
      ${ready && hasCode ? ' · <button class="linkish" data-code-reset>비밀번호 다시 입력</button>' : ''}</p>`;
  }

  function openPhoto(id) {
    const p = st.photos.find((x) => x.id === id);
    if (!p) return;
    const place = p.placeId && A.byId[p.placeId];
    openSheet(`<div class="d-head"><div class="cat">📷 ${esc(DAYS[p.day] ? DAYS[p.day].label : '')} ${esc(p.time || '')}</div>
        <h2 id="sheet-title">${place ? esc(place.name_ko) : '사진'}</h2></div>
      <img class="ph-big" src="${urlOf(p)}" alt="">
      <label class="memo-label">한 줄 메모 <span class="muted small">(예: 둘이 처음 먹어 본 털게, 너무 맛있었다)</span>
        <textarea data-pmemo="${p.id}" maxlength="200" rows="3">${esc(p.memo || '')}</textarea></label>
      <div class="small muted" style="margin:12px 0 6px">다른 날로 옮기기</div>
      <div class="btn-row three">${DAYS.map((d, i) => `<button class="btn small ${i === p.day ? 'on' : ''}" data-pmove="${p.id}" data-to="${i}">${esc(d.label)}</button>`).join('')}</div>
      <div class="btn-row" style="margin-top:14px">
        <button class="btn primary" data-close-sheet>저장하고 닫기</button>
        <button class="btn danger-text" data-pdel="${p.id}">사진 지우기</button>
      </div>`);
  }

  async function shareDiary(key) {
    const d = st.diaries[key];
    if (!d) return;
    const text = `${d.title}\n\n${d.body}`;
    const byPid = Object.fromEntries(st.photos.map((p) => [p.id, p]));
    const files = (d.photoIds || []).map((id, i) => byPid[id] && new File([byPid[id].blob], `sapporo-${key}-${i + 1}.jpg`, { type: 'image/jpeg' })).filter(Boolean).slice(0, 10);
    try {
      if (navigator.canShare && files.length && navigator.canShare({ files })) { await navigator.share({ title: d.title, text, files }); return; }
      if (navigator.share) { await navigator.share({ title: d.title, text }); return; }
    } catch (e) { if (e.name === 'AbortError') return; }
    copyDiary(key);
  }
  async function copyDiary(key) {
    const d = st.diaries[key];
    try { await navigator.clipboard.writeText(`${d.title}\n\n${d.body}`); toast('글을 복사했어요'); }
    catch { toast('복사하지 못했어요. 글을 길게 눌러 복사해 주세요'); }
  }

  /* ---------------- 이벤트 ---------------- */
  document.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-dday],[data-photo],[data-write-day],[data-write-essay],[data-pmove],[data-pdel],[data-dshare],[data-dcopy],[data-drewrite],[data-code-reset]');
    if (!t || t.disabled) return;
    if (t.dataset.dday != null) { st.day = Number(t.dataset.dday); render(); return; }
    if (t.dataset.photo) { openPhoto(t.dataset.photo); return; }
    if (t.hasAttribute('data-write-day')) { writeDay(st.day); return; }
    if (t.hasAttribute('data-write-essay')) { writeEssay(); return; }
    if (t.dataset.pmove) {
      const p = st.photos.find((x) => x.id === t.dataset.pmove);
      p.day = Number(t.dataset.to);
      await dbPut('photos', p);
      closeSheet(); await load(); render(); toast(`${DAYS[p.day].label}로 옮겼어요`);
      return;
    }
    if (t.dataset.pdel) {
      if (!confirm('이 사진을 지울까요? 휴대폰 사진첩의 원본은 그대로 있어요.')) return;
      await dbDel('photos', t.dataset.pdel);
      URL.revokeObjectURL(st.urls.get(t.dataset.pdel)); st.urls.delete(t.dataset.pdel);
      closeSheet(); await load(); render();
      return;
    }
    if (t.dataset.dshare) { shareDiary(t.dataset.dshare); return; }
    if (t.dataset.dcopy) { copyDiary(t.dataset.dcopy); return; }
    if (t.dataset.drewrite) {
      if (!confirm('지금 글 대신 새로 쓸까요?')) return;
      if (t.dataset.drewrite === 'essay') writeEssay(); else writeDay(Number(t.dataset.drewrite.slice(3)));
      return;
    }
    if (t.hasAttribute('data-code-reset')) { try { localStorage.removeItem('sp_familyCode'); } catch { /* 무시 */ } render(); }
  });
  document.addEventListener('change', (e) => {
    if (e.target.matches('[data-upload]')) { addFiles(e.target.files); e.target.value = ''; }
    if (e.target.matches('[data-pmemo]')) {
      const p = st.photos.find((x) => x.id === e.target.dataset.pmemo);
      if (p) { p.memo = e.target.value.trim(); dbPut('photos', p).then(render); }
    }
  });
  document.addEventListener('submit', async (e) => {
    if (!e.target.matches('[data-code-form]')) return;
    e.preventDefault();
    const code = new FormData(e.target).get('code').trim();
    try { localStorage.setItem('sp_familyCode', code); } catch { /* 무시 */ }
    try { await callApi('/ping'); toast('확인됐어요 ✓'); }
    catch { try { localStorage.removeItem('sp_familyCode'); } catch { /* 무시 */ } toast('비밀번호가 맞지 않아요'); }
    render();
  });

  window.DIARY = {
    async show() { await load(); render(); },
  };
  // app.js가 먼저 그린 첫 화면이 여행기라면 여기서 채우기
  if (/^#\/diary/.test(location.hash)) window.DIARY.show();
})();
