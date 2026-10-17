import { useEffect } from "react";
import { Play, RotateCcw, Square, ArrowLeft, Trophy, Target, Clock } from "lucide-react";

export default function GamePauseOverlay({
  score,
  targetsCollected,
  activeSeconds,
  onResume,
  onRecalibrate,
  onFinish,
  onQuit,
}) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.code === "Space" || e.code === "Enter") {
        e.preventDefault();
        onResume();
      } else if (e.code === "Escape") {
        e.preventDefault();
        onFinish();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onResume, onFinish]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-xl">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-slate-900/90 p-6 shadow-2xl">
        <div className="text-center">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-cyan-300">
            Game Paused
          </div>
          <h2 className="mt-2 text-2xl font-black text-white">Take a Breather</h2>
          <p className="mt-1 text-xs text-slate-400">
            Timer and dwell tracking are paused. Rest your arm and resume whenever you are ready.
          </p>
        </div>

        {/* Current Stats Snapshot */}
        <div className="mt-6 grid grid-cols-3 gap-2 rounded-2xl border border-white/5 bg-white/[0.03] p-3 text-center">
          <div>
            <div className="flex items-center justify-center text-cyan-400">
              <Trophy size={16} />
            </div>
            <div className="mt-1 font-mono text-lg font-bold text-white">{score}</div>
            <div className="text-[10px] text-slate-400">Score</div>
          </div>
          <div>
            <div className="flex items-center justify-center text-emerald-400">
              <Target size={16} />
            </div>
            <div className="mt-1 font-mono text-lg font-bold text-white">{targetsCollected}</div>
            <div className="text-[10px] text-slate-400">Targets</div>
          </div>
          <div>
            <div className="flex items-center justify-center text-purple-400">
              <Clock size={16} />
            </div>
            <div className="mt-1 font-mono text-lg font-bold text-white">{Math.round(activeSeconds)}s</div>
            <div className="text-[10px] text-slate-400">Active Time</div>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-6 flex flex-col gap-2.5">
          <button
            onClick={onResume}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-500 py-3 text-sm font-bold text-slate-950 shadow-lg shadow-cyan-500/20 transition hover:bg-cyan-400"
          >
            <Play size={16} className="fill-slate-950" />
            Resume Game (Space)
          </button>

          <button
            onClick={onRecalibrate}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-white/10 hover:text-white"
          >
            <RotateCcw size={15} />
            Recalibrate Reach Bounds
          </button>

          <button
            onClick={onFinish}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-400/20 bg-red-400/10 py-2.5 text-sm font-semibold text-red-400 transition hover:bg-red-400/20"
          >
            <Square size={14} className="fill-red-400" />
            Finish &amp; View Summary
          </button>

          <button
            onClick={onQuit}
            className="mt-1 flex items-center justify-center gap-1.5 text-xs text-slate-400 hover:text-slate-200"
          >
            <ArrowLeft size={13} />
            Exit to Game Setup
          </button>
        </div>
      </div>
    </div>
  );
}
