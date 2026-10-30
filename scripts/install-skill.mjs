#!/usr/bin/env node
// Install the moyu skill for Claude Code: copy skills/moyu/ to ~/.claude/skills/moyu/,
// replacing whatever was there.
import { cp, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const src = fileURLToPath(new URL('../skills/moyu/', import.meta.url));
const dest = join(process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude'), 'skills', 'moyu');

await rm(dest, { recursive: true, force: true });
await cp(src, dest, { recursive: true });
console.log(`moyu skill installed: ${dest}`);
