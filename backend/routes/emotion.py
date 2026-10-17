"""
emotion.py – Facial emotion detection API blueprint.

POST /api/emotion/analyze_frame
    Body : {"image": "data:image/jpeg;base64,..."}
    Returns:
        {
          "annotated_image": "data:image/jpeg;base64,...",
          "emotion": "happy",
          "scores": {"happy": 87.3, "neutral": 6.1, ...},
          "face_detected": true
        }
"""

import base64
import numpy as np
import cv2
from flask import Blueprint, jsonify, request

from analyzers.emotion_analyzer import EmotionAnalyzer

emotion_bp = Blueprint("emotion", __name__, url_prefix="/api/emotion")

# Module-level singleton — one shared analyser instance (stateless enough
# for this use-case; the rolling history is a small smoothing buffer only).
_analyzer = EmotionAnalyzer()


@emotion_bp.route("/analyze_frame", methods=["POST"])
def analyze_frame():
    """Decode a base64 JPEG frame, run emotion detection, return annotated frame + scores."""
    data = request.get_json(silent=True) or {}
    image_data_url = data.get("image")

    if not image_data_url:
        return jsonify({"error": "missing 'image' field"}), 400

    # Decode base64 → BGR frame
    try:
        _, encoded = image_data_url.split(",", 1)
        raw_bytes = base64.b64decode(encoded)
        np_array  = np.frombuffer(raw_bytes, dtype=np.uint8)
        frame     = cv2.imdecode(np_array, cv2.IMREAD_COLOR)
    except Exception:
        return jsonify({"error": "could not decode image"}), 400

    if frame is None:
        return jsonify({"error": "empty frame"}), 400

    annotated, result = _analyzer.process_frame(frame)

    # Re-encode annotated frame to base64 JPEG
    ok, buffer = cv2.imencode(".jpg", annotated, [cv2.IMWRITE_JPEG_QUALITY, 75])
    if not ok:
        return jsonify({"error": "could not encode output"}), 500

    annotated_b64 = "data:image/jpeg;base64," + base64.b64encode(buffer).decode("utf-8")

    return jsonify({
        "annotated_image": annotated_b64,
        "emotion":         result.get("emotion", "none"),
        "scores":          result.get("scores", {}),
        "face_detected":   result.get("face_detected", False),
    })
