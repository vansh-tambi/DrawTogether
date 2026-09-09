import assert from 'node:assert';
import { eraseStrokeSegmentAt, lineSegmentIntersection } from '../client/geometry';
import type { Stroke } from '../shared/protocol';

function runGeometryTests() {
  console.log('=== Running Geometry Unit Tests ===');

  // Test 1: Basic segment intersection
  const hit = lineSegmentIntersection(
    { x: 0, y: 10 },
    { x: 20, y: 10 },
    { x: 10, y: 0 },
    { x: 10, y: 20 }
  );
  assert(hit !== null, 'Perpendicular segments must intersect');
  assert.strictEqual(hit.point.x, 10);
  assert.strictEqual(hit.point.y, 10);
  console.log('✓ Line segment intersection math verified.');

  // Test 2: Isolated stroke click -> completely erased
  const isolatedStroke: Stroke = {
    id: 's_isolated',
    userId: 'u1',
    tool: 'brush',
    color: '#000',
    width: 4,
    points: [
      { x: 50, y: 50 },
      { x: 100, y: 50 },
      { x: 150, y: 50 },
    ],
  };

  const resIsolated = eraseStrokeSegmentAt({ x: 80, y: 52 }, [isolatedStroke]);
  assert(resIsolated !== null, 'Should hit isolated stroke');
  assert.strictEqual(resIsolated.targetStroke.id, 's_isolated');
  assert.strictEqual(resIsolated.replacementStrokes.length, 0, 'Isolated stroke should be fully erased');
  console.log('✓ Isolated stroke erase verified.');

  // Test 3: Two intersecting strokes (+ cross)
  const horizStroke: Stroke = {
    id: 's_horiz',
    userId: 'u1',
    tool: 'brush',
    color: '#2563eb',
    width: 4,
    points: [
      { x: 100, y: 200 },
      { x: 200, y: 200 },
      { x: 300, y: 200 },
    ],
  };

  const vertStroke: Stroke = {
    id: 's_vert',
    userId: 'u1',
    tool: 'brush',
    color: '#e11d48',
    width: 4,
    points: [
      { x: 200, y: 100 },
      { x: 200, y: 200 },
      { x: 200, y: 300 },
    ],
  };

  // Click on the left arm of horizontal stroke (x=140, y=201)
  const resLeftArm = eraseStrokeSegmentAt({ x: 140, y: 201 }, [horizStroke, vertStroke]);
  assert(resLeftArm !== null, 'Should hit horizontal stroke left arm');
  assert.strictEqual(resLeftArm.targetStroke.id, 's_horiz');
  assert.strictEqual(resLeftArm.replacementStrokes.length, 1, 'Should leave 1 remaining trimmed stroke');
  const remaining = resLeftArm.replacementStrokes[0];
  assert.strictEqual(remaining.points[0].x, 200, 'Remaining stroke should start at intersection x=200');
  assert.strictEqual(remaining.points[remaining.points.length - 1].x, 300, 'Remaining stroke should end at x=300');
  console.log('✓ End-to-intersection arm trimming verified.');

  // Test 4: Stroke with two intersections, clicking the middle segment -> splits into 2 strokes
  const baseLine: Stroke = {
    id: 's_base',
    userId: 'u1',
    tool: 'brush',
    color: '#000',
    width: 4,
    points: [
      { x: 50, y: 100 },
      { x: 150, y: 100 },
      { x: 250, y: 100 },
      { x: 350, y: 100 },
    ],
  };
  const cross1: Stroke = {
    id: 's_c1',
    userId: 'u1',
    tool: 'brush',
    color: '#000',
    width: 4,
    points: [{ x: 100, y: 50 }, { x: 100, y: 150 }],
  };
  const cross2: Stroke = {
    id: 's_c2',
    userId: 'u1',
    tool: 'brush',
    color: '#000',
    width: 4,
    points: [{ x: 300, y: 50 }, { x: 300, y: 150 }],
  };

  // Click in middle between cross1 (x=100) and cross2 (x=300), e.g. x=200
  const resMiddle = eraseStrokeSegmentAt({ x: 200, y: 102 }, [baseLine, cross1, cross2]);
  assert(resMiddle !== null, 'Should hit middle segment');
  assert.strictEqual(resMiddle.replacementStrokes.length, 2, 'Middle cut should split into 2 remaining strokes');
  const head = resMiddle.replacementStrokes[0];
  const tail = resMiddle.replacementStrokes[1];
  assert.strictEqual(head.points[0].x, 50);
  assert.strictEqual(head.points[head.points.length - 1].x, 100, 'Head should end at first intersection (100)');
  assert.strictEqual(tail.points[0].x, 300, 'Tail should start at second intersection (300)');
  assert.strictEqual(tail.points[tail.points.length - 1].x, 350);
  console.log('✓ Middle segment erase between two intersections (splitting stroke) verified.');

  console.log('=== All Geometry Tests PASSED! ===');
}

runGeometryTests();
