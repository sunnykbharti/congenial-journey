"""
game.py - PosePlay backend routes for movement-controlled games.

Endpoints:
  POST /api/game/analyze_frame - Lightweight pose inference for game interactions.
  POST /api/game/sessions      - Persist game session scores with validation & idempotency.
  GET  /api/game/sessions      - Retrieve past game sessions for the authenticated user.
"""

import os
import sys
import base64
import numpy as np
import cv2
from datetime import datetime
from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity, verify_jwt_in_request

from models import db, GameSession, User

# Ensure site-packages from model env are accessible if not in main env
_MODEL_ENV_PKG = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../model/model/env/lib/python3.9/site-packages'))
if os.path.isdir(_MODEL_ENV_PKG) and _MODEL_ENV_PKG not in sys.path:
    sys.path.append(_MODEL_ENV_PKG)

game_bp = Blueprint('game', __name__, url_prefix='/api/game')

# ── Singleton YOLO Model Loader ──────────────────────────────────────────────
_YOLO_MODEL = None
_YOLO_LOAD_FAILED = False

# COCO 17-keypoint indexes for YOLO pose
KP_NOSE = 0
KP_LEFT_SHOULDER = 5
KP_RIGHT_SHOULDER = 6
KP_LEFT_WRIST = 9
KP_RIGHT_WRIST = 10
KP_LEFT_HIP = 11
KP_RIGHT_HIP = 12

def get_yolo_model():
    """Lazily load singleton YOLO pose model once."""
    global _YOLO_MODEL, _YOLO_LOAD_FAILED
    if _YOLO_MODEL is not None:
        return _YOLO_MODEL
    if _YOLO_LOAD_FAILED:
        return None

    try:
        from ultralytics import YOLO
        # Search candidate paths for weights
        base_dir = os.path.dirname(__file__)
        candidates = [
            os.path.join(base_dir, '../yolo11n-pose.pt'),
            os.path.join(base_dir, '../../yolo11n-pose.pt'),
            os.path.join(base_dir, '../../model/yolo11n-pose.pt'),
            'yolo11n-pose.pt',
            'yolov8n-pose.pt'
        ]
        chosen_path = None
        for p in candidates:
            if os.path.exists(p):
                chosen_path = p
                break

        if chosen_path:
            _YOLO_MODEL = YOLO(chosen_path)
        else:
            _YOLO_MODEL = YOLO('yolo11n-pose.pt')
        return _YOLO_MODEL
    except Exception as e:
        print(f"[PosePlay] Warning: YOLO pose model could not be loaded: {e}")
        _YOLO_LOAD_FAILED = True
        return None


# ── Frame Analysis Endpoint ──────────────────────────────────────────────────
@game_bp.route('/analyze_frame', methods=['POST'])
def analyze_game_frame():
    """
    Lightweight pose inference endpoint specifically optimized for PosePlay games.
    Receives base64 image data and returns only wrist and reference landmarks
    without re-encoding heavy video annotations.
    """
    try:
        verify_jwt_in_request(optional=True)
    except Exception:
        pass

    data = request.get_json(silent=True) or {}
    image_data_url = data.get("image")
    frame_id = data.get("frame_id", 0)

    if not image_data_url:
        return jsonify({"error": "missing 'image' field"}), 400

    if not isinstance(image_data_url, str) or not image_data_url.startswith("data:image/"):
        return jsonify({"error": "invalid image format; expected data URL"}), 400

    # Request size guard - reject excessive image payloads (> 4MB base64)
    if len(image_data_url) > 4 * 1024 * 1024:
        return jsonify({"error": "image payload exceeds limit"}), 413

    try:
        _, encoded = image_data_url.split(",", 1)
        raw_bytes = base64.b64decode(encoded)
        np_array = np.frombuffer(raw_bytes, dtype=np.uint8)
        frame = cv2.imdecode(np_array, cv2.IMREAD_COLOR)
    except Exception:
        return jsonify({"error": "could not decode image base64"}), 400

    if frame is None or frame.size == 0:
        return jsonify({"error": "empty or corrupt image frame"}), 400

    height, width = frame.shape[:2]
    model = get_yolo_model()

    if model is None:
        # Fallback if YOLO runtime is unavailable in environment
        return jsonify({
            "frame_id": frame_id,
            "image_width": width,
            "image_height": height,
            "person_count": 0,
            "keypoints": {},
            "warning": "pose_inference_unavailable"
        }), 200

    try:
        frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = model(frame_rgb, verbose=False)

        if not results or len(results) == 0:
            return jsonify({
                "frame_id": frame_id,
                "image_width": width,
                "image_height": height,
                "person_count": 0,
                "keypoints": {}
            }), 200

        res = results[0]
        kp_data = res.keypoints.data if res.keypoints is not None else []
        person_count = len(kp_data)

        if person_count == 0:
            return jsonify({
                "frame_id": frame_id,
                "image_width": width,
                "image_height": height,
                "person_count": 0,
                "keypoints": {}
            }), 200

        # Primary player's keypoints (first detected person)
        primary = kp_data[0].cpu().numpy() if hasattr(kp_data[0], 'cpu') else np.array(kp_data[0])

        def format_kp(idx):
            if idx < len(primary):
                x, y, conf = float(primary[idx][0]), float(primary[idx][1]), float(primary[idx][2])
                return {"x": round(x, 1), "y": round(y, 1), "confidence": round(conf, 3)}
            return {"x": 0.0, "y": 0.0, "confidence": 0.0}

        keypoints = {
            "left_wrist": format_kp(KP_LEFT_WRIST),
            "right_wrist": format_kp(KP_RIGHT_WRIST),
            "left_shoulder": format_kp(KP_LEFT_SHOULDER),
            "right_shoulder": format_kp(KP_RIGHT_SHOULDER),
            "left_hip": format_kp(KP_LEFT_HIP),
            "right_hip": format_kp(KP_RIGHT_HIP),
        }

        return jsonify({
            "frame_id": frame_id,
            "image_width": width,
            "image_height": height,
            "person_count": person_count,
            "keypoints": keypoints
        }), 200

    except Exception as e:
        return jsonify({"error": "inference failed", "details": str(e)}), 500


# ── Game Result Persistence Endpoint ─────────────────────────────────────────
@game_bp.route('/sessions', methods=['POST'])
def save_game_session():
    """
    Persist a completed PosePlay session with strict validation and idempotency.
    Authenticated user ID is derived securely from JWT token on the server.
    """
    current_user_id = None
    try:
        verify_jwt_in_request(optional=True)
        identity = get_jwt_identity()
        if identity:
            current_user_id = int(identity)
    except Exception:
        pass

    data = request.get_json(silent=True) or {}

    # Idempotency check: if client sent an idempotency_key, check for existing record
    idempotency_key = data.get("idempotency_key")
    if idempotency_key:
        if not isinstance(idempotency_key, str) or len(idempotency_key) > 64:
            return jsonify({"error": "invalid idempotency_key format"}), 400
        existing = GameSession.query.filter_by(idempotency_key=idempotency_key).first()
        if existing:
            return jsonify({
                "message": "session already persisted",
                "session": existing.to_dict(),
                "duplicate": True
            }), 200

    # Bounds and type validation
    try:
        score = int(data.get("score", 0))
        targets_collected = int(data.get("targets_collected", 0))
        active_duration = float(data.get("active_duration_seconds", 0.0))
        tracking_interruptions = int(data.get("tracking_interruptions", 0))
    except (ValueError, TypeError):
        return jsonify({"error": "score, targets, active_duration and tracking_interruptions must be numbers"}), 400

    if score < 0 or score > 1_000_000:
        return jsonify({"error": "score out of reasonable bounds (0-1,000,000)"}), 400
    if targets_collected < 0 or targets_collected > 10_000:
        return jsonify({"error": "targets_collected out of bounds"}), 400
    if active_duration < 0.0 or active_duration > 86_400.0:
        return jsonify({"error": "active_duration out of bounds"}), 400
    if tracking_interruptions < 0 or tracking_interruptions > 10_000:
        return jsonify({"error": "tracking_interruptions out of bounds"}), 400

    # Allowed enum values
    play_mode = data.get("play_mode", "standing")
    if play_mode not in ("standing", "seated"):
        return jsonify({"error": "play_mode must be 'standing' or 'seated'"}), 400

    selected_hand = data.get("selected_hand", "right")
    if selected_hand not in ("left", "right", "either"):
        return jsonify({"error": "selected_hand must be 'left', 'right', or 'either'"}), 400

    game_type = data.get("game_type", "reach_and_collect")
    if game_type not in ("reach_and_collect",):
        return jsonify({"error": "unsupported game_type"}), 400

    config_version = str(data.get("configuration_version", "1.0"))[:20]

    started_at_str = data.get("started_at")
    started_at = datetime.utcnow()
    if started_at_str:
        try:
            started_at = datetime.fromisoformat(started_at_str.replace("Z", "+00:00"))
        except Exception:
            pass

    ended_at = datetime.utcnow()

    new_session = GameSession(
        user_id=current_user_id,
        game_type=game_type,
        play_mode=play_mode,
        selected_hand=selected_hand,
        configuration_version=config_version,
        started_at=started_at,
        ended_at=ended_at,
        active_duration_seconds=active_duration,
        score=score,
        targets_collected=targets_collected,
        tracking_interruptions=tracking_interruptions,
        idempotency_key=idempotency_key
    )

    db.session.add(new_session)
    db.session.commit()

    return jsonify({
        "message": "Game session saved successfully",
        "session": new_session.to_dict(),
        "duplicate": False
    }), 201


@game_bp.route('/sessions', methods=['GET'])
def get_game_sessions():
    """
    Retrieve game sessions for the current authenticated user.
    Enforces ownership check.
    """
    current_user_id = None
    try:
        verify_jwt_in_request(optional=True)
        identity = get_jwt_identity()
        if identity:
            current_user_id = int(identity)
    except Exception:
        pass

    if not current_user_id:
        return jsonify({"sessions": []}), 200

    sessions = GameSession.query.filter_by(user_id=current_user_id).order_by(GameSession.started_at.desc()).limit(50).all()
    return jsonify({
        "sessions": [s.to_dict() for s in sessions]
    }), 200
