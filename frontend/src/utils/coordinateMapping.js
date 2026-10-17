/**
 * coordinateMapping.js - High-precision coordinate transformation utility
 * for PosePlay movement games.
 *
 * Accounts for:
 * 1. Source image dimensions (e.g. 640x480 from video capture)
 * 2. Target container / arena dimensions (e.g. 960x540)
 * 3. CSS object-fit mode ('cover' or 'contain')
 * 4. Horizontal selfie-cam mirroring (mirrorX: true)
 * 5. Dynamic container resizing
 */

/**
 * Transforms a single (x, y) point from source coordinate space into container space.
 *
 * @param {number} srcX - Point X in source coordinates
 * @param {number} srcY - Point Y in source coordinates
 * @param {{width: number, height: number}} sourceDim - Source video/frame dimensions
 * @param {{width: number, height: number}} containerDim - DOM container dimensions
 * @param {{fit?: 'cover' | 'contain', mirrorX?: boolean}} options - Configuration
 * @returns {{x: number, y: number}} - Transformed point in container pixels
 */
export function mapPointToContainer(srcX, srcY, sourceDim, containerDim, options = {}) {
  const { fit = 'cover', mirrorX = true } = options;

  const srcW = sourceDim?.width || 640;
  const srcH = sourceDim?.height || 480;
  const dstW = containerDim?.width || 640;
  const dstH = containerDim?.height || 480;

  if (srcW <= 0 || srcH <= 0 || dstW <= 0 || dstH <= 0) {
    return { x: srcX, y: srcY };
  }

  // Calculate scale factor and letterboxing/cropping offsets
  let scale;
  let offsetX;
  let offsetY;

  if (fit === 'cover') {
    // Scales to fill the container, cropping excess
    scale = Math.max(dstW / srcW, dstH / srcH);
    const renderedW = srcW * scale;
    const renderedH = srcH * scale;
    offsetX = (dstW - renderedW) / 2.0;
    offsetY = (dstH - renderedH) / 2.0;
  } else {
    // 'contain' scales to fit entirely inside container, letterboxing empty space
    scale = Math.min(dstW / srcW, dstH / srcH);
    const renderedW = srcW * scale;
    const renderedH = srcH * scale;
    offsetX = (dstW - renderedW) / 2.0;
    offsetY = (dstH - renderedH) / 2.0;
  }

  // Linear projection into rendered video rectangle
  let mappedX = srcX * scale + offsetX;
  let mappedY = srcY * scale + offsetY;

  // Horizontal mirroring for user-facing selfie webcam previews:
  // When mirrorX is true, a physical movement to the user's right aligns with
  // the right side of the on-screen container.
  if (mirrorX) {
    mappedX = dstW - mappedX;
  }

  return {
    x: Math.round(mappedX * 10) / 10,
    y: Math.round(mappedY * 10) / 10,
  };
}

/**
 * Transforms an entire keypoints map.
 *
 * @param {Record<string, {x: number, y: number, confidence: number}>} keypoints
 * @param {{width: number, height: number}} sourceDim
 * @param {{width: number, height: number}} containerDim
 * @param {{fit?: 'cover' | 'contain', mirrorX?: boolean}} options
 * @returns {Record<string, {x: number, y: number, confidence: number}>}
 */
export function transformKeypoints(keypoints, sourceDim, containerDim, options = {}) {
  if (!keypoints) return {};
  const result = {};

  for (const [name, kp] of Object.entries(keypoints)) {
    if (!kp || typeof kp.x !== 'number' || typeof kp.y !== 'number') continue;
    const mapped = mapPointToContainer(kp.x, kp.y, sourceDim, containerDim, options);
    result[name] = {
      x: mapped.x,
      y: mapped.y,
      confidence: kp.confidence ?? 0,
    };
  }

  return result;
}
