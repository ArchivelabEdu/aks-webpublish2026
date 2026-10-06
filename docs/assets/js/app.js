// 수원시의원 아카이브 — 화면 렌더링 (data.js의 window.ARCHIVE 사용)
(function () {
  const { periods, items } = window.ARCHIVE;
  const params = new URLSearchParams(location.search);
  const $ = (sel) => document.querySelector(sel);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const periodOf = (id) => periods.find((p) => p.id === id);
  const portrait = ['신문', '포스터', '선거공보', '문서'];

  // 검색창에 현재 검색어 유지
  const q = (params.get('q') || '').trim();
  document.querySelectorAll('input[name="q"]').forEach((i) => { i.value = q; });

  function highlight(text) {
    const safe = esc(text);
    if (!q) return safe;
    return safe.split(esc(q)).join('<mark>' + esc(q) + '</mark>');
  }

  function card(it) {
    const p = periodOf(it.period);
    const tone = p ? 'tone-' + p.tone : 'tone-none';
    const fit = portrait.includes(it.type) ? ' class="contain"' : '';
    return `<a class="card compact ${tone}" href="item.html?id=${it.id}">
      <div class="img"><img src="assets/img/thumbs/${it.id}.jpg" alt=""${fit} loading="lazy"></div>
      <h3>${highlight(it.title)}</h3>
      <div class="kind">${esc(it.type)}${p ? ' · ' + esc(p.label) : ''}</div>
      <div class="when">${esc(it.date || '—')}</div>
      <div class="where">${highlight(it.holder)}</div>
      <span class="plus">+</span>
    </a>`;
  }

  window.ARCHIVE_UI = { card, esc };

  // ── 홈: 최근 자료 ──
  const latest = $('#latest');
  if (latest) {
    latest.innerHTML = items.filter((i) => i.period).slice().sort((a, b) => b.year - a.year).slice(0, 4).map(card).join('');
  }

  // ── 컬렉션 ──
  const grid = $('#collection');
  if (grid) {
    const period = params.get('period') || '';
    const type = params.get('type') || '';
    const sort = params.get('sort') || 'asc';
    const link = (next) => {
      const u = new URLSearchParams({ q, period, type, sort, ...next });
      [...u.keys()].forEach((k) => { if (!u.get(k)) u.delete(k); });
      const s = u.toString();
      return 'collection.html' + (s ? '?' + s : '');
    };
    const match = (it) => !q || [it.title, it.desc, it.holder, it.type, it.source, it.date, periodOf(it.period)?.label || '']
      .join(' ').toLowerCase().includes(q.toLowerCase());
    const base = items.filter(match);
    const count = (key, val) => base.filter((i) => i[key] === val).length;

    $('#f-period').innerHTML = [`<li><a class="${!period ? 'on' : ''}" href="${link({ period: '' })}">전체 <small>${base.length}</small></a></li>`]
      .concat(periods.map((p) => `<li><a class="${period === p.id ? 'on' : ''}" href="${link({ period: p.id })}">${p.label} <small>${count('period', p.id)}</small></a></li>`)).join('');
    const types = [...new Set(items.map((i) => i.type))];
    $('#f-type').innerHTML = [`<li><a class="${!type ? 'on' : ''}" href="${link({ type: '' })}">전체</a></li>`]
      .concat(types.map((t) => `<li><a class="${type === t ? 'on' : ''}" href="${link({ type: t })}">${t} <small>${count('type', t)}</small></a></li>`)).join('');

    const list = base.filter((i) => (!period || i.period === period) && (!type || i.type === type))
      .sort((a, b) => (a.year - b.year) * (sort === 'asc' ? 1 : -1));

    const p = periodOf(period);
    $('#c-title').textContent = p ? p.label : (q ? `‘${q}’ 검색 결과` : '전체 자료');
    $('#c-desc').textContent = p ? `${p.range} · ${p.desc}` : '사진·신문·포스터·선거공보로 보는 수원 지방의회의 역사';
    const chips = [q && ['q', `검색: ${q}`], p && ['period', p.label], type && ['type', type]].filter(Boolean)
      .map(([k, label]) => `<a class="chip" href="${link({ [k]: '' })}" title="조건 지우기">${esc(label)} ×</a>`).join('');
    $('#c-count').innerHTML = `<span><b>${list.length}</b>건${chips}</span>`;
    const s = $('#c-sort');
    s.value = sort;
    s.addEventListener('change', () => { location.href = link({ sort: s.value }); });

    grid.innerHTML = list.length ? list.map(card).join('')
      : `<p class="empty">조건에 맞는 자료가 없습니다. <a href="collection.html">전체 자료 보기</a></p>`;
    document.title = `${$('#c-title').textContent} — 컬렉션 — 수원시의원 아카이브`;
  }

  // ── 자료 상세 ──
  const detail = $('#item');
  if (detail) {
    const it = items.find((i) => i.id === params.get('id')) || items[0];
    const p = periodOf(it.period);
    document.title = `${it.title} — 수원시의원 아카이브`;
    const rows = [['제목', it.title], ['날짜', it.date || '—'], ['유형', it.type], ['시기', p ? `${p.label} (${p.range})` : '—'],
      ['소장처', it.holder], ['출처', it.source]];
    detail.innerHTML = `
      <div class="item-media">
        <a href="assets/img/items/${it.id}.jpg" target="_blank" rel="noopener"><img src="assets/img/items/${it.id}.jpg" alt="${esc(it.title)}"></a>
      </div>
      <div>
        <div class="eyebrow">${esc(it.type)}${p ? ' · ' + esc(p.label) : ''}</div>
        <h1>${esc(it.title)}</h1>
        <p class="desc">${esc(it.desc)}</p>
        <dl class="meta">${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
        ${it.file ? `<a class="btn solid" href="${it.file}" download>원문 PDF 내려받기 ↓</a>` : ''}
        ${p ? `<a class="btn" href="collection.html?period=${p.id}">${esc(p.label)} 자료 더 보기 →</a>` : ''}
      </div>`;
    $('#crumb').textContent = it.title;
    const rel = items.filter((i) => i.id !== it.id && i.period && i.period === it.period).slice(0, 4);
    $('#related').innerHTML = rel.map(card).join('');
    if (!rel.length) $('#related-block').remove();
  }

  // ── 전시: 목차 활성화, 진행 막대, 등장 효과 ──
  const toc = $('.ex-toc');
  if (toc) {
    const links = [...toc.querySelectorAll('a')];
    const bar = $('.progress');
    const onScroll = () => {
      const h = document.documentElement;
      bar.style.width = (h.scrollTop / (h.scrollHeight - h.clientHeight)) * 100 + '%';
      let cur = links[0];
      links.forEach((a) => { const t = document.querySelector(a.getAttribute('href')); if (t && t.getBoundingClientRect().top < 200) cur = a; });
      links.forEach((a) => a.classList.toggle('on', a === cur));
    };
    addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }
  const reveals = document.querySelectorAll('.reveal');
  if (reveals.length && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -10% 0px' });
    reveals.forEach((r) => io.observe(r));
  } else reveals.forEach((r) => r.classList.add('in'));
})();
