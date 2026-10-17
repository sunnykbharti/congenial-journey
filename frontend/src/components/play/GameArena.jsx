import { useState, useEffect, useRef } from "react";
import {
  Pause,
  Square,
  Volume2,
  VolumeX,
  Target as TargetIcon,
  Clock,
  Flame,
  AlertTriangle,
  UserCheck,
} from "lucide-react";
import { LOCALIZED_MESSAGES } from "../../utils/audioVoiceController";

export default function GameArena({
  videoRef,
  target,
  dwellProgress,
  leftCursor,
  rightCursor,
  score,
  combo,
  targetsCollected,
  timeRemaining,
  trackingState, // 'healthy' | 'lost' | 'multiple_people' | 'recovering'
  recoveryCountdown,
  config,
  onPause,
  onFinish,
  onToggleSound,
}) {
  const [collectEffect, setCollectEffect] = useState(null);
  const prevCollectedRef = useRef(targetsCollected);

  // Trigger brief burst effect when a target is collected
  useEffect(() => {
    if (targetsCollected > prevCollectedRef.current && target) {
      setCollectEffect({ x: target.x, y: target.y, id: Date.now() });
      const timer = setTimeout(() => setCollectEffect(null), 600);
      return () => clearTimeout(timer);
    }
    prevCollectedRef.current = targetsCollected;
  }, [targetsCollected, target]);

  // Keyboard navigation shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.code === "Space") {
        e.preventDefault();
        onPause();
      } else if (e.code === "Escape") {
        e.preventDefault();
        onFinish();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onPause, onFinish]);

  // Target SVG radial progress geometry
  const radius = target ? target.radius : 50;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - Math.max(0, Math.min(1, dwellProgress)));

  return (
    <div className="relative mx-auto flex h-full max-w-5xl flex-col px-3 py-2">
      {/* HUD Header Bar */}
      <div className="mb-3 flex items-center justify-between gap-2 rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 backdrop-blur-xl">
        {/* Score & Combo */}
        <div className="flex items-center gap-4">
          <div className="flex flex-col">
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Score</span>
            <span className="font-mono text-2xl font-black text-white sm:text-3xl">
              {score.toLocaleString()}
            </span>
          </div>

          {combo > 1 && (
            <div className="flex items-center gap-1 rounded-xl border border-amber-400/30 bg-amber-400/10 px-2.5 py-1 text-xs font-bold text-amber-300 animate-pulse">
              <Flame size={14} className="fill-amber-400" />
              <span>{combo}x Combo</span>
            </div>
          )}
        </div>

        {/* Center Targets & Time */}
        <div className="flex items-center gap-3 sm:gap-6">
          <div className="flex items-center gap-2 rounded-xl border border-white/5 bg-white/5 px-3 py-1.5">
            <TargetIcon size={16} className="text-cyan-400" />
            <span className="font-mono text-sm font-bold text-slate-200">
              {targetsCollected} <span className="text-xs font-normal text-slate-400">collected</span>
            </span>
          </div>

          <div className="flex items-center gap-2 rounded-xl border border-white/5 bg-white/5 px-3 py-1.5">
            <Clock size={16} className={timeRemaining <= 10 ? "text-red-400 animate-ping" : "text-slate-400"} />
            <span className={`font-mono text-sm font-bold ${timeRemaining <= 10 ? "text-red-400" : "text-white"}`}>
              {timeRemaining}s
            </span>
          </div>
        </div>

        {/* Controls: Mute, Pause, Finish */}
        <div className="flex items-center gap-2">
          <button
            onClick={onToggleSound}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/10 hover:text-white"
            title={config.soundEnabled ? "Mute audio" : "Enable audio"}
            aria-label="Toggle audio"
          >
            {config.soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </button>

          <button
            onClick={onPause}
            className="flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-xs font-bold text-white transition hover:bg-white/20 active:scale-95"
            title="Pause game (Spacebar)"
          >
            <Pause size={14} className="fill-white" />
            <span className="hidden sm:inline">Pause</span>
          </button>

          <button
            onClick={onFinish}
            className="flex items-center gap-1.5 rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-400 transition hover:bg-red-500/20 active:scale-95"
            title="Finish game (Esc)"
          >
            <Square size={13} className="fill-red-400" />
            <span className="hidden sm:inline">Finish</span>
          </button>
        </div>
      </div>

      {/* Main Game Arena Container */}
      <div className="relative aspect-video w-full overflow-hidden rounded-3xl border border-white/10 bg-black shadow-2xl">
        {/* Mirrored webcam video */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="h-full w-full object-cover"
          style={{ transform: "scaleX(-1)" }}
        />

        {/* SVG Game Visuals Layer */}
        <svg className="pointer-events-none absolute inset-0 h-full w-full">
          {/* Target Circle and Dwell Progress Ring */}
          {target && trackingState === "healthy" && (
            <g>
              {/* Outer pulsing ring */}
              <circle
                cx={target.x}
                cy={target.y}
                r={target.radius + 6}
                fill="none"
                stroke="rgba(34, 211, 238, 0.25)"
                strokeWidth="2"
                className="animate-pulse"
              />

              {/* Target background disk */}
              <circle
                cx={target.x}
                cy={target.y}
                r={target.radius}
                fill="rgba(8, 145, 178, 0.28)"
                stroke="rgba(34, 211, 238, 0.45)"
                strokeWidth="2"
              />

              {/* Center Bullseye Icon Core */}
              <circle
                cx={target.x}
                cy={target.y}
                r={Math.max(8, target.radius * 0.28)}
                fill="rgb(34, 211, 238)"
                className="animate-ping opacity-75"
              />
              <circle
                cx={target.x}
                cy={target.y}
                r={Math.max(6, target.radius * 0.24)}
                fill="rgb(255, 255, 255)"
              />

              {/* Radial Dwell Progress Ring */}
              <circle
                cx={target.x}
                cy={target.y}
                r={target.radius}
                fill="none"
                stroke="rgb(52, 211, 153)"
                strokeWidth="6"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                transform={`rotate(-90 ${target.x} ${target.y})`}
                style={{ transition: "stroke-dashoffset 60ms linear" }}
              />
            </g>
          )}

          {/* Collection burst animation */}
          {collectEffect && (
            <g>
              <circle
                cx={collectEffect.x}
                cy={collectEffect.y}
                r={radius * 1.5}
                fill="none"
                stroke="rgb(52, 211, 153)"
                strokeWidth="4"
                className="animate-ping opacity-90"
              />
            </g>
          )}

          {/* Left Hand Cursor */}
          {leftCursor && (
            <g transform={`translate(${leftCursor.x}, ${leftCursor.y})`}>
              <circle r="18" fill="rgba(168, 85, 247, 0.2)" stroke="rgba(168, 85, 247, 0.8)" strokeWidth="2" />
              <circle r="6" fill="rgb(216, 180, 254)" />
              <text x="22" y="4" fill="rgb(216, 180, 247)" fontSize="11" fontWeight="bold">L</text>
            </g>
          )}

          {/* Right Hand Cursor */}
          {rightCursor && (
            <g transform={`translate(${rightCursor.x}, ${rightCursor.y})`}>
              <circle r="18" fill="rgba(34, 211, 238, 0.2)" stroke="rgba(34, 211, 238, 0.8)" strokeWidth="2" />
              <circle r="6" fill="rgb(255, 255, 255)" />
              <text x="22" y="4" fill="rgb(103, 232, 249)" fontSize="11" fontWeight="bold">R</text>
            </g>
          )}
        </svg>

        {/* Tracking Loss or Multiple People Notification Overlay */}
        {trackingState === "lost" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/75 p-6 text-center backdrop-blur-md">
            <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-400/30 bg-amber-400/10 text-amber-400 animate-pulse">
              <AlertTriangle size={30} />
            </div>
            <h3 className="text-xl font-bold text-white">Tracking Interrupted</h3>
            <p className="mt-1 max-w-sm text-sm text-slate-300">
              {LOCALIZED_MESSAGES[config.language]?.trackingLost || LOCALIZED_MESSAGES.en.trackingLost}
            </p>
            <p className="mt-2 text-xs text-slate-400">Timer is paused. Re-align in view to resume.</p>
          </div>
        )}

        {trackingState === "multiple_people" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/80 p-6 text-center backdrop-blur-md">
            <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-400/30 bg-cyan-400/10 text-cyan-400">
              <UserCheck size={30} />
            </div>
            <h3 className="text-xl font-bold text-white">Multiple People Detected</h3>
            <p className="mt-1 max-w-sm text-sm text-slate-300">
              {LOCALIZED_MESSAGES[config.language]?.multiplePeople || LOCALIZED_MESSAGES.en.multiplePeople}
            </p>
          </div>
        )}

        {/* Resuming Recovery Countdown Overlay */}
        {trackingState === "recovering" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/60 backdrop-blur-sm">
            <div className="text-xs uppercase font-bold tracking-widest text-cyan-400">Resuming in</div>
            <div className="font-mono text-7xl font-black text-white animate-bounce">{recoveryCountdown}</div>
          </div>
        )}

        {/* Subtle Live Tracking Health Pill in bottom-left */}
        <div className="absolute bottom-4 left-4 flex items-center gap-2 rounded-full border border-white/10 bg-slate-950/80 px-3 py-1 text-xs backdrop-blur-md">
          <span
            className={`h-2 w-2 rounded-full ${
              trackingState === "healthy"
                ? "bg-emerald-400 animate-pulse"
                : trackingState === "lost"
                ? "bg-amber-400"
                : "bg-red-400"
            }`}
          />
          <span className="font-medium text-slate-300">
            {trackingState === "healthy"
              ? "Tracking Active"
              : trackingState === "lost"
              ? "Hand Not Detected"
              : "Pausing"}
          </span>
        </div>
      </div>
    </div>
  );
}
