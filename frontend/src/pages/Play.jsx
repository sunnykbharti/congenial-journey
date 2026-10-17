import { useState, useEffect, useRef, useCallback } from "react";
import { ArrowLeft, RefreshCw, AlertCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar";
import GameSetup from "../components/play/GameSetup";
import GameCalibration from "../components/play/GameCalibration";
import GameArena from "../components/play/GameArena";
import GamePauseOverlay from "../components/play/GamePauseOverlay";
import GameResults from "../components/play/GameResults";

import {
  GAME_STATES,
  CONFIDENCE_THRESHOLD,
  createCalibrationManager,
  generateNextTarget,
  createDwellTracker,
  calculateTargetScore,
} from "../utils/gameEngine";
import { mapPointToContainer } from "../utils/coordinateMapping";
import {
  speakInstruction,
  playCollectionChime,
  cancelSpeech,
} from "../utils/audioVoiceController";
import api from "../api/Api";

export default function Play() {
  const navigate = useNavigate();

  // ── State Machine ───────────────────────────────────────────────────────────
  const [gameState, setGameState] = useState(GAME_STATES.IDLE);
  const [errorMessage, setErrorMessage] = useState("");

  // ── Configuration ───────────────────────────────────────────────────────────
  const [config, setConfig] = useState({
    playMode: "standing",
    selectedHand: "right",
    language: "en",
    soundEnabled: true,
    sessionDuration: 60,
    targetSize: "medium",
    targetRadius: 55,
    dwellDuration: 1.0,
  });

  // ── Gameplay Telemetry & Score ──────────────────────────────────────────────
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [targetsCollected, setTargetsCollected] = useState(0);
  const [activeDurationSeconds, setActiveDurationSeconds] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState(60);
  const [trackingInterruptions, setTrackingInterruptions] = useState(0);
  const [target, setTarget] = useState(null);
  const [dwellProgress, setDwellProgress] = useState(0.0);
  const [trackingState, setTrackingState] = useState("healthy"); // 'healthy' | 'lost' | 'multiple_people' | 'recovering'
  const [recoveryCountdown, setRecoveryCountdown] = useState(3);
  const [idempotencyKey, setIdempotencyKey] = useState("");

  // ── Cursor Coordinates in Arena Space ──────────────────────────────────────
  const [leftCursor, setLeftCursor] = useState(null);
  const [rightCursor, setRightCursor] = useState(null);

  // ── Stable Managers via State ───────────────────────────────────────────────
  const [calibrationManager] = useState(() => createCalibrationManager());

  // ── Refs for Streams, Animation Frames, Intervals ──────────────────────────
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const canvasRef = useRef(null);
  const animFrameRef = useRef(null);
  const inferenceTimerRef = useRef(null);
  const inferenceBusyRef = useRef(false);
  const lastHealthyTrackingTimeRef = useRef(0);

  const dwellTrackerRef = useRef(null);
  const calibratedBoundsRef = useRef(null);

  // ── Camera Lifecycle ────────────────────────────────────────────────────────
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const handleRoundFinish = useCallback(() => {
    stopCamera();
    setGameState(GAME_STATES.FINISHED);
    speakInstruction("finished", config.language, config.soundEnabled);
  }, [stopCamera, config.language, config.soundEnabled]);

  const startCamera = useCallback(async () => {
    try {
      setGameState(GAME_STATES.REQUESTING_CAMERA);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: "user",
        },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setGameState(GAME_STATES.CALIBRATING);
      speakInstruction("calibrating", config.language, config.soundEnabled);
    } catch (err) {
      console.error("Camera access failed:", err);
      setErrorMessage(
        "Camera permission was denied or device is not available. Please allow webcam access in your browser."
      );
      setGameState(GAME_STATES.ERROR);
    }
  }, [config.language, config.soundEnabled]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopCamera();
      cancelSpeech();
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (inferenceTimerRef.current) clearInterval(inferenceTimerRef.current);
    };
  }, [stopCamera]);

  // ── Frame Inference Loop ────────────────────────────────────────────────────
  const captureAndSendFrame = useCallback(async () => {
    const video = videoRef.current;
    if (
      !video ||
      video.readyState < 2 ||
      inferenceBusyRef.current ||
      (gameState !== GAME_STATES.CALIBRATING && gameState !== GAME_STATES.PLAYING)
    ) {
      return;
    }

    if (!canvasRef.current) {
      canvasRef.current = document.createElement("canvas");
    }
    const canvas = canvasRef.current;
    const vW = video.videoWidth || 640;
    const vH = video.videoHeight || 480;
    canvas.width = vW;
    canvas.height = vH;

    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, vW, vH);
    const imageData = canvas.toDataURL("image/jpeg", 0.65);

    try {
      inferenceBusyRef.current = true;
      const res = await api.post("/game/analyze_frame", {
        image: imageData,
        frame_id: Date.now(),
      });

      const { person_count, keypoints, image_width = 640, image_height = 480 } = res.data;
      const containerW = video.parentElement?.clientWidth || 800;
      const containerH = video.parentElement?.clientHeight || 500;
      const srcDim = { width: image_width, height: image_height };
      const dstDim = { width: containerW, height: containerH };

      // Multiple people detection check
      if (person_count > 1) {
        setTrackingState("multiple_people");
        speakInstruction("multiplePeople", config.language, config.soundEnabled);
        return;
      }

      const leftWrist = keypoints?.left_wrist;
      const rightWrist = keypoints?.right_wrist;

      const hasConfidentLeft = leftWrist && leftWrist.confidence >= CONFIDENCE_THRESHOLD;
      const hasConfidentRight = rightWrist && rightWrist.confidence >= CONFIDENCE_THRESHOLD;

      // Transform coordinates to mirrored visible arena space
      const mappedLeft = hasConfidentLeft
        ? mapPointToContainer(leftWrist.x, leftWrist.y, srcDim, dstDim, { mirrorX: true, fit: "cover" })
        : null;
      const mappedRight = hasConfidentRight
        ? mapPointToContainer(rightWrist.x, rightWrist.y, srcDim, dstDim, { mirrorX: true, fit: "cover" })
        : null;

      setLeftCursor(mappedLeft);
      setRightCursor(mappedRight);

      // Check tracking health based on selected hand
      let handTracked = false;
      if (config.selectedHand === "left") handTracked = !!mappedLeft;
      else if (config.selectedHand === "right") handTracked = !!mappedRight;
      else handTracked = !!mappedLeft || !!mappedRight;

      const now = Date.now();
      if (handTracked) {
        lastHealthyTrackingTimeRef.current = now;
        if (trackingState !== "healthy" && trackingState !== "recovering") {
          setTrackingState("recovering");
          let count = 2;
          setRecoveryCountdown(count);
          const recInterval = setInterval(() => {
            count -= 1;
            if (count <= 0) {
              clearInterval(recInterval);
              setTrackingState("healthy");
            } else {
              setRecoveryCountdown(count);
            }
          }, 600);
        } else if (trackingState !== "recovering") {
          setTrackingState("healthy");
        }
      } else {
        if (now - lastHealthyTrackingTimeRef.current > 1500 && trackingState === "healthy") {
          setTrackingState("lost");
          setTrackingInterruptions((prev) => prev + 1);
          speakInstruction("trackingLost", config.language, config.soundEnabled);
        }
      }
    } catch (err) {
      console.warn("Frame analysis error:", err);
    } finally {
      inferenceBusyRef.current = false;
    }
  }, [gameState, config.selectedHand, config.language, config.soundEnabled, trackingState]);

  // Interval for inference loop
  useEffect(() => {
    if (gameState === GAME_STATES.CALIBRATING || gameState === GAME_STATES.PLAYING) {
      inferenceTimerRef.current = setInterval(captureAndSendFrame, 180);
    } else {
      if (inferenceTimerRef.current) clearInterval(inferenceTimerRef.current);
    }
    return () => {
      if (inferenceTimerRef.current) clearInterval(inferenceTimerRef.current);
    };
  }, [gameState, captureAndSendFrame]);

  // ── High-Frequency Game Engine Loop ─────────────────────────────────────────
  useEffect(() => {
    if (gameState !== GAME_STATES.PLAYING) return;

    let lastTimestamp = performance.now();

    const loop = (currentTimestamp) => {
      const deltaMs = currentTimestamp - lastTimestamp;
      lastTimestamp = currentTimestamp;

      if (trackingState === "healthy") {
        setActiveDurationSeconds((prev) => {
          const nextVal = prev + deltaMs / 1000;
          const remaining = Math.max(0, Math.ceil(config.sessionDuration - nextVal));
          setTimeRemaining(remaining);
          if (remaining <= 0) {
            handleRoundFinish();
          }
          return nextVal;
        });

        if (target) {
          const tracker = dwellTrackerRef.current || (dwellTrackerRef.current = createDwellTracker(1000));
          let activeDwell = 0.0;
          let targetHit = false;

          if (config.selectedHand === "left" || config.selectedHand === "either") {
            const res = tracker.updateHand("left", leftCursor, target, currentTimestamp);
            activeDwell = Math.max(activeDwell, res.progress);
            if (res.completed) targetHit = true;
          }

          if (config.selectedHand === "right" || config.selectedHand === "either") {
            const res = tracker.updateHand("right", rightCursor, target, currentTimestamp);
            activeDwell = Math.max(activeDwell, res.progress);
            if (res.completed) targetHit = true;
          }

          setDwellProgress(activeDwell);

          if (targetHit) {
            playCollectionChime(config.soundEnabled);
            speakInstruction("targetCollected", config.language, config.soundEnabled);

            setTargetsCollected((prev) => prev + 1);
            setScore((prevScore) => {
              const res = calculateTargetScore(prevScore, combo);
              setCombo(res.newCombo);
              return res.newScore;
            });

            tracker.resetTarget();
            setDwellProgress(0.0);
            if (calibratedBoundsRef.current) {
              const nextT = generateNextTarget(
                calibratedBoundsRef.current,
                config.targetRadius,
                target
              );
              setTarget(nextT);
            }
          }
        }
      }

      animFrameRef.current = requestAnimationFrame(loop);
    };

    animFrameRef.current = requestAnimationFrame(loop);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [gameState, trackingState, target, leftCursor, rightCursor, combo, config, handleRoundFinish]);

  // ── Handler Functions ───────────────────────────────────────────────────────
  const handleStartCalibration = (newConfig) => {
    setConfig(newConfig);
    dwellTrackerRef.current = createDwellTracker(newConfig.dwellDuration * 1000);
    setIdempotencyKey(`poseplay-${Date.now()}-${Math.floor(Math.random() * 100000)}`);
    startCamera();
  };

  const handleCalibrationComplete = (bounds) => {
    calibratedBoundsRef.current = bounds;
    const firstTarget = generateNextTarget(bounds, config.targetRadius, null);
    setTarget(firstTarget);

    setScore(0);
    setCombo(0);
    setTargetsCollected(0);
    setActiveDurationSeconds(0);
    setTimeRemaining(config.sessionDuration);
    setTrackingInterruptions(0);
    setDwellProgress(0.0);

    setGameState(GAME_STATES.PLAYING);
    speakInstruction("targetPrompt", config.language, config.soundEnabled);
  };

  const handlePause = () => {
    setGameState(GAME_STATES.PAUSED);
    speakInstruction("paused", config.language, config.soundEnabled);
  };

  const handleResume = () => {
    setGameState(GAME_STATES.PLAYING);
    speakInstruction("resuming", config.language, config.soundEnabled);
  };

  const handleRecalibrate = () => {
    calibrationManager.reset();
    setGameState(GAME_STATES.CALIBRATING);
    speakInstruction("calibrating", config.language, config.soundEnabled);
  };

  const handlePlayAgain = () => {
    setIdempotencyKey(`poseplay-${Date.now()}-${Math.floor(Math.random() * 100000)}`);
    setScore(0);
    setCombo(0);
    setTargetsCollected(0);
    setActiveDurationSeconds(0);
    setTimeRemaining(config.sessionDuration);
    setTrackingInterruptions(0);
    setDwellProgress(0.0);
    setGameState(GAME_STATES.IDLE);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white selection:bg-cyan-500 selection:text-black">
      <Navbar />

      <main className="relative mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
        {gameState !== GAME_STATES.PLAYING && (
          <div className="mb-4">
            <button
              onClick={() => navigate("/dashboard")}
              className="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 transition hover:text-cyan-400"
            >
              <ArrowLeft size={14} />
              Back to Dashboard
            </button>
          </div>
        )}

        {/* 1. SETUP STAGE */}
        {gameState === GAME_STATES.IDLE && (
          <GameSetup
            initialConfig={config}
            onStartCalibration={handleStartCalibration}
          />
        )}

        {/* CAMERA REQUESTING STATE */}
        {gameState === GAME_STATES.REQUESTING_CAMERA && (
          <div className="mx-auto flex max-w-md flex-col items-center justify-center rounded-3xl border border-white/10 bg-slate-900/60 p-12 text-center backdrop-blur-xl">
            <RefreshCw size={36} className="animate-spin text-cyan-400" />
            <h3 className="mt-4 text-xl font-bold text-white">Opening Camera...</h3>
            <p className="mt-2 text-xs text-slate-400">
              Please grant camera permissions when prompted by your browser.
            </p>
          </div>
        )}

        {/* 2. CALIBRATION STAGE */}
        {gameState === GAME_STATES.CALIBRATING && (
          <GameCalibration
            videoRef={videoRef}
            wristPoint={config.selectedHand === "left" ? leftCursor : rightCursor || leftCursor}
            trackingHealthy={!!(leftCursor || rightCursor)}
            config={config}
            onCalibrationComplete={handleCalibrationComplete}
            onCancel={() => {
              stopCamera();
              setGameState(GAME_STATES.IDLE);
            }}
            calibrationManager={calibrationManager}
          />
        )}

        {/* 3. ACTIVE PLAYING STAGE */}
        {(gameState === GAME_STATES.PLAYING || gameState === GAME_STATES.PAUSED) && (
          <div className="relative">
            <GameArena
              videoRef={videoRef}
              target={target}
              dwellProgress={dwellProgress}
              leftCursor={config.selectedHand === "left" || config.selectedHand === "either" ? leftCursor : null}
              rightCursor={config.selectedHand === "right" || config.selectedHand === "either" ? rightCursor : null}
              score={score}
              combo={combo}
              targetsCollected={targetsCollected}
              timeRemaining={timeRemaining}
              trackingState={trackingState}
              recoveryCountdown={recoveryCountdown}
              config={config}
              onPause={handlePause}
              onFinish={handleRoundFinish}
              onToggleSound={() => setConfig((c) => ({ ...c, soundEnabled: !c.soundEnabled }))}
            />

            {/* 4. PAUSE MODAL OVERLAY */}
            {gameState === GAME_STATES.PAUSED && (
              <GamePauseOverlay
                score={score}
                targetsCollected={targetsCollected}
                activeSeconds={activeDurationSeconds}
                onResume={handleResume}
                onRecalibrate={handleRecalibrate}
                onFinish={handleRoundFinish}
                onQuit={() => {
                  stopCamera();
                  setGameState(GAME_STATES.IDLE);
                }}
              />
            )}
          </div>
        )}

        {/* 5. FINISHED SUMMARY STAGE */}
        {gameState === GAME_STATES.FINISHED && (
          <GameResults
            sessionData={{
              score,
              targetsCollected,
              activeDurationSeconds,
              trackingInterruptions,
              playMode: config.playMode,
              selectedHand: config.selectedHand,
              sessionDuration: config.sessionDuration,
              idempotencyKey,
            }}
            onPlayAgain={handlePlayAgain}
          />
        )}

        {/* ERROR STAGE */}
        {gameState === GAME_STATES.ERROR && (
          <div className="mx-auto max-w-lg rounded-3xl border border-red-500/20 bg-slate-900/80 p-8 text-center backdrop-blur-xl">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/10 text-red-400">
              <AlertCircle size={32} />
            </div>
            <h3 className="text-xl font-bold text-white">Camera or Setup Issue</h3>
            <p className="mt-2 text-sm text-slate-300">{errorMessage}</p>
            <button
              onClick={() => {
                setErrorMessage("");
                setGameState(GAME_STATES.IDLE);
              }}
              className="mt-6 rounded-xl bg-cyan-500 px-6 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-cyan-400"
            >
              Try Again
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
