/**
 * fetch مع إعادة محاولة عند فشل الشبكة المؤقت (شائع عند بدء التشغيل على Windows)
 */
async function retryFetch(input, init = {}, attempts = 3) {
  let lastErr;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fetch(input, init);
    } catch (err) {
      lastErr = err;
      const msg = String(err?.message || err);
      const retryable = /fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|socket/i.test(msg);
      if (!retryable || i === attempts - 1) throw err;
      await new Promise((r) => setTimeout(r, 400 * (i + 1)));
    }
  }
  throw lastErr;
}

module.exports = { retryFetch };
