#!/usr/bin/env node

/**
 * Setup script for git hooks
 * This script installs the pre-commit hook for translation checking
 */

const fs = require('fs');
const path = require('path');

const colors = {
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    reset: '\x1b[0m',
    bold: '\x1b[1m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function main() {
    log(`${colors.bold}${colors.blue}🔧 Installing Git Hooks...${colors.reset}`);

    try {
        // Check if we're in a git repository
        if (!fs.existsSync('.git')) {
            log('❌ Not a git repository. Please run this script in the project root.', 'red');
            process.exit(1);
        }

        // Ensure hooks directory exists
        const hooksDir = '.git/hooks';
        if (!fs.existsSync(hooksDir)) {
            fs.mkdirSync(hooksDir, { recursive: true });
            log(`📁 Created hooks directory: ${hooksDir}`, 'blue');
        }

        // Copy pre-commit hook
        const sourceHook = path.join('scripts', 'pre-commit');
        const targetHook = path.join(hooksDir, 'pre-commit');

        if (!fs.existsSync(sourceHook)) {
            log(`❌ Source hook not found: ${sourceHook}`, 'red');
            process.exit(1);
        }

        fs.copyFileSync(sourceHook, targetHook);

        // Make it executable (works on Unix-like systems)
        try {
            fs.chmodSync(targetHook, 0o755);
        } catch (error) {
            log(`⚠️  Could not make hook executable: ${error.message}`, 'yellow');
            log('  You may need to run: chmod +x .git/hooks/pre-commit', 'yellow');
        }

        log(`✅ Pre-commit hook installed successfully!`, 'green');
        log(`📍 Location: ${targetHook}`, 'blue');
        log('', 'reset');
        log('The hook will now check translation completeness before each commit.', 'reset');
        log('To bypass the check (not recommended), use: git commit --no-verify', 'yellow');

    } catch (error) {
        log(`❌ Failed to install hooks: ${error.message}`, 'red');
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}
