import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('./diagnostico.html', import.meta.url), 'utf8');
const script = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m => m[1]).find(s => s.includes('const NSG_WHATSAPP'));
function setup({ offline = false } = {}) {
  let time = 1000;
  const timers = [], notices = [], calendar = [], requests = [], nodes = new Map();
  function element(attrs = '') {
    const handlers = {}, classes = new Set((attrs.match(/class="([^"]*)"/)?.[1] || '').split(' '));
    const node = { dataset: {}, style: {}, children: [], value: '', textContent: '', innerHTML: '', tagName: 'DIV',
      classList: { add: (...names) => names.forEach(n => classes.add(n)), remove: (...names) => names.forEach(n => classes.delete(n)), contains: n => classes.has(n), toggle: (n, on) => on ? classes.add(n) : classes.delete(n) },
      addEventListener: (event, fn) => { handlers[event] = fn; }, click: () => handlers.click?.({ preventDefault() {} }),
      focus() {}, removeAttribute() {}, append: (...children) => node.children.push(...children), appendChild: child => { node.children.push(child); return child; },
      checkValidity: () => !node.value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(node.value), querySelectorAll: () => [], querySelector: () => null };
    for (const m of attrs.matchAll(/data-([a-z]+)="([^"]*)"/g)) node.dataset[m[1]] = m[2];
    return node;
  }
  for (const tag of html.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)) nodes.set(tag[1], element(tag[0]));
  const sections = [...html.matchAll(/<section\b([^>]*)>([\s\S]*?)<\/section>/g)].map(m => {
    const section = element(m[1]);
    const options = [...m[2].matchAll(/<button class="opt[^>]+>/g)].map(o => element(o[0]));
    section.querySelectorAll = selector => selector === '.opt' ? options : [];
    return section;
  });
  const start = element(), handlers = {};
  const doc = { body: element(), head: element(), activeElement: { tagName: 'BODY' }, getElementById: id => { assert.ok(nodes.has(id), `missing element ${id}`); return nodes.get(id); },
    createElement: () => element(), addEventListener: (event, fn) => { handlers[event] = fn; },
    querySelector: selector => selector === '[data-start]' ? start : sections.find(s => s.classList.contains('active')),
    querySelectorAll: selector => selector === '.step' ? sections : selector === '.step[data-q]' ? sections.filter(s => s.dataset.q) : [] };
  const context = vm.createContext({ document: doc, window: { document: doc, scrollTo() {}, matchMedia: () => ({ matches: false }), NSGLeadNotify: (...args) => { notices.push(args); if (offline) throw Error('offline'); } },
    performance: { now: () => time }, setTimeout: (fn, ms) => timers.push({ fn, ms }), setInterval() {}, clearInterval() {},
    Cal: (...args) => calendar.push(args), fetch: (...args) => { requests.push(args); return Promise.resolve({ ok: true }); }, console, URLSearchParams });
  vm.runInContext(script, context);
  function runTimer(ms) { const i = timers.findIndex(t => t.ms === ms); assert.notEqual(i, -1, `timer ${ms}`); timers.splice(i, 1)[0].fn(); }
  function transition() { runTimer(220); time += 1000; }
  function choose(value) { const active = sections.find(s => s.classList.contains('active')); active.querySelectorAll('.opt').find(o => o.dataset.v === value).click(); runTimer(330); transition(); }
  const evaluate = code => vm.runInContext(code, context);
  return { nodes, start, handlers, choose, transition, runTimer, evaluate, notices, calendar, requests };
}

test('five-step campaign form reaches results and preserves booking with optional email, even when notification fails', () => {
  for (const offline of [false, true]) {
    const app = setup({ offline });
    app.start.click(); app.transition();
    app.choose('inmobiliaria'); app.choose('100'); app.choose('5a30');
    app.nodes.get('btnChannel').click();
    assert.equal(app.evaluate('steps[idx].dataset.q'), 'canal');
    assert.ok(app.nodes.get('channelErr').classList.contains('show'));
    app.nodes.get('fChannel').value = 'https://example.com/?a=1&b=2';
    app.handlers.keydown({ key: 'Enter', preventDefault() {} }); app.transition();
    assert.equal(app.evaluate('steps[idx].dataset.step'), 'lead');
    app.nodes.get('btnResult').click();
    assert.equal(app.notices.length, 0);
    app.nodes.get('fName').value = 'PRUEBA'; app.nodes.get('fPhone').value = '+570000000000';
    app.nodes.get('fEmail').value = 'invalid'; app.nodes.get('btnResult').click();
    assert.equal(app.notices.length, 0);
    app.nodes.get('fEmail').value = ''; app.nodes.get('btnResult').click(); app.transition();
    assert.equal(app.notices.length, 1);
    assert.equal(app.notices[0][1].response, '5–30 min');
    assert.equal(app.notices[0][1].channel, 'https://example.com/?a=1&b=2');
    assert.equal(app.notices[0][1].email, '');
    app.nodes.get('btnResult').click(); assert.equal(app.notices.length, 1);
    app.runTimer(2350); app.transition(); app.runTimer(4500); app.transition();
    assert.equal(app.evaluate('steps[idx].dataset.step'), 'agenda');
    const config = app.calendar.find(c => c[0] === 'inline')[1];
    assert.equal(config.calLink, 'ivanrr.oficial/nsg-consulting');
    assert.equal(config.config['metadata[tiempo_respuesta]'], '5–30 min');
    assert.equal(config.config['metadata[red_social_sitio_web]'], 'https://example.com/?a=1&b=2');
    app.nodes.get('skipAgenda').click(); app.transition();
    assert.equal(app.evaluate('steps[idx].dataset.step'), 'result');
    assert.equal(app.nodes.get('responseSummary').textContent, '5–30 min');
    const wa = decodeURIComponent(app.evaluate('buildWaMsg()'));
    for (const expected of ['PRUEBA', '+570000000000', 'Inmobiliaria', '50–150', '5–30 min', 'https://example.com/?a=1&b=2']) assert.ok(wa.includes(expected));
    assert.ok(!wa.includes('undefined') && !wa.includes('estimada:'));
    const callback = app.calendar.find(c => c[0] === 'on' && c[1].action === 'bookingSuccessfulV2')[1].callback;
    callback({ detail: { data: { uid: 'synthetic', startTime: '2026-09-15T18:00:00Z' } } });
    callback({ detail: { data: { uid: 'synthetic', startTime: '2026-09-15T18:00:00Z' } } });
    assert.equal(app.requests.length, 1);
    const reminder = JSON.parse(app.requests[0][1].body);
    assert.equal(reminder.chat_id, '7378104238');
    assert.ok(reminder.texto.includes('5–30 min') && reminder.texto.includes('https://example.com/?a=1&b=2'));
  }
});

test('all response choices produce qualitative guidance and visitor text stays text in result', () => {
  for (const [value, title] of [['menos5', 'Mantener una respuesta ágil'], ['5a30', 'Acortar la primera respuesta'], ['30a120', 'Acortar la primera respuesta'], ['mas2h', 'Acortar la primera respuesta'], ['sinrespuesta', 'Asegurar que cada prospecto reciba respuesta']]) {
    const app = setup();
    app.evaluate(`Object.assign(answers, {name:'PRUEBA', perfil:'otro', leads:'30', respuesta:'${value}', canal:'<img src=x onerror=alert(1)>'}); compute(); paintResult();`);
    assert.equal(app.nodes.get('fugaName').textContent, title);
    const answer = app.nodes.get('fugaBars').children[2].children[1];
    assert.equal(answer.textContent, '<img src=x onerror=alert(1)>');
    assert.equal(answer.innerHTML, '');
  }
});
