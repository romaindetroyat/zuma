#!/usr/bin/env node
/** Publication guard: refuses any tracked file that could carry proprietary Zuma material. */
import { execFileSync } from 'node:child_process';

const tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
const banned = [
  /\.(exe|dll|ogg|mo3|mp3|wav|pak|dat|cab)$/i,
  /\.pack\.json$/i,
  /^(private_assets|standalone|dist|\.compiled)\//,
  /^levels\//,
  /(^|\/)(images|sounds|music)\/.*\.(gif|jpg|jpeg|png)$/i,
];
const offenders = tracked.filter(f => banned.some(re => re.test(f)));
if (offenders.length > 0) {
  console.error('publication guard: proprietary or generated files are tracked:');
  for (const f of offenders) console.error(`  ${f}`);
  process.exit(1);
}
const large = tracked.filter(f => {
  try { return execFileSync('git', ['cat-file', '-s', `HEAD:${f}`], { encoding: 'utf8' }).trim() > 512 * 1024; } catch { return false; }
});
if (large.length > 0) {
  console.error('publication guard: unexpectedly large tracked files:');
  for (const f of large) console.error(`  ${f}`);
  process.exit(1);
}
console.log(`publication guard: ${tracked.length} tracked files, none proprietary`);
