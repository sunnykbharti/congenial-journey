# PosePlay — Movement-Controlled Accessible Gaming

> **Theme Alignment:**
> *"PosePlay bridges physical movement and digital interaction by translating camera-observed hand movement into a playable interface, supported by familiar-language instructions."*

---

## 1. Feature Overview

**PosePlay** is an accessible, webcam-powered movement game integrated into the **PoseCare** platform. The flagship initial game is **Reach & Collect**, designed to bridge the gap between physical movement and digital interaction for users who benefit from hands-free, gesture-based control rather than traditional keyboard or mouse inputs.

### Core Gameplay Loop
1. **Selection & Setup**: Choose posture mode (*Standing* or *Seated*), target hand (*Left*, *Right*, or *Either Hand*), language (*English*, *Hindi*, or *Hinglish*), round duration (30s–90s), target size, and dwell time.
2. **Safety Advisory**: Reminds users to move strictly within a comfortable range of motion and stop if experiencing pain, fatigue, or discomfort.
3. **Guided Calibration**: Guides the player to sweep their hand across their natural reach volume. Conservative bounding limits with safety margins are calculated so targets never spawn in unreachable or strained areas.
4. **Active Play**:
   - The detected wrist acts as an aligned on-screen cursor overlaid on a mirrored camera preview.
   - One glowing target appears at a time.
   - Keeping the cursor inside the target for the configured dwell duration (e.g., 1.0s) fills a smooth radial progress ring.
   - Upon completion, a cheerful chime plays, points are awarded with a combo multiplier, and the next target spawns.
5. **Tracking Interruption Handling**: If the user steps out of frame or multiple players enter the view, dwell accumulation and active round timer pause immediately until clean single-player tracking is restored.
6. **Result Summary & Idempotent Persistence**: Displays score, targets collected, active duration, and tracking interruptions. Results can be saved securely to the user's PoseCare database profile.

---

## 2. Files Changed & Added

### Frontend (`frontend/`)
- `frontend/src/Router.jsx`: Added `/play` route.
- `frontend/src/components/Navbar.jsx`: Added "Play" navigation link with `Gamepad2` icon.
- `frontend/src/pages/Play.jsx`: Core page state machine (`idle`, `requesting_camera`, `calibrating`, `playing`, `paused`, `tracking_lost`, `finished`, `error`).
- `frontend/src/components/play/GameSetup.jsx`: Mode, hand, language, sound, and timing configuration screen.
- `frontend/src/components/play/GameCalibration.jsx`: Step-by-step guided reach boundary calibration.
- `frontend/src/components/play/GameArena.jsx`: Mirrored camera display, SVG target HUD, radial dwell ring, dual wrist cursors, and interruption alerts.
- `frontend/src/components/play/GamePauseOverlay.jsx`: Accessible modal with Resume, Recalibrate, and Finish options.
- `frontend/src/components/play/GameResults.jsx`: Round statistics summary, retryable secure persistence, and replay actions.
- `frontend/src/utils/coordinateMapping.js`: High-precision coordinate transformation utility supporting `cover`/`contain`, aspect ratio scaling, letterboxing/cropping, and horizontal selfie mirroring.
- `frontend/src/utils/gameEngine.js`: Deterministic state machine, dwell accumulation tracker, and boundary-confined target generator.
- `frontend/src/utils/audioVoiceController.js`: Synthesized Web Audio API positive chime and multi-lingual `SpeechSynthesis` manager (English, Hindi, Hinglish) with cooldown guards.
- `frontend/test/gameEngine.test.js`: Comprehensive 12-test automated unit test suite.
- `frontend/package.json`: Registered `npm test` script.

### Backend (`backend/`)
- `backend/models.py`: Added `GameSession` model with fields for `user_id`, `game_type`, `play_mode`, `selected_hand`, `score`, `targets_collected`, `active_duration_seconds`, `tracking_interruptions`, and unique `idempotency_key`.
- `backend/routes/game.py`: Added dedicated Blueprint `game_bp` with:
  - `POST /api/game/analyze_frame`: Lightweight YOLO pose inference returning wrist and shoulder keypoints without heavy image re-encoding.
  - `POST /api/game/sessions`: Validated, authenticated, and idempotent game result persistence.
  - `GET /api/game/sessions`: User-scoped game session history retrieval.
- `backend/app.py`: Registered `game_bp` blueprint.
- `backend/analyzers/emotion_analyzer.py`: Fixed Python 3.9 type annotation compatibility (`from __future__ import annotations`).
- `backend/seed.py`: Handled standalone application context safely.
- `backend/test_game.py`: Automated backend unit test suite covering frame validation, bounds checking, idempotency, and auth ownership.

---

## 3. How to Launch and Play

### 1. Start the Flask Backend
```bash
cd backend
./env/bin/python app.py
```
*(Runs on `http://127.0.0.1:5000`)*

### 2. Start the React Frontend
```bash
cd frontend
npm run dev
```
*(Runs on `http://localhost:5173`)*

### 3. Open the Game
1. Visit `http://localhost:5173/play` or click **Play** in the top navigation bar.
2. Select your posture (*Standing* or *Seated*) and hand preference (*Left*, *Right*, or *Either*).
3. Click **Proceed to Calibration** and grant camera permissions.
4. Move your hand comfortably across the screen to record calibration samples.
5. Reach and dwell inside the on-screen circles to collect targets and score points!

---

## 4. API Specification

### `POST /api/game/analyze_frame`
Extracts keypoints for PosePlay cursor control.

**Request Payload:**
```json
{
  "image": "data:image/jpeg;base64,...",
  "frame_id": 1042
}
```

**Response Payload (`200 OK`):**
```json
{
  "frame_id": 1042,
  "image_width": 640,
  "image_height": 480,
  "person_count": 1,
  "keypoints": {
    "left_wrist": {"x": 220.4, "y": 180.2, "confidence": 0.94},
    "right_wrist": {"x": 412.1, "y": 195.0, "confidence": 0.91},
    "left_shoulder": {"x": 255.0, "y": 192.0, "confidence": 0.96},
    "right_shoulder": {"x": 385.0, "y": 193.0, "confidence": 0.95}
  }
}
```

### `POST /api/game/sessions`
Saves a completed game session. Enforces server-side authentication via JWT `Authorization: Bearer <token>` when available.

**Request Payload:**
```json
{
  "score": 450,
  "targets_collected": 4,
  "active_duration_seconds": 42.5,
  "tracking_interruptions": 1,
  "play_mode": "seated",
  "selected_hand": "right",
  "game_type": "reach_and_collect",
  "configuration_version": "1.0",
  "idempotency_key": "poseplay-1718294020-4821"
}
```

**Response Payload (`201 Created` or `200 OK` for duplicate idempotency match):**
```json
{
  "message": "Game session saved successfully",
  "duplicate": false,
  "session": {
    "id": 1,
    "user_id": 2,
    "score": 450,
    "targets_collected": 4,
    "active_duration_seconds": 42.5,
    "tracking_interruptions": 1,
    "play_mode": "seated",
    "selected_hand": "right",
    "game_type": "reach_and_collect"
  }
}
```

---

## 5. Database Schema & Migration

The `GameSession` table is added to `backend/models.py`.

```sql
CREATE TABLE game_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id),
    game_type VARCHAR(50) NOT NULL DEFAULT 'reach_and_collect',
    play_mode VARCHAR(20) NOT NULL DEFAULT 'standing',
    selected_hand VARCHAR(20) NOT NULL DEFAULT 'right',
    configuration_version VARCHAR(20) NOT NULL DEFAULT '1.0',
    started_at DATETIME,
    ended_at DATETIME,
    active_duration_seconds FLOAT DEFAULT 0.0,
    score INTEGER DEFAULT 0,
    targets_collected INTEGER DEFAULT 0,
    tracking_interruptions INTEGER DEFAULT 0,
    idempotency_key VARCHAR(64) UNIQUE
);
CREATE INDEX ix_game_sessions_idempotency_key ON game_sessions(idempotency_key);
```

**Migration Execution:**
`backend/app.py` runs `db.create_all()` automatically within its application context at startup. Missing tables are safely created without dropping or modifying existing user and exercise tables.

---

## 6. Coordinate-Space Conventions

- **Inference Space**: Original source dimensions of the captured canvas (typically `640 x 480`).
- **Arena Space**: Bounding client dimensions of the displayed `<video>` / `<svg>` container (responsive, e.g., `960 x 540`).
- **Aspect Scaling**: In CSS `object-fit: cover`, `scale = Math.max(containerW / sourceW, containerH / sourceH)`.
- **Mirroring (`mirrorX: true`)**: The camera preview is horizontally flipped via CSS `transform: scaleX(-1)` to provide a natural mirror experience. Coordinates are transformed such that:
  $$\text{mappedX} = \text{containerW} - (\text{rawX} \times \text{scale} + \text{offsetX})$$
  This guarantees the visual cursor precisely aligns with the player's physical hand on the mirrored video, while anatomical left and right labels are preserved.

---

## 7. Confidence & Stale-Data Thresholds

| Parameter | Value | Rationale |
|---|---|---|
| `CONFIDENCE_THRESHOLD` | `0.35` | Filters out false detections while maintaining smooth tracking even in varying lighting conditions. |
| `STALE_TRACKING_THRESHOLD_MS` | `800 ms` | If backend keypoints are delayed beyond 800ms, dwell accumulation halts. |
| `SUSTAINED_TRACKING_LOSS_MS` | `1500 ms` | Triggers the `TRACKING_LOST` state and pauses the active round timer. |
| `RECOVERY_COUNTDOWN` | `2 s` | Prevents sudden gameplay resumption before the player is prepared. |
| `INFERENCE_INTERVAL` | `180 ms (~5.5 FPS)` | Preserves client CPU while `requestAnimationFrame` maintains 60 FPS visual rendering. |

---

## 8. Automated Tests

### Run Backend Tests:
```bash
cd backend
./env/bin/python test_game.py
```
*Results: 8/8 tests pass (payload checks, bounds validation, idempotency, ownership security).*

### Run Frontend Tests:
```bash
cd frontend
npm test
```
*Results: 12/12 tests pass (mirroring, scaling, bound limits, dwell timing, hand independence, scoring).*

### Run Lint & Build Verification:
```bash
cd frontend
npm run lint   # 0 errors, 0 warnings
npm run build  # Builds clean production bundle
```

---

## 9. Known Limitations & Manual Validation Checklist

### Known Limitations
1. **Lighting & Backgrounds**: Like all vision-based pose estimators, low lighting or clothing matching the background color can lower landmark confidence.
2. **Client-Side Scores**: Scores are calculated in real-time on the client using verified backend landmarks. While appropriate for accessible personal gaming, scores are not cryptographically tamper-proof for public competitive cash prizes.
3. **Webcam FOV**: In seated mode, the camera should be tilted slightly down to capture the chest and hands comfortably above the desk.

### Manual Webcam Verification Checklist
- [ ] Connect webcam and navigate to `http://localhost:5173/play`.
- [ ] Verify setup options render properly (Standing vs Seated, Left vs Right vs Either).
- [ ] Complete calibration by waving your selected hand across your comfortable reach.
- [ ] Verify that a target spawns only within your calibrated zone.
- [ ] Move your wrist inside the target circle and verify that the green radial progress ring fills up.
- [ ] Verify that audio chime plays and score increments upon collection.
- [ ] Step out of frame and confirm that tracking loss triggers, pausing dwell and the active timer.
- [ ] Re-enter frame and verify the 2-second recovery countdown before resumption.
- [ ] Press `Space` to test Pause overlay and resume.
- [ ] Allow timer to reach 0 or press `Esc` to finish and click "Save Result" to verify persistence.
