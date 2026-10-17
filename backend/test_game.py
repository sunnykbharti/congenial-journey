"""
test_game.py - Automated test suite for PosePlay backend endpoints and models.

Tests:
  1. Payload validation for /api/game/analyze_frame (missing image, bad format, empty image).
  2. Session bounds and enum validation for /api/game/sessions.
  3. Idempotent session submission (preventing duplicate saves via idempotency_key).
  4. Authentication and ownership checks for retrieving user sessions.
  5. Fallback behavior when image frame cannot be decoded.
"""

import os
import sys
import unittest
import json
import base64
import numpy as np
import cv2

# Ensure site-packages from model env are accessible
_MODEL_ENV_PKG = os.path.abspath(os.path.join(os.path.dirname(__file__), '../model/model/env/lib/python3.9/site-packages'))
if os.path.isdir(_MODEL_ENV_PKG) and _MODEL_ENV_PKG not in sys.path:
    sys.path.append(_MODEL_ENV_PKG)

from app import app, db
from models import User, GameSession
from flask_jwt_extended import create_access_token


class GameEndpointTestCase(unittest.TestCase):
    def setUp(self):
        app.config['TESTING'] = True
        app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///:memory:'
        self.client = app.test_client()

        with app.app_context():
            db.create_all()
            # Create a test user
            self.user = User(
                name="Gamer Test",
                phone="9998887770",
                email="gamer@test.io"
            )
            db.session.add(self.user)
            db.session.commit()
            self.user_id = self.user.id
            self.token = create_access_token(identity=str(self.user_id))

    def tearDown(self):
        with app.app_context():
            db.session.remove()
            db.drop_all()

    # ── 1. Frame analysis validation ─────────────────────────────────────────
    def test_analyze_frame_missing_image(self):
        res = self.client.post('/api/game/analyze_frame', json={})
        self.assertEqual(res.status_code, 400)
        data = res.get_json()
        self.assertIn("error", data)
        self.assertIn("missing 'image' field", data["error"])

    def test_analyze_frame_invalid_format(self):
        res = self.client.post('/api/game/analyze_frame', json={"image": "not-a-data-url"})
        self.assertEqual(res.status_code, 400)
        self.assertIn("invalid image format", res.get_json()["error"])

    def test_analyze_frame_corrupt_base64(self):
        res = self.client.post('/api/game/analyze_frame', json={"image": "data:image/jpeg;base64,??invalid!!!"})
        self.assertEqual(res.status_code, 400)
        self.assertIn("could not decode", res.get_json()["error"])

    def test_analyze_frame_valid_synthetic_frame(self):
        # Create a valid 320x240 black frame JPEG
        img = np.zeros((240, 320, 3), dtype=np.uint8)
        _, buf = cv2.imencode('.jpg', img)
        b64 = "data:image/jpeg;base64," + base64.b64encode(buf).decode('utf-8')

        res = self.client.post('/api/game/analyze_frame', json={
            "image": b64,
            "frame_id": 42
        })
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertEqual(data["frame_id"], 42)
        self.assertEqual(data["image_width"], 320)
        self.assertEqual(data["image_height"], 240)
        self.assertIn("person_count", data)
        self.assertIn("keypoints", data)

    # ── 2. Session submission and bounds validation ───────────────────────────
    def test_save_session_bounds_validation(self):
        # Negative score
        res = self.client.post('/api/game/sessions', json={"score": -10})
        self.assertEqual(res.status_code, 400)

        # Invalid play_mode
        res = self.client.post('/api/game/sessions', json={"score": 100, "play_mode": "flying"})
        self.assertEqual(res.status_code, 400)

        # Invalid selected_hand
        res = self.client.post('/api/game/sessions', json={"score": 100, "selected_hand": "foot"})
        self.assertEqual(res.status_code, 400)

        # Invalid active duration
        res = self.client.post('/api/game/sessions', json={"score": 100, "active_duration_seconds": -5})
        self.assertEqual(res.status_code, 400)

    # ── 3. Session persistence and idempotency ────────────────────────────────
    def test_save_session_idempotency(self):
        payload = {
            "score": 500,
            "targets_collected": 5,
            "active_duration_seconds": 45.2,
            "tracking_interruptions": 1,
            "play_mode": "seated",
            "selected_hand": "left",
            "idempotency_key": "unique-test-key-12345"
        }

        # First save
        res1 = self.client.post('/api/game/sessions', json=payload,
                                headers={"Authorization": f"Bearer {self.token}"})
        self.assertEqual(res1.status_code, 201)
        data1 = res1.get_json()
        self.assertFalse(data1["duplicate"])
        session_id = data1["session"]["id"]
        self.assertEqual(data1["session"]["user_id"], self.user_id)
        self.assertEqual(data1["session"]["score"], 500)

        # Duplicate submit with same idempotency_key
        res2 = self.client.post('/api/game/sessions', json=payload,
                                headers={"Authorization": f"Bearer {self.token}"})
        self.assertEqual(res2.status_code, 200)
        data2 = res2.get_json()
        self.assertTrue(data2["duplicate"])
        self.assertEqual(data2["session"]["id"], session_id)

        # Check only 1 row exists in DB
        with app.app_context():
            count = GameSession.query.filter_by(idempotency_key="unique-test-key-12345").count()
            self.assertEqual(count, 1)

    # ── 4. Authentication and ownership checks ────────────────────────────────
    def test_user_id_server_side_enforced(self):
        # Client attempts to spoof user_id=999
        payload = {
            "user_id": 999,
            "score": 300,
            "targets_collected": 3,
            "active_duration_seconds": 30.0,
            "idempotency_key": "spoof-check-key"
        }
        res = self.client.post('/api/game/sessions', json=payload,
                                headers={"Authorization": f"Bearer {self.token}"})
        self.assertEqual(res.status_code, 201)
        data = res.get_json()
        # Server must override client-supplied user_id with authentic JWT user_id
        self.assertEqual(data["session"]["user_id"], self.user_id)

    def test_get_sessions_ownership(self):
        # Save a session for user 1
        with app.app_context():
            s1 = GameSession(
                user_id=self.user_id,
                score=700,
                targets_collected=7,
                active_duration_seconds=60.0,
                idempotency_key="user1-session"
            )
            # Create a second user and save a session for them
            user2 = User(name="User Two", phone="9998887771", email="u2@test.io")
            db.session.add(user2)
            db.session.flush()
            s2 = GameSession(
                user_id=user2.id,
                score=1200,
                targets_collected=12,
                active_duration_seconds=90.0,
                idempotency_key="user2-session"
            )
            db.session.add(s1)
            db.session.add(s2)
            db.session.commit()

        # Query sessions as user 1
        res = self.client.get('/api/game/sessions',
                              headers={"Authorization": f"Bearer {self.token}"})
        self.assertEqual(res.status_code, 200)
        sessions = res.get_json()["sessions"]
        self.assertEqual(len(sessions), 1)
        self.assertEqual(sessions[0]["user_id"], self.user_id)
        self.assertEqual(sessions[0]["score"], 700)


if __name__ == '__main__':
    unittest.main()
