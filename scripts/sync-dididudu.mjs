// The agent's voice is dididudu, a tool of the user's CUCAI kit; moyu ships a copy of its
// module as web/play/dididudu.js (players can't reach a local path). This brings the copy
// up to date from the kit, or with --check says whether it is.
//
//   node scripts/sync-dididudu.mjs            # copy the kit's module in
//   node scripts/sync-dididudu.mjs --check    # exit 1 if the copy differs from the kit's
//   node scripts/sync-dididudu.mjs <path>     # from another dididudu.js
//
// The kit is looked for next to the moyu checkout (../CUCAI); set DIDIDUDU or pass a path
// when it lives elsewhere.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const KIT = fileURLToPath(new URL('../../CUCAI/kit/tools/dididudu/dididudu.js', import.meta.url));
const args = process.argv.slice(2);
const check = args.includes('--check');
const from = args.find((a) => !a.startsWith('--')) ?? process.env.DIDIDUDU ?? KIT;
const to = fileURLToPath(new URL('../web/play/dididudu.js', import.meta.url));
const HEADER = `// Vendored from the CUCAI kit (CUCAI/kit/tools/dididudu/dididudu.js) by scripts/sync-dididudu.mjs:\n// edit it there, then sync. Not by hand here.\n`;
// The copy ships, so absolute paths in the kit's comments become paths from CUCAI/.
const local = (text) => text.replace(/[A-Za-z]:[\\/][^\s`'"()]*?[\\/]CUCAI[\\/]/g, 'CUCAI/');

if (!existsSync(from)) {
  console.error(`sync-dididudu: no ${from} (pass the path to dididudu.js, or set DIDIDUDU)`);
  process.exit(2);
}
const want = HEADER + local(readFileSync(from, 'utf8').replace(/\r\n/g, '\n'));
const have = existsSync(to) ? readFileSync(to, 'utf8').replace(/\r\n/g, '\n') : '';
if (check) {
  console.log(want === have ? 'web/play/dididudu.js is up to date' : 'web/play/dididudu.js differs from the kit: run node scripts/sync-dididudu.mjs');
  process.exit(want === have ? 0 : 1);
}
writeFileSync(to, want);
console.log(want === have ? 'web/play/dididudu.js already up to date' : `web/play/dididudu.js <- ${from}`);
