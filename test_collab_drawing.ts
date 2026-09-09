import { WebSocket } from 'ws';
import type { ServerMessage, ClientMessage } from './shared/protocol';

async function runE2ETest() {
  console.log('--- Connecting Client A and Client B ---');

  const wsA = new WebSocket('ws://localhost:3000');
  const wsB = new WebSocket('ws://localhost:3000');

  const receivedA: ServerMessage[] = [];
  const receivedB: ServerMessage[] = [];

  await Promise.all([
    new Promise<void>((resolve) => wsA.on('open', resolve)),
    new Promise<void>((resolve) => wsB.on('open', resolve)),
  ]);

  wsA.on('message', (data) => receivedA.push(JSON.parse(data.toString())));
  wsB.on('message', (data) => receivedB.push(JSON.parse(data.toString())));

  // Join same room
  wsA.send(JSON.stringify({ type: 'join', roomId: 'collab-test-room', userId: 'user_alice' }));
  wsB.send(JSON.stringify({ type: 'join', roomId: 'collab-test-room', userId: 'user_bob' }));

  await new Promise((r) => setTimeout(r, 100));

  console.log('Client A received welcome/join messages:', receivedA.length);
  console.log('Client B received welcome/join messages:', receivedB.length);

  // Clear event logs for stroke testing
  receivedA.length = 0;
  receivedB.length = 0;

  console.log('\n--- Client A draws a stroke ---');
  const strokeId = 'test_stroke_123';
  wsA.send(JSON.stringify({
    type: 'stroke-start',
    id: strokeId,
    x: 100,
    y: 100,
    color: '#2563eb',
    width: 4,
    tool: 'brush',
  }));

  wsA.send(JSON.stringify({
    type: 'stroke-point',
    strokeId,
    x: 110,
    y: 110,
  }));

  wsA.send(JSON.stringify({
    type: 'stroke-end',
    strokeId,
  }));

  await new Promise((r) => setTimeout(r, 100));

  // Verify Client A did NOT receive server echo
  const aStrokes = receivedA.filter((m) => m.type === 'stroke-start' || m.type === 'stroke-point' || m.type === 'stroke-end');
  if (aStrokes.length !== 0) {
    console.error('FAILED: Client A should not receive echo of its own stroke events!', aStrokes);
    process.exit(1);
  }
  console.log('✓ Confirmed: Sender (Client A) receives no server echo for its strokes.');

  // Verify Client B received live stroke events tagged with Alice's userId
  const bStrokeStart = receivedB.find((m) => m.type === 'stroke-start');
  const bStrokePoint = receivedB.find((m) => m.type === 'stroke-point');
  const bStrokeEnd = receivedB.find((m) => m.type === 'stroke-end');

  if (!bStrokeStart || !bStrokePoint || !bStrokeEnd) {
    console.error('FAILED: Client B did not receive full live stroke sequence:', receivedB);
    process.exit(1);
  }

  if (
    (bStrokeStart as Extract<ServerMessage, { type: 'stroke-start' }>).userId !== 'user_alice' ||
    (bStrokePoint as Extract<ServerMessage, { type: 'stroke-point' }>).userId !== 'user_alice' ||
    (bStrokeEnd as Extract<ServerMessage, { type: 'stroke-end' }>).userId !== 'user_alice'
  ) {
    console.error('FAILED: Client B stroke events not tagged with sender userId:', { bStrokeStart, bStrokePoint, bStrokeEnd });
    process.exit(1);
  }
  console.log('✓ Confirmed: Peer (Client B) received live stroke-start, stroke-point, stroke-end tagged with user_alice.');

  console.log('\n--- Client B sends undo ---');
  receivedA.length = 0;
  receivedB.length = 0;

  wsB.send(JSON.stringify({ type: 'undo' }));
  await new Promise((r) => setTimeout(r, 100));

  const aUndo = receivedA.find((m) => m.type === 'undo-applied');
  const bUndo = receivedB.find((m) => m.type === 'undo-applied');

  if (!aUndo || !bUndo) {
    console.error('FAILED: Both clients should receive undo-applied!', { aUndo, bUndo });
    process.exit(1);
  }
  console.log('✓ Confirmed: Both Client A and Client B received undo-applied message with updated visible strokes.');

  console.log('\n--- Client A sends redo ---');
  receivedA.length = 0;
  receivedB.length = 0;

  wsA.send(JSON.stringify({ type: 'redo' }));
  await new Promise((r) => setTimeout(r, 100));

  const aRedo = receivedA.find((m) => m.type === 'redo-applied');
  const bRedo = receivedB.find((m) => m.type === 'redo-applied');

  if (!aRedo || !bRedo) {
    console.error('FAILED: Both clients should receive redo-applied!', { aRedo, bRedo });
    process.exit(1);
  }
  console.log('✓ Confirmed: Both Client A and Client B received redo-applied message with restored stroke.');

  wsA.close();
  wsB.close();

  console.log('\nALL COLLABORATIVE DRAWING INTEGRATION TESTS PASSED!');
  process.exit(0);
}

runE2ETest().catch((err) => {
  console.error('E2E Test Error:', err);
  process.exit(1);
});
