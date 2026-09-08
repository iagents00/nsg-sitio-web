import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const client = readFileSync(new URL('./assets/nsg-lead-notify.js', import.meta.url), 'utf8');
const packet = (overrides = {}) => ({ version: 1, eventId: '00000000-0000-4000-8000-000000000001', source: 'quick', elapsedMs: 6000, contactTrap: '', data: { name: 'PRUEBA', phone: '+570000000000', email: '', industry: 'Salud', channel: '@ejemplo', leads: '120', response: '5–30 min', nextStep: 'Acortar la primera respuesta' }, ...overrides });
const tick = () => new Promise(resolve => setImmediate(resolve));
test('browser sends once, captures campaign tags, and bounds retries without throwing', async () => {
  const calls = [], timers = [];
  const context = { window: {}, location: { origin: 'https://www.nsgintelligence.com', search: '?utm_source=facebook&utm_campaign=septiembre' }, document: { getElementById: () => ({ value: '' }) }, crypto: { randomUUID: () => packet().eventId }, URLSearchParams, AbortController, setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimeout() {}, fetch: (...args) => { calls.push(args); return Promise.reject(new Error('offline')); } };
  vm.runInNewContext(client, context);
  context.window.NSGLeadNotify('quick', packet().data);
  context.window.NSGLeadNotify('quick', packet().data);
  await tick();
  assert.equal(calls.length, 1);
  const body = JSON.parse(calls[0][1].body);
  assert.equal(body.attribution.utm_campaign, 'septiembre');
  assert.equal(calls[0][1].keepalive, true);
  const retry = timers.find(t => t.ms === 2500);
  retry.fn(); await tick();
  assert.equal(calls.length, 2);
  assert.equal(calls[0][1].body, calls[1][1].body);
  assert.equal(timers.filter(t => t.ms === 2500).length, 1);
});
test('local previews never notify production; campaign booking code is preserved', () => {
  let sent = false;
  const context = { window: {}, location: { origin: 'http://127.0.0.1:4178' }, fetch: () => { sent = true; } };
  vm.runInNewContext(client, context);
  context.window.NSGLeadNotify('quick', packet().data);
  assert.equal(sent, false);
  const wizard = readFileSync(new URL('./diagnostico.html', import.meta.url), 'utf8');
  assert.ok(wizard.includes("NSGLeadNotify?.('campaign'"));
  assert.ok(wizard.includes('registerAiosStudyGuide(booking'));
  assert.ok(wizard.includes('setTimeout(goCongrats, 2350)'));
});

test('campaign result and agenda sequence remain available when notification throws', () => {
  const wizard = readFileSync(new URL('./diagnostico.html', import.meta.url), 'utf8');
  const code = wizard.split('// ===== CÁLCULO =====')[1].split('function buildWaMsg')[0];
  for (const shouldThrow of [false, true]) {
    const nodes = new Map(), timers = [], notices = [], transitions = [];
    const fields = { fName: 'PRUEBA', fPhone: '+570000000000', fCompany: 'Prueba', fEmail: '' };
    const element = id => {
      if (!nodes.has(id)) nodes.set(id, { value: fields[id] || '', classList: { add() {}, remove() {} }, addEventListener: (event, fn) => { element(id)[event] = fn; } });
      return nodes.get(id);
    };
    const context = vm.createContext({ document: { getElementById: element }, steps: [{ dataset: { step: 'lead' } }], idx: 0, answers: { perfil: 'inmobiliaria', fuente: 'meta_ads', leads: '100', problema: 'respuesta' }, setTimeout: (fn, delay) => timers.push(delay), goCongrats() {}, show: n => transitions.push(n), window: { NSGLeadNotify: (...args) => { notices.push(args); if (shouldThrow) throw new Error('offline'); } } });
    vm.runInContext(code, context);
    element('btnResult').click();
    assert.deepEqual(transitions, [1]);
    assert.ok(timers.includes(2350));
    assert.ok(vm.runInContext('result.monthly > 0', context));
    assert.equal(notices[0][0], 'campaign');
    assert.equal(notices[0][1].channel, 'Facebook/Instagram Ads');
    assert.equal(notices[0][1].problem, 'Respuesta lenta');
  }
});
