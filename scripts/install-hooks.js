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
    bold: '\x1b[1m',
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function main() {
    log(
        `${colors.bold}${colors.blue}🔧 Installing Git Hooks...${colors.reset}`,
    );

    try {
        // Check if we're in a git repository
        if (!fs.existsSync('.git')) {
            log(
                '❌ Not a git repository. Please run this script in the project root.',
                'red',
            );
            process.exit(1);
        }

        // Ensure hooks directory exists
        const hooksDir = '.git/hooks';
        if (!fs.existsSync(hooksDir)) {
            fs.mkdirSync(hooksDir, { recursive: true });
            log(`📁 Created hooks directory: ${hooksDir}`, 'blue');
        }

        // Copy pre-commit hook
        const preCommitSource = path.join('scripts', 'pre-commit');
        const preCommitTarget = path.join(hooksDir, 'pre-commit');

        if (!fs.existsSync(preCommitSource)) {
            log(`✌ Source hook not found: ${preCommitSource}`, 'red');
            process.exit(1);
        }

        fs.copyFileSync(preCommitSource, preCommitTarget);

        // Make it executable (works on Unix-like systems)
        try {
            fs.chmodSync(preCommitTarget, 0o755);
        } catch (error) {
            log(
                `⚠️  Could not make hook executable: ${error.message}`,
                'yellow',
            );
            log(
                '  You may need to run: chmod +x .git/hooks/pre-commit',
                'yellow',
            );
        }

        log(`✅ Pre-commit hook installed successfully!`, 'green');
        log(`📍 Location: ${preCommitTarget}`, 'blue');

        // Copy commit-msg hook for commitlint
        const commitMsgSource = path.join('scripts', 'commit-msg');
        const commitMsgTarget = path.join(hooksDir, 'commit-msg');

        if (fs.existsSync(commitMsgSource)) {
            fs.copyFileSync(commitMsgSource, commitMsgTarget);
            try {
                fs.chmodSync(commitMsgTarget, 0o755);
            } catch (error) {
                log(
                    `⚠️  Could not make commit-msg hook executable: ${error.message}`,
                    'yellow',
                );
                log(
                    '  You may need to run: chmod +x .git/hooks/commit-msg',
                    'yellow',
                );
            }
            log(`✅ commit-msg hook installed successfully!`, 'green');
            log(`📍 Location: ${commitMsgTarget}`, 'blue');
        } else {
            log(
                `⚠️  commit-msg hook source not found: ${commitMsgSource}`,
                'yellow',
            );
        }
        log('', 'reset');
        log(
            'The pre-commit hook checks translation completeness and formats code.',
            'reset',
        );
        log(
            'The commit-msg hook validates your commit message with commitlint.',
            'reset',
        );
        log(
            'To bypass the check (not recommended), use: git commit --no-verify',
            'yellow',
        );
    } catch (error) {
        log(`❌ Failed to install hooks: ${error.message}`, 'red');
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}
