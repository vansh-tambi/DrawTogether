import type { Point, Stroke } from '../shared/protocol';

export interface IntersectionResult {
  point: Point;
  s: number; // Continuous parameter along target stroke [0, points.length - 1]
}

export interface SegmentEraseResult {
  targetStroke: Stroke;
  replacementStrokes: Stroke[];
  erasedSegment: {
    startPoint: Point;
    endPoint: Point;
  };
}

/**
 * Computes 2D vector cross product: v1.x * v2.y - v1.y * v2.x
 */
function cross(x1: number, y1: number, x2: number, y2: number): number {
  return x1 * y2 - y1 * x2;
}

/**
 * Computes distance between two points.
 */
export function distance(p1: Point, p2: Point): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Calculates squared distance between two points.
 */
export function distanceSq(p1: Point, p2: Point): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return dx * dx + dy * dy;
}

/**
 * Finds the minimum distance from point P to line segment AB,
 * along with the projection parameter t clamped to [0, 1].
 */
export function pointToSegmentDistance(
  p: Point,
  a: Point,
  b: Point
): { distance: number; t: number; projection: Point } {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const lenSq = abx * abx + aby * aby;

  if (lenSq < 1e-9) {
    return {
      distance: distance(p, a),
      t: 0,
      projection: { x: a.x, y: a.y },
    };
  }

  const apx = p.x - a.x;
  const apy = p.y - a.y;
  const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / lenSq));

  const projX = a.x + t * abx;
  const projY = a.y + t * aby;
  const dist = Math.sqrt((p.x - projX) * (p.x - projX) + (p.y - projY) * (p.y - projY));

  return {
    distance: dist,
    t,
    projection: { x: projX, y: projY },
  };
}

/**
 * Computes intersection between line segment p1-p2 and line segment p3-p4.
 * Returns intersection point and parameters t, u in [0, 1] if lines intersect.
 */
export function lineSegmentIntersection(
  p1: Point,
  p2: Point,
  p3: Point,
  p4: Point
): { point: Point; t: number; u: number } | null {
  const rX = p2.x - p1.x;
  const rY = p2.y - p1.y;
  const sX = p4.x - p3.x;
  const sY = p4.y - p3.y;

  const rCrossS = cross(rX, rY, sX, sY);
  if (Math.abs(rCrossS) < 1e-8) {
    // Parallel or collinear
    return null;
  }

  const qMinusPX = p3.x - p1.x;
  const qMinusPY = p3.y - p1.y;

  const t = cross(qMinusPX, qMinusPY, sX, sY) / rCrossS;
  const u = cross(qMinusPX, qMinusPY, rX, rY) / rCrossS;

  const EPS = 1e-4;
  if (t >= -EPS && t <= 1 + EPS && u >= -EPS && u <= 1 + EPS) {
    const clampedT = Math.max(0, Math.min(1, t));
    return {
      point: {
        x: p1.x + clampedT * rX,
        y: p1.y + clampedT * rY,
      },
      t: clampedT,
      u: Math.max(0, Math.min(1, u)),
    };
  }

  return null;
}

/**
 * Identifies the stroke nearest to the given click coordinates within a tolerance.
 */
export function findClosestStroke(
  clickPoint: Point,
  strokes: Stroke[],
  threshold = 16
): { stroke: Stroke; segmentIndex: number; t: number; distance: number } | null {
  let closest: { stroke: Stroke; segmentIndex: number; t: number; distance: number } | null = null;
  let minDistance = Infinity;

  // Search strokes in reverse order (top-most first)
  for (let sIdx = strokes.length - 1; sIdx >= 0; sIdx--) {
    const stroke = strokes[sIdx];
    if (stroke.tool === 'eraser') continue; // Skip eraser mask strokes

    const strokeTolerance = Math.max(stroke.width / 2 + 8, threshold);
    const pts = stroke.points;
    if (!pts || pts.length === 0) continue;

    if (pts.length === 1) {
      const d = distance(clickPoint, pts[0]);
      if (d <= strokeTolerance && d < minDistance) {
        minDistance = d;
        closest = { stroke, segmentIndex: 0, t: 0, distance: d };
      }
      continue;
    }

    for (let i = 0; i < pts.length - 1; i++) {
      const segDist = pointToSegmentDistance(clickPoint, pts[i], pts[i + 1]);
      if (segDist.distance <= strokeTolerance && segDist.distance < minDistance) {
        minDistance = segDist.distance;
        closest = {
          stroke,
          segmentIndex: i,
          t: segDist.t,
          distance: segDist.distance,
        };
      }
    }
  }

  return closest;
}

/**
 * Finds all intersection points of targetStroke with other strokes.
 */
export function findStrokeIntersections(
  targetStroke: Stroke,
  allStrokes: Stroke[]
): IntersectionResult[] {
  const results: IntersectionResult[] = [];
  const targetPts = targetStroke.points;
  if (targetPts.length < 2) return results;

  for (const other of allStrokes) {
    if (other.tool === 'eraser') continue;
    const otherPts = other.points;
    if (otherPts.length < 2) continue;

    const isSelf = other.id === targetStroke.id;

    for (let i = 0; i < targetPts.length - 1; i++) {
      const p1 = targetPts[i];
      const p2 = targetPts[i + 1];

      for (let j = 0; j < otherPts.length - 1; j++) {
        // Skip adjacent segments on self-intersection
        if (isSelf && Math.abs(i - j) <= 1) continue;

        const p3 = otherPts[j];
        const p4 = otherPts[j + 1];

        const hit = lineSegmentIntersection(p1, p2, p3, p4);
        if (hit) {
          const s = i + hit.t;
          results.push({ point: hit.point, s });
        }
      }
    }
  }

  // Sort by parameter s ascending
  results.sort((a, b) => a.s - b.s);

  // De-duplicate intersections very close to each other
  const unique: IntersectionResult[] = [];
  for (const item of results) {
    if (unique.length === 0 || Math.abs(item.s - unique[unique.length - 1].s) > 0.04) {
      unique.push(item);
    }
  }

  return unique;
}

/**
 * Extracts a sub-path from targetStroke from continuous parameter sStart to sEnd.
 * Generates exact points and preserves stroke properties.
 */
function sliceStroke(
  targetStroke: Stroke,
  sStart: number,
  sEnd: number,
  startPt: Point,
  endPt: Point,
  newId: string
): Stroke | null {
  if (sEnd - sStart < 0.05) {
    return null; // Too short to form a meaningful stroke
  }

  const pts = targetStroke.points;
  const slicedPoints: Point[] = [{ x: startPt.x, y: startPt.y }];

  const firstWholeIdx = Math.ceil(sStart);
  const lastWholeIdx = Math.floor(sEnd);

  for (let i = firstWholeIdx; i <= lastWholeIdx; i++) {
    if (i > sStart && i < sEnd && i < pts.length) {
      slicedPoints.push({ x: pts[i].x, y: pts[i].y });
    }
  }

  slicedPoints.push({ x: endPt.x, y: endPt.y });

  // Filter consecutive identical points
  const cleanPoints: Point[] = [];
  for (const pt of slicedPoints) {
    if (cleanPoints.length === 0 || distanceSq(pt, cleanPoints[cleanPoints.length - 1]) > 0.25) {
      cleanPoints.push(pt);
    }
  }

  if (cleanPoints.length < 2) {
    return null;
  }

  return {
    id: newId,
    userId: targetStroke.userId,
    tool: targetStroke.tool,
    color: targetStroke.color,
    width: targetStroke.width,
    points: cleanPoints,
  };
}

/**
 * Erases the line segment of targetStroke at clickPoint, stopping at nearest intersections
 * with other lines or line endpoints.
 *
 * Returns the replacement strokes (0, 1, or 2 strokes) replacing targetStroke.
 */
export function eraseStrokeSegmentAt(
  clickPoint: Point,
  allStrokes: Stroke[],
  threshold = 18
): SegmentEraseResult | null {
  const hit = findClosestStroke(clickPoint, allStrokes, threshold);
  if (!hit) return null;

  const targetStroke = hit.stroke;
  const pts = targetStroke.points;
  if (pts.length < 2) {
    // Single point stroke: simply erase entirely
    return {
      targetStroke,
      replacementStrokes: [],
      erasedSegment: {
        startPoint: pts[0] || clickPoint,
        endPoint: pts[0] || clickPoint,
      },
    };
  }

  const clickS = hit.segmentIndex + hit.t;
  const maxS = pts.length - 1;

  // Find all intersections of targetStroke with other strokes
  const intersections = findStrokeIntersections(targetStroke, allStrokes);

  // Build partition boundaries: [0, int_1, int_2, ..., maxS]
  interface Boundary {
    s: number;
    point: Point;
  }

  const boundaries: Boundary[] = [
    { s: 0, point: pts[0] },
    ...intersections.map((i) => ({ s: i.s, point: i.point })),
    { s: maxS, point: pts[pts.length - 1] },
  ];

  // Find which interval contains clickS
  let targetIntervalIdx = 0;
  for (let i = 0; i < boundaries.length - 1; i++) {
    if (clickS >= boundaries[i].s && clickS <= boundaries[i + 1].s) {
      targetIntervalIdx = i;
      break;
    }
  }

  const cutStart = boundaries[targetIntervalIdx];
  const cutEnd = boundaries[targetIntervalIdx + 1];

  const replacementStrokes: Stroke[] = [];
  const randSuffix = Math.random().toString(36).substring(2, 7);

  // 1. Portion before cut (0 to cutStart.s)
  if (cutStart.s > 0.08) {
    const headStroke = sliceStroke(
      targetStroke,
      0,
      cutStart.s,
      pts[0],
      cutStart.point,
      `${targetStroke.id}_h_${randSuffix}`
    );
    if (headStroke) {
      replacementStrokes.push(headStroke);
    }
  }

  // 2. Portion after cut (cutEnd.s to maxS)
  if (cutEnd.s < maxS - 0.08) {
    const tailStroke = sliceStroke(
      targetStroke,
      cutEnd.s,
      maxS,
      cutEnd.point,
      pts[pts.length - 1],
      `${targetStroke.id}_t_${randSuffix}`
    );
    if (tailStroke) {
      replacementStrokes.push(tailStroke);
    }
  }

  return {
    targetStroke,
    replacementStrokes,
    erasedSegment: {
      startPoint: cutStart.point,
      endPoint: cutEnd.point,
    },
  };
}
