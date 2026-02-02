/**
 * Awesome Claude Test Runner
 *
 * Usage:
 *   pnpm test              - Run all tests
 *   pnpm test:session      - Run session slot tests only
 *
 * Prerequisites:
 *   - Tauri app must be running: cd packages/tauri-app && pnpm tauri dev
 */

import chalk from 'chalk';

console.log(chalk.bold.cyan('\n  Awesome Claude Test Runner\n'));
console.log(chalk.gray('  Available test suites:'));
console.log(chalk.gray('    pnpm test:session    Session slot management tests'));
console.log('');
console.log(chalk.yellow('  Run specific test suite with the commands above.'));
console.log('');
