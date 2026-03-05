import { create } from 'zustand';

export type SoundId =
  | 'turn_advance'
  | 'policy_set'
  | 'milestone'
  | 'event_critical'
  | 'event_positive'
  | 'event_warning'
  | 'ui_click';

interface AudioState {
  muted: boolean;
  volume: number;
  toggleMute: () => void;
  setVolume: (v: number) => void;
}

function readAudioPrefs(): { muted: boolean; volume: number } {
  try {
    const raw = window.localStorage.getItem('econ_sim_audio');
    if (raw) {
      const parsed = JSON.parse(raw);
      return { muted: !!parsed.muted, volume: typeof parsed.volume === 'number' ? parsed.volume : 0.5 };
    }
  } catch { /* ignore */ }
  return { muted: false, volume: 0.5 };
}

function saveAudioPrefs(muted: boolean, volume: number): void {
  try { window.localStorage.setItem('econ_sim_audio', JSON.stringify({ muted, volume })); } catch { /* ignore */ }
}

export const useAudioStore = create<AudioState>((set, get) => ({
  ...readAudioPrefs(),
  toggleMute: () => {
    const next = !get().muted;
    set({ muted: next });
    saveAudioPrefs(next, get().volume);
  },
  setVolume: (v) => {
    const clamped = Math.max(0, Math.min(1, v));
    set({ volume: clamped });
    saveAudioPrefs(get().muted, clamped);
  },
}));

// Lazy AudioContext (created on first user interaction)
let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (ctx) return ctx;
  try {
    ctx = new AudioContext();
  } catch {
    return null;
  }
  return ctx;
}

function osc(
  audioCtx: AudioContext,
  type: OscillatorType,
  freq: number,
  startTime: number,
  duration: number,
  gain: number,
  freqEnd?: number,
): void {
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, startTime);
  if (freqEnd !== undefined) {
    o.frequency.linearRampToValueAtTime(freqEnd, startTime + duration);
  }
  g.gain.setValueAtTime(gain, startTime);
  g.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
  o.connect(g).connect(audioCtx.destination);
  o.start(startTime);
  o.stop(startTime + duration);
}

const SOUND_DEFS: Record<SoundId, (audioCtx: AudioContext, vol: number) => void> = {
  turn_advance: (audioCtx, vol) => {
    const t = audioCtx.currentTime;
    osc(audioCtx, 'sine', 220, t, 0.08, vol * 0.3, 440);
    osc(audioCtx, 'sine', 330, t + 0.04, 0.06, vol * 0.2, 550);
  },
  policy_set: (audioCtx, vol) => {
    const t = audioCtx.currentTime;
    osc(audioCtx, 'sine', 600, t, 0.05, vol * 0.2);
    osc(audioCtx, 'sine', 800, t + 0.06, 0.08, vol * 0.25);
  },
  milestone: (audioCtx, vol) => {
    const t = audioCtx.currentTime;
    osc(audioCtx, 'sine', 523, t, 0.12, vol * 0.3);          // C5
    osc(audioCtx, 'sine', 659, t + 0.1, 0.12, vol * 0.3);    // E5
    osc(audioCtx, 'sine', 784, t + 0.2, 0.18, vol * 0.35);   // G5
  },
  event_critical: (audioCtx, vol) => {
    const t = audioCtx.currentTime;
    osc(audioCtx, 'sawtooth', 180, t, 0.15, vol * 0.15, 90);
    osc(audioCtx, 'sine', 200, t + 0.08, 0.2, vol * 0.2, 120);
  },
  event_positive: (audioCtx, vol) => {
    const t = audioCtx.currentTime;
    osc(audioCtx, 'sine', 440, t, 0.1, vol * 0.25, 660);
    osc(audioCtx, 'triangle', 550, t + 0.08, 0.12, vol * 0.2);
  },
  event_warning: (audioCtx, vol) => {
    const t = audioCtx.currentTime;
    osc(audioCtx, 'triangle', 300, t, 0.1, vol * 0.2);
    osc(audioCtx, 'triangle', 260, t + 0.12, 0.1, vol * 0.18);
  },
  ui_click: (audioCtx, vol) => {
    const t = audioCtx.currentTime;
    osc(audioCtx, 'sine', 800, t, 0.03, vol * 0.15);
  },
};

export function playSound(id: SoundId): void {
  const state = useAudioStore.getState();
  if (state.muted) return;
  const audioCtx = getCtx();
  if (!audioCtx) return;
  // Resume suspended context (autoplay policy)
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  try {
    SOUND_DEFS[id](audioCtx, state.volume);
  } catch {
    // Ignore audio errors
  }
}
