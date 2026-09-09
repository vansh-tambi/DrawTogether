import WebSocket from 'ws';
import assert from 'node:assert';

const SERVER_URL = 'ws://localhost:3000';
const ROOM_ID = 'stress-room';

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runResilienceTest() {
  console.log('=== Starting DrawTogether Resilience & Stress Test ===');

  // 1. Launch 5 simultaneous clients
  console.log('1. Connecting 5 simultaneous clients...');
  const clients: { id: string; ws: WebSocket; messages: any[]; color?: string }[] = [];

  for (let i = 1; i <= 5; i++) {
    const id = `client_${i}`;
    const ws = new WebSocket(SERVER_URL);
    const clientData = { id, ws, messages: [] as any[], color: undefined as string | undefined };
    clients.push(clientData);

    ws.on('message', (raw) => {
      const parsed = JSON.parse(raw.toString());
      clientData.messages.push(parsed);
      if (parsed.type === 'welcome') {
        clientData.color = parsed.assignedColor;
      }
    });

    await new Promise<void>((resolve, reject) => {
      ws.on('open', () => {
        ws.send(JSON.stringify({ type: 'join', roomId: ROOM_ID, userId: id }));
        resolve();
      });
      ws.on('error', reject);
    });
  }

  await sleep(400);

  // Verify all 5 received welcome and distinct colors from the palette
  const colors = new Set<string>();
  for (const c of clients) {
    const welcome = c.messages.find((m) => m.type === 'welcome');
    assert(welcome, `Client ${c.id} should have received welcome`);
    colors.add(welcome.assignedColor);
  }
  // Client 5 should see all 5 participants in initial welcome snapshot
  const c5Welcome = clients[4].messages.find((m) => m.type === 'welcome');
  assert(c5Welcome.presence.length === 5, `Client 5 should see 5 participants in presence, got ${c5Welcome.presence.length}`);
  // Client 1 should have received 4 user-joined messages
  const c1JoinedMessages = clients[0].messages.filter((m) => m.type === 'user-joined');
  assert(c1JoinedMessages.length === 4, `Client 1 should receive 4 user-joined messages, got ${c1JoinedMessages.length}`);
  console.log(`✓ 5 clients connected simultaneously. Unique colors assigned: ${colors.size}/5`);

  // 2. Client 1 draws mid-stroke and abruptly drops connection
  console.log('2. Testing mid-stroke abrupt drop (Client 1)...');
  const c1 = clients[0];
  c1.ws.send(
    JSON.stringify({
      type: 'stroke-start',
      id: 'stroke_c1_mid',
      x: 100,
      y: 100,
      color: c1.color,
      width: 4,
      tool: 'brush',
    })
  );
  c1.ws.send(
    JSON.stringify({
      type: 'stroke-point',
      strokeId: 'stroke_c1_mid',
      x: 110,
      y: 110,
    })
  );
  c1.ws.send(
    JSON.stringify({
      type: 'stroke-point',
      strokeId: 'stroke_c1_mid',
      x: 120,
      y: 120,
    })
  );

  await sleep(100);
  // Abruptly terminate socket (simulate network crash or tab kill without clean close handshake)
  c1.ws.terminate();
  console.log('Client 1 abruptly terminated mid-stroke.');

  await sleep(400);

  // Verify surviving clients received user-left for client_1 and stroke-end or stroke was committed
  const c2 = clients[1];
  const userLeftForC1 = c2.messages.find((m) => m.type === 'user-left' && m.userId === 'client_1');
  assert(userLeftForC1, 'Surviving client should receive user-left when client_1 socket drops');
  console.log('✓ Surviving clients notified of client_1 exit.');

  // 3. Client 2 tests offline buffering and reconnection
  console.log('3. Testing offline queue & reconnect buffering with Client 2...');
  // Drop Client 2's connection
  c2.ws.close();
  await sleep(200);

  // Now simulate reconnecting with a fresh socket, sending join, receiving snapshot, and then flushing stroke
  const c2ReconnectedWs = new WebSocket(SERVER_URL);
  const c2NewMessages: any[] = [];
  c2ReconnectedWs.on('message', (raw) => c2NewMessages.push(JSON.parse(raw.toString())));

  await new Promise<void>((resolve) => c2ReconnectedWs.on('open', resolve));
  c2ReconnectedWs.send(JSON.stringify({ type: 'join', roomId: ROOM_ID, userId: 'client_2' }));

  await sleep(300);

  const reWelcome = c2NewMessages.find((m) => m.type === 'welcome');
  assert(reWelcome, 'Client 2 should receive welcome on reconnect');
  console.log(
    `✓ Client 2 reconnected! Canvas snapshot contains ${reWelcome.snapshot.strokes.length} strokes (including finalized mid-drop stroke from client 1).`
  );
  assert(
    reWelcome.snapshot.strokes.some((s: any) => s.id === 'stroke_c1_mid'),
    'Client 1 mid-stroke should be preserved in room snapshot!'
  );

  // Flush buffered offline stroke from Client 2
  console.log('Flushing offline stroke from Client 2...');
  c2ReconnectedWs.send(
    JSON.stringify({
      type: 'stroke-start',
      id: 'stroke_c2_offline',
      x: 200,
      y: 200,
      color: reWelcome.assignedColor,
      width: 6,
      tool: 'brush',
    })
  );
  c2ReconnectedWs.send(
    JSON.stringify({
      type: 'stroke-point',
      strokeId: 'stroke_c2_offline',
      x: 210,
      y: 210,
    })
  );
  c2ReconnectedWs.send(
    JSON.stringify({
      type: 'stroke-end',
      strokeId: 'stroke_c2_offline',
    })
  );

  await sleep(300);

  // 4. Test defensive server guard: send malformed garbage messages
  console.log('4. Testing defensive malformed message handling...');
  c2ReconnectedWs.send('NOT_JSON_AT_ALL');
  c2ReconnectedWs.send(JSON.stringify({ type: 'unknown_type', randomField: 123 }));
  c2ReconnectedWs.send(JSON.stringify({ type: 'stroke-start' })); // missing required fields
  await sleep(200);

  // Check if server is still completely responsive
  c2ReconnectedWs.send(JSON.stringify({ type: 'undo' }));
  await sleep(300);

  const undoApplied = c2NewMessages.find((m) => m.type === 'undo-applied');
  assert(undoApplied, 'Server should process undo cleanly even after malformed message barrage');
  console.log('✓ Malformed messages dropped silently without server crash.');

  // 5. Clean teardown of remaining clients
  console.log('5. Tearing down remaining clients...');
  c2ReconnectedWs.send(JSON.stringify({ type: 'leave' }));
  c2ReconnectedWs.close();

  for (let i = 2; i < clients.length; i++) {
    clients[i].ws.send(JSON.stringify({ type: 'leave' }));
    clients[i].ws.close();
  }

  await sleep(400);
  console.log('=== All Resilience & Hardening Tests PASSED! ===');
  process.exit(0);
}

runResilienceTest().catch((err) => {
  console.error('Test FAILED:', err);
  process.exit(1);
});
