// 자연어 질문 → SPARQL 변환 검색 (규칙 기반, 서버 없이 브라우저에서 실행)
import init, * as oxigraph from 'https://cdn.jsdelivr.net/npm/oxigraph@0.5.11/web.js';

const A = window.ARCHIVE;
const { card, esc } = window.ARCHIVE_UI;
const BASE = 'https://archivelabedu.github.io/aks-webpublish2026/id/';
const PREFIXES = `PREFIX id: <${BASE}>
PREFIX sca: <${BASE}vocab#>
PREFIX foaf: <http://xmlns.com/foaf/0.1/>
PREFIX dcterms: <http://purl.org/dc/terms/>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
PREFIX schema: <https://schema.org/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
`;

const bodyOf = (id) => A.bodies.find((b) => b.id === id);
const careerOf = (id) => A.careers.find((c) => c.id === id);
const periodOf = (id) => A.periods.find((p) => p.id === id);
const siYear = (t) => bodyOf('si').terms[t];

// 의회 경력 'si:4' → { body, term, year, label }
function membership(code) {
  const [body, n] = code.split(':');
  if (body === 'si') return { body, term: +n, year: siYear(n), label: `제${n}대 수원시의회 (${siYear(n)})` };
  return { body, year: +n, label: `${n}년 ${bodyOf(body).label}` };
}
const periodOfPerson = (p) => {
  const m = membership(p.m[0]);
  return m.body !== 'si' ? 'colonial' : m.term <= 3 ? 'liberation' : 'revival';
};

// ── 1. data.js → RDF(Turtle) ──────────────────────────
const lit = (s) => '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n') + '"';
function buildTurtle() {
  const t = [PREFIXES.replace(/PREFIX (\S+) (<[^>]+>)/g, '@prefix $1 $2 .')];
  t.push(`<${BASE}career> a skos:ConceptScheme ; skos:prefLabel ${lit('수원 지방의원 경력 분류')}@ko .`);
  A.careers.forEach((c) => t.push(`id:career-${c.id} a skos:Concept ; skos:inScheme <${BASE}career> ; skos:prefLabel ${lit(c.label)}@ko${c.broader ? ` ; skos:broader id:career-${c.broader}` : ''} .`));
  A.periods.forEach((p) => t.push(`id:period-${p.id} a skos:Concept ; skos:prefLabel ${lit(p.label)}@ko ; sca:range ${lit(p.range)} .`));
  A.bodies.forEach((b) => t.push(`id:body-${b.id} a sca:Council ; rdfs:label ${lit(b.label)}@ko .`));
  A.people.forEach((p) => {
    const s = [`id:${p.id} a foaf:Person`, `foaf:name ${lit(p.name)}`, `dcterms:description ${lit(p.desc)}`,
      `sca:period id:period-${periodOfPerson(p)}`, `dcterms:source ${lit('『수원시의원으로 살다』 ' + p.page + '쪽')}`];
    if (p.gender) s.push(`foaf:gender ${lit(p.gender)}`);
    (p.c || []).forEach((c) => s.push(`sca:career id:career-${c}`));
    if (p.parent) s.push(`schema:parent id:${p.parent}`);
    if (p.sibling) s.push(`schema:sibling id:${p.sibling}`);
    p.m.forEach((code) => {
      const m = membership(code);
      s.push(`sca:membership [ sca:body id:body-${m.body} ; sca:year ${m.year}${m.term ? ` ; sca:term ${m.term}` : ''} ; rdfs:label ${lit(m.label)} ]`);
    });
    t.push(s.join(' ;\n  ') + ' .');
    if (p.sibling) t.push(`id:${p.sibling} schema:sibling id:${p.id} .`);
  });
  A.items.forEach((it) => {
    const s = [`id:${it.id} a sca:Item`, `dcterms:title ${lit(it.title)}`, `dcterms:type ${lit(it.type)}`,
      `dcterms:rightsHolder ${lit(it.holder)}`, `dcterms:source ${lit(it.source)}`, `dcterms:description ${lit(it.desc)}`, `sca:year ${it.year}`];
    if (it.date) s.push(`dcterms:date ${lit(it.date)}`);
    if (it.period) s.push(`sca:period id:period-${it.period}`);
    A.people.filter((p) => (p.items || []).includes(it.id)).forEach((p) => s.push(`dcterms:subject id:${p.id}`));
    t.push(s.join(' ;\n  ') + ' .');
  });
  return t.join('\n\n') + '\n';
}

// ── 2. 자연어 해석 ────────────────────────────────────
const CAREER_WORDS = [
  [/지주/, 'landlord'], [/자산가|사업가|기업가|부호|부유|상인|실업가|경영/, 'asset'], [/농업|농민|농사/, 'farming'],
  [/의사/, 'doctor'], [/교사|선생/, 'teacher'], [/전문직/, 'professional'],
  [/경찰/, 'police'], [/동장/, 'dongjang'], [/군인|군 출신|장교|군대/, 'military'], [/관료|공무원|공직|관리 출신/, 'official'],
  [/우익|청년단/, 'rightwing'], [/관변|새마을/, 'govorg'],
  [/여당|자유당|공화당|민자당/, 'ruling'], [/야당|민주당|신민당|평민당/, 'opposition'],
  [/노동|노조/, 'labor'], [/시민운동|시민단체|경실련/, 'civic'], [/사회운동|운동가/, 'movement']
];
const TYPE_WORDS = [[/사진/, '사진'], [/신문|기사/, '신문'], [/포스터/, '포스터'], [/선거공보|공보/, '선거공보'], [/문서|원문|pdf/i, '문서']];
const PERIOD_WORDS = [[/식민지|일제|강점기/, 'colonial'], [/해방|전쟁|이승만|4·19/, 'liberation'], [/부활|민주화 이후/, 'revival']];
const ITEM_CUES = /자료|사진|이미지|기사|신문|포스터|공보|문서|원문|소장|기록/;
const PERSON_CUES = /누구|누가|인물|사람|의원|출신|경력|명단/;
const STOP = new Set(['관련', '있는', '있나요', '어떤', '무엇', '모든', '전체', '목록', '주세요', '대한', '누구', '누구야', '누구인가', '자료', '의원', '시의원', '인물', '사람', '경우', '출신']);

export function parse(input) {
  const q = input.trim();
  const r = { q, names: [], terms: [], bodies: [], careers: [], periods: [], types: [], holders: [], gender: null, relation: null, from: null, to: null };
  let rest = q;

  // 인물 이름 (긴 이름부터)
  [...A.people].sort((a, b) => b.name.length - a.name.length).forEach((p) => {
    if (rest.includes(p.name)) { r.names.push(p.name); rest = rest.split(p.name).join(' '); }
  });
  // 관계
  if (/부자|아버지|아들|부친/.test(rest)) r.relation = 'parent';
  else if (/형제|동생|형님|형이/.test(rest)) r.relation = 'sibling';
  else if (/가족|친척|집안/.test(rest)) r.relation = 'any';
  // 의회 대수: 초대, 제4대, 4·5대, 5~7대
  if (/초대/.test(rest)) r.terms.push(1);
  rest.replace(/제?\s*(\d{1,2})\s*(?:[·,~\-]\s*(\d{1,2})\s*)?대(?!\s*학)/g, (_, a, b) => {
    const from = +a, to = b ? +b : from;
    const list = /~|-/.test(_) ? Array.from({ length: to - from + 1 }, (__, i) => from + i) : [from, to];
    list.forEach((n) => { if (siYear(n) && !r.terms.includes(n)) r.terms.push(n); });
    return '';
  });
  // 의회 종류
  if (/면협/.test(rest)) r.bodies.push('myeon');
  if (/읍회|읍의원/.test(rest)) r.bodies.push('eup');
  // 연도·연대
  const dec = rest.match(/(\d{4})\s*년대/);
  const yr = rest.match(/(\d{4})\s*년(?!대)/) || (!dec && rest.match(/\b(1[89]\d\d|20[0-2]\d)\b/));
  if (dec) { r.from = +dec[1]; r.to = +dec[1] + 9; }
  else if (yr) { r.from = r.to = +yr[1]; }
  if (r.from && /이후|부터|以後/.test(rest)) r.to = null;
  if (r.to && /이전|까지|전에/.test(rest)) { r.from = null; }
  // 시기
  PERIOD_WORDS.forEach(([re, id]) => { if (re.test(rest)) r.periods.push(id); });
  // 경력 (하위 개념과 상위 개념이 함께 잡히면 하위만 남긴다)
  CAREER_WORDS.forEach(([re, id]) => { if (re.test(rest) && !r.careers.includes(id)) r.careers.push(id); });
  // 성별
  if (/여성|여자|여의원/.test(rest)) r.gender = 'female';
  // 자료 유형·소장처
  TYPE_WORDS.forEach(([re, t]) => { if (re.test(rest)) r.types.push(t); });
  [...new Set(A.items.map((i) => i.holder))].forEach((h) => { if (rest.includes(h.replace(/[『』]/g, ''))) r.holders.push(h); });

  // 무엇을 찾는가: 인물 / 자료
  const personish = r.names.length || r.terms.length || r.bodies.length || r.careers.length || r.gender || r.relation;
  if (ITEM_CUES.test(rest) || r.types.length || r.holders.length) r.target = 'items';
  else if (personish || PERSON_CUES.test(rest)) r.target = 'people';
  else if (r.from || r.periods.length) r.target = 'items';
  else r.target = 'text';

  // 남는 낱말 → 전문 검색용 키워드
  r.keywords = rest.replace(/[?!.,"'“”‘’()]/g, ' ').split(/\s+/)
    .map((w) => w.replace(/(에서|으로|에게|이랑|하고|이란|와|과|은|는|이|가|을|를|의|에|로|도|만)$/, ''))
    .filter((w) => w.length >= 2 && !STOP.has(w) && !/^(보여|찾아|알려|검색해)/.test(w));
  return r;
}

// 해석 결과를 사람이 읽는 조건 목록으로
function describe(r) {
  const out = [['대상', { people: '인물', items: '자료', text: '전체 텍스트' }[r.target]]];
  r.names.forEach((n) => out.push(['인물', n]));
  if (r.relation) out.push(['관계', { parent: '부자(父子)', sibling: '형제', any: '가족 관계' }[r.relation]]);
  if (r.terms.length) out.push(['의회', r.terms.map((t) => `제${t}대`).join(', ') + ' 수원시의회']);
  r.bodies.forEach((b) => out.push(['의회', bodyOf(b).label]));
  r.careers.forEach((c) => {
    const kids = A.careers.filter((k) => k.broader === c).map((k) => k.label);
    out.push(['경력', careerOf(c).label + (kids.length ? ` (하위 포함: ${kids.join('·')})` : '')]);
  });
  if (r.gender) out.push(['성별', '여성']);
  r.periods.forEach((p) => out.push(['시기', periodOf(p).label]));
  if (r.from || r.to) out.push(['연도', `${r.from ?? ''}${r.from === r.to ? '' : '–' + (r.to ?? '')}`]);
  r.types.forEach((t) => out.push(['유형', t]));
  r.holders.forEach((h) => out.push(['소장처', h]));
  if (r.target === 'text' && r.keywords.length) out.push(['키워드', r.keywords.join(', ')]);
  return out;
}

// ── 3. SPARQL 생성 ────────────────────────────────────
const yearFilter = (v, r) => [r.from && `${v} >= ${r.from}`, r.to && `${v} <= ${r.to}`].filter(Boolean).join(' && ');

// 인물 조건 (?person 기준)
function personPatterns(r, v = '?person') {
  const w = [];
  if (r.names.length) w.push(`${v} foaf:name ?pname . VALUES ?pname { ${r.names.map(lit).join(' ')} }`);
  if (r.terms.length || r.bodies.length || ((r.from || r.to) && r.target === 'people')) {
    w.push(`${v} sca:membership ?m .`);
    if (r.terms.length) w.push(`?m sca:body id:body-si ; sca:term ?term . FILTER(?term IN (${r.terms.join(', ')}))`);
    if (r.bodies.length) w.push(`?m sca:body ?body . VALUES ?body { ${r.bodies.map((b) => 'id:body-' + b).join(' ')} }`);
    if ((r.from || r.to) && r.target === 'people') w.push(`?m sca:year ?myear . FILTER(${yearFilter('?myear', r)})`);
  }
  r.careers.forEach((c) => w.push(`${v} sca:career/skos:broader* id:career-${c} .  # ${careerOf(c).label}`));
  if (r.gender) w.push(`${v} foaf:gender "female" .`);
  if (r.periods.length && r.target === 'people') w.push(`${v} sca:period ?period . VALUES ?period { ${r.periods.map((p) => 'id:period-' + p).join(' ')} }`);
  return w;
}

export function toSparql(r) {
  if (r.target === 'items') {
    const w = ['?item a sca:Item ; dcterms:title ?title ; dcterms:type ?type ; dcterms:rightsHolder ?holder ; sca:year ?year .'];
    if (r.types.length) w.push(`VALUES ?type { ${r.types.map(lit).join(' ')} }`);
    if (r.holders.length) w.push(`VALUES ?holder { ${r.holders.map(lit).join(' ')} }`);
    if (r.periods.length) w.push(`?item sca:period ?period . VALUES ?period { ${r.periods.map((p) => 'id:period-' + p).join(' ')} }`);
    if (r.from || r.to) w.push(`FILTER(${yearFilter('?year', r)})`);
    const pp = personPatterns(r);
    if (pp.length) w.push('?item dcterms:subject ?person .', ...pp);
    return `${PREFIXES}
# 자료 검색: “${r.q}”
SELECT DISTINCT ?item ?title ?type ?year ?holder WHERE {
  ${w.join('\n  ')}
}
ORDER BY ?year ?title`;
  }

  if (r.target === 'people') {
    const w = personPatterns(r);
    if (r.relation) {
      const rel = [];
      if (r.relation !== 'sibling') rel.push('{ ?person schema:parent ?other . BIND("아들" AS ?relation) }', '{ ?other schema:parent ?person . BIND("아버지" AS ?relation) }');
      if (r.relation !== 'parent') rel.push('{ ?person schema:sibling ?other . BIND("형제" AS ?relation) }');
      w.push(rel.join('\n  UNION '), '?other foaf:name ?otherName .');
    }
    return `${PREFIXES}
# 인물 검색: “${r.q}”
SELECT ?person ?name (MIN(?y) AS ?first)
       (GROUP_CONCAT(DISTINCT ?council; separator=" / ") AS ?councils)
       (GROUP_CONCAT(DISTINCT ?careerLabel; separator=", ") AS ?careers)${r.relation ? '\n       (SAMPLE(?relation) AS ?rel) (SAMPLE(?otherName) AS ?relName)' : ''}
WHERE {
  ?person a foaf:Person ; foaf:name ?name .
  ${w.join('\n  ')}
  OPTIONAL { ?person sca:membership ?mm . ?mm rdfs:label ?council ; sca:year ?y }
  OPTIONAL { ?person sca:career ?cc . ?cc skos:prefLabel ?careerLabel }
}
GROUP BY ?person ?name
ORDER BY ?first ?name`;
  }

  // 전문 검색: 인물과 자료의 이름·제목·설명에서 키워드 찾기
  const kw = r.keywords.length ? r.keywords : [r.q];
  const f = (vars) => kw.map((k) => vars.map((v) => `CONTAINS(${v}, ${lit(k)})`).join(' || ')).join(' || ');
  return `${PREFIXES}
# 전문 검색: “${r.q}”
SELECT DISTINCT ?item ?person WHERE {
  { ?item a sca:Item ; dcterms:title ?t ; dcterms:description ?d ; dcterms:rightsHolder ?h .
    FILTER(${f(['?t', '?d', '?h'])}) }
  UNION
  { ?person a foaf:Person ; foaf:name ?n ; dcterms:description ?d .
    FILTER(${f(['?n', '?d'])}) }
}`;
}

// ── 4. 실행과 화면 ─────────────────────────────────────
const $ = (s) => document.querySelector(s);
const local = (term) => term && term.value.startsWith(BASE) ? term.value.slice(BASE.length) : null;

function personCard(p, row) {
  const careers = (p.c || []).map((c) => `<span class="tag">${esc(careerOf(c).label)}</span>`).join('');
  const rel = row.get('rel') ? `<p class="rel">${esc(row.get('relName').value)}의 ${esc(row.get('rel').value)}</p>` : '';
  const items = (p.items || []).map((id) => `<a href="item.html?id=${id}" title="${esc(A.items.find((i) => i.id === id).title)}"><img src="assets/img/thumbs/${id}.jpg" alt="" loading="lazy"></a>`).join('');
  const per = periodOf(periodOfPerson(p));
  return `<article class="person tone-${per.tone}">
    <div class="eyebrow">${esc(per.label)}${p.gender === 'female' ? ' · 여성' : ''}</div>
    <h3><a href="search.html?q=${encodeURIComponent(p.name)}">${esc(p.name)}</a></h3>
    ${rel}
    <p class="councils">${p.m.map((c) => esc(membership(c).label)).join(' · ')}</p>
    <p class="pdesc">${esc(p.desc)}</p>
    <div class="tags">${careers}</div>
    ${items ? `<div class="pitems">${items}</div>` : ''}
    <p class="psrc">출처: 『수원시의원으로 살다』 ${esc(p.page)}쪽</p>
  </article>`;
}

function render(rows) {
  const out = $('#results');
  if (!rows.length) { out.innerHTML = '<p class="empty">결과가 없습니다. 아래 예시 질문을 눌러 보거나 SPARQL을 직접 고쳐 보세요.</p>'; return 0; }
  const vars = [...rows[0].keys()];
  const people = rows.filter((r) => local(r.get('person'))).map((r) => [A.people.find((p) => p.id === local(r.get('person'))), r]).filter(([p]) => p);
  const items = rows.filter((r) => local(r.get('item'))).map((r) => A.items.find((i) => i.id === local(r.get('item')))).filter(Boolean);
  let html = '';
  if (people.length) html += `<h2 class="rhead">인물 <b>${people.length}</b></h2><div class="people">${people.map(([p, r]) => personCard(p, r)).join('')}</div>`;
  if (items.length) html += `<h2 class="rhead">자료 <b>${items.length}</b></h2><div class="cards four">${items.map(card).join('')}</div>`;
  if (!people.length && !items.length) {
    html = `<div class="table-wrap"><table><thead><tr>${vars.map((v) => `<th>?${esc(v)}</th>`).join('')}</tr></thead><tbody>${
      rows.map((r) => `<tr>${vars.map((v) => `<td>${r.get(v) ? esc(r.get(v).value) : ''}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }
  out.innerHTML = html;
  return people.length + items.length || rows.length;
}

let store;
function run(sparql) {
  const status = $('#status');
  try {
    const t0 = performance.now();
    const res = store.query(sparql);
    if (!Array.isArray(res)) { $('#results').innerHTML = `<pre class="raw">${esc(typeof res === 'boolean' ? String(res) : res)}</pre>`; status.textContent = '질의를 실행했습니다.'; return; }
    const n = render(res);
    status.textContent = `결과 ${n}건 · ${(performance.now() - t0).toFixed(0)}ms`;
  } catch (e) {
    status.textContent = '';
    $('#results').innerHTML = `<p class="error">SPARQL 오류: ${esc(e.message || e)}</p>`;
  }
}

async function main() {
  const q = new URLSearchParams(location.search).get('q') || '';
  const turtle = buildTurtle();
  $('#ttl').href = URL.createObjectURL(new Blob([turtle], { type: 'text/turtle' }));
  $('#status').textContent = 'SPARQL 엔진을 불러오는 중…';
  await init();
  store = new oxigraph.Store();
  store.load(turtle, { format: 'text/turtle' });
  $('#triples').textContent = store.size.toLocaleString();

  const editor = $('#sparql');
  $('#run').addEventListener('click', () => { $('#interp').innerHTML = '<span class="chip">직접 작성한 SPARQL</span>'; run(editor.value); });
  editor.addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') $('#run').click(); });

  if (!q) { $('#status').textContent = `준비되었습니다. 질문을 입력하세요.`; return; }
  const r = parse(q);
  $('#interp').innerHTML = describe(r).map(([k, v]) => `<span class="chip"><em>${esc(k)}</em> ${esc(v)}</span>`).join('');
  editor.value = toSparql(r);
  run(editor.value);
}

main().catch((e) => { $('#status').textContent = 'SPARQL 엔진을 불러오지 못했습니다: ' + (e.message || e); });

export const getStore = () => store;
