import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const code = html.split('// OPTION GROUPS')[1].split('// REVEAL ON SCROLL')[0];
function form(overrides = {}, response = 1, notification = () => {}) {
  const fields = { qLeads: '120', qIndustry: 'Salud', qChannel: '@clínica en Instagram', qName: 'Ana Pérez', qPhone: '+52 984 000 0000', qEmail: '', ...overrides };
  const nodes = new Map();
  function node(id) {
    if (!nodes.has(id)) nodes.set(id, { value: fields[id] ?? '', textContent: '', href: '', classList: { add() {} }, setAttribute() {}, focus() {}, scrollIntoView() {}, addEventListener(event, fn) { this[event] = fn; } });
    return nodes.get(id);
  }
  const document = { querySelector: id => node(id.slice(1)), querySelectorAll: () => [] };
  const context = vm.createContext({ document, NSG_WHATSAPP: '529842803001', window: { NSGLeadNotify: notification } });
  vm.runInContext(code, context);
  vm.runInContext('choice.resp = ' + JSON.stringify(response), context);
  node('diagCalc').click();
  return { nodes, get: node, message: () => new URL(node('resWhats').href).searchParams.get('text') };
}
test('requested fields replace follow-up and ticket questions', () => {
  assert.ok(html.includes('id="qIndustry"') && html.includes('id="qChannel"'));
  assert.ok(!html.includes('id="qTicket"') && !html.includes('data-group="follow"'));
  assert.ok(html.includes('Correo (opcional)'));
});
test('empty email succeeds and all new answers survive WhatsApp encoding', () => {
  const f = form();
  assert.equal(f.get('diagErr').textContent, '');
  const msg = f.message();
  for (const text of ['Industria: Salud', '@clínica en Instagram', 'Tiempo de respuesta: 5–30 min', 'Prospectos/mes: 120', 'Ana Pérez']) assert.ok(msg.includes(text));
  assert.ok(!msg.includes('Correo:') && !msg.includes('Ticket:') && !msg.includes('USD'));
});
test('valid optional email is included; invalid supplied email is rejected', () => {
  assert.ok(form({ qEmail: 'ana@example.com' }).message().includes('Correo: ana@example.com'));
  const f = form({ qEmail: 'incorrecto' });
  assert.match(f.get('diagErr').textContent, /correo válido/);
  assert.equal(f.get('resWhats').href, '');
});
test('industry, channel, response time and contact remain required', () => {
  for (const key of ['qIndustry', 'qChannel', 'qName', 'qPhone']) assert.notEqual(form({ [key]: '' }).get('diagErr').textContent, '');
  assert.match(form({}, null).get('diagErr').textContent, /tiempo de respuesta/);
  for (const leads of ['0', '-1', '1.2', 'Infinity', '']) assert.notEqual(form({ qLeads: leads }).get('diagErr').textContent, '');
});
test('all response choices produce guidance without financial estimates', () => {
  for (let response = 0; response < 5; response++) {
    const f = form({}, response);
    assert.equal(f.get('diagErr').textContent, '');
    assert.ok(f.get('leakNum').textContent.length > 0);
    assert.ok(!f.message().includes('USD'));
  }
});
test('website query strings and entered markup remain data', () => {
  const website = 'https://example.com/?a=1&b=á#contacto';
  const f = form({ qChannel: website, qIndustry: '<b>Comercio</b>' });
  assert.ok(f.message().includes(website));
  assert.equal(f.get('resIndustry').textContent, '<b>Comercio</b>');
  assert.equal(f.get('resChannel').textContent, website);
});

test('notification receives all validated fields and never prevents the result', () => {
  const calls = [];
  const f = form({}, 1, (...args) => calls.push(args));
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'quick');
  assert.equal(calls[0][1].email, '');
  assert.equal(calls[0][1].response, '5–30 min');
  assert.ok(f.get('resWhats').href.startsWith('https://wa.me/'));
  assert.ok(form({}, 1, () => { throw new Error('offline'); }).get('resWhats').href.startsWith('https://wa.me/'));
  form({ qIndustry: '' }, 1, (...args) => calls.push(args));
  assert.equal(calls.length, 1);
});
