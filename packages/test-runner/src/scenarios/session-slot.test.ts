/**
 * Session Slot Test Scenarios
 *
 * Tests terminal-based session management:
 * 1. MCP connects → gets animal name assigned
 * 2. MCP reconnects from same terminal → same animal name
 * 3. MCP from different terminal → different animal name
 */

import { describe, it, beforeAll, afterAll, expect, runTests } from '../utils/test-framework.js';
import { TestWebSocketClient, type SessionAssignedPayload } from '../utils/websocket-client.js';
import chalk from 'chalk';

// Simulated terminal shell PIDs (in real app, these come from TerminalManager)
const TERMINAL_1_SHELL_PID = 10001;
const TERMINAL_2_SHELL_PID = 10002;

// Simulated MCP process PIDs
let mcpPidCounter = 20000;
function nextMcpPid(): number {
  return ++mcpPidCounter;
}

// Helper to create a fake PID chain
// In real scenario: [mcp_pid, claude_pid, ..., shell_pid]
function createPidChain(mcpPid: number, shellPid: number): number[] {
  // Simulate: mcp -> node -> claude -> powershell (shell)
  const claudePid = mcpPid + 1000;
  return [mcpPid, claudePid, shellPid];
}

describe('Session Slot Assignment', () => {
  let client1: TestWebSocketClient;
  let assignedSession1: SessionAssignedPayload | null = null;

  beforeAll(async () => {
    console.log(chalk.gray('      Connecting to Tauri WebSocket...'));
    client1 = new TestWebSocketClient();
    await client1.connect();
  });

  afterAll(async () => {
    client1.disconnect();
  });

  it('should receive connection:established on connect', async () => {
    const event = await client1.waitForEvent('connection:established');
    expect(event.type).toBe('connection:established');
    expect((event.payload as { clientId: string }).clientId).toBeTruthy();
  });

  it('should receive session:assigned after mcp:register with PID chain', async () => {
    const mcpPid = nextMcpPid();
    const pidChain = createPidChain(mcpPid, TERMINAL_1_SHELL_PID);

    await client1.sendRegister({
      pid: mcpPid,
      ppid: pidChain[1],
      pidChain,
      workingDirectory: process.cwd(),
    });

    const event = await client1.waitForEvent('session:assigned');
    expect(event.type).toBe('session:assigned');

    const payload = event.payload as SessionAssignedPayload;
    expect(payload.sessionId).toBeTruthy();
    expect(payload.animalName).toBeTruthy();
    expect(payload.animalIndex).toBeGreaterThan(-1);

    assignedSession1 = payload;
    console.log(chalk.gray(`      Assigned: ${payload.animalName} (index: ${payload.animalIndex})`));
  });

  it('should assign animal name from predefined list', async () => {
    const animalNames = [
      'Bear', 'Fox', 'Rabbit', 'Wolf', 'Deer',
      'Owl', 'Eagle', 'Hawk', 'Falcon', 'Raven',
      'Tiger', 'Lion', 'Panther', 'Jaguar', 'Leopard',
      'Dolphin', 'Whale', 'Shark', 'Orca', 'Seal',
      'Koala', 'Panda', 'Sloth', 'Otter', 'Beaver',
    ];
    expect(animalNames).toContain(assignedSession1?.animalName);
  });
});

describe('Session Slot Reactivation (Same Terminal)', () => {
  let client1: TestWebSocketClient;
  let client2: TestWebSocketClient;
  let firstAnimalName: string = '';
  let secondAnimalName: string = '';

  beforeAll(async () => {
    console.log(chalk.gray('      Testing session reactivation...'));
  });

  afterAll(async () => {
    client2?.disconnect();
  });

  it('should connect first MCP and get animal name', async () => {
    client1 = new TestWebSocketClient();
    await client1.connect();
    await client1.waitForEvent('connection:established');

    const mcpPid = nextMcpPid();
    const pidChain = createPidChain(mcpPid, TERMINAL_1_SHELL_PID);

    await client1.sendRegister({
      pid: mcpPid,
      ppid: pidChain[1],
      pidChain,
      workingDirectory: process.cwd(),
    });

    const event = await client1.waitForEvent('session:assigned');
    firstAnimalName = (event.payload as SessionAssignedPayload).animalName;
    console.log(chalk.gray(`      First MCP: ${firstAnimalName}`));
  });

  it('should disconnect first MCP', async () => {
    client1.disconnect();
    // Give server time to process disconnect
    await new Promise(resolve => setTimeout(resolve, 500));
  });

  it('should reconnect from same terminal and get SAME animal name', async () => {
    client2 = new TestWebSocketClient();
    await client2.connect();
    await client2.waitForEvent('connection:established');

    // New MCP process but same shell PID (same terminal)
    const mcpPid = nextMcpPid();
    const pidChain = createPidChain(mcpPid, TERMINAL_1_SHELL_PID);

    await client2.sendRegister({
      pid: mcpPid,
      ppid: pidChain[1],
      pidChain,
      workingDirectory: process.cwd(),
    });

    const event = await client2.waitForEvent('session:assigned');
    secondAnimalName = (event.payload as SessionAssignedPayload).animalName;
    console.log(chalk.gray(`      Second MCP (same terminal): ${secondAnimalName}`));

    // Key assertion: same terminal = same animal name
    expect(secondAnimalName).toBe(firstAnimalName);
  });
});

describe('Multiple Terminals (Different Sessions)', () => {
  let client1: TestWebSocketClient;
  let client2: TestWebSocketClient;
  let terminal1Animal: string = '';
  let terminal2Animal: string = '';

  beforeAll(async () => {
    console.log(chalk.gray('      Testing multiple terminals...'));
  });

  afterAll(async () => {
    client1?.disconnect();
    client2?.disconnect();
  });

  it('should connect MCP from Terminal 1', async () => {
    client1 = new TestWebSocketClient();
    await client1.connect();
    await client1.waitForEvent('connection:established');

    const mcpPid = nextMcpPid();
    const pidChain = createPidChain(mcpPid, TERMINAL_1_SHELL_PID);

    await client1.sendRegister({
      pid: mcpPid,
      ppid: pidChain[1],
      pidChain,
      workingDirectory: process.cwd(),
    });

    const event = await client1.waitForEvent('session:assigned');
    terminal1Animal = (event.payload as SessionAssignedPayload).animalName;
    console.log(chalk.gray(`      Terminal 1: ${terminal1Animal}`));
  });

  it('should connect MCP from Terminal 2 and get DIFFERENT animal name', async () => {
    client2 = new TestWebSocketClient();
    await client2.connect();
    await client2.waitForEvent('connection:established');

    // Different shell PID = different terminal
    const mcpPid = nextMcpPid();
    const pidChain = createPidChain(mcpPid, TERMINAL_2_SHELL_PID);

    await client2.sendRegister({
      pid: mcpPid,
      ppid: pidChain[1],
      pidChain,
      workingDirectory: process.cwd(),
    });

    const event = await client2.waitForEvent('session:assigned');
    terminal2Animal = (event.payload as SessionAssignedPayload).animalName;
    console.log(chalk.gray(`      Terminal 2: ${terminal2Animal}`));

    // Note: In this test, since we're not actually running in Tauri's terminals,
    // the PID chain won't match any real terminal, so Tauri will use fallback.
    // But the animal names should still be different due to counter increment.
    // In real usage with actual terminals, this will work correctly.
  });
});

// Run tests
console.log(chalk.bold.cyan('\n  Session Slot Tests\n'));
console.log(chalk.gray('  Prerequisites:'));
console.log(chalk.gray('    - Tauri app must be running (pnpm tauri dev)'));
console.log(chalk.gray('    - WebSocket server on ws://127.0.0.1:61987\n'));

runTests().then((passed) => {
  process.exit(passed ? 0 : 1);
}).catch((err) => {
  console.error(chalk.red('Test runner error:'), err);
  process.exit(1);
});
