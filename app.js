/* 삿포로 기념일 여행 — 앱 로직 (데이터는 data.js) */
(() => {
  'use strict';

  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
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

  pill.addEventListener('click', () => {
    if (state.geoError && !state.pos) { alert(state.geoError); state.geoError = null; }
    startWatch();
    if (state.pos && inHokkaido(state.pos)) location.hash = '#/map';
  });

  /* ---------------- 공통 조각 ---------------- */
  const catOf = (p) => CATS[p.cat] || { label: '', emoji: '📍' };

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
          ${p.route ? `<span class="tag">🏨 ${esc(p.route.min)}분</span>` : ''}
          ${cw ? `<span class="tag warn">${esc(cw)}</span>` : ''}
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

  /* ---------------- 일정 ---------------- */
  function renderPlan(dayIdx) {
    const cur = currentDayIndex();
    if (dayIdx == null) dayIdx = state.day ?? (cur >= 0 ? cur : 0);
    state.day = dayIdx;
    const day = DAYS[dayIdx];
    const dd = dday();
    const isToday = day.date === todayISO();
    const hm = nowHM();

    let hero;
    if (cur >= 0) {
      const next = DAYS[cur].items.find((it) => it.time && it.time >= hm && it.kind !== 'move');
      hero = `<div class="hero"><h2>${esc(DAYS[cur].label)} · 즐거운 여행 되세요!</h2>
        <p>${next ? `다음 일정 <b>${esc(next.time)}</b> ${esc(next.place ? byId[next.place].name_ko : next.title)}` : '오늘 일정을 모두 마쳤어요. 푹 쉬세요 🌙'}</p>
        <div class="now"><a class="btn gold" href="${gmapsDir(HOTEL, 'transit')}" target="_blank" rel="noopener">🏨 호텔로 돌아가기</a>
        <button class="btn" data-taxi="hotel">🚕 택시에 보여주기</button></div></div>`;
    } else if (dd > 0) {
      hero = `<div class="hero"><h2>여행까지 D-${dd}</h2><p>${esc(TRIP.subtitle)}</p></div>`;
    } else {
      hero = `<div class="hero"><h2>${esc(TRIP.title)}</h2><p>${esc(TRIP.subtitle)}</p></div>`;
    }

    const tabs = DAYS.map((d, i) => `<button class="daytab" role="tab" aria-selected="${i === dayIdx}" data-day="${i}">
        <b>${esc(d.label)}</b><span>${esc(d.dateLabel)}</span></button>`).join('');

    const items = day.items.map((it) => {
      const p = it.place ? byId[it.place] : null;
      const done = isToday && it.time && it.time < hm && day.items.some((x) => x.time && x.time >= hm);
      if (it.kind === 'move') {
        return `<li class="tl-item kind-move${done ? ' done' : ''}"><div class="tl-time">${esc(it.time || '')}</div><div class="tl-dot"></div>
          <div class="tl-body"><div class="tl-move">${it.text}</div></div></li>`;
      }
      const cw = p ? closedWarn(p, day.date) : '';
      const title = it.title || (p && p.name_ko) || '';
      const sub = it.text || (p && p.desc) || '';
      const kind = it.kind || (p ? p.type : 'sight');
      const tag = p ? `<span class="tl-meta">${it.alt ? `<span class="tag">대안: ${it.alt.map((a) => esc(byId[a].name_ko)).join(', ')}</span>` : ''}${cw ? `<span class="tag warn">${cw}</span>` : ''}<span class="tag dist" data-dist="${esc(p.id)}" hidden></span></span>` : '';
      const inner = `<h3>${esc(title)}</h3>${sub ? `<p>${esc(sub)}</p>` : ''}${tag}`;
      return `<li class="tl-item kind-${esc(kind)}${done ? ' done' : ''}"><div class="tl-time">${esc(it.time || '')}</div><div class="tl-dot"></div>
        <div class="tl-body">${p ? `<button type="button" class="tl-card" data-open="${esc(p.id)}">${inner}</button>` : `<div class="tl-card" style="cursor:default">${inner}</div>`}</div></li>`;
    }).join('');

    view.innerHTML = `<div id="near-slot">${nearBannerHTML()}</div>${hero}
      <div class="daytabs" role="tablist">${tabs}</div>
      <div class="day-head"><h2>${esc(day.title)}</h2><p>${esc(day.summary)}</p></div>
      <ol class="timeline">${items}</ol>
      ${day.note ? `<div class="tip">${day.note}</div>` : ''}`;
  }

  /* ---------------- 목록 ---------------- */
  function renderList(type) {
    const isFood = type === 'food';
    const key = isFood ? 'foodCat' : 'sightCat';
    const cats = Object.entries(CATS).filter(([, c]) => c.type === type);
    let list = PLACES.filter((p) => p.type === type);
    const sel = state[key];
    if (sel === 'otaru') list = list.filter((p) => p.area === '오타루');
    else if (sel !== 'all') list = list.filter((p) => p.cat === sel);
    const canSort = state.pos && inHokkaido(state.pos);
    if (state.sortNear && canSort) list = [...list].sort((a, b) => haversine(state.pos, a) - haversine(state.pos, b));

    const chips = [['all', '전체'], ...cats.map(([k, c]) => [k, `${c.emoji} ${c.label}`]), ['otaru', '🚃 오타루']]
      .map(([k, l]) => `<button class="chip" aria-pressed="${sel === k}" data-cat="${k}" data-key="${key}">${esc(l)}</button>`).join('');

    view.innerHTML = `<div id="near-slot">${nearBannerHTML()}</div>
      <div class="filters">${chips}</div>
      <div class="sortbar"><span>${list.length}곳 · 🏨 = 호텔에서 걸리는 시간</span>
        <button data-sort>${state.sortNear && canSort ? '추천순으로' : '📍 가까운 순'}</button></div>
      <div class="plist">${list.map(placeCard).join('')}</div>`;
  }

  /* ---------------- 정보 ---------------- */
  function routeOption(o) {
    return `<div class="card opt${o.rec ? ' rec' : ''}">
      <h3>${o.rec ? '⭐ ' : ''}${esc(o.title)}</h3>
      <div class="route-sum" style="margin-top:8px">${o.min ? `<span class="tag">⏱ ${esc(o.min)}</span>` : ''}${o.fare ? `<span class="tag">💴 ${esc(o.fare)}</span>` : ''}</div>
      <ol class="route-steps">${o.steps.map((s) => `<li>${s}</li>`).join('')}</ol>
      ${o.note ? `<div class="tip">${o.note}</div>` : ''}
    </div>`;
  }

  function renderInfo() {
    const h = HOTEL;
    const checks = store.get('checks', {});
    view.innerHTML = `
      <h2 class="section-title">🏨 호텔</h2>
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
      </div>

      <h2 class="section-title">📞 미리 예약할 곳</h2>
      <div class="card stack">${INFO.reservations.map((r) => {
        const p = byId[r.place];
        return `<div style="display:flex;gap:12px;align-items:center">
          <div style="flex:1;min-width:0"><b>${esc(p.name_ko)}</b><div class="small muted">${esc(r.when)} · ${esc(r.note)}</div></div>
          <button class="btn small" data-open="${esc(p.id)}">예약 방법</button></div>`;
      }).join('')}</div>

      <h2 class="section-title">✈️ 공항 → 호텔 (도착일)</h2>
      <div class="stack">${AIRPORT.to.map(routeOption).join('')}</div>

      <h2 class="section-title">🛫 호텔 → 공항 (귀국일)</h2>
      <div class="stack">${AIRPORT.from.map(routeOption).join('')}</div>

      <h2 class="section-title">🧥 날씨·준비물</h2>
      <div class="card stack">
        <p style="margin:0">${INFO.weather}</p>
        <div class="checklist">${INFO.packing.map((x, i) => `<label><input type="checkbox" data-check="${i}" ${checks[i] ? 'checked' : ''}><span>${esc(x)}</span></label>`).join('')}</div>
      </div>

      <h2 class="section-title">💡 알아두면 좋은 것</h2>
      <div class="card"><ul style="margin:0;padding-left:20px" class="stack">${INFO.tips.map((t) => `<li>${t}</li>`).join('')}</ul></div>

      <h2 class="section-title">🗣 일본어 한마디 <span class="small muted">(누르면 크게 보여요)</span></h2>
      <div class="card" style="padding:4px 16px">${INFO.phrases.map((p, i) => `<div class="phrase" data-phrase="${i}" role="button" tabindex="0">
        <span class="ko">${esc(p.ko)}</span><span class="ja">${esc(p.ja)}</span><span class="rd">${esc(p.rd)}</span></div>`).join('')}</div>

      <h2 class="section-title">🚨 긴급 연락처</h2>
      <div class="card"><dl class="facts">${INFO.emergency.map((e) => `<dt>${esc(e.label)}</dt><dd>${e.tel ? `<a href="tel:${esc(e.tel)}">${esc(e.value)}</a>` : esc(e.value)}</dd>`).join('')}</dl></div>
      <p class="small muted" style="margin-top:20px">영업시간·휴무일은 ${esc(TRIP.checked)} 기준으로 조사한 정보예요. 출발 전 구글맵에서 한 번 더 확인해 주세요.</p>`;
  }

  /* ---------------- 상세 시트 ---------------- */
  function liveBoxHTML(p) {
    let body;
    if (!state.pos) {
      body = state.geoError
        ? `<p style="margin:0">${esc(state.geoError)}</p>`
        : `<p style="margin:0">내 위치를 켜면 여기서부터 거리와 걸리는 시간을 알려드려요.</p>
           <button class="btn primary" data-geo style="margin-top:10px;width:100%">📍 내 위치 켜기</button>`;
    } else if (!inHokkaido(state.pos)) {
      body = `<p style="margin:0">지금은 삿포로 밖이라 거리를 계산하지 않아요. 현지에 도착하면 자동으로 보여요.</p>`;
    } else {
      const d = haversine(state.pos, p);
      body = `<div class="big">${fmtDist(d)}</div>
        <p style="margin:2px 0 0">${d < 1500 ? `걸어서 약 ${walkMin(d)}분이에요. 걸어가셔도 좋아요.` : d < 4000 ? `걸으면 ${walkMin(d)}분쯤 — 지하철·전차나 택시를 추천해요.` : '대중교통이나 택시로 이동하세요.'}</p>
        <p class="small muted" style="margin:4px 0 0">직선거리 기준 · 위치 정확도 ±${Math.round(state.pos.acc)}m</p>`;
    }
    return `<div class="card live-box stack" id="live-box" data-id="${esc(p.id)}">
      <div class="small" style="font-weight:700;color:var(--blue)">지금 내 위치에서</div>
      ${body}
      <div class="btn-row">
        <a class="btn primary" href="${gmapsDir(p, 'transit')}" target="_blank" rel="noopener">🚇 대중교통 길찾기</a>
        <a class="btn" href="${gmapsDir(p, 'walking')}" target="_blank" rel="noopener">🚶 도보 길찾기</a>
      </div>
    </div>`;
  }

  function openPlace(id) {
    const p = byId[id];
    if (!p) return;
    const isHotel = p.id === 'hotel';
    const c = catOf(p);
    const cw = closedWarn(p);
    const r = p.route;
    const fromLabel = p.from === 'otaru' ? '오타루역에서 가는 법' : '호텔에서 가는 법';
    $('#sheet-body').innerHTML = `
      <div class="d-head ${esc(p.type)}">
        <div class="cat">${c.emoji} ${esc(c.label)} · ${esc(p.area || '')}</div>
        <h2 id="sheet-title">${esc(p.name_ko)}</h2>
        <div class="ja">${esc(p.name_ja)}</div>
        ${p.desc ? `<p class="d-desc">${esc(p.desc)}</p>` : ''}
        ${cw ? `<div class="tl-meta"><span class="tag warn">⚠ ${esc(cw)}</span></div>` : ''}
      </div>
      <div class="stack" style="margin-top:16px">
        ${liveBoxHTML(p)}
        ${r ? `<div class="card">
          <h3 style="font-size:17px;margin-bottom:10px">🏨 ${fromLabel}</h3>
          <div class="route-sum">${r.min ? `<span class="tag">⏱ 약 ${esc(r.min)}분</span>` : ''}${r.fare ? `<span class="tag">💴 ${esc(r.fare)}</span>` : ''}${r.taxi ? `<span class="tag">🚕 ${esc(r.taxi)}</span>` : ''}</div>
          <ol class="route-steps">${r.steps.map((s) => `<li>${s}</li>`).join('')}</ol>
          ${p.from !== 'otaru' && !isHotel ? `<a class="btn small" href="${gmapsDir(p, 'transit', true)}" target="_blank" rel="noopener">구글맵으로 호텔→여기 경로 보기</a>` : ''}
        </div>` : ''}
        <div class="card"><dl class="facts">
          ${p.menu ? `<dt>추천 메뉴</dt><dd>${esc(p.menu)}</dd>` : ''}
          ${p.price ? `<dt>예산</dt><dd>${esc(p.price)}</dd>` : ''}
          ${p.hours ? `<dt>영업시간</dt><dd>${esc(p.hours)}</dd>` : ''}
          ${p.closed ? `<dt>휴무</dt><dd>${esc(p.closed)}</dd>` : ''}
          ${p.fee ? `<dt>요금</dt><dd>${esc(p.fee)}</dd>` : ''}
          ${p.stay ? `<dt>머무는 시간</dt><dd>${esc(p.stay)}</dd>` : ''}
          ${p.reserve ? `<dt>예약</dt><dd>${p.reserve}</dd>` : ''}
          ${p.address ? `<dt>주소</dt><dd>${esc(p.address)}</dd>` : ''}
          ${p.phone ? `<dt>전화</dt><dd><a href="tel:${esc(p.phone.replace(/[^+\d]/g, ''))}">${esc(p.phone)}</a></dd>` : ''}
        </dl></div>
        ${p.tip ? `<div class="tip">💡 ${p.tip}</div>` : ''}
        <div class="btn-row">
          <button class="btn" data-taxi="${esc(p.id)}">🚕 택시에 보여주기</button>
          <a class="btn" href="#/map?focus=${esc(p.id)}" data-close>🗺 지도에서 보기</a>
          <a class="btn wide" href="${gmapsPlace(p)}" target="_blank" rel="noopener">구글맵에서 리뷰·사진 보기</a>
        </div>
      </div>`;
    $('#sheet').hidden = false;
    $('#sheet-backdrop').hidden = false;
    $('#sheet').scrollTop = 0;
    document.body.style.overflow = 'hidden';
    $('#sheet-close').focus();
  }
  function closeSheet() {
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
    map = L.map('map', { zoomControl: false }).setView([HOTEL.lat, HOTEL.lng], 14);
    L.control.zoom({ position: 'bottomleft' }).addTo(map);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, subdomains: 'abc',
      attribution: '&copy; OpenStreetMap',
    }).addTo(map);
    for (const p of [HOTEL, ...PLACES]) {
      const kind = p.id === 'hotel' ? 'hotel' : p.type;
      const icon = L.divIcon({ className: '', html: `<div class="pin ${kind}"><span>${p.id === 'hotel' ? '🏨' : catOf(p).emoji}</span></div>`, iconSize: [34, 34], iconAnchor: [17, 34], popupAnchor: [0, -30] });
      const m = L.marker([p.lat, p.lng], { icon, zIndexOffset: p.id === 'hotel' ? 1000 : 0 }).addTo(map);
      m.bindPopup(() => `<b>${esc(p.name_ko)}</b><div class="small muted">${esc(p.name_ja)}</div>
        <div class="small" data-dist="${esc(p.id)}">${esc(distLabel(p))}</div>
        <div class="pop-actions"><button class="btn small primary" data-open="${esc(p.id)}">자세히</button>
        <a class="btn small" href="${gmapsDir(p, 'transit')}" target="_blank" rel="noopener">길찾기</a></div>`);
      markers[p.id] = { m, p };
    }
    $('#map-chips').innerHTML = [['all', '전체'], ['food', '🍣 맛집'], ['sight', '⛩ 명소'], ['otaru', '🚃 오타루']]
      .map(([k, l]) => `<button class="chip" data-mapf="${k}" aria-pressed="${state.mapFilter === k}">${l}</button>`).join('');
    applyMapFilter();
    updateMeMarker();
  }
  function applyMapFilter() {
    const f = state.mapFilter;
    for (const { m, p } of Object.values(markers)) {
      const show = p.id === 'hotel' || f === 'all' || (f === 'otaru' ? p.area === '오타루' : p.type === f);
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
    else if (state.pos) { alert('지금은 삿포로 밖이에요. 호텔 위치를 보여드릴게요.'); map.setView([HOTEL.lat, HOTEL.lng], 15); }
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
  const titles = { plan: '삿포로 2박 3일', map: '지도', food: '맛집', sights: '가볼 만한 곳', info: '여행 정보' };
  function route() {
    const raw = location.hash.replace(/^#\/?/, '') || 'plan';
    const [path, query] = raw.split('?');
    const [tab, arg] = path.split('/');
    const params = new URLSearchParams(query || '');
    document.querySelectorAll('.tabbar a').forEach((a) => a.classList.toggle('active', a.dataset.tab === tab));
    $('#page-title').textContent = titles[tab] || titles.plan;
    if (tab === 'map') { showMap(params.get('focus')); refreshLive(); return; }
    $('#map-wrap').hidden = true;
    view.hidden = false;
    if (tab === 'food') renderList('food');
    else if (tab === 'sights') renderList('sight');
    else if (tab === 'info') renderInfo();
    else renderPlan(arg != null ? Number(arg) : null);
    refreshLive();
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', () => { closeSheet(); route(); });

  /* ---------------- 이벤트 위임 ---------------- */
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-open],[data-taxi],[data-day],[data-cat],[data-sort],[data-geo],[data-mapf],[data-phrase],[data-close]');
    if (!t) return;
    if (t.dataset.open) { openPlace(t.dataset.open); return; }
    if (t.dataset.taxi) { showTaxi(t.dataset.taxi); return; }
    if (t.dataset.day != null) { state.day = Number(t.dataset.day); renderPlan(state.day); refreshLive(); return; }
    if (t.dataset.cat) { state[t.dataset.key] = t.dataset.cat; renderList(t.dataset.key === 'foodCat' ? 'food' : 'sight'); refreshLive(); return; }
    if (t.hasAttribute('data-sort')) {
      if (!state.pos) { startWatch(); alert('내 위치를 켜는 중이에요. 위치가 잡히면 다시 눌러 주세요.'); return; }
      if (!inHokkaido(state.pos)) { alert('삿포로에 도착하면 가까운 순으로 볼 수 있어요.'); return; }
      state.sortNear = !state.sortNear; route(); return;
    }
    if (t.hasAttribute('data-geo')) { startWatch(); return; }
    if (t.dataset.mapf) { state.mapFilter = t.dataset.mapf; applyMapFilter(); return; }
    if (t.dataset.phrase != null) { showPhrase(Number(t.dataset.phrase)); return; }
    if (t.hasAttribute('data-close')) closeSheet();
  });
  document.addEventListener('change', (e) => {
    const c = e.target.closest('[data-check]');
    if (!c) return;
    const checks = store.get('checks', {});
    checks[c.dataset.check] = c.checked;
    store.set('checks', checks);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeSheet(); $('#showcard').hidden = true; }
    if (e.key === 'Enter' && e.target.dataset && e.target.dataset.phrase != null) showPhrase(Number(e.target.dataset.phrase));
  });
  $('#sheet-close').addEventListener('click', closeSheet);
  $('#sheet-backdrop').addEventListener('click', closeSheet);

  /* ---------------- 시작 ---------------- */
  const dd = dday();
  $('#dday').textContent = dd > 0 ? `결혼기념일 여행 · D-${dd}` : currentDayIndex() >= 0 ? `결혼기념일 여행 · ${DAYS[currentDayIndex()].label}` : '결혼기념일 여행';
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
