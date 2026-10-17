import { useState, useEffect } from "react";
import {
  Sparkles,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
  ArrowRight,
  Volume2,
} from "lucide-react";
import { LOCALIZED_MESSAGES } from "../../utils/audioVoiceController";

export default function GameCalibration({
  videoRef,
  wristPoint,
  trackingHealthy,
  config,
  onCalibrationComplete,
  onCancel,
  calibrationManager,
}) {
  const [samplesCount, setSamplesCount] = useState(0);
  const [errorNotice, setErrorNotice] = useState(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const requiredSamples = 20;

  // Clear samples on mount
  useEffect(() => {
    calibrationManager.reset();
    const id = requestAnimationFrame(() => {
      setSamplesCount(0);
      setErrorNotice(null);
      setIsSuccess(false);
    });
    return () => cancelAnimationFrame(id);
  }, [calibrationManager]);

  // Sample wrist when tracking is confident
  useEffect(() => {
    if (isSuccess || !trackingHealthy || !wristPoint) return;

    calibrationManager.addSample(wristPoint);
    const count = calibrationManager.getSampleCount();

    const id = requestAnimationFrame(() => {
      setSamplesCount(count);

      if (count >= requiredSamples) {
        const containerDim = {
          width: videoRef?.current?.parentElement?.clientWidth || 800,
          height: videoRef?.current?.parentElement?.clientHeight || 500,
        };
        const boundsResult = calibrationManager.computeBounds(containerDim);

        if (boundsResult.valid) {
          setIsSuccess(true);
          setErrorNotice(null);
        } else {
          if (boundsResult.reason === "range_too_small") {
            setErrorNotice(
              "Movement area was quite small. Please move your hand across a wider, comfortable reach."
            );
          } else {
            setErrorNotice("Could not clearly map reach. Please move your hand across the view.");
          }
        }
      }
    });

    return () => cancelAnimationFrame(id);
  }, [wristPoint, trackingHealthy, isSuccess, calibrationManager, videoRef]);

  const handleRetry = () => {
    calibrationManager.reset();
    setSamplesCount(0);
    setErrorNotice(null);
    setIsSuccess(false);
  };

  const handleFinish = () => {
    const containerDim = {
      width: videoRef?.current?.parentElement?.clientWidth || 800,
      height: videoRef?.current?.parentElement?.clientHeight || 500,
    };
    const bounds = calibrationManager.computeBounds(containerDim);
    if (bounds.valid) {
      onCalibrationComplete(bounds);
    }
  };

  const promptText =
    LOCALIZED_MESSAGES[config.language]?.calibrating ||
    LOCALIZED_MESSAGES.en.calibrating;

  const progressPercent = Math.min(100, Math.round((samplesCount / requiredSamples) * 100));

  return (
    <div className="relative mx-auto max-w-4xl px-4 py-4">
      {/* Calibration Header */}
      <div className="mb-4 text-center">
        <div className="inline-flex items-center gap-1.5 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3.5 py-1 text-xs font-semibold uppercase tracking-wider text-cyan-300">
          <Sparkles size={12} />
          Step 2: Guided Calibration
        </div>
        <h2 className="mt-2 text-2xl font-bold text-white sm:text-3xl">
          Calibrate Your Reach Area
        </h2>
        <p className="mt-1 text-sm text-slate-300">
          {config.playMode === "seated" ? "Sit comfortably" : "Stand comfortably"} and move your{" "}
          <span className="font-semibold text-cyan-400 capitalize">{config.selectedHand} hand</span> within your easy reach.
        </p>
      </div>

      {/* Spoken / Visual Prompt Pill */}
      <div className="mb-4 flex items-center justify-center">
        <div className="flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-950/40 px-5 py-2 text-sm font-medium text-cyan-200 shadow-lg shadow-cyan-950/50">
          <Volume2 size={16} className="text-cyan-400" />
          <span>{promptText}</span>
        </div>
      </div>

      {/* Arena Preview Frame */}
      <div className="relative aspect-video w-full overflow-hidden rounded-3xl border border-white/10 bg-slate-950 shadow-2xl">
        {/* Mirrored video element */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="h-full w-full object-cover"
          style={{ transform: "scaleX(-1)" }}
        />

        {/* Live Wrist Tracker Indicator */}
        {wristPoint && (
          <div
            className="pointer-events-none absolute h-8 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-cyan-300 bg-cyan-400/40 shadow-lg shadow-cyan-400/80 transition-transform duration-75"
            style={{ left: `${wristPoint.x}px`, top: `${wristPoint.y}px` }}
          >
            <div className="absolute inset-1 animate-ping rounded-full bg-cyan-300 opacity-60" />
          </div>
        )}

        {/* Tracking status badge */}
        <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full border border-white/10 bg-slate-950/70 px-3 py-1.5 text-xs backdrop-blur-md">
          <span
            className={`h-2.5 w-2.5 rounded-full ${
              trackingHealthy ? "bg-emerald-400 animate-pulse" : "bg-amber-400"
            }`}
          />
          <span className="font-medium text-slate-200">
            {trackingHealthy ? "Wrist Detected" : "Looking for hand..."}
          </span>
        </div>

        {/* Center overlay when success or error */}
        {isSuccess && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/70 p-6 text-center backdrop-blur-md">
            <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-400/30 bg-emerald-400/10 text-emerald-400 shadow-lg shadow-emerald-400/20">
              <CheckCircle2 size={32} />
            </div>
            <h3 className="text-xl font-bold text-white">Calibration Complete!</h3>
            <p className="mt-1 max-w-md text-xs text-slate-300 sm:text-sm">
              Your safe reach zone is successfully locked. Targets will spawn exclusively inside this zone.
            </p>
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={handleRetry}
                className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-medium text-slate-300 hover:bg-white/10"
              >
                <RotateCcw size={15} />
                Recalibrate
              </button>
              <button
                type="button"
                onClick={handleFinish}
                className="flex items-center gap-2 rounded-xl bg-cyan-500 px-6 py-2.5 text-sm font-bold text-slate-950 shadow-lg shadow-cyan-500/25 transition hover:bg-cyan-400"
              >
                Start Game
                <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}

        {errorNotice && !isSuccess && (
          <div className="absolute inset-x-6 bottom-6 flex flex-col items-center justify-between gap-3 rounded-2xl border border-amber-400/30 bg-slate-950/90 p-4 text-center backdrop-blur-lg sm:flex-row sm:text-left">
            <div className="flex items-center gap-3">
              <AlertCircle className="shrink-0 text-amber-400" size={24} />
              <p className="text-xs text-amber-200 sm:text-sm">{errorNotice}</p>
            </div>
            <button
              type="button"
              onClick={handleRetry}
              className="flex shrink-0 items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-amber-400"
            >
              <RotateCcw size={14} />
              Retry Calibration
            </button>
          </div>
        )}
      </div>

      {/* Progress Bar & Instructions */}
      {!isSuccess && (
        <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-md">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Sampling Reach (move your hand):</span>
            <span className="font-semibold text-cyan-400">
              {samplesCount} / {requiredSamples} points ({progressPercent}%)
            </span>
          </div>
          <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-emerald-400 transition-all duration-150"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <div className="mt-4 flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={onCancel}
              className="text-xs font-semibold text-slate-400 hover:text-white"
            >
              ← Back to Settings
            </button>
            <button
              type="button"
              onClick={handleRetry}
              className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-cyan-400"
            >
              <RotateCcw size={13} />
              Reset Samples
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
