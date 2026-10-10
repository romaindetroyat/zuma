#!/usr/bin/env node
/** Publication guard: refuses any tracked file that could carry proprietary Zuma material. */
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

/** Path patterns that must never be tracked (binaries, generated trees, original pictures, sounds, fonts). */
export const BANNED = [
  /\.(exe|dll|ogg|m4a|aac|mo3|mp3|wav|pak|dat|cab)$/i,
  /\.pack\.json$/i,
  /^(private_assets|standalone|dist|\.compiled)\//,
  /^levels\//,
  /(^|\/)(images|sounds|music|fonts)\/.*\.(gif|jpg|jpeg|png|txt)$/i,
];

/** Returns the exit code: 0 when the tracked tree is clean, 1 otherwise (messages on stderr). */
export function guard() {
  const tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
  const offenders = tracked.filter(f => BANNED.some(re => re.test(f)));
  if (offenders.length > 0) {
    console.error('publication guard: proprietary or generated files are tracked:');
    for (const f of offenders) console.error(`  ${f}`);
    return 1;
  }
  const large = tracked.filter(f => {
    try { return Number(execFileSync('git', ['cat-file', '-s', `:${f}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()) > 512 * 1024; } catch { return false; }
  });
  if (large.length > 0) {
    console.error('publication guard: unexpectedly large tracked files:');
    for (const f of large) console.error(`  ${f}`);
    return 1;
  }
  console.log(`publication guard: ${tracked.length} tracked files, none proprietary`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(guard());
}
