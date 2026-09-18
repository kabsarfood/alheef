const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

console.log('=== npm run build ===');
let r = spawnSync('npm', ['run', 'build'], { encoding: 'utf8', shell: true });
console.log(r.stdout || '');
if (r.status !== 0) {
  console.log(r.stderr || '');
  process.exit(1);
}

console.log('=== syntax check server entry ===');
r = spawnSync('node', ['--check', 'server.js'], { encoding: 'utf8', shell: true });
if (r.status !== 0) {
  console.log(r.stderr || r.stdout);
  process.exit(1);
}
console.log('server.js syntax ok');

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', 'uploads', 'data', 'screenshots', 'tmp-ejar-shots', 'tmp-ejar-cards'].includes(ent.name)) continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (ent.name.endsWith('.js')) out.push(p);
  }
  return out;
}

const files = walk('server').concat(['server.js']);
const missing = [];
for (const f of files) {
  const text = fs.readFileSync(f, 'utf8');
  const re = /require\(\s*['"](\.\.?\/[^'"]+)['"]\s*\)/g;
  let m;
  while ((m = re.exec(text))) {
    let target = path.resolve(path.dirname(f), m[1]);
    const candidates = [target, `${target}.js`, path.join(target, 'index.js')];
    if (!candidates.some((c) => fs.existsSync(c))) missing.push(`${f} -> ${m[1]}`);
  }
}
console.log('=== missing relative requires ===');
console.log(missing.length ? missing.join('\n') : 'none');

console.log('=== Dockerfile COPY sources ===');
for (const p of ['package.json', 'server.js', 'server', 'public', 'dashboard', 'marketer']) {
  console.log(p, fs.existsSync(p) ? 'OK' : 'MISSING');
}

console.log('=== supabase in image? ===');
console.log('NOTE: Dockerfile does NOT copy supabase/ — migrations SQL absent in container');
