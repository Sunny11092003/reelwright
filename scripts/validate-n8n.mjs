import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'n8n', 'workflows');
let bad = 0;
for (const f of readdirSync(dir).filter((x) => x.endsWith('.json'))) {
  try {
    const wf = JSON.parse(readFileSync(resolve(dir, f), 'utf8'));
    const names = new Set(wf.nodes.map((n) => n.name));
    if (names.size !== wf.nodes.length) throw new Error('duplicate node names');
    for (const [from, c] of Object.entries(wf.connections)) {
      if (!names.has(from)) throw new Error(`connection from unknown node ${from}`);
      for (const out of c.main) for (const t of out) if (!names.has(t.node)) throw new Error(`connection to unknown node ${t.node}`);
    }
    for (const n of wf.nodes) if (!n.id || !n.type || !n.position) throw new Error(`node ${n.name} missing fields`);
    console.log('OK  ', f, `(${wf.nodes.length} nodes)`);
  } catch (e) { bad++; console.error('FAIL', f, e.message); }
}
process.exit(bad ? 1 : 0);
