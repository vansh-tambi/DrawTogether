import WebSocket from 'ws';
import assert from 'node:assert';

const SERVER_URL = 'ws://localhost:3000';
const ROOM_ID = 'heartbeat-room';

async function runHeartbeatTest() {
  console.log('=== Starting Silent Disconnect Heartbeat Test ===');

  // Client A connects normally
  const wsA = new WebSocket(SERVER_URL);
  const messagesA: any[] = [];
  wsA.on('message', (raw) => messagesA.push(JSON.parse(raw.toString())));

  await new Promise<void>((resolve) => wsA.on('open', resolve));
  wsA.send(JSON.stringify({ type: 'join', roomId: ROOM_ID, userId: 'normal_user' }));

  // Client B connects and deliberately suppresses pong response to simulate silent freeze/dead net
  const wsB = new WebSocket(SERVER_URL);
  await new Promise<void>((resolve) => wsB.on('open', resolve));
  wsB.send(JSON.stringify({ type: 'join', roomId: ROOM_ID, userId: 'silent_dead_user' }));

  // Suppress default pong
  // @ts-ignore
  wsB.pong = () => {};

  console.log('Connected normal_user and silent_dead_user. Waiting for bounded heartbeat check (max ~11s)...');

  const start = Date.now();
  let userLeftReceived = false;

  while (Date.now() - start < 15000) {
    await new Promise((r) => setTimeout(r, 500));
    const leftMsg = messagesA.find((m) => m.type === 'user-left' && m.userId === 'silent_dead_user');
    if (leftMsg) {
      userLeftReceived = true;
      break;
    }
  }

  assert(userLeftReceived, 'Server heartbeat must prune dead socket and broadcast user-left within 10-12s');
  console.log(`✓ Silent dead client was successfully pruned and user-left broadcasted after ${Math.round((Date.now() - start)/1000)}s!`);

  wsA.send(JSON.stringify({ type: 'leave' }));
  wsA.close();
  wsB.terminate();

  console.log('=== Silent Disconnect Heartbeat Test PASSED! ===');
  process.exit(0);
}

runHeartbeatTest().catch((err) => {
  console.error('Heartbeat test failed:', err);
  process.exit(1);
});
