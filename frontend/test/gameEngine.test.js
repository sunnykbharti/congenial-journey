import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  mapPointToContainer,
  transformKeypoints,
} from '../src/utils/coordinateMapping.js';

import {
  createCalibrationManager,
  generateNextTarget,
  createDwellTracker,
  calculateTargetScore,
} from '../src/utils/gameEngine.js';

describe('1. Mirrored and Non-Mirrored Coordinate Mapping', () => {
  const sourceDim = { width: 640, height: 480 };
  const containerDim = { width: 640, height: 480 };

  test('maps 1:1 point without mirroring', () => {
    const pt = mapPointToContainer(100, 150, sourceDim, containerDim, { fit: 'cover', mirrorX: false });
    assert.equal(pt.x, 100);
    assert.equal(pt.y, 150);
  });

  test('correctly mirrors X coordinate for user-facing selfie webcam', () => {
    // In mirrored display: an inference point at x=100 on 640w frame maps to 640 - 100 = 540
    const pt = mapPointToContainer(100, 150, sourceDim, containerDim, { fit: 'cover', mirrorX: true });
    assert.equal(pt.x, 540);
    assert.equal(pt.y, 150);
  });

  test('preserves anatomical keypoint identity while mirroring position', () => {
    const rawKeypoints = {
      left_wrist: { x: 120, y: 200, confidence: 0.95 },
      right_wrist: { x: 500, y: 210, confidence: 0.92 },
    };
    const transformed = transformKeypoints(rawKeypoints, sourceDim, containerDim, { mirrorX: true });

    assert.equal(transformed.left_wrist.x, 640 - 120);
    assert.equal(transformed.left_wrist.y, 200);
    assert.equal(transformed.left_wrist.confidence, 0.95);

    assert.equal(transformed.right_wrist.x, 640 - 500);
    assert.equal(transformed.right_wrist.y, 210);
  });
});

describe('2. Letterboxing/Cropping and Resized Arenas', () => {
  const sourceDim = { width: 640, height: 480 }; // 4:3 ratio

  test('handles cover scaling on wider 16:9 container (cropping vertical excess)', () => {
    const wideContainer = { width: 1280, height: 720 };
    // scale = max(1280/640=2.0, 720/480=1.5) = 2.0
    // renderedH = 480 * 2.0 = 960 -> offsetY = (720 - 960)/2 = -120
    const centerPoint = mapPointToContainer(320, 240, sourceDim, wideContainer, { fit: 'cover', mirrorX: false });
    // mappedX = 320 * 2 = 640
    // mappedY = 240 * 2 - 120 = 480 - 120 = 360 (exact center of 720h!)
    assert.equal(centerPoint.x, 640);
    assert.equal(centerPoint.y, 360);
  });

  test('handles contain scaling on taller container (letterboxing vertical space)', () => {
    const tallContainer = { width: 640, height: 960 };
    // scale = min(640/640=1.0, 960/480=2.0) = 1.0
    // renderedH = 480 -> offsetY = (960 - 480)/2 = 240
    const centerPoint = mapPointToContainer(320, 240, sourceDim, tallContainer, { fit: 'contain', mirrorX: false });
    assert.equal(centerPoint.x, 320);
    assert.equal(centerPoint.y, 240 + 240); // 480 (exact center of 960h!)
  });
});

describe('3. Target Generation Within Calibrated Bounds', () => {
  const bounds = { minX: 100, maxX: 700, minY: 80, maxY: 420 };
  const targetRadius = 50;

  test('ensures targets are generated strictly within calibrated limits with radius margin', () => {
    // Synthetic deterministic PRNG
    let seed = 0.123;
    const fakeRng = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };

    for (let i = 0; i < 50; i++) {
      const target = generateNextTarget(bounds, targetRadius, null, fakeRng);
      // Entire target must be inside bounds:
      // x - r >= minX, x + r <= maxX
      // y - r >= minY, y + r <= maxY
      assert.ok(target.x - target.radius >= bounds.minX - 1);
      assert.ok(target.x + target.radius <= bounds.maxX + 1);
      assert.ok(target.y - target.radius >= bounds.minY - 1);
      assert.ok(target.y + target.radius <= bounds.maxY + 1);
    }
  });

  test('attempts distance spacing from previous target location', () => {
    const prevTarget = { x: 200, y: 150 };
    const nextTarget = generateNextTarget(bounds, targetRadius, prevTarget, () => 0.8);
    const dist = Math.hypot(nextTarget.x - prevTarget.x, nextTarget.y - prevTarget.y);
    assert.ok(dist > 0);
  });
});

describe('4. Timestamp-Based Dwell Accumulation', () => {
  test('accumulates dwell proportionally to elapsed timestamp delta', () => {
    const tracker = createDwellTracker(1000); // 1000ms full dwell
    const target = { x: 300, y: 300, radius: 50 };
    const cursor = { x: 310, y: 295 }; // Inside target

    // First frame initializes baseline timestamp
    const t0 = 1000;
    tracker.updateHand('right', cursor, target, t0);

    // After 500ms -> progress should be approximately 0.5
    const t1 = 1500;
    const res1 = tracker.updateHand('right', cursor, target, t1);
    assert.equal(res1.completed, false);
    assert.ok(res1.progress >= 0.49 && res1.progress <= 0.51);

    // After another 500ms (1000ms total) -> should complete
    const t2 = 2000;
    const res2 = tracker.updateHand('right', cursor, target, t2);
    assert.equal(res2.completed, true);
    assert.equal(res2.progress, 1.0);
  });
});

describe('5. Dwell Reset/Pause on Missing or Stale Keypoints', () => {
  test('drains/pauses dwell progress when hand leaves target or tracking is lost', () => {
    const tracker = createDwellTracker(1000);
    const target = { x: 200, y: 200, radius: 40 };

    tracker.updateHand('right', { x: 200, y: 200 }, target, 1000);
    const step1 = tracker.updateHand('right', { x: 200, y: 200 }, target, 1200);
    assert.ok(step1.progress > 0);

    // Hand leaves target area
    const step2 = tracker.updateHand('right', { x: 500, y: 500 }, target, 1300);
    assert.equal(step2.inTarget, false);
    assert.ok(step2.progress < step1.progress); // Drains progress

    // Hand tracking completely lost (null cursor)
    const step3 = tracker.updateHand('right', null, target, 1400);
    assert.equal(step3.inTarget, false);
    assert.ok(step3.progress < step2.progress);
  });
});

describe('6. Independent Left and Right Hand Tracking', () => {
  test('maintains separate dwell progress so alternating hands does not falsely trigger collection', () => {
    const tracker = createDwellTracker(1000);
    const target = { x: 250, y: 250, radius: 50 };

    const leftHand = { x: 250, y: 250 }; // in target
    const rightHand = { x: 50, y: 50 };   // outside target

    // Left hand enters target for 400ms
    tracker.updateHand('left', leftHand, target, 1000);
    const leftRes = tracker.updateHand('left', leftHand, target, 1400);
    assert.ok(leftRes.progress >= 0.38 && leftRes.progress <= 0.42);

    // Right hand enters target for only 100ms
    tracker.updateHand('right', rightHand, target, 1400);
    const rightRes = tracker.updateHand('right', { x: 250, y: 250 }, target, 1500);
    // Right hand progress must be independent (~0.1), NOT combined with left hand!
    assert.ok(rightRes.progress >= 0.08 && rightRes.progress <= 0.12);
    assert.equal(rightRes.completed, false);
  });
});

describe('7. Single Scoring Event Per Target', () => {
  test('awards points and combo bonus exactly once per target', () => {
    const tracker = createDwellTracker(500);
    const target = { x: 100, y: 100, radius: 50 };
    const hand = { x: 100, y: 100 };

    tracker.updateHand('right', hand, target, 1000);
    const completedRes = tracker.updateHand('right', hand, target, 1600);
    assert.equal(completedRes.completed, true);

    // Subsequent updates on the same target before reset MUST NOT re-trigger completion
    const redundantRes = tracker.updateHand('right', hand, target, 1700);
    assert.equal(redundantRes.completed, false);

    // Score calculation
    let currentScore = 0;
    let combo = 0;
    const score1 = calculateTargetScore(currentScore, combo, 100);
    assert.equal(score1.newScore, 100);
    assert.equal(score1.newCombo, 1);

    // Second consecutive target awards combo
    const score2 = calculateTargetScore(score1.newScore, score1.newCombo, 100);
    assert.equal(score2.newScore, 210); // 100 base + 10 combo
    assert.equal(score2.newCombo, 2);
  });
});

describe('8. Calibration Reach Verification', () => {
  test('rejects insufficient range and approves wide comfortable range', () => {
    const manager = createCalibrationManager({ minSamples: 5, minSpanX: 80, minSpanY: 60 });

    // Insufficient samples
    manager.addSample({ x: 100, y: 100 });
    assert.equal(manager.isReady(), false);
    assert.equal(manager.computeBounds().valid, false);

    // Tiny range (user did not move)
    manager.reset();
    for (let i = 0; i < 6; i++) {
      manager.addSample({ x: 100 + i, y: 100 + i });
    }
    const tinyResult = manager.computeBounds({ width: 800, height: 600 });
    assert.equal(tinyResult.valid, false);
    assert.equal(tinyResult.reason, 'range_too_small');

    // Wide comfortable reach
    manager.reset();
    manager.addSample({ x: 150, y: 120 });
    manager.addSample({ x: 600, y: 450 });
    manager.addSample({ x: 300, y: 250 });
    manager.addSample({ x: 450, y: 380 });
    manager.addSample({ x: 220, y: 180 });
    const wideResult = manager.computeBounds({ width: 800, height: 600 });
    assert.equal(wideResult.valid, true);
    assert.ok(wideResult.minX < wideResult.maxX);
    assert.ok(wideResult.minY < wideResult.maxY);
  });
});
