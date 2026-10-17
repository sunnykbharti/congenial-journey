/**
 * audioVoiceController.js - Accessible audio cues and multilingual speech
 * feedback for PosePlay (English, Hindi, Hinglish).
 *
 * Enforces:
 * - Speech cooldowns (no stuttering / queue pileups)
 * - Mute toggling
 * - Clean text fallback
 * - Synthesized web audio chime (no external audio files needed)
 */

export const LOCALIZED_MESSAGES = {
  en: {
    welcome: 'Welcome to PosePlay. Calibrate your reach to begin.',
    calibrating: 'Move your hand across your comfortable reach area.',
    ready: 'Ready! Starting in 3, 2, 1!',
    targetPrompt: 'Move your hand into the glowing target.',
    targetCollected: 'Target collected! Great reach!',
    trackingLost: 'Looking for your hand. Please stay in view.',
    multiplePeople: 'Multiple people detected. Please play one at a time.',
    paused: 'Game paused. Take a breath.',
    resuming: 'Resuming game!',
    finished: 'Awesome effort! Your session is complete.',
  },
  hi: {
    welcome: 'पोज-प्ले में आपका स्वागत है। शुरू करने के लिए अपना हाथ हिलाकर कैलिब्रेट करें।',
    calibrating: 'अपने हाथ को आरामदायक दायरे में हिलाएं।',
    ready: 'तैयार! खेल शुरू हो रहा है!',
    targetPrompt: 'अपना हाथ चमकते वृत्त के अंदर ले जाएं।',
    targetCollected: 'टारगेट कलेक्ट हुआ! बहुत बढ़िया!',
    trackingLost: 'कैमरे को आपका हाथ नहीं दिख रहा। कृपया सामने रहें।',
    multiplePeople: 'एक से अधिक लोग दिखे। कृपया अकेले खेलें।',
    paused: 'खेल रुका हुआ है। थोड़ा आराम करें।',
    resuming: 'खेल पुनः शुरू हो रहा है!',
    finished: 'शानदार प्रयास! आपका गेम समाप्त हुआ।',
  },
  hinglish: {
    welcome: 'PosePlay mein aapka swagat hai. Shuru karne ke liye hand calibrate karein.',
    calibrating: 'Apna hand comfortable area mein ghumayein.',
    ready: 'Ready ho jao! Game shuru hone wala hai.',
    targetPrompt: 'Apna hand glowing target ke andar le jao.',
    targetCollected: 'Target collect ho gaya! Badhiya reach!',
    trackingLost: 'Camera ko aapka hand clearly nahi dikh raha. Saamne rahein.',
    multiplePeople: 'Ek se zyada log dikh rahe hain. Please akele khelein.',
    paused: 'Game pause ho gaya. Relax karein.',
    resuming: 'Game resume ho raha hai!',
    finished: 'Shaandaar effort! Aapka game complete ho gaya.',
  },
};

let audioCtx = null;
let lastSpokenText = '';
let lastSpokenTime = 0;
const SPEECH_COOLDOWN_MS = 3500;

function getAudioContext() {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

/**
 * Plays a pleasant synthesizer chime for target collection using Web Audio API.
 */
export function playCollectionChime(enabled = true) {
  if (!enabled || typeof window === 'undefined') return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    const now = ctx.currentTime;

    // Upward cheerful arpeggio (C5 -> E5 -> G5)
    osc.frequency.setValueAtTime(523.25, now);
    osc.frequency.exponentialRampToValueAtTime(659.25, now + 0.08);
    osc.frequency.exponentialRampToValueAtTime(783.99, now + 0.16);

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.36);
  } catch {
    // Non-critical audio warning
  }
}

/**
 * Speaks a localized message using browser SpeechSynthesis with rate and cooldown guards.
 *
 * @param {string} key - Message key from LOCALIZED_MESSAGES
 * @param {'en' | 'hi' | 'hinglish'} lang - Selected language
 * @param {boolean} soundEnabled - Sound on/off
 */
export function speakInstruction(key, lang = 'en', soundEnabled = true) {
  if (!soundEnabled || typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return;
  }

  const langPack = LOCALIZED_MESSAGES[lang] || LOCALIZED_MESSAGES.en;
  const message = langPack[key] || LOCALIZED_MESSAGES.en[key] || key;

  const now = Date.now();
  if (window.speechSynthesis.speaking) return;
  if (message === lastSpokenText && now - lastSpokenTime < SPEECH_COOLDOWN_MS) return;

  try {
    const utterance = new SpeechSynthesisUtterance(message);
    const hasDevanagari = /[\u0900-\u097F]/.test(message);
    utterance.lang = hasDevanagari ? 'hi-IN' : 'en-US';
    utterance.rate = 0.95;
    utterance.pitch = 1.0;
    utterance.volume = 0.85;

    const voices = window.speechSynthesis.getVoices();
    if (hasDevanagari) {
      const hiVoice = voices.find((v) => v.lang === 'hi-IN' || v.lang.startsWith('hi'));
      if (hiVoice) utterance.voice = hiVoice;
    } else {
      const enVoice = voices.find((v) => v.lang === 'en-US' || v.lang.startsWith('en'));
      if (enVoice) utterance.voice = enVoice;
    }

    lastSpokenText = message;
    lastSpokenTime = now;
    window.speechSynthesis.speak(utterance);
  } catch {
    // Speech synthesis error caught gracefully
  }
}

export function cancelSpeech() {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}
