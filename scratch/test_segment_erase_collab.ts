import WebSocket from 'ws';
import assert from 'node:assert';
import { eraseStrokeSegmentAt } from '../client/geometry';
import type { Stroke } from '../shared/protocol';

const SERVER_URL = 'ws://localhost:3000';
const ROOM_ID = 'segment-erase-test-room';

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function runCollabSegmentEraseTest() {
  console.log('=== Starting Collaborative Segment Eraser Test ===');

  const wsA = new WebSocket(SERVER_URL);
  const wsB = new WebSocket(SERVER_URL);

  const messagesA: any[] = [];
  const messagesB: any[] = [];

  wsA.on('message', (raw) => messagesA.push(JSON.parse(raw.toString())));
  wsB.on('message', (raw) => messagesB.push(JSON.parse(raw.toString())));

  await Promise.all([
    new Promise<void>((r) => wsA.on('open', r)),
    new Promise<void>((r) => wsB.on('open', r)),
  ]);

  wsA.send(JSON.stringify({ type: 'join', roomId: ROOM_ID, userId: 'user_a' }));
  wsB.send(JSON.stringify({ type: 'join', roomId: ROOM_ID, userId: 'user_b' }));

  await sleep(300);

  // 1. User A draws a horizontal line (100,200 to 300,200)
  console.log('1. User A draws horizontal line...');
  wsA.send(
    JSON.stringify({
      type: 'stroke-start',
      id: 'stroke_h',
      x: 100,
      y: 200,
      color: '#2563eb',
      width: 4,
      tool: 'brush',
    })
  );
  wsA.send(JSON.stringify({ type: 'stroke-point', strokeId: 'stroke_h', x: 200, y: 200 }));
  wsA.send(JSON.stringify({ type: 'stroke-point', strokeId: 'stroke_h', x: 300, y: 200 }));
  wsA.send(JSON.stringify({ type: 'stroke-end', strokeId: 'stroke_h' }));

  await sleep(150);

  // 2. User A draws a vertical line (200,100 to 200,300), crossing at (200,200)
  console.log('2. User A draws vertical crossing line...');
  wsA.send(
    JSON.stringify({
      type: 'stroke-start',
      id: 'stroke_v',
      x: 200,
      y: 100,
      color: '#e11d48',
      width: 4,
      tool: 'brush',
    })
  );
  wsA.send(JSON.stringify({ type: 'stroke-point', strokeId: 'stroke_v', x: 200, y: 200 }));
  wsA.send(JSON.stringify({ type: 'stroke-point', strokeId: 'stroke_v', x: 200, y: 300 }));
  wsA.send(JSON.stringify({ type: 'stroke-end', strokeId: 'stroke_v' }));

  await sleep(250);

  // Reconstruct User B's local strokes
  const strokeH: Stroke = {
    id: 'stroke_h',
    userId: 'user_a',
    color: '#2563eb',
    width: 4,
    tool: 'brush',
    points: [
      { x: 100, y: 200 },
      { x: 200, y: 200 },
      { x: 300, y: 200 },
    ],
  };
  const strokeV: Stroke = {
    id: 'stroke_v',
    userId: 'user_a',
    color: '#e11d48',
    width: 4,
    tool: 'brush',
    points: [
      { x: 200, y: 100 },
      { x: 200, y: 200 },
      { x: 200, y: 300 },
    ],
  };

  // 3. User B uses segment eraser on the left arm of stroke_h at (140, 200)
  console.log('3. User B clicks left arm of stroke_h with segment eraser...');
  const trimResult = eraseStrokeSegmentAt({ x: 140, y: 200 }, [strokeH, strokeV]);
  assert(trimResult !== null, 'Segment eraser must detect stroke_h');
  assert.strictEqual(trimResult.targetStroke.id, 'stroke_h');
  assert.strictEqual(trimResult.replacementStrokes.length, 1, 'Should trim to 1 stroke');

  wsB.send(
    JSON.stringify({
      type: 'erase-segment',
      targetStrokeId: trimResult.targetStroke.id,
      newStrokes: trimResult.replacementStrokes,
    })
  );

  await sleep(300);

  // Verify User A received segment-erased message
  const segMsgA = messagesA.find((m) => m.type === 'segment-erased');
  assert(segMsgA, 'User A must receive segment-erased event');
  assert.strictEqual(segMsgA.targetStrokeId, 'stroke_h');
  assert.strictEqual(segMsgA.newStrokes.length, 1);
  console.log('✓ User A received synchronized segment-erased event with updated trimmed stroke.');

  // 4. Test Undo: User B triggers undo
  console.log('4. Testing Undo of segment erase...');
  wsB.send(JSON.stringify({ type: 'undo' }));
  await sleep(300);

  const undoMsgA = messagesA.find((m) => m.type === 'undo-applied');
  assert(undoMsgA, 'User A must receive undo-applied event');
  // Verify the restored stroke is the original full stroke_h
  const restored = undoMsgA.strokes.find((s: any) => s.id === 'stroke_h');
  assert(restored, 'Original uncut stroke_h must be restored upon undo');
  assert.strictEqual(restored.points[0].x, 100);
  assert.strictEqual(restored.points[restored.points.length - 1].x, 300);
  console.log('✓ Undo cleanly restored the original uncut stroke for all room participants.');

  // 5. Test Redo: User B triggers redo
  console.log('5. Testing Redo of segment erase...');
  wsB.send(JSON.stringify({ type: 'redo' }));
  await sleep(300);

  const redoMsgA = messagesA.find((m) => m.type === 'redo-applied');
  assert(redoMsgA, 'User A must receive redo-applied event');
  // Verify stroke_h is trimmed again (new stroke id, starts at 200)
  const trimmedAfterRedo = redoMsgA.strokes.find((s: any) => s.id !== 'stroke_v');
  assert(trimmedAfterRedo, 'Trimmed stroke must exist after redo');
  assert.strictEqual(trimmedAfterRedo.points[0].x, 200, 'Trimmed stroke starts at intersection point');
  console.log('✓ Redo cleanly re-applied the segment erase.');

  // Teardown
  wsA.send(JSON.stringify({ type: 'leave' }));
  wsB.send(JSON.stringify({ type: 'leave' }));
  wsA.close();
  wsB.close();

  console.log('=== Collaborative Segment Eraser Test PASSED! ===');
  process.exit(0);
}

runCollabSegmentEraseTest().catch((err) => {
  console.error('Collab test FAILED:', err);
  process.exit(1);
});
