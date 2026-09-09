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

  // Client B connects and deliberately freezes its TCP socket to simulate an unresponsive client / silent network blackout
  const wsB = new WebSocket(SERVER_URL);
  await new Promise<void>((resolve) => wsB.on('open', resolve));
  wsB.send(JSON.stringify({ type: 'join', roomId: ROOM_ID, userId: 'silent_dead_user' }));

  await new Promise((r) => setTimeout(r, 200));

  // Pause underlying socket stream so no TCP packets/pings are processed or ponged
  // @ts-ignore
  if (wsB._socket) {
    // @ts-ignore
    wsB._socket.pause();
  }

  console.log('Connected normal_user and silent_dead_user. Waiting for bounded heartbeat sweep (approx 10-20s)...');

  const start = Date.now();
  let userLeftReceived = false;

  while (Date.now() - start < 25000) {
    await new Promise((r) => setTimeout(r, 500));
    const leftMsg = messagesA.find((m) => m.type === 'user-left' && m.userId === 'silent_dead_user');
    if (leftMsg) {
      userLeftReceived = true;
      break;
    }
  }

  assert(userLeftReceived, 'Server heartbeat must prune dead socket and broadcast user-left within bounded heartbeat window');
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
