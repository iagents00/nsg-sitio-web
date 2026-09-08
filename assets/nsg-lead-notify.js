/* Optional notification: the diagnostic UI never waits for this request. */
(() => {
  const allowed = new Set(['https://www.nsgintelligence.com', 'https://nsgintelligence.com', 'https://nsg-intelligence.ivan-synergy.chatgpt.site']);
  const endpoint = 'https://personal-n8n.suwsiw.easypanel.host/webhook/nsg-diagnostico-angel-v1';
  const startedAt = Date.now();
  const submissions = new Map();
  window.NSGLeadNotify = (source, data) => {
    try {
      if (!allowed.has(location.origin) || typeof fetch !== 'function') return;
      const signature = JSON.stringify([source, data]);
      if (submissions.has(signature)) return;
      const eventId = typeof crypto?.randomUUID === 'function' ? crypto.randomUUID() : Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
      submissions.set(signature, eventId);
      const query = new URLSearchParams(location.search);
      const attribution = {};
      for (const key of ['utm_source', 'utm_medium', 'utm_campaign']) {
        const value = query.get(key);
        if (value) attribution[key] = value.slice(0, 120);
      }
      const payload = JSON.stringify({ version: 1, eventId, source, data, attribution, elapsedMs: Date.now() - startedAt, contactTrap: document.getElementById('nsgContactFax')?.value || '' });
      const send = attempt => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 20000);
        // text/plain is a CORS simple request; no preflight dependency.
        Promise.resolve().then(() => fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, body: payload, keepalive: true, credentials: 'omit', signal: controller.signal }))
          .then(response => { if (!response.ok && response.status >= 500) throw new Error('notification unavailable'); })
          .catch(() => { if (attempt === 0) setTimeout(() => send(1), 2500); })
          .finally(() => clearTimeout(timeout));
      };
      send(0);
    } catch (_) { /* Analytics/notification failures must never affect the form. */ }
  };
})();
