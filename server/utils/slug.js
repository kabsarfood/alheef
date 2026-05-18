function slugify(text) {
  if (!text || typeof text !== 'string') return 'item';
  let s = text.trim().toLowerCase();
  s = s.replace(/[^\w\u0600-\u06FF]+/g, '-');
  s = s.replace(/-+/g, '-').replace(/^-|-$/g, '');
  return s || 'item';
}

async function uniqueSlug(base, existsFn, maxTry = 20) {
  let slug = slugify(base);
  let candidate = slug;
  let n = 0;
  while (n < maxTry) {
    const taken = await existsFn(candidate);
    if (!taken) return candidate;
    n += 1;
    candidate = `${slug}-${n}`;
  }
  return `${slug}-${Date.now()}`;
}

module.exports = { slugify, uniqueSlug };
