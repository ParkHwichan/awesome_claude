import chalk from 'chalk';

export interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration: number;
}

export interface TestSuite {
  name: string;
  results: TestResult[];
}

type TestFn = () => Promise<void>;

class TestRunner {
  private suites: Map<string, { tests: Map<string, TestFn>; beforeAll?: () => Promise<void>; afterAll?: () => Promise<void> }> = new Map();
  private currentSuite: string = '';

  describe(name: string, fn: () => void): void {
    this.currentSuite = name;
    this.suites.set(name, { tests: new Map() });
    fn();
    this.currentSuite = '';
  }

  beforeAll(fn: () => Promise<void>): void {
    const suite = this.suites.get(this.currentSuite);
    if (suite) {
      suite.beforeAll = fn;
    }
  }

  afterAll(fn: () => Promise<void>): void {
    const suite = this.suites.get(this.currentSuite);
    if (suite) {
      suite.afterAll = fn;
    }
  }

  it(name: string, fn: TestFn): void {
    const suite = this.suites.get(this.currentSuite);
    if (suite) {
      suite.tests.set(name, fn);
    }
  }

  async run(): Promise<TestSuite[]> {
    const results: TestSuite[] = [];

    for (const [suiteName, suite] of this.suites) {
      console.log(chalk.bold.blue(`\n  ${suiteName}`));

      const suiteResults: TestResult[] = [];

      // Run beforeAll
      if (suite.beforeAll) {
        try {
          await suite.beforeAll();
        } catch (e) {
          console.log(chalk.red(`    ✗ beforeAll failed: ${e}`));
          continue;
        }
      }

      // Run tests
      for (const [testName, testFn] of suite.tests) {
        const start = Date.now();
        try {
          await testFn();
          const duration = Date.now() - start;
          console.log(chalk.green(`    ✓ ${testName}`) + chalk.gray(` (${duration}ms)`));
          suiteResults.push({ name: testName, passed: true, duration });
        } catch (e) {
          const duration = Date.now() - start;
          const error = e instanceof Error ? e.message : String(e);
          console.log(chalk.red(`    ✗ ${testName}`));
          console.log(chalk.gray(`      ${error}`));
          suiteResults.push({ name: testName, passed: false, error, duration });
        }
      }

      // Run afterAll
      if (suite.afterAll) {
        try {
          await suite.afterAll();
        } catch (e) {
          console.log(chalk.yellow(`    ⚠ afterAll failed: ${e}`));
        }
      }

      results.push({ name: suiteName, results: suiteResults });
    }

    // Summary
    const totalTests = results.reduce((sum, s) => sum + s.results.length, 0);
    const passedTests = results.reduce((sum, s) => sum + s.results.filter(r => r.passed).length, 0);
    const failedTests = totalTests - passedTests;

    console.log('\n' + chalk.bold('  Summary:'));
    console.log(chalk.green(`    ${passedTests} passed`));
    if (failedTests > 0) {
      console.log(chalk.red(`    ${failedTests} failed`));
    }
    console.log('');

    return results;
  }
}

export const runner = new TestRunner();

export function describe(name: string, fn: () => void): void {
  runner.describe(name, fn);
}

export function it(name: string, fn: TestFn): void {
  runner.it(name, fn);
}

export function beforeAll(fn: () => Promise<void>): void {
  runner.beforeAll(fn);
}

export function afterAll(fn: () => Promise<void>): void {
  runner.afterAll(fn);
}

export function expect<T>(actual: T) {
  return {
    toBe(expected: T): void {
      if (actual !== expected) {
        throw new Error(`Expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`);
      }
    },
    toEqual(expected: T): void {
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(`Expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`);
      }
    },
    toBeTruthy(): void {
      if (!actual) {
        throw new Error(`Expected truthy value but got ${JSON.stringify(actual)}`);
      }
    },
    toBeFalsy(): void {
      if (actual) {
        throw new Error(`Expected falsy value but got ${JSON.stringify(actual)}`);
      }
    },
    toContain(item: unknown): void {
      if (!Array.isArray(actual) || !actual.includes(item)) {
        throw new Error(`Expected ${JSON.stringify(actual)} to contain ${JSON.stringify(item)}`);
      }
    },
    toBeGreaterThan(expected: number): void {
      if (typeof actual !== 'number' || actual <= expected) {
        throw new Error(`Expected ${actual} to be greater than ${expected}`);
      }
    },
    toMatch(pattern: RegExp): void {
      if (typeof actual !== 'string' || !pattern.test(actual)) {
        throw new Error(`Expected "${actual}" to match ${pattern}`);
      }
    },
  };
}

export async function runTests(): Promise<boolean> {
  const results = await runner.run();
  const allPassed = results.every(s => s.results.every(r => r.passed));
  return allPassed;
}
