/* 삿포로 기념일 여행 — 앱 로직 (데이터는 data.js) */
(() => {
  'use strict';

  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // 카페·디저트는 맛집과 따로 「둘러보기 › 카페」에서 보여주기
  PLACES.forEach((p) => { if (CATS[p.cat] && CATS[p.cat].type === 'cafe') p.type = 'cafe'; });
  const byId = Object.fromEntries([HOTEL, ...PLACES].map((p) => [p.id, p]));

  const store = {
    get(k, d) { try { const v = localStorage.getItem('sp_' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('sp_' + k, JSON.stringify(v)); } catch { /* 저장 불가 환경 */ } },
  };

  const state = {
    pos: null,          // {lat, lng, acc, ts}
    watchId: null,
    geoError: null,
    foodCat: 'all',
    cafeCat: 'all',
    sightCat: 'all',
    sortNear: false,
    mapFilter: 'all',
    day: null,
  };

  /* ---------------- 거리·시간 유틸 ---------------- */
  function haversine(a, b) {
    const R = 6371000, toR = (d) => (d * Math.PI) / 180;
    const dLat = toR(b.lat - a.lat), dLng = toR(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  const fmtDist = (m) => (m < 995 ? `${Math.round(m / 10) * 10}m` : `${(m / 1000).toFixed(m < 10000 ? 1 : 0)}km`);
  const walkMin = (m) => Math.max(1, Math.round((m * 1.3) / 75)); // 직선거리×1.3, 분당 75m
  const inHokkaido = (p) => p && p.lat > 42.6 && p.lat < 43.4 && p.lng > 140.7 && p.lng < 141.8;

  function distLabel(place) {
    if (!state.pos || !inHokkaido(state.pos)) return '';
    const d = haversine(state.pos, place);
    return d < 1500 ? `📍 ${fmtDist(d)} · 도보 ${walkMin(d)}분` : `📍 ${fmtDist(d)}`;
  }

  /* ---------------- 지도 링크 ---------------- */
  function gmapsDir(place, mode = 'transit', fromHotel = false) {
    const u = new URL('https://www.google.com/maps/dir/');
    u.searchParams.set('api', '1');
    if (fromHotel) u.searchParams.set('origin', `${HOTEL.lat},${HOTEL.lng}`);
    // 로프웨이·공항처럼 좌표보다 이름이 정확한 곳은 이름으로 검색
    u.searchParams.set('destination', place.navQuery || `${place.lat},${place.lng}`);
    u.searchParams.set('travelmode', mode);
    return u.toString();
  }
  function gmapsPlace(place) {
    const u = new URL('https://www.google.com/maps/search/');
    u.searchParams.set('api', '1');
    u.searchParams.set('query', `${place.name_ja} ${place.address || ''}`.trim());
    return u.toString();
  }

  /* ---------------- 날짜 ---------------- */
  function todayISO() {
    // 일본 시간 기준 날짜
    const f = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' });
    return f.format(new Date());
  }
  function nowHM() {
    const f = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', hour12: false });
    return f.format(new Date());
  }
  function dday() {
    const start = new Date(TRIP.start + 'T00:00:00+09:00');
    const t = new Date(todayISO() + 'T00:00:00+09:00');
    return Math.round((start - t) / 86400000);
  }
  function currentDayIndex() {
    const i = DAYS.findIndex((d) => d.date === todayISO());
    return i;
  }
  function closedWarn(place, date) {
    if (!place || !place.closedDates) return '';
    if (date) return place.closedDates.includes(date) ? '이 날 휴무' : '';
    const ds = place.closedDates.filter((d) => DAYS.some((x) => x.date === d));
    return ds.length ? ds.map((d) => `${Number(d.slice(8))}일`).join('·') + ' 휴무' : '';
  }

  /* ---------------- 위치 ---------------- */
  const pill = $('#loc-pill');
  function updatePill() {
    const t = $('.loc-text', pill);
    pill.classList.toggle('on', !!state.pos);
    pill.classList.toggle('err', !!state.geoError && !state.pos);
    if (state.pos) {
      if (!inHokkaido(state.pos)) t.textContent = '위치 켜짐 (삿포로 밖)';
      else {
        const d = haversine(state.pos, HOTEL);
        t.textContent = `호텔까지 ${fmtDist(d)}`;
      }
    } else if (state.geoError) t.textContent = '위치 꺼짐 · 다시 시도';
    else if (state.watchId != null) t.textContent = '위치 찾는 중…';
    else t.textContent = '내 위치 켜기';
  }

  function startWatch() {
    if (!('geolocation' in navigator)) { state.geoError = '이 브라우저는 위치를 지원하지 않아요.'; updatePill(); return; }
    if (state.watchId != null) return;
    state.geoError = null;
    state.watchId = navigator.geolocation.watchPosition(
      (p) => {
        state.pos = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy, ts: p.timestamp };
        state.geoError = null;
        store.set('geo', true);
        onPosition();
      },
      (e) => {
        state.geoError = e.code === 1
          ? '위치 권한이 꺼져 있어요. 휴대폰 설정 → 브라우저(Safari/Chrome) → 위치를 "허용"으로 바꿔 주세요.'
          : '위치를 찾지 못했어요. 잠시 후 다시 시도해 주세요.';
        if (e.code === 1) { navigator.geolocation.clearWatch(state.watchId); state.watchId = null; }
        updatePill();
        refreshLive();
      },
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 }
    );
    updatePill();
  }

  let lastRender = 0;
  function onPosition() {
    updatePill();
    updateMeMarker();
    const now = Date.now();
    if (now - lastRender > 4000) { lastRender = now; refreshLive(); }
  }

  // 화면을 통째로 다시 그리지 않고 거리 표시만 갱신
  function refreshLive() {
    document.querySelectorAll('[data-dist]').forEach((el) => {
      const p = byId[el.dataset.dist];
      const label = p ? distLabel(p) : '';
      el.textContent = label;
      el.hidden = !label;
    });
    const live = $('#live-box');
    if (live) live.outerHTML = liveBoxHTML(byId[live.dataset.id]);
    const nb = $('#near-slot');
    if (nb) nb.innerHTML = nearBannerHTML();
  }

  // 위치를 한 번만 받기 (켜져 있고 1분 안의 위치면 그대로 사용)
  function getPosOnce() {
    if (state.pos && Date.now() - state.pos.ts < 60000) return Promise.resolve(state.pos);
    if (!('geolocation' in navigator)) return Promise.resolve(null);
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (p) => {
          state.pos = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy, ts: p.timestamp || Date.now() };
          state.geoError = null;
          store.set('geo', true);
          onPosition();
          resolve(state.pos);
        },
        (e) => {
          state.geoError = e.code === 1
            ? '위치 권한이 꺼져 있어요. 휴대폰 설정 → 브라우저(Safari/Chrome) → 위치를 "허용"으로 바꿔 주세요.'
            : '위치를 찾지 못했어요. 잠시 후 다시 시도해 주세요.';
          resolve(null);
        },
        { enableHighAccuracy: true, maximumAge: 30000, timeout: 15000 }
      );
    });
  }
  // 지금 위치를 지도 링크로 카톡 등에 보내기 (가족 안심용)
  async function sendMyLocation() {
    toast('위치를 찾는 중이에요…');
    const pos = await getPosOnce();
    if (!pos) { alertSheet(state.geoError || '위치를 찾지 못했어요.'); return; }
    const url = `https://maps.google.com/?q=${pos.lat.toFixed(6)},${pos.lng.toFixed(6)}`;
    let near = '';
    if (inHokkaido(pos)) {
      let best = null, bd = Infinity;
      for (const p of [HOTEL, ...PLACES]) { const d = haversine(pos, p); if (d < bd) { bd = d; best = p; } }
      if (best && bd < 400) near = ` (${best.name_ko} 근처)`;
    }
    const text = `📍 지금 여기 있어요${near} · ${nowHM()}`;
    if (navigator.share) {
      try { await navigator.share({ title: '내 위치', text, url }); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    try { await navigator.clipboard.writeText(`${text}\n${url}`); toast('위치 링크를 복사했어요. 카톡에 붙여넣기 하세요'); }
    catch { alertSheet(`아래 링크를 길게 눌러 복사해서 보내 주세요.\n${url}`); }
  }
  function alertSheet(message) {
    openSheet(`<div class="confirm"><h2 id="sheet-title" class="confirm-msg" style="white-space:pre-line;word-break:break-all">${esc(message)}</h2>
      <button class="btn primary" data-close-sheet style="width:100%">확인</button></div>`);
  }

  pill.addEventListener('click', () => {
    if (state.geoError && !state.pos) { alertSheet(state.geoError); state.geoError = null; return; }
    startWatch();
    if (state.pos && inHokkaido(state.pos)) location.hash = '#/map';
  });

  /* ---------------- 공통 조각 ---------------- */
  const catOf = (p) => CATS[p.cat] || { label: '', emoji: '📍' };

  // 타베로그 평점은 소수 둘째 자리까지 같은 모양으로
  const fmtRating = (r) => Number(r).toFixed(2);
  function placeCard(p) {
    const cw = closedWarn(p);
    return `<button type="button" class="pcard" data-open="${esc(p.id)}">
      <span class="emoji" aria-hidden="true">${catOf(p).emoji}</span>
      <span>
        <h3>${esc(p.name_ko)}</h3>
        <div class="ja">${esc(p.name_ja)} · ${esc(p.area)}</div>
        <p>${esc(p.desc)}</p>
        <span class="tl-meta">
          <span class="tag">${esc(catOf(p).label)}</span>
          ${p.price ? `<span class="tag">${esc(p.price)}</span>` : ''}
          ${p.rating ? `<span class="tag">타베로그 ${fmtRating(p.rating)}</span>` : ''}
          ${p.route ? `<span class="tag">호텔에서 ${esc(p.route.min)}분</span>` : ''}
          ${cw ? `<span class="tag warn">${esc(cw)}</span>` : ''}
          ${plannedDays(p.id).map((i) => `<span class="tag ok">✓ ${esc(DAYS[i].label)}</span>`).join('')}
          <span class="tag dist" data-dist="${esc(p.id)}" hidden></span>
        </span>
      </span>
    </button>`;
  }

  function nearBannerHTML() {
    if (!state.pos || !inHokkaido(state.pos)) return '';
    let best = null, bd = Infinity;
    for (const p of PLACES) { const d = haversine(state.pos, p); if (d < bd) { bd = d; best = p; } }
    const hd = haversine(state.pos, HOTEL);
    if (hd < 120) return `<div class="near-banner"><span style="font-size:26px">🏨</span><div><b>지금 호텔 근처예요</b><span class="small muted">${esc(HOTEL.name_ko)}</span></div></div>`;
    if (best && bd < 200) {
      return `<div class="near-banner"><span style="font-size:26px">${catOf(best).emoji}</span><div><b>${esc(best.name_ko)} 근처예요</b><span class="small muted">약 ${fmtDist(bd)}</span></div><button class="btn small" data-open="${esc(best.id)}">보기</button></div>`;
    }
    return '';
  }

  /* ---------------- 내 일정 (휴대폰에 저장) ---------------- */
  // item: { uid, place?: 장소 id, title?: 메모 제목, time?: 'HH:MM', memo?: 한 줄 메모, move?: 이동 메모 }
  const plan = (() => {
    const p = store.get('plan_v1', null);
    return p && Array.isArray(p.days) && p.days.length === DAYS.length ? p : { days: DAYS.map(() => []) };
  })();
  const newUid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const stripTags = (h) => String(h).replace(/<[^>]+>/g, '');
  function savePlan() { store.set('plan_v1', plan); }
  function plannedDays(placeId) {
    return plan.days.map((d, i) => (d.some((it) => it.place === placeId) ? i : -1)).filter((i) => i >= 0);
  }
  function togglePlace(placeId, dayIdx) {
    const day = plan.days[dayIdx];
    const i = day.findIndex((it) => it.place === placeId);
    if (i >= 0) { day.splice(i, 1); toast(`${DAYS[dayIdx].label} 일정에서 뺐어요`); }
    else { day.push({ uid: newUid(), place: placeId }); toast(`${DAYS[dayIdx].label} 일정에 넣었어요 ✓`); }
    savePlan();
  }
  // 결혼기념일 디너는 따로 표시 (예전에 불러온 일정은 메모 문구로 알아봄)
  const isAnniv = (it) => !!it.anniv || /결혼기념일/.test(`${it.memo || ''} ${it.title || ''}`);
  function recommendedPlan() {
    return DAYS.map((d) => d.items.map((it) => (it.place
      ? { uid: newUid(), place: it.place, time: it.time, memo: it.text || '', anniv: /결혼기념일/.test(it.text || '') || undefined }
      : { uid: newUid(), title: it.kind === 'move' ? stripTags(it.text).replace(/^[^\p{L}\p{N}]+/u, '') : it.title, time: it.time, memo: it.kind === 'move' ? '' : (it.text || ''), move: it.kind === 'move' })));
  }

  // 공유 링크: 일정과 쇼핑 리스트를 짧게 줄여서 주소 뒤에 붙임 (서버 없이 카톡으로 전달)
  function encodePlan() {
    const compact = plan.days.map((d) => d.map((it) => [it.place || 0, it.time || '', it.place ? '' : (it.title || ''), it.memo || '', it.move ? 1 : 0]));
    const shopList = shop.map((x) => [x.name, x.note || '', x.done ? 1 : 0, x.rec || '']);
    const bytes = new TextEncoder().encode(JSON.stringify({ v: 1, d: compact, s: shopList }));
    let s = '';
    bytes.forEach((b) => { s += String.fromCharCode(b); });
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function decodePlan(str) {
    try {
      const b = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
      const obj = JSON.parse(new TextDecoder().decode(Uint8Array.from(b, (c) => c.charCodeAt(0))));
      if (!obj || !Array.isArray(obj.d) || obj.d.length !== DAYS.length) return null;
      const days = obj.d.map((d) => d.map(([place, time, title, memo, move]) => (place && byId[place]
        ? { uid: newUid(), place, time, memo }
        : { uid: newUid(), title: title || '메모', time, memo, move: !!move })).filter((it) => it.place || it.title));
      // 예전 링크에는 쇼핑 리스트가 없음 → null이면 내 쇼핑 리스트를 그대로 둠
      const shopList = Array.isArray(obj.s)
        ? obj.s.filter((x) => Array.isArray(x) && x[0]).map(([name, note, done, rec]) => ({ uid: newUid(), name: String(name).slice(0, 40), note: note || '', done: !!done, rec: rec || undefined }))
        : null;
      return { days, shop: shopList };
    } catch { return null; }
  }
  async function sharePlan() {
    const total = plan.days.reduce((n, d) => n + d.length, 0);
    if (!total && !shop.length) { toast('아직 일정과 쇼핑 리스트가 비어 있어요'); return; }
    const url = `${location.origin}${location.pathname}#/import?d=${encodePlan()}`;
    const text = '삿포로 여행 일정과 쇼핑 리스트예요. 링크를 누르면 내 폰에도 똑같이 들어가요 👇';
    if (navigator.share) {
      try { await navigator.share({ title: '삿포로 여행 일정', text, url }); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    try { await navigator.clipboard.writeText(`${text}\n${url}`); toast('링크를 복사했어요. 카톡에 붙여넣기 하세요'); }
    catch { openSheet(`<h2 id="sheet-title" class="d-head" style="font-size:20px">일정 보내기</h2><p>아래 링크를 길게 눌러 복사해서 보내 주세요.</p><textarea readonly style="width:100%;height:120px;font-size:14px">${esc(url)}</textarea>`); }
  }
  function showImport(str) {
    const got = decodePlan(str || '');
    if (!got) { toast('일정 링크를 읽지 못했어요'); location.hash = '#/plan'; return; }
    const { days } = got;
    const shopLine = got.shop && got.shop.length ? `<li><b>🛍 쇼핑 리스트</b> ${got.shop.length}개 (산 것 ${got.shop.filter((x) => x.done).length}개)</li>` : '';
    const summary = shopLine + days.map((d, i) => {
      const names = d.filter((x) => x.place).map((x) => byId[x.place].name_ko);
      const what = !d.length ? '비어 있음' : names.length ? `${names.slice(0, 3).join(', ')}${names.length > 3 ? ' 외' : ''}` : '메모만';
      return `<li><b>${esc(DAYS[i].label)}</b> ${d.length}개 — ${esc(what)}</li>`;
    }).join('');
    openSheet(`<div class="d-head"><h2 id="sheet-title">📩 일정을 받았어요</h2></div>
      <ul class="stack" style="padding-left:20px;margin:14px 0">${summary}</ul>
      <p class="small muted">내 폰에 있던 일정${shopLine ? '과 쇼핑 리스트' : ''}는 받은 내용으로 바뀌어요.</p>
      <div class="btn-row"><button class="btn primary" data-import-accept>내 폰에 저장</button><button class="btn" data-close-sheet>취소</button></div>`);
    state.pendingImport = got;
    history.replaceState(null, '', '#/plan');
  }

  // 거리 안내의 기준점: 장소면 그 장소, 호텔 관련 메모면 호텔, 그 밖의 메모(이동·투어 등)는 위치를 모르니 안내하지 않음
  function anchorOf(it) {
    if (it.place) return byId[it.place] || null;
    if (!it.move && /호텔|체크인|체크아웃|짐 (맡기|찾)/.test(it.title || '')) return HOTEL;
    return null;
  }
  function travelHint(a, b) {
    const d = haversine(a, b);
    if (d < 60) return '';
    const how = d < 1200 ? `🚶 걸어서 약 ${walkMin(d)}분` : d < 4000 ? `🚇 약 ${fmtDist(d)} · 지하철이나 택시` : `🚆 약 ${fmtDist(d)} · 대중교통`;
    const u = new URL('https://www.google.com/maps/dir/');
    u.searchParams.set('api', '1');
    u.searchParams.set('origin', `${a.lat},${a.lng}`);
    u.searchParams.set('destination', b.navQuery || `${b.lat},${b.lng}`);
    u.searchParams.set('travelmode', d < 1200 ? 'walking' : 'transit');
    return `<li class="hint">${how} <a href="${u}" target="_blank" rel="noopener">길 보기</a></li>`;
  }

  function planItemHTML(it, i, day, dayIdx, editing, status) {
    const p = it.place ? byId[it.place] : null;
    const title = p ? p.name_ko : it.title;
    const anniv = isAnniv(it);
    const emoji = anniv ? '💍' : p ? catOf(p).emoji : it.move ? '➡️' : '📝';
    const cw = p ? closedWarn(p, DAYS[dayIdx].date) : '';
    const controls = editing ? `<div class="pi-edit">
        <input type="time" value="${esc(it.time || '')}" data-time="${esc(it.uid)}" aria-label="시간">
        <button class="btn small" data-move="${esc(it.uid)}" data-dir="-1" ${i === 0 ? 'disabled' : ''} aria-label="위로">▲</button>
        <button class="btn small" data-move="${esc(it.uid)}" data-dir="1" ${i === day.length - 1 ? 'disabled' : ''} aria-label="아래로">▼</button>
        <button class="btn small danger" data-del="${esc(it.uid)}" aria-label="삭제">삭제</button>
      </div>` : '';
    const body = `<span class="pi-emoji" aria-hidden="true">${emoji}</span>
      <span class="pi-main">
        ${status === 'now' ? '<span class="now-badge">지금</span>' : ''}
        ${anniv ? '<span class="anniv-badge">결혼기념일 디너</span>' : ''}
        <h3>${esc(title)}</h3>
        ${it.memo ? `<p>${esc(anniv ? it.memo.replace(/^💍\s*결혼기념일 디너\.\s*/, '') : it.memo)}</p>` : p ? `<p class="muted">${esc(p.area)} · ${esc(catOf(p).label)}${p.rating ? ` · 타베로그 ${fmtRating(p.rating)}` : ''}</p>` : ''}
        ${p ? `<span class="tl-meta">${cw ? `<span class="tag warn">${esc(cw)}</span>` : ''}<span class="tag dist" data-dist="${esc(p.id)}" hidden></span></span>` : ''}
      </span>`;
    return `<li class="pi${it.move ? ' is-move' : ''}${status ? ` ${status}` : ''}${anniv ? ' anniv' : ''}" ${status === 'now' ? 'id="pi-now"' : ''}>
      <div class="pi-time">${esc(it.time || '')}</div>
      <div class="pi-card">
        ${p && !editing ? `<button type="button" class="pi-row" data-open="${esc(p.id)}">${body}</button>` : `<div class="pi-row">${body}</div>`}
        ${anniv && !editing ? '<button type="button" class="anniv-phrase" data-phrase="3">💍 「오늘 결혼기념일이에요」 일본어로 보여주기</button>' : ''}
        ${controls}
      </div></li>`;
  }
  // 여행 당일: 시작 시각이 지난 마지막 일정이 '지금', 그 앞은 '끝남'
  function dayStatuses(day, isToday, hm) {
    const st = day.map(() => '');
    if (!isToday) return st;
    let nowIdx = -1;
    day.forEach((it, i) => { if (it.time && it.time <= hm) nowIdx = i; });
    day.forEach((it, i) => {
      if (i === nowIdx) st[i] = 'now';
      else if (nowIdx >= 0 && i < nowIdx && it.time) st[i] = 'done';
    });
    return st;
  }

  function renderPlan(dayIdx) {
    const cur = currentDayIndex();
    if (dayIdx == null) dayIdx = state.day ?? (cur >= 0 ? cur : 0);
    state.day = dayIdx;
    const day = plan.days[dayIdx];
    const dd = dday();
    const isToday = DAYS[dayIdx].date === todayISO();
    const hm = nowHM();
    const editing = !!state.editing;

    let hero;
    if (cur >= 0) {
      const today = plan.days[cur];
      const st = dayStatuses(today, true, hm);
      const nowItem = today[st.indexOf('now')];
      const next = today.find((it, i) => i > st.indexOf('now') && it.time && it.time > hm && !it.move);
      const nextPlace = next && next.place ? byId[next.place] : null;
      const nameOf = (it) => (it.place && byId[it.place] ? byId[it.place].name_ko : it.title);
      hero = `<div class="hero"><h2>${esc(DAYS[cur].label)} · ${esc(DAYS[cur].dateLabel)}</h2>
        <dl class="now-next">
          ${nowItem ? `<div><dt>지금</dt><dd>${esc(nameOf(nowItem))}</dd></div>` : ''}
          <div><dt>다음</dt><dd>${next ? `<b>${esc(next.time)}</b> ${esc(nameOf(next))}` : '오늘 일정을 다 마쳤어요. 푹 쉬세요'}</dd></div>
        </dl>
        <div class="now">
          ${nextPlace ? `<a class="btn gold" href="${gmapsDir(nextPlace, 'transit')}" target="_blank" rel="noopener">🧭 다음 일정 길찾기</a>` : ''}
          <a class="btn ${nextPlace ? '' : 'gold'}" href="${gmapsDir(HOTEL, 'transit')}" target="_blank" rel="noopener">🏨 호텔로 돌아가기</a>
          <button class="btn" data-taxi="${nextPlace ? esc(nextPlace.id) : 'hotel'}">🚕 택시에 보여주기</button>
          <button class="btn" data-send-loc>📤 내 위치 보내기</button>
        </div></div>`;
    } else if (dd > 0) {
      hero = `<div class="hero"><h2>결혼기념일 여행까지 D-${dd}</h2><p>${esc(TRIP.subtitle)}</p></div>`;
    } else {
      hero = `<div class="hero"><h2>${esc(TRIP.title)}</h2><p>${esc(TRIP.subtitle)}</p></div>`;
    }

    const tabs = DAYS.map((d, i) => `<button class="daytab" role="tab" aria-selected="${i === dayIdx}" data-day="${i}">
        <b>${esc(d.label)}</b><span>${esc(d.dateLabel)}</span><em>${plan.days[i].length ? `${plan.days[i].length}개` : '비어 있음'}</em></button>`).join('');

    const statuses = dayStatuses(day, isToday, hm);
    let list = '';
    day.forEach((it, i) => {
      // 바로 앞 항목과 이 항목의 위치를 둘 다 알 때만 거리 안내
      if (i > 0 && !editing) {
        const a = anchorOf(day[i - 1]), b = anchorOf(it);
        if (a && b) list += travelHint(a, b);
      }
      list += planItemHTML(it, i, day, dayIdx, editing, statuses[i]);
    });
    const collageNudge = day.length && !editing
      ? `<a class="day-end" href="#/diary"><span aria-hidden="true">📸</span><span><b>${dayIdx === DAYS.length - 1 ? '여행 사진으로 콜라주 만들기' : '오늘 찍은 사진으로 콜라주 만들기'}</b><small>앨범에 사진을 올리면 한 장으로 엮어 드려요</small></span></a>`
      : '';

    const empty = `<div class="empty card">
        <div style="font-size:40px">🗓</div>
        <h3>${esc(DAYS[dayIdx].label)} 일정이 비어 있어요</h3>
        <p class="muted">「둘러보기」 탭에서 가고 싶은 곳을 골라 <b>📅 일정에 넣기</b>를 누르거나, 아래 버튼으로 바로 추가하세요.</p>
      </div>`;

    view.innerHTML = `<div id="near-slot">${nearBannerHTML()}</div>${hero}
      <div class="daytabs" role="tablist">${tabs}</div>
      <div class="plan-tools">
        <span class="plan-date">${esc(DAYS[dayIdx].dateLabel)}</span>
        ${day.length ? `<button class="btn small" data-edit>${editing ? '✓ 완료' : '✏️ 편집'}</button>` : ''}
        ${editing && day.length > 1 ? '<button class="btn small" data-sort-time>⏱ 시간순</button>' : ''}
      </div>
      <div data-wx-day="${dayIdx}">${wxDayHTML(dayIdx)}</div>
      ${pinnedNoteHTML(dayIdx)}
      ${day.length ? `<ol class="plan-list">${list}</ol>` : empty}
      ${collageNudge}
      <div class="btn-row" style="margin-top:14px">
        <button class="btn primary" data-picker>＋ 장소 추가</button>
        <button class="btn" data-memo-form>＋ 메모 추가</button>
      </div>
      <h2 class="section-title">일정 관리</h2>
      <div class="card stack">
        <button class="btn gold" data-share style="width:100%">📤 일정·쇼핑 리스트 보내기 (카톡 공유)</button>
        <p class="small muted" style="margin:0">보낸 링크를 받은 사람이 누르면 같은 일정과 쇼핑 리스트가 그 폰에도 들어가요. 각자 폰에 저장되니 고친 뒤에는 다시 보내 주세요.</p>
        <button class="btn" data-import-rec style="width:100%">✨ 추천 일정 불러오기</button>
        <p class="small muted" style="margin:0">미리 짜 둔 2박 3일 코스로 채워요: 1일차 오타루와 결혼기념일 디너, 2일차 비에이 투어, 3일차 시내 산책. 불러온 뒤 자유롭게 고칠 수 있어요.</p>
        ${plan.days.some((d) => d.length) ? '<button class="btn small" data-clear style="justify-self:start">일정 전부 지우기</button>' : ''}
      </div>`;
    refreshWx();
    // 여행 당일에는 지금 일정이 화면 가운데 오도록 (다시 그릴 때는 rerender가 스크롤을 되돌림)
    const nowEl = $('#pi-now');
    if (nowEl && !editing && !state.keepScroll) requestAnimationFrame(() => nowEl.scrollIntoView({ block: 'center' }));
  }

  /* ---------------- 장소 고르기 시트 ---------------- */
  function pickerListHTML() {
    const q = (state.pickQ || '').trim().toLowerCase();
    const f = state.pickF || 'all';
    let list = PLACES.filter((p) => p.cat !== 'transport');
    if (f === 'food') list = list.filter((p) => p.type === 'food');
    else if (f === 'cafe') list = list.filter((p) => p.type === 'cafe');
    else if (f === 'sight') list = list.filter((p) => p.type === 'sight');
    else if (f === 'otaru') list = list.filter((p) => p.area === '오타루');
    if (q) list = list.filter((p) => `${p.name_ko} ${p.name_ja} ${p.area} ${catOf(p).label} ${p.menu || ''}`.toLowerCase().includes(q));
    if (state.pos && inHokkaido(state.pos) && f === 'near') list = [...list].sort((a, b) => haversine(state.pos, a) - haversine(state.pos, b));
    const dayIdx = state.day ?? 0;
    if (!list.length) return '<p class="muted" style="text-align:center;padding:20px 0">찾는 곳이 없어요</p>';
    return list.map((p) => {
      const inDay = plan.days[dayIdx].some((it) => it.place === p.id);
      return `<div class="pick-row">
        <span class="pi-emoji" aria-hidden="true">${catOf(p).emoji}</span>
        <span class="pi-main"><b>${esc(p.name_ko)}</b><span class="small muted">${esc(p.area)} · ${esc(catOf(p).label)}${p.rating ? ` · ★${esc(p.rating)}` : ''}</span></span>
        <button class="btn small ${inDay ? '' : 'primary'}" data-pick="${esc(p.id)}">${inDay ? '✓ 넣음' : '＋ 넣기'}</button>
      </div>`;
    }).join('');
  }
  function openPicker() {
    const dayIdx = state.day ?? 0;
    const chips = [['all', '전체'], ['food', '🍣 맛집'], ['cafe', '🍰 카페'], ['sight', '⛩ 명소'], ['otaru', '🚃 오타루'], ['near', '📍 가까운 순']]
      .map(([k, l]) => `<button class="chip" data-pickf="${k}" aria-pressed="${(state.pickF || 'all') === k}">${l}</button>`).join('');
    openSheet(`<div class="d-head"><h2 id="sheet-title">어디에 가실래요?</h2><p class="d-sub">📅 ${esc(DAYS[dayIdx].label)} · ${esc(DAYS[dayIdx].dateLabel)}에 넣어요</p></div>
      <input type="search" class="search" placeholder="이름·메뉴로 찾기 (예: 라멘, 게, 오타루)" value="${esc(state.pickQ || '')}" data-pickq>
      <div class="filters" style="margin-top:10px">${chips}</div>
      <div id="pick-list" class="pick-list">${pickerListHTML()}</div>
      <button class="btn primary" data-close-sheet style="width:100%;margin-top:14px">다 골랐어요</button>`);
  }
  function openMemoForm() {
    const dayIdx = state.day ?? 0;
    openSheet(`<div class="d-head"><h2 id="sheet-title">메모 추가</h2><p class="d-sub">📝 ${esc(DAYS[dayIdx].label)} · ${esc(DAYS[dayIdx].dateLabel)}</p></div>
      <form class="memo-form stack" data-memo-save style="margin-top:14px">
        <label>할 일 <input name="title" required maxlength="40" placeholder="예: 호텔 체크인, 기념품 쇼핑"></label>
        <label>시간 (선택) <input name="time" type="time"></label>
        <label>메모 (선택) <input name="memo" maxlength="80" placeholder="예: 프런트에 짐 맡기기"></label>
        <button class="btn primary" type="submit">추가하기</button>
      </form>`);
    setTimeout(() => $('.memo-form input[name=title]')?.focus(), 50);
  }

  /* ---------------- 목록 ---------------- */
  function renderList(type) {
    const key = `${type}Cat`;
    const cats = Object.entries(CATS).filter(([, c]) => c.type === type);
    let list = PLACES.filter((p) => p.type === type);
    const sel = state[key];
    if (sel === 'otaru') list = list.filter((p) => p.area === '오타루');
    else if (sel !== 'all') list = list.filter((p) => p.cat === sel);
    const canSort = state.pos && inHokkaido(state.pos);
    if (state.sortNear && canSort) list = [...list].sort((a, b) => haversine(state.pos, a) - haversine(state.pos, b));

    const chips = [['all', '전체'], ...cats.map(([k, c]) => [k, `${c.emoji} ${c.label}`]), ['otaru', '🚃 오타루']]
      .map(([k, l]) => `<button class="chip" aria-pressed="${sel === k}" data-cat="${k}" data-key="${key}">${esc(l)}</button>`).join('');

    const segs = [['food', '🍣', '맛집'], ['cafe', '☕', '카페'], ['sight', '⛩', '명소']]
      .map(([t, e, l]) => `<a class="seg" href="#/places/${t}" aria-current="${t === type ? 'page' : 'false'}"><span aria-hidden="true">${e}</span>${l}<em>${PLACES.filter((p) => p.type === t).length}</em></a>`).join('');

    view.innerHTML = `<nav class="segbar" aria-label="종류">${segs}</nav>
      <div id="near-slot">${nearBannerHTML()}</div>
      <div class="filters">${chips}</div>
      <div class="sortbar"><h2 class="sortbar-title">${{ food: '맛집', cafe: '카페', sight: '명소' }[type]} ${list.length}곳</h2>
        <button data-sort>${state.sortNear && canSort ? '추천순으로' : '📍 가까운 순'}</button></div>
      <div class="plist">${list.map(placeCard).join('')}</div>`;
  }

  /* ---------------- 쇼핑 리스트 (휴대폰에 저장) ---------------- */
  // item: { uid, name, note?, done, rec?: 추천 기념품 id }
  let shop = store.get('shop_v1', []);
  const saveShop = () => store.set('shop_v1', shop);
  function shopHTML() {
    const total = shop.length, done = shop.filter((x) => x.done).length;
    const visible = state.hideBought ? shop.filter((x) => !x.done) : shop;
    const items = visible.map((x) => `<li class="shop-item${x.done ? ' done' : ''}">
        <label><input type="checkbox" data-shop-check="${esc(x.uid)}" ${x.done ? 'checked' : ''}>
          <span><b>${esc(x.name)}</b>${x.note ? `<small>${esc(x.note)}</small>` : ''}</span></label>
        <button class="shop-del" data-shop-del="${esc(x.uid)}" aria-label="${esc(x.name)} 지우기">✕</button>
      </li>`).join('');
    const recs = SHOP.recs.map((r) => {
      const added = shop.some((x) => x.rec === r.id);
      return `<div class="pick-row">
        <span class="pi-emoji" aria-hidden="true">${r.emoji}</span>
        <span class="pi-main"><b>${esc(r.name)}</b><span class="small muted">${esc(r.ja)}</span>
          <span class="small" style="display:block;margin-top:2px">${esc(r.desc)}</span>
          <span class="small muted" style="display:block">📍 ${esc(r.where)}${r.price ? ` · ${esc(r.price)}` : ''}${r.cold ? ' · ❄️ 냉장' : ''}${r.liquid ? ' · 💧 위탁 수하물' : ''}</span>
          ${r.place ? `<button class="linkish small" data-open="${esc(r.place)}">가게 보기 ›</button>` : ''}</span>
        <button class="btn small ${added ? '' : 'primary'}" data-shop-rec="${esc(r.id)}">${added ? '✓ 담음' : '＋ 담기'}</button>
      </div>`;
    }).join('');
    return `<div class="card stack">
        <div class="shop-head">
          <b>${total ? `${done} / ${total} 샀어요` : '살 것을 적어 두세요'}</b>
          ${done ? `<button class="linkish small" data-shop-hide>${state.hideBought ? '산 것도 보기' : '산 것 숨기기'}</button>` : ''}
        </div>
        ${total ? `<div class="shop-bar"><span style="width:${Math.round((done / total) * 100)}%"></span></div>` : ''}
        <form class="shop-add" data-shop-add>
          <input name="name" maxlength="40" placeholder="예: 회사 동료 줄 초콜릿 5개" aria-label="살 것" required>
          <button class="btn primary small" type="submit">추가</button>
        </form>
        ${visible.length ? `<ul class="shop-list">${items}</ul>` : total ? '<p class="small muted" style="margin:0">다 샀어요! 🎉</p>' : '<p class="small muted" style="margin:0">직접 적거나, 아래 추천 기념품에서 <b>＋ 담기</b>를 눌러 보세요.</p>'}
        ${total ? '<button class="btn small" data-share style="justify-self:start">📤 쇼핑 리스트 보내기 (일정과 함께)</button>' : ''}
      </div>
      <details class="card shop-recs" ${total ? '' : 'open'}>
        <summary>🎁 삿포로 추천 기념품 <span class="small muted">${SHOP.recs.length}가지</span></summary>
        <div class="rec-list">${recs}</div>
      </details>
      <div class="card" style="margin-top:12px"><b>💡 쇼핑할 때 알아 둘 것</b>
        <ul class="stack" style="margin:8px 0 0;padding-left:20px;font-size:15px">${SHOP.tips.map((t) => `<li>${t}</li>`).join('')}</ul></div>`;
  }
  function jumpToSection(key) {
    const el = document.getElementById(`sec-${key}`);
    if (!el) return;
    el.open = true;
    setInfoOpen(key, true);
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - $('.top').offsetHeight - 8, behavior: 'smooth' });
  }
  function rerenderShop() {
    // 입력 중인 칸이 사라지지 않도록 쇼핑 부분만 다시 그리기
    const y = window.scrollY;
    renderInfo();
    window.scrollTo(0, y);
  }

  /* ---------------- 내 여행 메모 (이 휴대폰에만 저장, 공유 링크에도 넣지 않음) ---------------- */
  let notes = store.get('notes_v1', {});
  const NOTE_FIELDS = [
    { group: '✈️ 가는 비행기 (22일)', fields: [['out_no', '편명', '예: KE765'], ['out_time', '도착 시각', '예: 10:30 신치토세']] },
    { group: '🛫 오는 비행기 (24일)', fields: [['in_no', '편명', '예: KE766'], ['in_time', '출발 시각', '예: 18:00']] },
    { group: '🏨 호텔', fields: [['hotel_no', '예약 번호', '체크인할 때 보여 줄 번호']] },
    { group: '🚌 비에이 투어 (23일)', fields: [['tour_company', '투어 회사', ''], ['tour_time', '집합 시각', '예: 07:30'], ['tour_place', '집합 장소', '예: 삿포로역 북쪽 출구'], ['tour_voucher', '예약·바우처 번호', ''], ['tour_phone', '투어 연락처', '']] },
  ];
  const noteVal = (k) => (notes[k] || '').trim();
  function placeSearchURL(text) {
    const u = new URL('https://www.google.com/maps/search/');
    u.searchParams.set('api', '1');
    u.searchParams.set('query', /札幌|삿포로|Sapporo/i.test(text) ? text : `${text} 札幌`);
    return u.toString();
  }
  function notesHTML() {
    const groups = NOTE_FIELDS.map((g) => `<fieldset class="note-group"><legend>${g.group}</legend>
      ${g.fields.map(([k, label, ph]) => `<label>${esc(label)}<input data-note="${k}" value="${esc(notes[k] || '')}" placeholder="${esc(ph)}" autocomplete="off"></label>`).join('')}
    </fieldset>`).join('');
    const place = noteVal('tour_place');
    return `<div class="card stack">
      <p class="small muted" style="margin:0">🔒 여기 적은 내용은 <b>이 휴대폰에만</b> 저장되고, 일정 공유 링크에도 들어가지 않아요.</p>
      ${groups}
      ${place ? `<div class="btn-row"><a class="btn small primary" href="${placeSearchURL(place)}" target="_blank" rel="noopener">🗺 집합 장소 길찾기</a><button class="btn small" data-taxi-text="${esc(place)}">🚕 택시에 보여주기</button></div>` : ''}
      <label class="note-memo">자유 메모<textarea data-note="memo" rows="3" placeholder="예: 투어 버스 번호, 꼭 사 올 것">${esc(notes.memo || '')}</textarea></label>
    </div>`;
  }
  // 일정 탭에 그날 필요한 메모(항공편·투어 집합)를 고정해서 보여주기
  function pinnedNoteHTML(dayIdx) {
    if (dayIdx === 0 && (noteVal('out_no') || noteVal('out_time'))) {
      return `<div class="pin-note">✈️ <span>가는 비행기 <b>${esc(noteVal('out_no'))}</b> ${esc(noteVal('out_time'))}</span></div>`;
    }
    if (dayIdx === 1) {
      if (noteVal('tour_place') || noteVal('tour_time')) {
        return `<div class="pin-note">🚌 <span>투어 집합 <b>${esc(noteVal('tour_time'))}</b> ${esc(noteVal('tour_place'))}${noteVal('tour_phone') ? ` · ☎ <a href="tel:${esc(noteVal('tour_phone').replace(/[^+\d]/g, ''))}">${esc(noteVal('tour_phone'))}</a>` : ''}</span>
          ${noteVal('tour_place') ? `<a class="btn small" href="${placeSearchURL(noteVal('tour_place'))}" target="_blank" rel="noopener">길찾기</a>` : ''}</div>`;
      }
      return '<a class="pin-note empty-note" href="#/info" data-jump-later="notes">🚌 <span>투어 집합 장소·시간이 정해지면 <b>정보 › 내 여행 메모</b>에 적어 두세요</span></a>';
    }
    if (dayIdx === 2 && (noteVal('in_no') || noteVal('in_time'))) {
      return `<div class="pin-note">🛫 <span>오는 비행기 <b>${esc(noteVal('in_no'))}</b> ${esc(noteVal('in_time'))} 출발</span><button class="btn small" data-open="airport">공항 가는 법</button></div>`;
    }
    return '';
  }

  /* ---------------- 날씨 (Open-Meteo, 키 없이 무료 · 최대 16일 예보) ---------------- */
  const WX_SPOTS = [
    { key: 'sapporo', name: '삿포로', lat: 43.0618, lng: 141.3545 },
    { key: 'otaru', name: '오타루', lat: 43.1907, lng: 140.9947 },
    { key: 'biei', name: '비에이', lat: 43.5883, lng: 142.4669 },
  ];
  let wx = store.get('wx', null); // { at, spots: { key: { now: {t, code}, days: { 'YYYY-MM-DD': {code, hi, lo, pop, snow} } } } }
  function wxLabel(code) {
    if (code === 0) return ['☀️', '맑음'];
    if (code <= 2) return ['🌤', '구름 조금'];
    if (code === 3) return ['☁️', '흐림'];
    if (code === 45 || code === 48) return ['🌫', '안개'];
    if (code >= 51 && code <= 57) return ['🌦', '이슬비'];
    if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return ['🌧', '비'];
    if ((code >= 71 && code <= 77) || code === 85 || code === 86) return ['🌨', '눈'];
    if (code >= 95) return ['⛈', '뇌우'];
    return ['🌡', ''];
  }
  const isSnowy = (d) => d.snow > 0 || (d.code >= 71 && d.code <= 77) || d.code === 85 || d.code === 86;
  // 예보가 나오는 날: 출발일에서 15일 전
  const forecastFrom = (date) => {
    const d = new Date(`${date}T00:00:00+09:00`);
    d.setDate(d.getDate() - 15);
    return `${d.getMonth() + 1}월 ${d.getDate()}일`;
  };
  async function loadWx() {
    if (wx && Date.now() - wx.at < 2 * 3600 * 1000) return false;
    const u = new URL('https://api.open-meteo.com/v1/forecast');
    u.searchParams.set('latitude', WX_SPOTS.map((s) => s.lat).join(','));
    u.searchParams.set('longitude', WX_SPOTS.map((s) => s.lng).join(','));
    u.searchParams.set('daily', 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,snowfall_sum');
    u.searchParams.set('current', 'temperature_2m,weather_code');
    u.searchParams.set('timezone', 'Asia/Tokyo');
    u.searchParams.set('forecast_days', '16');
    try {
      const arr = await (await fetch(u)).json();
      if (!Array.isArray(arr) || arr.length !== WX_SPOTS.length) return false;
      const spots = {};
      WX_SPOTS.forEach((s, i) => {
        const d = arr[i].daily;
        const days = {};
        d.time.forEach((date, j) => {
          days[date] = { code: d.weather_code[j], hi: d.temperature_2m_max[j], lo: d.temperature_2m_min[j], pop: d.precipitation_probability_max[j], snow: d.snowfall_sum[j] };
        });
        spots[s.key] = { now: { t: arr[i].current.temperature_2m, code: arr[i].current.weather_code }, days };
      });
      wx = { at: Date.now(), spots };
      store.set('wx', wx);
      return true;
    } catch { return false; } // 오프라인이면 마지막에 받은 예보를 그대로 사용
  }
  function wxSpotChip(spot, d) {
    const [emo, txt] = wxLabel(d.code);
    // 비·눈 확률이 30% 이상이면 확률을, 아니면 하늘 상태를 보여줌
    const sub = d.pop != null && d.pop >= 30 ? `${isSnowy(d) ? '눈' : '비'} ${d.pop}%` : txt;
    return `<div class="wx-chip"><span class="wx-name">${spot.name}</span><span class="wx-emo" aria-hidden="true">${emo}</span>
      <span><b>${Math.round(d.hi)}°</b> / ${Math.round(d.lo)}°</span><span class="wx-sub">${sub}</span></div>`;
  }
  // 일정 탭: 고른 날의 세 도시 날씨
  function wxDayHTML(dayIdx) {
    const date = DAYS[dayIdx].date;
    const have = wx && WX_SPOTS.every((s) => wx.spots[s.key] && wx.spots[s.key].days[date]);
    if (have) {
      const cold = WX_SPOTS.some((s) => wx.spots[s.key].days[date].lo <= 0);
      const snowy = WX_SPOTS.some((s) => isSnowy(wx.spots[s.key].days[date]));
      return `<div class="wx-card">
        <div class="wx-row">${WX_SPOTS.map((s) => wxSpotChip(s, wx.spots[s.key].days[date])).join('')}</div>
        ${snowy ? '<p class="wx-tip">❄️ 눈 소식이 있어요. 미끄럼 방지 신발을 신으세요.</p>' : cold ? '<p class="wx-tip">🧣 영하로 내려가요. 모자·장갑을 챙기세요.</p>' : ''}
      </div>`;
    }
    return `<div class="wx-card wx-wait"><span aria-hidden="true">🌡</span>
      <span>예보는 <b>${forecastFrom(date)}쯤</b>부터 나와요. 평년엔 낮 3~7℃, 밤 0℃ 안팎이고 눈발이 날리기도 해요.</span></div>`;
  }
  // 정보 탭: 지금 날씨 + 여행 3일 예보표
  function wxTableHTML() {
    const now = wx ? WX_SPOTS.map((s) => {
      const n = wx.spots[s.key] && wx.spots[s.key].now;
      return n ? `<span class="wx-now-item">${s.name} ${wxLabel(n.code)[0]} <b>${Math.round(n.t)}°</b></span>` : '';
    }).join('') : '';
    const rows = DAYS.map((d) => {
      const cells = WX_SPOTS.map((s) => {
        const x = wx && wx.spots[s.key] && wx.spots[s.key].days[d.date];
        if (!x) return '<td class="muted">–</td>';
        return `<td><span aria-hidden="true">${wxLabel(x.code)[0]}</span> <b>${Math.round(x.hi)}°</b>/${Math.round(x.lo)}°${x.pop >= 30 ? `<br><small>${isSnowy(x) ? '눈' : '비'} ${x.pop}%</small>` : ''}</td>`;
      }).join('');
      return `<tr><th>${esc(d.dateLabel)}</th>${cells}</tr>`;
    }).join('');
    const any = wx && DAYS.some((d) => wx.spots.sapporo && wx.spots.sapporo.days[d.date]);
    return `<div class="card stack">
      ${now ? `<div class="wx-now"><span class="small muted">지금</span>${now}</div>` : ''}
      <table class="wx-table"><thead><tr><th></th>${WX_SPOTS.map((s) => `<th>${s.name}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>
      <p class="small muted" style="margin:0">${any ? '최고/최저 기온 · 비·눈 확률 30% 이상만 표시해요.' : `여행 날짜 예보는 ${forecastFrom(DAYS[0].date)}쯤부터 채워져요.`} ${wx ? `${new Date(wx.at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' })} 업데이트` : ''}</p>
    </div>`;
  }
  // 예보를 받아 오면 화면에 있는 날씨 칸만 바꾸기
  async function refreshWx() {
    if (!(await loadWx())) return;
    const day = $('[data-wx-day]');
    if (day) day.innerHTML = wxDayHTML(Number(day.dataset.wxDay));
    const table = $('[data-wx-table]');
    if (table) table.innerHTML = wxTableHTML();
  }

  /* ---------------- 환율 계산기 ---------------- */
  const FX_FALLBACK = { rate: 8.51, date: '2026-11-03' }; // 1엔 = ?원 (불러오기 실패 시)
  let fx = store.get('fx', FX_FALLBACK);
  const fmtWon = (n) => {
    const won = Math.round(n / 10) * 10;
    return `${won.toLocaleString('ko-KR')}원${won >= 10000 ? ` (약 ${(won / 10000).toFixed(won >= 100000 ? 0 : 1)}만 원)` : ''}`;
  };
  const fxResult = (v) => (state.fxDir === 'krw' ? `≈ ${Math.round(v / fx.rate).toLocaleString('ko-KR')}엔` : `≈ ${fmtWon(v * fx.rate)}`);
  function fxHTML() {
    const krw = state.fxDir === 'krw';
    const v = Number(state.fxVal) || 0;
    const quick = (krw ? [10000, 30000, 50000, 100000] : [500, 1000, 3000, 5000, 10000])
      .map((n) => `<button class="chip" data-fx-quick="${n}">${n.toLocaleString('ko-KR')}${krw ? '원' : '엔'}</button>`).join('');
    return `<div class="card stack">
      <div class="fx-row">
        <input class="fx-in" data-fx-in inputmode="numeric" pattern="[0-9]*" placeholder="0" value="${v ? v.toLocaleString('ko-KR') : ''}" aria-label="${krw ? '원' : '엔'} 금액">
        <span class="fx-unit">${krw ? '원' : '엔'}</span>
      </div>
      <div class="fx-out${v ? '' : ' empty'}" id="fx-out">${v ? esc(fxResult(v)) : '가격표 숫자를 넣어 보세요'}</div>
      <div class="filters" style="padding-bottom:0">${quick}</div>
      <div class="fx-foot">
        <span class="small muted" id="fx-rate">1엔 = ${fx.rate.toFixed(2)}원 · ${esc(fx.date.slice(5).replace('-', '/'))} 기준</span>
        <button class="linkish small" data-fx-swap>⇄ ${krw ? '엔 → 원으로' : '원 → 엔으로'}</button>
      </div>
      <p class="small muted" style="margin:0">카드로 결제하면 카드사 환율·수수료 때문에 조금 달라질 수 있어요.</p>
    </div>`;
  }
  async function refreshFx() {
    if (Date.now() - (fx.at || 0) < 6 * 3600 * 1000) return;
    try {
      const j = await (await fetch('https://open.er-api.com/v6/latest/JPY')).json();
      if (j.result !== 'success' || !j.rates || !j.rates.KRW) return;
      fx = { rate: j.rates.KRW, date: new Date(j.time_last_update_unix * 1000).toISOString().slice(0, 10), at: Date.now() };
      store.set('fx', fx);
      const r = $('#fx-rate');
      if (r) r.textContent = `1엔 = ${fx.rate.toFixed(2)}원 · ${fx.date.slice(5).replace('-', '/')} 기준`;
      const v = Number(state.fxVal) || 0;
      const out = $('#fx-out');
      if (out && v) out.textContent = fxResult(v);
    } catch { /* 오프라인이면 마지막 환율 사용 */ }
  }

  /* ---------------- 정보 ---------------- */
  function routeOption(o) {
    return `<div class="card opt${o.rec ? ' rec' : ''}">
      ${o.rec ? '<span class="rec-badge">추천</span>' : ''}
      <h3>${esc(o.title)}</h3>
      <div class="route-sum" style="margin-top:8px">${o.min ? `<span class="tag">⏱ ${esc(o.min)}</span>` : ''}${o.fare ? `<span class="tag">💴 ${esc(o.fare)}</span>` : ''}</div>
      <ol class="route-steps">${o.steps.map((s) => `<li>${s}</li>`).join('')}</ol>
      ${o.note ? `<div class="tip">${o.note}</div>` : ''}
    </div>`;
  }

  // 정보 탭 섹션: 제목을 눌러 열고 닫기, 열림 상태는 휴대폰에 기억
  const INFO_OPEN_DEFAULT = { fx: true, shop: true, hotel: true };
  const infoOpen = (key) => { const o = store.get('infoOpen', INFO_OPEN_DEFAULT); return key in o ? o[key] : !!INFO_OPEN_DEFAULT[key]; };
  function setInfoOpen(key, open) { const o = store.get('infoOpen', { ...INFO_OPEN_DEFAULT }); o[key] = open; store.set('infoOpen', o); }
  function sec(key, title, body, hint = '') {
    return `<details class="sec" id="sec-${key}" data-sec="${key}" ${infoOpen(key) ? 'open' : ''}>
      <summary class="sec-title"><h2>${title}</h2>${hint ? `<span class="sec-hint">${hint}</span>` : ''}</summary>
      <div class="sec-body">${body}</div>
    </details>`;
  }

  function renderInfo() {
    const h = HOTEL;
    const checks = store.get('checks', {});
    const packed = INFO.packing.filter((_, i) => checks[i]).length;
    const bought = shop.filter((x) => x.done).length;
    const jumps = [['fx', '💴 환율'], ['weather', '🌤 날씨'], ['shop', '🛍 쇼핑'], ['notes', '🔒 내 메모'], ['hotel', '🏨 호텔'], ['reserve', '📞 예약'], ['airport', '✈️ 공항'], ['phrase', '🗣 일본어'], ['sos', '🚨 긴급']]
      .map(([k, l]) => `<button class="chip" data-jump="${k}">${l}</button>`).join('');
    const allOpen = ['fx', 'shop', 'notes', 'hotel', 'reserve', 'airport', 'airport-back', 'weather', 'tips', 'phrase', 'sos'].every(infoOpen);
    const noteCount = Object.keys(notes).filter((k) => noteVal(k)).length;
    view.innerHTML = `
      <div class="setting-row">
        <span><b>글씨 크게 보기</b><small>머리글·본문·버튼 글씨를 30% 키워요</small></span>
        <button class="switch" role="switch" aria-checked="${isBig()}" data-bigtext><span class="knob" aria-hidden="true"></span><span class="sr-only">글씨 크게 보기</span></button>
      </div>
      <div class="filters">${jumps}</div>
      <div class="sec-tools"><button class="linkish small" data-sec-all="${allOpen ? '0' : '1'}">${allOpen ? '모두 접기' : '모두 펼치기'}</button></div>
      ${sec('fx', '💴 환율 계산기', fxHTML())}
      ${sec('shop', '🛍 쇼핑 리스트', shopHTML(), shop.length ? `${bought}/${shop.length}` : '')}
      ${sec('notes', '🔒 내 여행 메모', notesHTML(), noteCount ? `${noteCount}개 적음` : '항공편·투어')}
      ${sec('hotel', '🏨 호텔', `
      <div class="card stack">
        <div><h3 style="font-size:19px">${esc(h.name_ko)}</h3><div class="muted">${esc(h.name_ja)}</div></div>
        <dl class="facts">
          <dt>주소</dt><dd>${esc(h.address)}</dd>
          <dt>전화</dt><dd><a href="tel:${esc(h.phone.replace(/[^+\d]/g, ''))}">${esc(h.phone)}</a></dd>
          <dt>체크인</dt><dd>${esc(h.checkin)} / 체크아웃 ${esc(h.checkout)}</dd>
          <dt>가까운 역</dt><dd>${h.near.map(esc).join('<br>')}</dd>
        </dl>
        <div class="btn-row">
          <a class="btn primary" href="${gmapsDir(h, 'transit')}" target="_blank" rel="noopener">🧭 호텔로 길찾기</a>
          <button class="btn" data-taxi="hotel">🚕 택시에 보여주기</button>
        </div>
        ${h.tip ? `<div class="tip">${h.tip}</div>` : ''}
      </div>`)}
      ${sec('reserve', '📞 미리 예약할 곳', `<div class="card stack">${INFO.reservations.map((r) => {
        const p = byId[r.place];
        return `<div style="display:flex;gap:12px;align-items:center">
          <div style="flex:1;min-width:0"><b>${esc(p.name_ko)}</b><div class="small muted">${esc(r.when)} · ${esc(r.note)}</div></div>
          <button class="btn small" data-open="${esc(p.id)}">예약 방법</button></div>`;
      }).join('')}</div>`, `${INFO.reservations.length}곳`)}
      ${sec('airport', '✈️ 공항 → 호텔 (도착일)', `<div class="stack">${AIRPORT.to.map(routeOption).join('')}</div>`)}
      ${sec('airport-back', '🛫 호텔 → 공항 (귀국일)', `<div class="stack">${AIRPORT.from.map(routeOption).join('')}</div>`)}
      ${sec('weather', '🧥 날씨·준비물', `<div data-wx-table>${wxTableHTML()}</div>
      <div class="card stack" style="margin-top:10px">
        <p style="margin:0">${INFO.weather}</p>
        <div class="checklist">${INFO.packing.map((x, i) => `<label><input type="checkbox" data-check="${i}" ${checks[i] ? 'checked' : ''}><span>${esc(x)}</span></label>`).join('')}</div>
      </div>`, `${packed}/${INFO.packing.length}`)}
      ${sec('tips', '💡 알아두면 좋은 것', `<div class="card"><ul style="margin:0;padding-left:20px" class="stack">${INFO.tips.map((t) => `<li>${t}</li>`).join('')}</ul></div>`)}
      ${sec('phrase', '🗣 일본어 한마디', `<p class="small muted" style="margin:0 0 8px">문장을 누르면 크게 보여요.</p>
      <div class="card" style="padding:4px 16px">${INFO.phrases.map((p, i) => `<div class="phrase" data-phrase="${i}" role="button" tabindex="0">
        <span class="ko">${esc(p.ko)}</span><span class="ja">${esc(p.ja)}</span><span class="rd">${esc(p.rd)}</span></div>`).join('')}</div>`)}
      ${sec('sos', '🚨 긴급 연락처', `<button class="btn primary" data-send-loc style="width:100%;margin-bottom:10px">📤 지금 내 위치를 가족에게 보내기</button>
      <div class="card"><dl class="facts">${INFO.emergency.map((e) => `<dt>${esc(e.label)}</dt><dd>${e.tel ? `<a href="tel:${esc(e.tel)}">${esc(e.value)}</a>` : esc(e.value)}</dd>`).join('')}</dl></div>`)}
      <p class="small muted" style="margin-top:20px">영업시간·휴무일은 ${esc(TRIP.checked)} 기준으로 조사한 정보예요. 출발 전 구글맵에서 한 번 더 확인해 주세요.</p>`;
    refreshFx();
    refreshWx();
    if (state.jumpTo) { const k = state.jumpTo; state.jumpTo = null; setTimeout(() => jumpToSection(k), 50); }
  }

  /* ---------------- 상세 시트 ---------------- */
  function liveBoxHTML(p) {
    // 지금 위치에서의 거리 한 줄 (길찾기 버튼은 상세 창 맨 위에 따로 있음)
    let body;
    if (!state.pos) {
      body = state.geoError
        ? `<span>${esc(state.geoError)}</span>`
        : '<span>내 위치를 켜면 여기서부터 거리를 알려 드려요.</span><button class="btn small" data-geo>📍 위치 켜기</button>';
    } else if (!inHokkaido(state.pos)) {
      body = '<span>삿포로에 도착하면 여기서부터 거리를 알려 드려요.</span>';
    } else {
      const d = haversine(state.pos, p);
      const advice = d < 1500 ? `걸어서 약 ${walkMin(d)}분` : d < 4000 ? '지하철·전차나 택시 추천' : '대중교통이나 택시로';
      body = `<span><b class="live-dist">${fmtDist(d)}</b> ${advice}</span>
        ${d < 1500 ? `<a class="btn small" href="${gmapsDir(p, 'walking')}" target="_blank" rel="noopener">🚶 걷는 길</a>` : ''}`;
    }
    return `<div class="live-line" id="live-box" data-id="${esc(p.id)}">${body}</div>`;
  }

  function openPlace(id) {
    const p = byId[id];
    if (!p) return;
    const isHotel = p.id === 'hotel';
    const c = catOf(p);
    const cw = closedWarn(p);
    const r = p.route;
    const fromLabel = p.from === 'otaru' ? '오타루역에서 가는 법' : '호텔에서 가는 법';
    // 순서: 이름 → (고정) 가기·택시·지도 → 거리 → 설명·팁 → 핵심 정보 → 가는 법(접힘) → 일정에 넣기 → 더 알아보기
    const more = [
      p.address && `<dt>주소</dt><dd>${esc(p.address)}</dd>`,
      p.phone && `<dt>전화</dt><dd><a href="tel:${esc(p.phone.replace(/[^+\d]/g, ''))}">${esc(p.phone)}</a></dd>`,
      p.reserve && `<dt>예약</dt><dd>${p.reserve}</dd>`,
      p.stay && `<dt>머무는 시간</dt><dd>${esc(p.stay)}</dd>`,
    ].filter(Boolean).join('');
    openSheet(`
      <div class="d-head ${esc(p.type)}">
        <h2 id="sheet-title">${esc(p.name_ko)}</h2>
        <p class="d-sub">${c.emoji} ${esc(c.label)} · ${esc(p.area || '')}${p.rating ? ` · 타베로그 ${fmtRating(p.rating)}` : ''}</p>
        <p class="ja">${esc(p.name_ja)}</p>
        ${cw ? `<div class="tl-meta"><span class="tag warn">⚠ ${esc(cw)}</span></div>` : ''}
      </div>
      <div class="go-bar">
        <a class="btn primary" href="${gmapsDir(p, 'transit')}" target="_blank" rel="noopener">🧭 길찾기</a>
        <button class="btn" data-taxi="${esc(p.id)}">🚕 택시</button>
        <a class="btn" href="#/map?focus=${esc(p.id)}" data-close>🗺 지도</a>
      </div>
      <div class="stack">
        ${liveBoxHTML(p)}
        ${p.desc ? `<p class="d-desc">${esc(p.desc)}</p>` : ''}
        ${p.tip ? `<div class="tip">💡 ${p.tip}</div>` : ''}
        <dl class="facts card">
          ${p.menu ? `<dt>추천 메뉴</dt><dd>${esc(p.menu)}</dd>` : ''}
          ${p.price ? `<dt>예산</dt><dd>${esc(p.price)}</dd>` : ''}
          ${p.fee ? `<dt>요금</dt><dd>${esc(p.fee)}</dd>` : ''}
          ${p.hours ? `<dt>영업시간</dt><dd>${esc(p.hours)}</dd>` : ''}
          ${p.closed ? `<dt>휴무</dt><dd>${esc(p.closed)}</dd>` : ''}
        </dl>
        ${r ? `<details class="fold">
          <summary>🏨 ${fromLabel} <span class="fold-hint">${r.min ? `약 ${esc(r.min)}분` : ''}${r.fare ? ` · ${esc(r.fare)}` : ''}</span></summary>
          <div class="fold-body">
            ${r.taxi ? `<p class="small muted" style="margin:0 0 10px">택시라면 ${esc(r.taxi)}</p>` : ''}
            <ol class="route-steps">${r.steps.map((s) => `<li>${s}</li>`).join('')}</ol>
            ${p.from !== 'otaru' && !isHotel ? `<a class="btn small" href="${gmapsDir(p, 'transit', true)}" target="_blank" rel="noopener">구글맵으로 호텔→여기 경로 보기</a>` : ''}
          </div>
        </details>` : ''}
        ${more ? `<details class="fold"><summary>📋 주소·전화·예약</summary><div class="fold-body"><dl class="facts">${more}</dl></div></details>` : ''}
        ${isHotel ? '' : planBoxHTML(p)}
        <div class="link-row">
          ${p.tabelog ? `<a href="${esc(p.tabelog)}" target="_blank" rel="noopener">🍴 타베로그 메뉴·사진</a>` : ''}
          <a href="${gmapsPlace(p)}" target="_blank" rel="noopener">⭐ 구글맵 리뷰·사진</a>
        </div>
      </div>`);
  }
  function planBoxHTML(p) {
    const days = plannedDays(p.id);
    return `<div class="card plan-box" id="plan-box" data-id="${esc(p.id)}">
      <p class="plan-box-title">📅 내 일정에 넣기 <span class="muted">(한 번 더 누르면 빠져요)</span></p>
      <div class="btn-row three">${DAYS.map((d, i) => `<button class="btn stacked ${days.includes(i) ? 'on' : ''}" data-toggle-day="${i}" data-id="${esc(p.id)}" aria-pressed="${days.includes(i)}"><span>${days.includes(i) ? '✓ ' : ''}${esc(d.label)}</span><small>${esc(d.dateLabel.split(' ')[0])}</small></button>`).join('')}</div>
    </div>`;
  }
  function openSheet(html) {
    $('#sheet-body').innerHTML = html;
    $('#sheet').hidden = false;
    $('#sheet-backdrop').hidden = false;
    $('#sheet').scrollTop = 0;
    document.body.style.overflow = 'hidden';
    // 화면 읽기·키보드 사용자를 위해 시트 제목으로 초점 이동
    const title = $('#sheet-title');
    if (title) { title.setAttribute('tabindex', '-1'); title.focus({ preventScroll: true }); }
  }
  let toastTimer;
  function toast(msg) {
    let t = $('#toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
  }
  // 브라우저 기본 확인창은 카톡 인앱 브라우저 등에서 뜨지 않고 '취소'로 처리되므로 앱 안에서 직접 묻기
  let confirmResolve = null;
  function askConfirm(message, okLabel = '확인', danger = false) {
    if (confirmResolve) confirmResolve(false);
    return new Promise((resolve) => {
      openSheet(`<div class="confirm">
        <h2 id="sheet-title" class="confirm-msg">${esc(message)}</h2>
        <div class="btn-row"><button class="btn ${danger ? 'danger-fill' : 'primary'}" data-confirm="1">${esc(okLabel)}</button><button class="btn" data-confirm="0">취소</button></div>
      </div>`);
      confirmResolve = resolve;
    });
  }
  function closeSheet() {
    if (confirmResolve) { const r = confirmResolve; confirmResolve = null; r(false); }
    // 시트에서 일정을 바꿨으면 뒤 화면도 새로 그리기
    if (state.dirty) { state.dirty = false; rerender(); }
    $('#sheet').hidden = true;
    $('#sheet-backdrop').hidden = true;
    document.body.style.overflow = '';
  }

  /* ---------------- 택시 카드 / 문장 크게 보기 ---------------- */
  function showTaxi(id) {
    const p = byId[id];
    $('#showcard-inner').innerHTML = `
      <div class="sc-lead">運転手さん、こちらまでお願いします。</div>
      <div class="sc-name">${esc(p.taxi_ja || p.name_ja)}</div>
      ${p.taxi_addr || p.address ? `<div class="sc-addr">${esc(p.taxi_addr || p.address)}</div>` : ''}
      ${p.phone && !p.taxi_ja ? `<div class="sc-addr">☎ ${esc(p.phone)}</div>` : ''}
      <div class="sc-ko">기사님께 이 화면을 보여주세요 · ${esc(p.name_ko)}</div>`;
    $('#showcard').hidden = false;
  }
  function showTaxiText(text) {
    $('#showcard-inner').innerHTML = `
      <div class="sc-lead">運転手さん、こちらまでお願いします。</div>
      <div class="sc-name">${esc(text)}</div>
      <div class="sc-ko">기사님께 이 화면을 보여주세요</div>`;
    $('#showcard').hidden = false;
  }
  function showPhrase(i) {
    const p = INFO.phrases[i];
    $('#showcard-inner').innerHTML = `<div class="sc-name" style="font-size:36px">${esc(p.ja)}</div><div class="sc-ko" style="font-size:20px">${esc(p.ko)} · ${esc(p.rd)}</div>`;
    $('#showcard').hidden = false;
  }
  $('#showcard-close').addEventListener('click', () => { $('#showcard').hidden = true; });

  /* ---------------- 지도 ---------------- */
  let map = null, meMarker = null, meCircle = null;
  const markers = {};
  function initMap() {
    if (map || typeof L === 'undefined') return;
    // 일정이 있으면 처음엔 내 일정 장소만 보여서 핀이 덜 복잡하게
    if (plan.days.some((d) => d.some((it) => it.place))) state.mapFilter = 'plan';
    map = L.map('map', { zoomControl: false }).setView([HOTEL.lat, HOTEL.lng], 14);
    L.control.zoom({ position: 'bottomleft' }).addTo(map);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, subdomains: 'abc',
      attribution: '&copy; OpenStreetMap',
    }).addTo(map);
    for (const p of [HOTEL, ...PLACES]) {
      const kind = p.id === 'hotel' ? 'hotel' : p.type;
      const icon = L.divIcon({ className: '', html: `<div class="pin ${kind}"><span>${p.id === 'hotel' ? '🏨' : catOf(p).emoji}</span></div>`, iconSize: [34, 34], iconAnchor: [17, 34], popupAnchor: [0, -30] });
      const m = L.marker([p.lat, p.lng], { icon, title: p.name_ko, alt: p.name_ko, zIndexOffset: p.id === 'hotel' ? 1000 : 0 }).addTo(map);
      m.bindPopup(() => `<b>${esc(p.name_ko)}</b><div class="small muted">${esc(p.name_ja)}</div>
        <div class="small" data-dist="${esc(p.id)}">${esc(distLabel(p))}</div>
        <div class="pop-actions"><button class="btn small primary" data-open="${esc(p.id)}">자세히</button>
        <a class="btn small" href="${gmapsDir(p, 'transit')}" target="_blank" rel="noopener">길찾기</a></div>`);
      markers[p.id] = { m, p };
    }
    $('#map-chips').innerHTML = [['all', '전체'], ['plan', '📅 내 일정'], ['food', '🍣 맛집'], ['cafe', '☕ 카페'], ['sight', '⛩ 명소'], ['otaru', '🚃 오타루']]
      .map(([k, l]) => `<button class="chip" data-mapf="${k}" aria-pressed="${state.mapFilter === k}">${l}</button>`).join('');
    applyMapFilter();
    updateMeMarker();
  }
  function applyMapFilter() {
    const f = state.mapFilter;
    for (const { m, p } of Object.values(markers)) {
      const show = p.id === 'hotel' || f === 'all'
        || (f === 'plan' ? plannedDays(p.id).length > 0 : f === 'otaru' ? p.area === '오타루' : p.type === f);
      if (show) m.addTo(map); else m.remove();
    }
    document.querySelectorAll('[data-mapf]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.mapf === f));
  }
  function updateMeMarker() {
    if (!map || !state.pos) return;
    const ll = [state.pos.lat, state.pos.lng];
    if (!meMarker) {
      meMarker = L.marker(ll, { icon: L.divIcon({ className: '', html: '<div class="me-dot"></div>', iconSize: [20, 20], iconAnchor: [10, 10] }), zIndexOffset: 2000 }).addTo(map).bindPopup('<b>지금 내 위치</b>');
      meCircle = L.circle(ll, { radius: state.pos.acc, color: '#2c64c7', weight: 1, fillOpacity: .08 }).addTo(map);
    } else {
      meMarker.setLatLng(ll);
      meCircle.setLatLng(ll).setRadius(state.pos.acc);
    }
  }
  $('#btn-locate').addEventListener('click', () => {
    startWatch();
    if (state.pos && inHokkaido(state.pos)) map.setView([state.pos.lat, state.pos.lng], 16);
    else if (state.pos) { toast('지금은 삿포로 밖이라 호텔 위치를 보여 드릴게요'); map.setView([HOTEL.lat, HOTEL.lng], 15); }
  });
  function showMap(focusId) {
    $('#map-wrap').hidden = false;
    view.hidden = true;
    initMap();
    setTimeout(() => {
      map.invalidateSize();
      if (focusId && markers[focusId]) {
        const { m, p } = markers[focusId];
        if (state.mapFilter !== 'all') { state.mapFilter = 'all'; applyMapFilter(); }
        map.setView([p.lat, p.lng], 16);
        m.openPopup();
      }
    }, 50);
  }

  /* ---------------- 라우팅 ---------------- */
  const view = $('#view');
  const titles = { plan: '삿포로 2박 3일', map: '지도', places: '둘러보기', diary: '여행 앨범', info: '여행 정보' };
  // 예전 주소(#/food 등)도 둘러보기 탭으로 열기
  const PLACE_TYPES = { food: 'food', cafe: 'cafe', sights: 'sight', sight: 'sight' };
  function route() {
    const raw = location.hash.replace(/^#\/?/, '') || 'plan';
    const [path, query] = raw.split('?');
    let [tab, arg] = path.split('/');
    if (PLACE_TYPES[tab]) { arg = PLACE_TYPES[tab]; tab = 'places'; }
    const params = new URLSearchParams(query || '');
    document.querySelectorAll('.tabbar a').forEach((a) => {
      const on = a.dataset.tab === (titles[tab] ? tab : 'plan');
      a.classList.toggle('active', on);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    $('#page-title').textContent = titles[tab] || titles.plan;
    if (tab === 'import') { $('#map-wrap').hidden = true; view.hidden = false; renderPlan(); showImport(params.get('d')); return; }
    if (tab === 'map') { showMap(params.get('focus')); refreshLive(); return; }
    $('#map-wrap').hidden = true;
    view.hidden = false;
    if (tab === 'diary') { view.innerHTML = ''; if (window.DIARY) window.DIARY.show(); window.scrollTo(0, 0); return; }
    if (tab === 'places') {
      state.placesType = PLACE_TYPES[arg] || state.placesType || 'food';
      renderList(state.placesType);
    } else if (tab === 'info') renderInfo();
    else renderPlan(arg != null ? Number(arg) : null);
    refreshLive();
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', () => { state.dirty = false; closeSheet(); route(); });
  // 스크롤 위치를 지키면서 현재 화면만 다시 그리기
  function rerender() {
    const y = window.scrollY;
    state.keepScroll = true;
    route();
    state.keepScroll = false;
    window.scrollTo(0, y);
    if (map && !$('#map-wrap').hidden) applyMapFilter();
  }

  /* ---------------- 이벤트 위임 ---------------- */
  const findItem = (uid) => {
    for (const d of plan.days) { const i = d.findIndex((x) => x.uid === uid); if (i >= 0) return [d, i]; }
    return [null, -1];
  };
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-open],[data-taxi],[data-day],[data-cat],[data-sort],[data-geo],[data-mapf],[data-phrase],[data-close],[data-confirm],'
      + '[data-toggle-day],[data-pick],[data-pickf],[data-picker],[data-memo-form],[data-edit],[data-sort-time],[data-move],[data-del],'
      + '[data-share],[data-import-rec],[data-import-accept],[data-clear],[data-close-sheet],'
      + '[data-send-loc],[data-bigtext],[data-sos-phrase],[data-jump],[data-jump-later],[data-taxi-text],[data-fx-swap],[data-fx-quick],[data-sec-all],[data-shop-del],[data-shop-rec],[data-shop-hide]');
    if (!t || t.disabled) return;
    if (t.hasAttribute('data-send-loc')) { sendMyLocation(); return; }
    if (t.hasAttribute('data-bigtext')) { toggleBigText(); return; }
    if (t.dataset.sosPhrase != null) {
      const p = SOS_PHRASES[Number(t.dataset.sosPhrase)];
      $('#showcard-inner').innerHTML = `<div class="sc-name" style="font-size:44px">${esc(p.ja)}</div><div class="sc-ko" style="font-size:20px">${esc(p.ko)} · ${esc(p.rd)}</div>`;
      $('#showcard').hidden = false;
      return;
    }
    if (t.dataset.jump) { jumpToSection(t.dataset.jump); return; }
    if (t.dataset.jumpLater) { state.jumpTo = t.dataset.jumpLater; return; } // #/info로 이동한 뒤 그 섹션을 열기
    if (t.dataset.taxiText) { showTaxiText(t.dataset.taxiText); return; }
    if (t.dataset.fxSwap != null) {
      state.fxDir = state.fxDir === 'krw' ? 'jpy' : 'krw';
      state.fxVal = '';
      rerenderShop();
      return;
    }
    if (t.dataset.fxQuick) {
      state.fxVal = t.dataset.fxQuick;
      const inp = $('[data-fx-in]');
      if (inp) inp.value = Number(state.fxVal).toLocaleString('ko-KR');
      $('#fx-out').textContent = fxResult(Number(state.fxVal)); $('#fx-out').classList.remove('empty');
      return;
    }
    if (t.dataset.secAll != null) {
      const open = t.dataset.secAll === '1';
      document.querySelectorAll('details.sec').forEach((d) => { d.open = open; setInfoOpen(d.dataset.sec, open); });
      t.dataset.secAll = open ? '0' : '1';
      t.textContent = open ? '모두 접기' : '모두 펼치기';
      return;
    }
    if (t.dataset.shopDel) {
      const item = shop.find((x) => x.uid === t.dataset.shopDel);
      shop = shop.filter((x) => x !== item);
      saveShop(); rerenderShop();
      if (item) toast(`「${item.name}」 항목을 지웠어요`);
      return;
    }
    if (t.dataset.shopRec) {
      const r = SHOP.recs.find((x) => x.id === t.dataset.shopRec);
      const i = shop.findIndex((x) => x.rec === r.id);
      if (i >= 0) { shop.splice(i, 1); toast('쇼핑 리스트에서 뺐어요'); }
      else { shop.push({ uid: newUid(), name: r.name, note: r.where, done: false, rec: r.id }); toast('쇼핑 리스트에 담았어요 ✓'); }
      saveShop(); rerenderShop();
      return;
    }
    if (t.hasAttribute('data-shop-hide')) { state.hideBought = !state.hideBought; rerenderShop(); return; }
    if (t.dataset.open) { openPlace(t.dataset.open); return; }
    if (t.dataset.taxi) { showTaxi(t.dataset.taxi); return; }
    if (t.dataset.toggleDay != null) {
      togglePlace(t.dataset.id, Number(t.dataset.toggleDay));
      $('#plan-box').outerHTML = planBoxHTML(byId[t.dataset.id]);
      state.dirty = true;
      return;
    }
    if (t.dataset.pick) {
      togglePlace(t.dataset.pick, state.day ?? 0);
      $('#pick-list').innerHTML = pickerListHTML();
      state.dirty = true;
      return;
    }
    if (t.dataset.pickf) {
      if (t.dataset.pickf === 'near' && !(state.pos && inHokkaido(state.pos))) { startWatch(); toast('삿포로에서 위치를 켜면 가까운 순으로 보여요'); return; }
      state.pickF = t.dataset.pickf;
      document.querySelectorAll('[data-pickf]').forEach((b) => b.setAttribute('aria-pressed', b === t));
      $('#pick-list').innerHTML = pickerListHTML();
      return;
    }
    if (t.hasAttribute('data-picker')) { openPicker(); return; }
    if (t.hasAttribute('data-memo-form')) { openMemoForm(); return; }
    if (t.hasAttribute('data-edit')) { state.editing = !state.editing; rerender(); return; }
    if (t.hasAttribute('data-sort-time')) {
      // 시간 없는 항목은 원래 순서대로 맨 뒤에
      const day = plan.days[state.day ?? 0];
      day.sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'));
      savePlan(); rerender(); return;
    }
    if (t.dataset.move) {
      const [d, i] = findItem(t.dataset.move);
      const j = i + Number(t.dataset.dir);
      if (d && j >= 0 && j < d.length) { [d[i], d[j]] = [d[j], d[i]]; savePlan(); rerender(); }
      return;
    }
    if (t.dataset.del) {
      const [d, i] = findItem(t.dataset.del);
      if (d) { d.splice(i, 1); savePlan(); rerender(); toast('일정에서 지웠어요'); }
      return;
    }
    if (t.hasAttribute('data-share')) { sharePlan(); return; }
    if (t.hasAttribute('data-import-rec')) {
      const has = plan.days.some((d) => d.length);
      (has ? askConfirm('지금 일정이 추천 일정으로 바뀌어요. 괜찮으세요?', '바꾸기') : Promise.resolve(true)).then((ok) => {
        if (!ok) return;
        plan.days = recommendedPlan(); savePlan(); state.day = 0; rerender(); toast('추천 일정을 불러왔어요');
      });
      return;
    }
    if (t.dataset.confirm != null) {
      const resolve = confirmResolve;
      confirmResolve = null;
      closeSheet();
      if (resolve) resolve(t.dataset.confirm === '1');
      return;
    }
    if (t.hasAttribute('data-import-accept')) {
      const got = state.pendingImport;
      if (got) {
        plan.days = got.days; savePlan();
        if (got.shop && got.shop.length) { shop = got.shop; saveShop(); }
        state.pendingImport = null;
      }
      state.dirty = true; closeSheet(); toast('받은 일정을 저장했어요 ✓');
      return;
    }
    if (t.hasAttribute('data-clear')) {
      askConfirm('3일 일정을 모두 지울까요?', '모두 지우기', true).then((ok) => {
        if (ok) { plan.days = DAYS.map(() => []); savePlan(); state.editing = false; rerender(); }
      });
      return;
    }
    if (t.hasAttribute('data-close-sheet')) { closeSheet(); return; }
    if (t.dataset.day != null) { state.day = Number(t.dataset.day); renderPlan(state.day); refreshLive(); return; }
    if (t.dataset.cat) { state[t.dataset.key] = t.dataset.cat; renderList(t.dataset.key.replace(/Cat$/, '')); refreshLive(); return; }
    if (t.hasAttribute('data-sort')) {
      if (!state.pos) { startWatch(); toast('내 위치를 켜는 중이에요. 잡히면 다시 눌러 주세요'); return; }
      if (!inHokkaido(state.pos)) { toast('삿포로에 도착하면 가까운 순으로 볼 수 있어요'); return; }
      state.sortNear = !state.sortNear; route(); return;
    }
    if (t.hasAttribute('data-geo')) { startWatch(); return; }
    if (t.dataset.mapf) { state.mapFilter = t.dataset.mapf; applyMapFilter(); return; }
    if (t.dataset.phrase != null) { showPhrase(Number(t.dataset.phrase)); return; }
    if (t.hasAttribute('data-close')) closeSheet();
  });
  document.addEventListener('input', (e) => {
    if (e.target.matches('[data-pickq]')) { state.pickQ = e.target.value; $('#pick-list').innerHTML = pickerListHTML(); }
    if (e.target.matches('[data-note]')) { notes[e.target.dataset.note] = e.target.value; store.set('notes_v1', notes); }
    if (e.target.matches('[data-fx-in]')) {
      const digits = e.target.value.replace(/[^\d]/g, '').slice(0, 9);
      state.fxVal = digits;
      e.target.value = digits ? Number(digits).toLocaleString('ko-KR') : '';
      $('#fx-out').textContent = digits ? fxResult(Number(digits)) : '가격표 숫자를 넣어 보세요'; $('#fx-out').classList.toggle('empty', !digits);
    }
  });
  document.addEventListener('submit', (e) => {
    if (e.target.matches('[data-shop-add]')) {
      e.preventDefault();
      const name = String(new FormData(e.target).get('name') || '').trim();
      if (!name) return;
      shop.push({ uid: newUid(), name, done: false });
      saveShop(); rerenderShop();
      const input = $('[data-shop-add] input');
      if (input) input.focus({ preventScroll: true });
      return;
    }
    if (!e.target.matches('[data-memo-save]')) return;
    e.preventDefault();
    const f = new FormData(e.target);
    const title = String(f.get('title') || '').trim();
    if (!title) return;
    plan.days[state.day ?? 0].push({ uid: newUid(), title, time: String(f.get('time') || ''), memo: String(f.get('memo') || '').trim() });
    savePlan(); state.dirty = true; closeSheet(); toast('메모를 추가했어요');
  });
  document.addEventListener('change', (e) => {
    const sc = e.target.closest('[data-shop-check]');
    if (sc) {
      const item = shop.find((x) => x.uid === sc.dataset.shopCheck);
      if (item) { item.done = sc.checked; saveShop(); rerenderShop(); }
      return;
    }
    const tm = e.target.closest('[data-time]');
    if (tm) { const [d, i] = findItem(tm.dataset.time); if (d) { d[i].time = tm.value; savePlan(); } return; }
    const c = e.target.closest('[data-check]');
    if (!c) return;
    const checks = store.get('checks', {});
    checks[c.dataset.check] = c.checked;
    store.set('checks', checks);
    const hint = $('#sec-weather .sec-hint');
    if (hint) hint.textContent = `${INFO.packing.filter((_, i) => checks[i]).length}/${INFO.packing.length}`;
  });
  // 정보 탭 섹션을 열고 닫으면 기억 (toggle 이벤트는 버블링되지 않아 capture로 받음)
  document.addEventListener('toggle', (e) => {
    const d = e.target;
    if (d.matches && d.matches('details.sec')) setInfoOpen(d.dataset.sec, d.open);
  }, true);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeSheet(); $('#showcard').hidden = true; }
    if (e.key === 'Enter' && e.target.dataset && e.target.dataset.phrase != null) showPhrase(Number(e.target.dataset.phrase));
  });
  $('#sheet-close').addEventListener('click', closeSheet);
  $('#sheet-backdrop').addEventListener('click', closeSheet);

  // 여행기(diary.js)에서 쓰는 공용 도구
  window.APP = { esc, toast, openSheet, closeSheet, askConfirm, byId, haversine };

  // 카톡·네이버 등 앱 안 브라우저에서는 위치·사진 저장이 막히고 저장 공간도 따로라서 기본 브라우저로 안내
  function inAppBanner() {
    const ua = navigator.userAgent;
    const kakao = /KAKAOTALK/i.test(ua);
    const other = /NAVER\(inapp|Instagram|FBAN|FBAV|Line\/|DaumApps|everytimeApp/i.test(ua);
    if (!kakao && !other) return;
    try { if (sessionStorage.getItem('sp_inapp_hide')) return; } catch { /* 무시 */ }
    const isIOS = /iPhone|iPad|iPod/i.test(ua);
    const how = kakao
      ? '아래 버튼을 누르면 휴대폰 기본 브라우저로 열려요.'
      : `오른쪽 위 ${isIOS ? '공유(⋯)' : '메뉴(⋮)'} 버튼 → 「다른 브라우저로 열기」를 눌러 주세요.`;
    const el = document.createElement('div');
    el.className = 'inapp';
    el.innerHTML = `<b>📱 ${isIOS ? 'Safari' : 'Chrome'}에서 열어 주세요</b>
      <p>지금은 ${kakao ? '카카오톡' : '앱'} 안에서 열려 있어서 내 위치·사진 저장이 잘 안 되고, 적어 둔 일정이 따로 저장될 수 있어요. ${how}</p>
      <div class="btn-row">${kakao ? '<button class="btn gold small" data-inapp-open>기본 브라우저로 열기</button>' : ''}<button class="btn small" data-inapp-hide>그냥 볼게요</button></div>`;
    $('#view').before(el);
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-inapp-open]')) location.href = `kakaotalk://web/openExternal?url=${encodeURIComponent(location.href)}`;
      if (e.target.closest('[data-inapp-hide]')) { el.remove(); try { sessionStorage.setItem('sp_inapp_hide', '1'); } catch { /* 무시 */ } }
    });
  }

  // 글씨 크게 보기: 머리글·본문·상세 창·하단 탭까지 키우고(지도는 그대로) 설정은 휴대폰에 기억
  const isBig = () => document.documentElement.classList.contains('big');
  function applyBigText(on) {
    document.documentElement.classList.toggle('big', on);
    setHeaderH();
  }
  function toggleBigText() {
    const on = !isBig();
    store.set('bigText', on);
    applyBigText(on);
    toast(on ? '글씨를 크게 했어요' : '글씨를 원래 크기로 했어요');
    if (/^#\/info/.test(location.hash)) rerender();
  }

  // 긴급: 머리글의 SOS 버튼 → 큰 전화 버튼과 내 위치 보내기를 한 창에
  function openSOS() {
    const calls = [
      { label: '구급차·소방', sub: '119 · 다쳤거나 몸이 아플 때', tel: '119', main: true },
      { label: '경찰', sub: '110 · 도난·분실·사고', tel: '110', main: true },
      { label: '영사콜센터 (24시간)', sub: '+82-2-3210-0404 · 한국어 상담', tel: '+82232100404' },
      { label: '주삿포로 총영사관', sub: '011-218-0288 · 여권 분실', tel: '+81112180288' },
      { label: '호텔', sub: `${HOTEL.phone} · ${HOTEL.name_ko}`, tel: HOTEL.phone.replace(/[^+\d]/g, '').replace(/^0/, '+81') },
    ];
    openSheet(`<div class="d-head"><h2 id="sheet-title">도움이 필요하세요?</h2><p class="d-sub">누르면 바로 전화가 걸려요.</p></div>
      <div class="sos-list">${calls.map((c) => `<a class="sos-call${c.main ? ' main' : ''}" href="tel:${esc(c.tel)}"><b>${esc(c.label)}</b><span>${esc(c.sub)}</span></a>`).join('')}</div>
      <div class="btn-row" style="margin-top:12px">
        <button class="btn primary" data-send-loc>📤 내 위치 보내기</button>
        <button class="btn" data-taxi="hotel">🚕 호텔로 택시</button>
      </div>
      <div class="sos-phrases">
        <button class="phrase-btn" data-sos-phrase="0"><b>助けてください</b><span>도와주세요 · 타스케테 쿠다사이</span></button>
        <button class="phrase-btn" data-sos-phrase="1"><b>救急車を呼んでください</b><span>구급차를 불러 주세요 · 큐-큐-샤오 욘데 쿠다사이</span></button>
      </div>`);
  }
  const SOS_PHRASES = [
    { ja: '助けてください', ko: '도와주세요', rd: '타스케테 쿠다사이' },
    { ja: '救急車を呼んでください', ko: '구급차를 불러 주세요', rd: '큐-큐-샤오 욘데 쿠다사이' },
  ];
  $('#sos-btn').addEventListener('click', openSOS);

  /* ---------------- 시작 ---------------- */
  // 상단 고정 영역(둘러보기 전환 바, 지도)이 헤더 바로 아래에 붙도록 헤더 높이를 기억
  function setHeaderH() { document.documentElement.style.setProperty('--header-h', `${$('.top').offsetHeight}px`); }
  applyBigText(store.get('bigText', false));
  inAppBanner();
  window.addEventListener('resize', setHeaderH);
  route();
  updatePill();
  // 예전에 위치를 허용했으면 자동으로 켜기
  if (store.get('geo', false)) {
    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: 'geolocation' }).then((r) => { if (r.state === 'granted') startWatch(); }).catch(() => {});
    }
  }
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
