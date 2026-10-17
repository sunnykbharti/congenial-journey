/**
 * gameEngine.js - Deterministic Game State Machine, Target Generation,
 * Dwell Accumulator, and Tracking Quality Monitor for PosePlay.
 */

export const GAME_STATES = {
  IDLE: 'idle',
  REQUESTING_CAMERA: 'requesting_camera',
  CALIBRATING: 'calibrating',
  COUNTDOWN: 'countdown',
  PLAYING: 'playing',
  PAUSED: 'paused',
  TRACKING_LOST: 'tracking_lost',
  FINISHED: 'finished',
  ERROR: 'error',
};

export const CONFIDENCE_THRESHOLD = 0.35;
export const STALE_TRACKING_THRESHOLD_MS = 800; // Pause dwell if no frame update in 800ms
export const SUSTAINED_TRACKING_LOSS_MS = 2000; // Trigger tracking_lost state if lost > 2s

/**
 * Creates a Calibration Manager to record reachable movement bounds.
 */
export function createCalibrationManager(options = {}) {
  const {
    minSamples = 15,
    minSpanX = 80,
    minSpanY = 60,
    marginFactor = 0.15,
  } = options;

  let samples = [];

  return {
    addSample(pt) {
      if (pt && typeof pt.x === 'number' && typeof pt.y === 'number') {
        samples.push({ x: pt.x, y: pt.y });
      }
    },

    getSampleCount() {
      return samples.length;
    },

    reset() {
      samples = [];
    },

    isReady() {
      return samples.length >= minSamples;
    },

    computeBounds(containerDim) {
      if (samples.length < minSamples) {
        return { valid: false, reason: 'insufficient_samples', samplesCount: samples.length };
      }

      const xs = samples.map((s) => s.x);
      const ys = samples.map((s) => s.y);

      const rawMinX = Math.min(...xs);
      const rawMaxX = Math.max(...xs);
      const rawMinY = Math.min(...ys);
      const rawMaxY = Math.max(...ys);

      const spanX = rawMaxX - rawMinX;
      const spanY = rawMaxY - rawMinY;

      if (spanX < minSpanX || spanY < minSpanY) {
        return {
          valid: false,
          reason: 'range_too_small',
          spanX,
          spanY,
          minSpanX,
          minSpanY,
        };
      }

      // Inward margins so targets aren't placed right at extreme reaching extents
      const marginX = spanX * marginFactor;
      const marginY = spanY * marginFactor;

      const cW = containerDim?.width || 800;
      const cH = containerDim?.height || 500;

      const bounds = {
        minX: Math.max(40, Math.round(rawMinX + marginX)),
        maxX: Math.min(cW - 40, Math.round(rawMaxX - marginX)),
        minY: Math.max(40, Math.round(rawMinY + marginY)),
        maxY: Math.min(cH - 40, Math.round(rawMaxY - marginY)),
        valid: true,
      };

      // Ensure valid positive bounding box
      if (bounds.maxX <= bounds.minX + 40 || bounds.maxY <= bounds.minY + 40) {
        bounds.maxX = Math.min(cW - 20, bounds.minX + 80);
        bounds.maxY = Math.min(cH - 20, bounds.minY + 80);
      }

      return bounds;
    },
  };
}

/**
 * Generates the next target position inside calibrated bounds.
 * Avoids spawning too close to the previous target location.
 *
 * @param {{minX: number, maxX: number, minY: number, maxY: number}} bounds
 * @param {number} targetRadius - Radius of target in pixels
 * @param {{x: number, y: number} | null} prevTarget - Position of previous target
 * @param {() => number} [rng=Math.random] - Injectable RNG for test determinism
 * @returns {{id: string, x: number, y: number, radius: number, spawnedAt: number}}
 */
export function generateNextTarget(bounds, targetRadius, prevTarget = null, rng = Math.random) {
  const safeRadius = Math.max(20, targetRadius);

  // Keep entire circle inside calibrated bounds
  const lowX = bounds.minX + safeRadius;
  const highX = Math.max(lowX, bounds.maxX - safeRadius);
  const lowY = bounds.minY + safeRadius;
  const highY = Math.max(lowY, bounds.maxY - safeRadius);

  const minDistance = Math.min(100, (highX - lowX) * 0.4);

  let bestX = lowX + (highX - lowX) * 0.5;
  let bestY = lowY + (highY - lowY) * 0.5;
  let maxFoundDist = -1;

  // Try up to 8 candidate positions to maximize distance from previous target
  for (let i = 0; i < 8; i++) {
    const candidateX = Math.round(lowX + rng() * (highX - lowX));
    const candidateY = Math.round(lowY + rng() * (highY - lowY));

    if (!prevTarget) {
      bestX = candidateX;
      bestY = candidateY;
      break;
    }

    const dist = Math.hypot(candidateX - prevTarget.x, candidateY - prevTarget.y);
    if (dist >= minDistance) {
      bestX = candidateX;
      bestY = candidateY;
      break;
    }

    if (dist > maxFoundDist) {
      maxFoundDist = dist;
      bestX = candidateX;
      bestY = candidateY;
    }
  }

  return {
    id: `target_${Date.now()}_${Math.floor(rng() * 10000)}`,
    x: bestX,
    y: bestY,
    radius: safeRadius,
    spawnedAt: typeof performance !== 'undefined' ? performance.now() : Date.now(),
  };
}

/**
 * Creates independent Dwell Trackers for hands to avoid false triggers
 * when alternating hands in either-hand mode.
 */
export function createDwellTracker(dwellDurationMs = 1000) {
  let trackers = {
    left: { progress: 0.0, lastTimestamp: null, inTarget: false },
    right: { progress: 0.0, lastTimestamp: null, inTarget: false },
  };

  let targetCompleted = false;

  return {
    /**
     * Updates dwell progress for a specific hand.
     *
     * @param {'left' | 'right'} hand
     * @param {{x: number, y: number} | null} cursor
     * @param {{x: number, y: number, radius: number} | null} target
     * @param {number} nowMs - Current performance.now() timestamp
     * @returns {{progress: number, completed: boolean, inTarget: boolean}}
     */
    updateHand(hand, cursor, target, nowMs) {
      if (targetCompleted || !target) {
        return { progress: 0.0, completed: false, inTarget: false };
      }

      const tracker = trackers[hand] || (trackers[hand] = { progress: 0.0, lastTimestamp: null, inTarget: false });

      if (!cursor) {
        // Tracking lost for this hand: freeze/reset dwell
        tracker.inTarget = false;
        tracker.lastTimestamp = nowMs;
        tracker.progress = Math.max(0.0, tracker.progress - 0.05);
        return { progress: tracker.progress, completed: false, inTarget: false };
      }

      const dist = Math.hypot(cursor.x - target.x, cursor.y - target.y);
      const isInside = dist <= target.radius;
      tracker.inTarget = isInside;

      if (isInside) {
        if (tracker.lastTimestamp != null) {
          const deltaMs = Math.max(0, Math.min(dwellDurationMs, nowMs - tracker.lastTimestamp));
          const increment = deltaMs / Math.max(100, dwellDurationMs);
          tracker.progress = Math.min(1.0, tracker.progress + increment);
        }
      } else {
        // Smoothly drain progress when hand moves out of target
        tracker.progress = Math.max(0.0, tracker.progress - 0.08);
      }

      tracker.lastTimestamp = nowMs;

      if (tracker.progress >= 1.0 && !targetCompleted) {
        targetCompleted = true;
        return { progress: 1.0, completed: true, inTarget: true };
      }

      return {
        progress: Math.round(tracker.progress * 1000) / 1000,
        completed: false,
        inTarget: isInside,
      };
    },

    resetTarget() {
      targetCompleted = false;
      trackers.left.progress = 0.0;
      trackers.left.lastTimestamp = null;
      trackers.left.inTarget = false;
      trackers.right.progress = 0.0;
      trackers.right.lastTimestamp = null;
      trackers.right.inTarget = false;
    },

    getProgress(hand) {
      return trackers[hand]?.progress || 0.0;
    },
  };
}

/**
 * Calculates score for collected target with optional combo bonus.
 *
 * @param {number} currentScore
 * @param {number} currentCombo
 * @param {number} basePoints
 * @returns {{newScore: number, newCombo: number, awardedPoints: number}}
 */
export function calculateTargetScore(currentScore, currentCombo = 0, basePoints = 100) {
  const combo = currentCombo + 1;
  const bonus = Math.min(50, (combo - 1) * 10);
  const awardedPoints = basePoints + bonus;
  return {
    newScore: currentScore + awardedPoints,
    newCombo: combo,
    awardedPoints,
  };
}
