/**
 * Unified interaction-feedback controller.
 *
 * Handles sound (Web Audio API) and haptic feedback for scroll-crossing events.
 * Designed as a module-level singleton; safe under SSR because all browser APIs
 * are guarded behind typeof checks.
 */

type FeedbackSource = "user" | "inertia" | "programmatic";

const THROTTLE_MS = 55;
const VIBRATE_MS = 6;
const DEFAULT_VOLUME = 0.11;
const SOUND_URL = "/assets/sounds/click-soft.mp3";
const LS_HAPTIC = "vs_scroll_haptic";
const LS_SOUND = "vs_scroll_sound";

class InteractionFeedback {
  private ctx: AudioContext | null = null;
  private buffer: AudioBuffer | null = null;
  private lastFire = 0;
  private hapticEl: HTMLLabelElement | null = null;
  private _hapticEnabled: boolean;
  private _soundEnabled: boolean;
  private volume = DEFAULT_VOLUME;
  private loading = false;
  private listeners: Set<() => void> = new Set();

  constructor() {
    if (typeof window !== "undefined") {
      this._hapticEnabled = localStorage.getItem(LS_HAPTIC) !== "0";
      this._soundEnabled = localStorage.getItem(LS_SOUND) === "1";
    } else {
      this._hapticEnabled = true;
      this._soundEnabled = false;
    }
  }

  get hapticEnabled() {
    return this._hapticEnabled;
  }
  get soundEnabled() {
    return this._soundEnabled;
  }

  setHapticEnabled(v: boolean) {
    this._hapticEnabled = v;
    try {
      localStorage.setItem(LS_HAPTIC, v ? "1" : "0");
    } catch {}
    this.notify();
  }

  setSoundEnabled(v: boolean) {
    this._soundEnabled = v;
    try {
      localStorage.setItem(LS_SOUND, v ? "1" : "0");
    } catch {}
    if (v) this.ensureAudio();
    this.notify();
  }

  /** Subscribe to settings changes. Returns an unsubscribe function. */
  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private notify() {
    for (const fn of this.listeners) fn();
  }

  /**
   * Call on the first real user gesture (pointerdown / tap / click) to
   * create or resume the AudioContext and pre-decode the click sound.
   */
  unlock() {
    if (typeof window === "undefined") return;
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
      } catch {
        return;
      }
    }
    if (this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
    if (!this.buffer && !this.loading) {
      this.loadBuffer();
    }
  }

  ensureAudio() {
    this.unlock();
  }

  private async loadBuffer() {
    if (this.loading || this.buffer || !this.ctx) return;
    this.loading = true;
    try {
      const res = await fetch(SOUND_URL);
      const ab = await res.arrayBuffer();
      this.buffer = await this.ctx.decodeAudioData(ab);
    } catch {
      /* silent degradation */
    }
    this.loading = false;
  }

  /**
   * Install the iOS haptic-fallback element.
   * Uses a hidden checkbox[switch] whose toggle can trigger the
   * system haptic on iOS Safari. Safe to call multiple times.
   */
  installHapticFallback() {
    if (typeof document === "undefined" || this.hapticEl) return;
    const input = document.createElement("input");
    input.type = "checkbox";
    input.setAttribute("switch", "");
    input.tabIndex = -1;
    input.setAttribute("aria-hidden", "true");

    const label = document.createElement("label");
    label.className = "visually-hidden";
    label.setAttribute("aria-hidden", "true");
    label.appendChild(input);
    document.body.appendChild(label);
    this.hapticEl = label;
  }

  /**
   * Fire a crossing-feedback event.
   * Only `"user"` and `"inertia"` sources produce output;
   * `"programmatic"` is silently ignored.
   */
  fire(source: FeedbackSource = "user") {
    if (source === "programmatic") return;

    const now = performance.now();
    if (now - this.lastFire < THROTTLE_MS) return;
    this.lastFire = now;

    this.doHaptic();
    this.doSound();
  }

  private doHaptic() {
    if (!this._hapticEnabled) return;

    // 1. Future native bridge (UISelectionFeedbackGenerator.selectionChanged)
    try {
      const bridge = (
        window as Window & {
          webkit?: {
            messageHandlers?: {
              haptics?: { postMessage: (msg: { type: string }) => void };
            };
          };
        }
      ).webkit?.messageHandlers?.haptics;
      if (bridge) {
        bridge.postMessage({ type: "selectionChanged" });
        return;
      }
    } catch {}

    // 2. navigator.vibrate (Android Chrome, etc.)
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      try {
        navigator.vibrate(VIBRATE_MS);
      } catch {}
      return;
    }

    // 3. iOS switch-checkbox fallback (best-effort)
    this.hapticEl?.click();
  }

  private doSound() {
    if (!this._soundEnabled || !this.ctx || !this.buffer) return;
    if (this.ctx.state !== "running") return;
    try {
      const src = this.ctx.createBufferSource();
      src.buffer = this.buffer;
      const gain = this.ctx.createGain();
      gain.gain.value = this.volume;
      src.connect(gain);
      gain.connect(this.ctx.destination);
      src.start(0);
    } catch {
      /* silent degradation */
    }
  }

  dispose() {
    this.hapticEl?.remove();
    this.hapticEl = null;
    try {
      this.ctx?.close();
    } catch {}
    this.ctx = null;
    this.buffer = null;
  }
}

let _instance: InteractionFeedback | null = null;

export function getInteractionFeedback(): InteractionFeedback {
  if (!_instance) {
    _instance = new InteractionFeedback();
  }
  return _instance;
}

export type { FeedbackSource };
