/**
 * Unit checks for admin notification sound baseline logic.
 * node scripts/test-admin-notification-sound-logic.js
 */
const assert = require('assert');

function createLogic() {
  const SEEN_KEY = 'test_seen';
  const store = { session: {}, local: {} };
  let firstPollDone = false;

  const sessionStorage = {
    getItem: (k) => store.session[k] ?? null,
    setItem: (k, v) => { store.session[k] = v; },
  };
  const localStorage = {
    getItem: (k) => store.local[k] ?? null,
    setItem: (k, v) => { store.local[k] = v; },
  };

  function getSeenIds() {
    try {
      const raw = sessionStorage.getItem(SEEN_KEY);
      const list = raw ? JSON.parse(raw) : [];
      return new Set(Array.isArray(list) ? list : []);
    } catch {
      return new Set();
    }
  }

  function saveSeenIds(set) {
    sessionStorage.setItem(SEEN_KEY, JSON.stringify([...set]));
  }

  function ingest(items) {
    const list = Array.isArray(items) ? items : [];
    const seen = getSeenIds();
    if (!firstPollDone) {
      list.forEach((n) => { if (n?.id) seen.add(n.id); });
      saveSeenIds(seen);
      firstPollDone = true;
      return [];
    }
    const fresh = list.filter((n) => n?.id && !seen.has(n.id));
    if (fresh.length) {
      fresh.forEach((n) => seen.add(n.id));
      saveSeenIds(seen);
    }
    return fresh;
  }

  return { ingest, reset: () => { firstPollDone = false; store.session = {}; } };
}

const logic = createLogic();
const old = [{ id: 'a' }, { id: 'b' }];
assert.deepStrictEqual(logic.ingest(old), [], 'first load baseline — no fresh');
assert.deepStrictEqual(logic.ingest(old), [], 'poll again — no fresh');
assert.deepStrictEqual(logic.ingest([...old, { id: 'c' }]).map((n) => n.id), ['c'], 'one new');
assert.deepStrictEqual(logic.ingest([...old, { id: 'c' }, { id: 'd' }]).map((n) => n.id), ['d'], 'another new');
logic.reset();
assert.deepStrictEqual(logic.ingest(old), [], 'after reset first load still baseline');

console.log('✓ admin notification sound logic tests passed');
