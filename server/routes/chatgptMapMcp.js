const express = require('express');
const gate = require('../services/mapApproval');
const mcp = require('../services/chatgptMapMcp');
const oauth = require('../services/chatgptOAuth');

const router = express.Router();

function sendPayload(req, res, status, payload) {
  if (status === 202 || payload == null) {
    res.status(202);
    res.set('Cache-Control', 'no-store');
    res.set('Content-Length', '0');
    return res.end();
  }
  const accept = req.get('accept') || '';
  const sseOnly = accept.includes('text/event-stream') && !accept.includes('application/json');
  res.set('Cache-Control', 'no-store');
  if (!sseOnly) return res.status(status).json(payload);
  res.status(status).type('text/event-stream').send(`event: message\ndata: ${JSON.stringify(payload)}\n\n`);
}

async function resolveAuth(header) {
  const auth = gate.authorizeConnector(header);
  if (auth.ok) return auth;
  const match = String(header || '').match(/^Bearer\s+(.+)$/i);
  if (match) {
    try {
      const oauthAuth = await oauth.verifyAccessToken(match[1].trim());
      if (oauthAuth.ok) return { ok: true };
    } catch (error) {
      console.error('[chatgpt-oauth]', gate.safeReason(error));
    }
  }
  if (auth.status === 503) return auth;
  return { ok: false, status: 401, message: 'غير مصرح', challenge: oauth.wwwAuthenticate() };
}

router.post('/mcp', async (req, res) => {
  if (!gate.rateLimiter.allowRequest(req)) {
    return sendPayload(req, res, 429, {
      jsonrpc: '2.0',
      id: null,
      error: { code: -32000, message: 'محاولات كثيرة. أعد المحاولة لاحقًا' },
    });
  }
  const auth = await resolveAuth(req.get('authorization'));
  if (!auth.ok) {
    if (auth.challenge) res.set('WWW-Authenticate', auth.challenge);
    return sendPayload(req, res, auth.status, {
      jsonrpc: '2.0',
      id: null,
      error: { code: auth.status === 503 ? -32001 : -32002, message: auth.message },
    });
  }
  try {
    const outcome = await mcp.handleRpc(req.body);
    sendPayload(req, res, outcome.status, outcome.payload);
  } catch (error) {
    console.error('[chatgpt-map-tool]', gate.safeReason(error));
    sendPayload(req, res, 500, {
      jsonrpc: '2.0',
      id: null,
      error: { code: -32603, message: 'تعذر تنفيذ الأداة' },
    });
  }
});

router.get('/mcp', (_req, res) => {
  res.set('Allow', 'POST');
  res.status(405).json({
    jsonrpc: '2.0',
    id: null,
    error: { code: -32601, message: 'موصل ChatGPT يستقبل POST فقط' },
  });
});

module.exports = router;
