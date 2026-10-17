import { useState } from "react";
import {
  Gamepad2,
  Sparkles,
  Volume2,
  VolumeX,
  Target,
  Clock,
  Hand,
  User,
  ShieldCheck,
  AlertCircle,
  Play,
  ArrowRight,
} from "lucide-react";

export default function GameSetup({ onStartCalibration, initialConfig }) {
  const [playMode, setPlayMode] = useState(initialConfig?.playMode || "standing");
  const [selectedHand, setSelectedHand] = useState(initialConfig?.selectedHand || "right");
  const [language, setLanguage] = useState(initialConfig?.language || "en");
  const [soundEnabled, setSoundEnabled] = useState(initialConfig?.soundEnabled ?? true);
  const [sessionDuration, setSessionDuration] = useState(initialConfig?.sessionDuration || 60);
  const [targetSize, setTargetSize] = useState(initialConfig?.targetSize || "medium"); // small: 40, medium: 55, large: 75
  const [dwellDuration, setDwellDuration] = useState(initialConfig?.dwellDuration || 1.0); // seconds

  const handleSubmit = (e) => {
    e.preventDefault();
    onStartCalibration({
      playMode,
      selectedHand,
      language,
      soundEnabled,
      sessionDuration: Number(sessionDuration),
      targetSize,
      targetRadius: targetSize === "small" ? 40 : targetSize === "large" ? 75 : 55,
      dwellDuration: Number(dwellDuration),
    });
  };

  return (
    <div className="relative mx-auto max-w-4xl px-4 py-8">
      {/* Intro Header */}
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl border border-cyan-400/30 bg-cyan-400/10 text-cyan-400 shadow-lg shadow-cyan-400/20">
          <Gamepad2 size={36} />
        </div>
        <div className="inline-flex items-center gap-1.5 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3.5 py-1 text-xs font-semibold uppercase tracking-wider text-cyan-300">
          <Sparkles size={12} />
          Bridge The Gap • Accessible Movement
        </div>
        <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
          PosePlay: Reach &amp; Collect
        </h1>
        <p className="mx-auto mt-2 max-w-2xl text-sm text-slate-400 sm:text-base">
          Control an interactive game using your natural hand movements. Touch and hold on-screen targets with your wrist to score points at your own comfortable pace.
        </p>
      </div>

      {/* Safety & Comfort Alert */}
      <div className="mb-8 rounded-2xl border border-amber-400/20 bg-amber-400/5 p-4 backdrop-blur-md">
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 shrink-0 text-amber-400" size={20} />
          <div className="text-xs text-amber-200/90 sm:text-sm">
            <span className="font-semibold text-amber-300">Safety Advisory: </span>
            Move only within your comfortable range of motion. Never overstretch, bend awkwardly, or continue if you feel pain, dizziness, or fatigue. You can pause or exit at any moment.
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Play Mode & Hand Selection Grid */}
        <div className="grid gap-6 md:grid-cols-2">
          {/* Posture Mode */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-xl">
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-200">
              <User size={16} className="text-cyan-400" />
              Posture Mode
            </label>
            <p className="mt-1 text-xs text-slate-400">
              Choose your comfortable physical position.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setPlayMode("standing")}
                className={`rounded-xl border p-3.5 text-center text-sm font-medium transition duration-200 ${
                  playMode === "standing"
                    ? "border-cyan-400 bg-cyan-400/15 text-white shadow-md shadow-cyan-400/10"
                    : "border-white/10 bg-white/5 text-slate-400 hover:border-white/20 hover:text-white"
                }`}
              >
                Standing
              </button>
              <button
                type="button"
                onClick={() => setPlayMode("seated")}
                className={`rounded-xl border p-3.5 text-center text-sm font-medium transition duration-200 ${
                  playMode === "seated"
                    ? "border-cyan-400 bg-cyan-400/15 text-white shadow-md shadow-cyan-400/10"
                    : "border-white/10 bg-white/5 text-slate-400 hover:border-white/20 hover:text-white"
                }`}
              >
                Seated (Chair/Desk)
              </button>
            </div>
          </div>

          {/* Hand Selection */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-xl">
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-200">
              <Hand size={16} className="text-cyan-400" />
              Active Hand
            </label>
            <p className="mt-1 text-xs text-slate-400">
              Select which wrist will control the game cursor.
            </p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {[
                { id: "left", label: "Left" },
                { id: "right", label: "Right" },
                { id: "either", label: "Either Hand" },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setSelectedHand(opt.id)}
                  className={`rounded-xl border p-3 text-center text-sm font-medium transition duration-200 ${
                    selectedHand === opt.id
                      ? "border-cyan-400 bg-cyan-400/15 text-white shadow-md shadow-cyan-400/10"
                      : "border-white/10 bg-white/5 text-slate-400 hover:border-white/20 hover:text-white"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Language & Voice Grid */}
        <div className="grid gap-6 md:grid-cols-2">
          {/* Language Selection */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-xl">
            <label className="text-sm font-semibold text-slate-200">
              Voice &amp; UI Language
            </label>
            <p className="mt-1 text-xs text-slate-400">
              Spoken audio prompts and visual instructions.
            </p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {[
                { id: "en", label: "English" },
                { id: "hi", label: "हिन्दी (Hindi)" },
                { id: "hinglish", label: "Hinglish" },
              ].map((lang) => (
                <button
                  key={lang.id}
                  type="button"
                  onClick={() => setLanguage(lang.id)}
                  className={`rounded-xl border p-3 text-center text-xs font-semibold transition duration-200 sm:text-sm ${
                    language === lang.id
                      ? "border-cyan-400 bg-cyan-400/15 text-white shadow-md shadow-cyan-400/10"
                      : "border-white/10 bg-white/5 text-slate-400 hover:border-white/20 hover:text-white"
                  }`}
                >
                  {lang.label}
                </button>
              ))}
            </div>
          </div>

          {/* Sound & Voice Toggle */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-xl">
            <label className="text-sm font-semibold text-slate-200">
              Sound Effects &amp; Voice
            </label>
            <p className="mt-1 text-xs text-slate-400">
              Audio feedback upon target touch and collection.
            </p>
            <div className="mt-3 flex items-center justify-between rounded-xl border border-white/10 bg-white/5 p-3">
              <div className="flex items-center gap-3">
                {soundEnabled ? (
                  <Volume2 className="text-cyan-400" size={20} />
                ) : (
                  <VolumeX className="text-slate-500" size={20} />
                )}
                <span className="text-sm text-slate-200">
                  {soundEnabled ? "Audio & Speech Enabled" : "Muted"}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSoundEnabled(!soundEnabled)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  soundEnabled ? "bg-cyan-500" : "bg-slate-700"
                }`}
                role="switch"
                aria-checked={soundEnabled}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    soundEnabled ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
          </div>
        </div>

        {/* Accessibility & Mechanics Tweaks */}
        <div className="grid gap-6 md:grid-cols-3">
          {/* Target Size */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-xl">
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-200">
              <Target size={16} className="text-cyan-400" />
              Target Size
            </label>
            <p className="mt-1 text-xs text-slate-400">
              Size of the interactive circles.
            </p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {["small", "medium", "large"].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setTargetSize(s)}
                  className={`rounded-xl border py-2.5 text-center text-xs font-semibold capitalize transition ${
                    targetSize === s
                      ? "border-cyan-400 bg-cyan-400/15 text-white"
                      : "border-white/10 bg-white/5 text-slate-400 hover:text-white"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Dwell Duration */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-xl">
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-200">
              <Clock size={16} className="text-cyan-400" />
              Dwell Hold Time
            </label>
            <p className="mt-1 text-xs text-slate-400">
              Seconds to hold hand inside target.
            </p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {[
                { v: 0.6, label: "0.6s (Fast)" },
                { v: 1.0, label: "1.0s (Normal)" },
                { v: 1.5, label: "1.5s (Easy)" },
              ].map((d) => (
                <button
                  key={d.v}
                  type="button"
                  onClick={() => setDwellDuration(d.v)}
                  className={`rounded-xl border py-2.5 text-center text-xs font-semibold transition ${
                    dwellDuration === d.v
                      ? "border-cyan-400 bg-cyan-400/15 text-white"
                      : "border-white/10 bg-white/5 text-slate-400 hover:text-white"
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          {/* Session Duration */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-xl">
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-200">
              <Clock size={16} className="text-cyan-400" />
              Game Duration
            </label>
            <p className="mt-1 text-xs text-slate-400">
              Total active play round time.
            </p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {[
                { v: 30, label: "30s" },
                { v: 60, label: "60s" },
                { v: 90, label: "90s" },
              ].map((t) => (
                <button
                  key={t.v}
                  type="button"
                  onClick={() => setSessionDuration(t.v)}
                  className={`rounded-xl border py-2.5 text-center text-xs font-semibold transition ${
                    sessionDuration === t.v
                      ? "border-cyan-400 bg-cyan-400/15 text-white"
                      : "border-white/10 bg-white/5 text-slate-400 hover:text-white"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Privacy Note */}
        <div className="flex items-center justify-between rounded-xl border border-white/5 bg-slate-900/40 px-4 py-3 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <ShieldCheck className="text-emerald-400" size={16} />
            <span>Privacy Note: Video frames are analyzed in real-time. No webcam video is stored on any disk.</span>
          </div>
        </div>

        {/* Submit Button */}
        <div className="pt-2">
          <button
            type="submit"
            className="group flex w-full items-center justify-center gap-3 rounded-2xl bg-cyan-500 py-4 text-base font-bold text-slate-950 shadow-xl shadow-cyan-500/25 transition duration-300 hover:bg-cyan-400 hover:scale-[1.01] active:scale-[0.99]"
          >
            <Play size={20} className="fill-slate-950" />
            Proceed to Calibration
            <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
          </button>
        </div>
      </form>
    </div>
  );
}
