/**
 * جهاز واحد لكل عميل عروض خاصة.
 * node --use-system-ca scripts/test-private-device.js
 */
require('dotenv').config();

const otp = require('../server/services/whatsappOtpCore');
let lastCode = '';
let sendCount = 0;
otp._setSender(async (_phone, message) => {
  sendCount += 1;
  const match = String(message || '').match(/\b(\d{6})\b/);
  lastCode = match ? match[1] : '';
});

const app = require('../server');
const { createToken } = require('../server/middleware/auth');
const privateClientsRepo = require('../server/repositories/privateClientsRepo');

function assert(cond, label) {
  if (!cond) throw new Error(label);
  console.log('ok', label);
}

function cookieOf(res) {
  const lines = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
  const line = lines.find((item) => item.startsWith('alheef_pd=')) || '';
  const match = line.match(/^alheef_pd=([^;]+)/);
  return { raw: line, value: match ? decodeURIComponent(match[1]) : '' };
}

async function main() {
  const server = await new Promise((resolve) => {
    const handle = app.listen(0, '127.0.0.1', () => resolve(handle));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const admin = createToken({ role: 'admin', userId: 'device-test' });
  const adminHeaders = { Authorization: `Bearer ${admin}`, 'Content-Type': 'application/json' };
  let clientId = '';

  try {
    const created = await fetch(`${base}/api/admin/private-offers/clients`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        clientLabel: 'device-policy-test',
        phone: '0511111001',
        requestType: 'buy',
        propertyKind: 'land',
      }),
    }).then((r) => r.json());
    if (!created.success) throw new Error(created.message || 'create failed');
    clientId = created.client.id;
    const slug = created.client.pageSlug;
    const phoneShown = JSON.stringify(created.client.phone || '');

    const gate = await fetch(`${base}/api/private-offers/gate?slug=${slug}`).then((r) => r.json());
    assert(gate.state === 'open', '1 gate open before bind');
    assert(gate.phoneMasked && !gate.phoneMasked.includes('11111001'), 'gate masks phone');

    const send1 = await fetch(`${base}/api/private-offers/otp/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0 Chrome/120.0' },
      body: JSON.stringify({ slug, phone: '0599999999' }),
    });
    assert(send1.status === 200, 'otp uses stored phone');
    assert(sendCount === 1 && lastCode.length === 6, 'otp issued once');
    const challengeId = (await send1.json()).challengeId;

    const verified = await fetch(`${base}/api/private-offers/otp/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0 Chrome/120.0' },
      body: JSON.stringify({ slug, challengeId, code: lastCode }),
    });
    const verifiedBody = await verified.json();
    const cookie = cookieOf(verified);
    assert(verified.status === 200 && verifiedBody.token, '1 first device binds');
    assert(!verifiedBody.phone, 'verify hides phone');
    assert(cookie.raw.includes('HttpOnly') && cookie.raw.includes('SameSite=Lax') && cookie.raw.includes('Path=/'), 'cookie flags');
    let token = verifiedBody.token;
    let deviceCookie = `alheef_pd=${encodeURIComponent(cookie.value)}`;

    const offers = await fetch(`${base}/api/private-offers`, {
      headers: { Authorization: `Bearer ${token}`, Cookie: deviceCookie },
    });
    const offersBody = await offers.json();
    assert(offers.status === 200 && Array.isArray(offersBody.offers), '1 offers on approved device');

    const session = await fetch(`${base}/api/private-offers/session`, {
      headers: { Authorization: `Bearer ${token}`, Cookie: deviceCookie },
    });
    const sessionBody = await session.json();
    assert(sessionBody.authenticated === true, '2 same device returns');

    const otherCookie = 'alheef_pd=other-browser-secret';
    const beforeOther = sendCount;
    const otherSend = await fetch(`${base}/api/private-offers/otp/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: otherCookie, 'User-Agent': 'Mozilla/5.0 Firefox/120.0' },
      body: JSON.stringify({ slug }),
    });
    const otherBody = await otherSend.json();
    assert(otherSend.status === 200, '3 whatsapp code is sent in any browser');
    assert(sendCount === beforeOther + 1, '3 otp is sent for the new browser');
    const otherChallenge = otherBody.challengeId;
    const otherVerify = await fetch(`${base}/api/private-offers/otp/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: otherCookie, 'User-Agent': 'Mozilla/5.0 Firefox/120.0' },
      body: JSON.stringify({ slug, challengeId: otherChallenge, code: lastCode }),
    });
    const otherVerified = await otherVerify.json();
    const rebound = cookieOf(otherVerify);
    assert(otherVerify.status === 200 && otherVerified.token && rebound.value, '3 whatsapp login works in the new browser');
    const oldOffers = await fetch(`${base}/api/private-offers`, {
      headers: { Authorization: `Bearer ${token}`, Cookie: deviceCookie },
    });
    assert(oldOffers.status === 403, '3 previous browser is no longer the active device');
    const reboundCookie = `alheef_pd=${encodeURIComponent(rebound.value)}`;
    const reboundOffers = await fetch(`${base}/api/private-offers`, {
      headers: { Authorization: `Bearer ${otherVerified.token}`, Cookie: reboundCookie },
    });
    assert(reboundOffers.status === 200, '3 new browser lists offers');
    deviceCookie = reboundCookie;
    token = otherVerified.token;

    const noCookieOffers = await fetch(`${base}/api/private-offers`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const noCookieBody = await noCookieOffers.json();
    assert(noCookieOffers.status === 403 && !noCookieBody.offers, '4 and 5 missing cookie rejected');

    const bare = await fetch(`${base}/api/private-offers/otp/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug, challengeId: 'none', code: '000000' }),
    });
    assert(bare.status === 400 || bare.status === 401 || bare.status === 403, '6 bad otp rejected');

    const ended = await fetch(`${base}/api/admin/private-offers/clients/${clientId}/end-sessions`, {
      method: 'POST',
      headers: adminHeaders,
    }).then((r) => r.json());
    assert(ended.success, 'end sessions');
    const stale = await fetch(`${base}/api/private-offers`, {
      headers: { Authorization: `Bearer ${token}`, Cookie: deviceCookie },
    });
    assert(stale.status === 401, 'ended session cannot list');
    const again = await fetch(`${base}/api/private-offers/otp/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: deviceCookie },
      body: JSON.stringify({ slug }),
    });
    assert(again.status === 200, '2 same cookie can request otp');
    const againBody = await again.json();
    const againVerify = await fetch(`${base}/api/private-offers/otp/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: deviceCookie },
      body: JSON.stringify({ slug, challengeId: againBody.challengeId, code: lastCode }),
    });
    const againToken = (await againVerify.json()).token;
    assert(againVerify.status === 200, '2 same device new session');
    const listed = await fetch(`${base}/api/private-offers`, {
      headers: { Authorization: `Bearer ${againToken}`, Cookie: deviceCookie },
    });
    assert(listed.status === 200, '2 renewed session lists');

    const revoked = await fetch(`${base}/api/admin/private-offers/clients/${clientId}/revoke-device`, {
      method: 'POST',
      headers: adminHeaders,
    }).then((r) => r.json());
    assert(revoked.success && revoked.client.deviceStatus === 'revoked' && revoked.client.active === false, '8 revoke');
    const afterRevoke = await fetch(`${base}/api/private-offers`, {
      headers: { Authorization: `Bearer ${againToken}`, Cookie: deviceCookie },
    });
    assert(afterRevoke.status === 403, '8 revoked device has no offers');

    const regen = await fetch(`${base}/api/admin/private-offers/clients/${clientId}/regenerate`, {
      method: 'POST',
      headers: adminHeaders,
    }).then((r) => r.json());
    assert(regen.success && regen.client.pageSlug !== slug && regen.client.deviceStatus === 'none', '9 new link');
    const oldGate = await fetch(`${base}/api/private-offers/gate?slug=${slug}`);
    assert(oldGate.status >= 400, '9 old link dead');
    const newSlug = regen.client.pageSlug;
    const freshGate = await fetch(`${base}/api/private-offers/gate?slug=${newSlug}`).then((r) => r.json());
    assert(freshGate.state === 'open', '9 new link is open');

    const sendNew = await fetch(`${base}/api/private-offers/otp/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0 Safari/17.0' },
      body: JSON.stringify({ slug: newSlug }),
    });
    const sendNewBody = await sendNew.json();
    const verifyNew = await fetch(`${base}/api/private-offers/otp/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0 Safari/17.0' },
      body: JSON.stringify({ slug: newSlug, challengeId: sendNewBody.challengeId, code: lastCode }),
    });
    const newCookie = cookieOf(verifyNew);
    assert(verifyNew.status === 200 && newCookie.value && newCookie.value !== cookie.value, '9 new device bound');

    const changed = await fetch(`${base}/api/admin/private-offers/clients/${clientId}`, {
      method: 'PUT',
      headers: adminHeaders,
      body: JSON.stringify({ phone: '0511111002', clientLabel: 'device-policy-test' }),
    }).then((r) => r.json());
    assert(changed.deviceReset && changed.client.pageSlug !== newSlug && changed.client.deviceStatus === 'none', '10 phone change resets');
    const oldAfterPhone = await fetch(`${base}/api/private-offers/gate?slug=${newSlug}`);
    assert(oldAfterPhone.status >= 400, '10 old link dead after phone change');
    const phoneGate = await fetch(`${base}/api/private-offers/gate?slug=${changed.client.pageSlug}`, {
      headers: { Cookie: `alheef_pd=${encodeURIComponent(newCookie.value)}` },
    }).then((r) => r.json());
    assert(phoneGate.state === 'open', '10 previous device is not approved');

    const publicBoard = await fetch(`${base}/api/offer-board`);
    assert(publicBoard.status === 200, '12 public board unchanged');
    const adminBoard = await fetch(`${base}/api/admin/offer-board`, { headers: { Authorization: `Bearer ${admin}` } });
    assert(adminBoard.status === 200, '12 admin board unchanged');
    const anonBoard = await fetch(`${base}/api/admin/offer-board`);
    assert(anonBoard.status === 401, '12 admin board stays private');
    assert(phoneShown.length > 2, 'admin create returned');
  } finally {
    if (clientId) {
      await privateClientsRepo.setClientActive(clientId, false).catch(() => {});
    }
    server.close();
  }
}

main().catch((error) => {
  console.error('fail', error.message);
  process.exit(1);
});
