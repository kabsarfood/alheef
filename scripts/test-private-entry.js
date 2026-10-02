/**
 * بوابة طلب الدخول بدل الخريطة العامة.
 * node --use-system-ca scripts/test-private-entry.js
 */
require('dotenv').config();

const app = require('../server');
const { createToken } = require('../server/middleware/auth');
const privateClientsRepo = require('../server/repositories/privateClientsRepo');

function assert(cond, label) {
  if (!cond) throw new Error(label);
  console.log('ok', label);
}

async function main() {
  const server = await new Promise((resolve) => {
    const handle = app.listen(0, '127.0.0.1', () => resolve(handle));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  let clientId = '';
  try {
    const home = await fetch(`${base}/`).then((r) => r.text());
    assert(home.includes('طلب دخول العروض الخاصة'), 'home has request button');
    assert(home.includes('https://wa.me/966530792754?text='), 'home opens heef whatsapp');
    assert(!home.includes('/map.html') && !home.includes('>الخريطة<'), 'home has no map link');
    const decoded = decodeURIComponent(home.match(/wa\.me\/966530792754\?text=([^"']+)/)[1]);
    assert(decoded.includes('الاسم:') && decoded.includes('كاش / تمويل') && !decoded.includes('/map'), 'message has the form and no map link');

    const gate = await fetch(`${base}/map.html`).then((r) => r.text());
    assert(gate.includes('طلب دخول العروض الخاصة') && gate.includes('966530792754'), 'map url is the request gate');
    assert(!gate.includes('leaflet') && !gate.includes('ALHEEF_BOARD_MODE'), 'map url hides listings');
    const offersPath = await fetch(`${base}/private-offers`).then((r) => r.text());
    assert(offersPath.includes('طلب دخول العروض الخاصة') && !offersPath.includes('leaflet'), 'private-offers path is the gate');

    const board = await fetch(`${base}/api/offer-board`);
    assert(board.status === 200, 'offer board api unchanged');
    const adminBoard = await fetch(`${base}/api/admin/offer-board`);
    assert(adminBoard.status === 401, 'admin board stays private');
    const adminPage = await fetch(`${base}/dashboard/private-offers.html`).then((r) => r.text());
    assert(adminPage.includes("ALHEEF_BOARD_MODE = 'admin'"), 'admin map page unchanged');

    const admin = createToken({ role: 'admin', userId: 'entry-test' });
    const created = await fetch(`${base}/api/admin/private-offers/clients`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${admin}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientLabel: 'entry-gate-test',
        phone: '0511111006',
        requestType: 'buy',
        propertyKind: 'land',
      }),
    }).then((r) => r.json());
    clientId = created.client && created.client.id;
    const packed = JSON.stringify(created);
    assert(created.success && created.client.shareUrl && created.client.deviceStatus === 'none', 'new client link without a device');
    assert(!packed.includes('accessCode') && !packed.includes('plainCode'), 'no static access code in the response');

    const changed = await fetch(`${base}/api/admin/private-offers/clients/${clientId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${admin}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '0511111007', clientLabel: 'entry-gate-test' }),
    }).then((r) => r.json());
    assert(changed.deviceReset && changed.client.pageSlug !== created.client.pageSlug, 'phone change resets the link');
    assert(!JSON.stringify(changed).includes('accessCode'), 'phone change does not return a code');
  } finally {
    if (clientId) await privateClientsRepo.setClientActive(clientId, false).catch(() => {});
    server.close();
  }
}

main().catch((error) => {
  console.error('fail', error.message);
  process.exit(1);
});
