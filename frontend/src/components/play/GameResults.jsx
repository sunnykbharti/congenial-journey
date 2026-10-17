import { useState } from "react";
import {
  Trophy,
  Target,
  Clock,
  AlertTriangle,
  RotateCcw,
  Home,
  CheckCircle2,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import api from "../../api/Api";

export default function GameResults({ sessionData, onPlayAgain }) {
  const navigate = useNavigate();
  const [saveStatus, setSaveStatus] = useState("idle"); // 'idle' | 'saving' | 'saved' | 'error'
  const [errorMessage, setErrorMessage] = useState("");

  const {
    score = 0,
    targetsCollected = 0,
    activeDurationSeconds = 0,
    trackingInterruptions = 0,
    playMode = "standing",
    selectedHand = "right",
    sessionDuration = 60,
    idempotencyKey,
  } = sessionData;

  const handleSaveResult = async () => {
    setSaveStatus("saving");
    setErrorMessage("");
    try {
      const response = await api.post("/game/sessions", {
        score,
        targets_collected: targetsCollected,
        active_duration_seconds: activeDurationSeconds,
        tracking_interruptions: trackingInterruptions,
        play_mode: playMode,
        selected_hand: selectedHand,
        game_type: "reach_and_collect",
        configuration_version: "1.0",
        idempotency_key: idempotencyKey,
      });

      if (response.status === 200 || response.status === 201) {
        setSaveStatus("saved");
      }
    } catch (err) {
      console.error("Failed to save game session:", err);
      setSaveStatus("error");
      setErrorMessage(
        err.response?.data?.error || "Could not connect to backend to persist score."
      );
    }
  };

  return (
    <div className="relative mx-auto max-w-2xl px-4 py-8">
      <div className="overflow-hidden rounded-3xl border border-white/10 bg-slate-900/80 p-6 shadow-2xl backdrop-blur-xl sm:p-8">
        {/* Header */}
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-3xl border border-amber-400/30 bg-amber-400/10 text-amber-400 shadow-lg shadow-amber-400/20">
            <Trophy size={36} />
          </div>
          <div className="inline-flex items-center gap-1.5 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3.5 py-1 text-xs font-semibold uppercase tracking-wider text-cyan-300">
            <Sparkles size={12} />
            Round Complete
          </div>
          <h2 className="mt-2 text-3xl font-black text-white">Fantastic Movement!</h2>
          <p className="mx-auto mt-1 max-w-sm text-xs text-slate-400 sm:text-sm">
            You completed your Reach &amp; Collect session using gentle, guided arm extensions.
          </p>
        </div>

        {/* Primary Metrics Grid */}
        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-4 text-center">
            <div className="flex items-center justify-center text-cyan-400">
              <Trophy size={18} />
            </div>
            <div className="mt-1 font-mono text-2xl font-black text-white">{score}</div>
            <div className="text-[11px] font-medium text-slate-400">Total Score</div>
          </div>

          <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-4 text-center">
            <div className="flex items-center justify-center text-emerald-400">
              <Target size={18} />
            </div>
            <div className="mt-1 font-mono text-2xl font-black text-white">{targetsCollected}</div>
            <div className="text-[11px] font-medium text-slate-400">Targets Collected</div>
          </div>

          <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-4 text-center">
            <div className="flex items-center justify-center text-purple-400">
              <Clock size={18} />
            </div>
            <div className="mt-1 font-mono text-2xl font-black text-white">
              {Math.round(activeDurationSeconds)}s
            </div>
            <div className="text-[11px] font-medium text-slate-400">Active Play Time</div>
          </div>

          <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-4 text-center">
            <div className="flex items-center justify-center text-amber-400">
              <AlertTriangle size={18} />
            </div>
            <div className="mt-1 font-mono text-2xl font-black text-white">
              {trackingInterruptions}
            </div>
            <div className="text-[11px] font-medium text-slate-400">Tracking Breaks</div>
          </div>
        </div>

        {/* Session Details Pill */}
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-xs text-slate-400">
          <span className="rounded-lg border border-white/5 bg-white/5 px-2.5 py-1 capitalize">
            Mode: {playMode}
          </span>
          <span className="rounded-lg border border-white/5 bg-white/5 px-2.5 py-1 capitalize">
            Hand: {selectedHand}
          </span>
          <span className="rounded-lg border border-white/5 bg-white/5 px-2.5 py-1">
            Target Round: {sessionDuration}s
          </span>
        </div>

        {/* Persistence Section */}
        <div className="mt-6 rounded-2xl border border-white/10 bg-slate-950/60 p-4">
          {saveStatus === "idle" && (
            <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
              <span className="text-xs text-slate-300">
                Save this session to your PoseCare workout and gaming history?
              </span>
              <button
                onClick={handleSaveResult}
                className="flex items-center gap-2 rounded-xl bg-cyan-500 px-4 py-2 text-xs font-bold text-slate-950 transition hover:bg-cyan-400"
              >
                Save Result
              </button>
            </div>
          )}

          {saveStatus === "saving" && (
            <div className="flex items-center justify-center gap-2 text-xs text-cyan-400">
              <RefreshCw size={14} className="animate-spin" />
              <span>Saving result securely...</span>
            </div>
          )}

          {saveStatus === "saved" && (
            <div className="flex items-center justify-center gap-2 text-xs text-emerald-400">
              <CheckCircle2 size={16} />
              <span className="font-semibold">Result saved to your session records!</span>
            </div>
          )}

          {saveStatus === "error" && (
            <div className="flex flex-col items-center justify-between gap-2 sm:flex-row">
              <span className="text-xs text-red-400">{errorMessage}</span>
              <button
                onClick={handleSaveResult}
                className="flex items-center gap-1.5 rounded-xl bg-red-500/20 px-3 py-1.5 text-xs font-semibold text-red-300 hover:bg-red-500/30"
              >
                <RotateCcw size={13} />
                Retry Save
              </button>
            </div>
          )}
        </div>

        {/* Primary Navigation Actions */}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button
            onClick={onPlayAgain}
            className="flex items-center justify-center gap-2 rounded-2xl bg-cyan-500 px-6 py-3.5 text-sm font-bold text-slate-950 shadow-xl shadow-cyan-500/20 transition hover:bg-cyan-400"
          >
            <RotateCcw size={16} />
            Play Again
          </button>

          <button
            onClick={() => navigate("/dashboard")}
            className="flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-6 py-3.5 text-sm font-semibold text-slate-200 transition hover:bg-white/10 hover:text-white"
          >
            <Home size={16} />
            Back to Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
