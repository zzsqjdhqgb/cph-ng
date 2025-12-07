#!/usr/bin/env node

/**
 * Setup script for git hooks
 * This script installs the pre-commit hook for translation checking
 */

import { chmodSync, copyFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

try {
  if (!existsSync('.git')) {
    throw new Error('No .git directory found');
  }
  const hooksDir = '.git/hooks';
  mkdirSync(hooksDir, { recursive: true });
  for (const type of ['pre-commit', 'commit-msg']) {
    const target = join(hooksDir, type);
    copyFileSync(join('scripts', type), target);
    chmodSync(target, 0o755);
  }
  console.log('Git hooks installed successfully.');
} catch (error) {
  console.error('Failed to install git hooks:', error);
  process.exit(1);
}
