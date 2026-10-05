import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { AppSettings } from '@core/model';

// Read lazily, not at module scope: the e2e stub installs it on the window before the app mounts.
const synth = (): SpeechSynthesis | undefined => (typeof window === 'undefined' ? undefined : window.speechSynthesis);

let speaking = false;
const listeners = new Set<() => void>();
const emit = (next: boolean) => {
  speaking = next;
  for (const l of listeners) l();
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Speaks `text`, cancelling whatever is queued: one voice at a time, so a long story never piles up. */
export function speak(text: string, { voiceUri, rate }: AppSettings['speech']) {
  const s = synth();
  if (!s || text === '') return;
  s.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const voice = voiceUri === undefined ? undefined : s.getVoices().find((v) => v.voiceURI === voiceUri);
  if (voice) u.voice = voice;
  u.rate = rate;
  u.addEventListener('end', () => emit(false));
  u.addEventListener('error', () => emit(false));
  emit(true);
  s.speak(u);
}

export function stopSpeech() {
  synth()?.cancel();
  emit(false);
}

/** `supported: false` where there is no speech service (Linux Chrome without one); the UI then hides itself. */
export function useSpeech() {
  const isSpeaking = useSyncExternalStore(subscribe, () => speaking);
  return { supported: synth() !== undefined, speaking: isSpeaking, speak, stop: stopSpeech };
}

/** Reads a finished turn aloud; what was already on screen when the adventure opened is not read. */
export function useReadAloud(speech: AppSettings['speech'], text: string | undefined) {
  const mounted = useRef(false);
  useEffect(() => {
    const first = !mounted.current;
    mounted.current = true;
    if (first || !speech.enabled || text === undefined) return undefined;
    speak(text, speech);
    return stopSpeech; // a new turn, or leaving the adventure, cuts the voice off
  }, [speech, text]);
}

const readVoices = (): SpeechSynthesisVoice[] => {
  const all = synth()?.getVoices() ?? [];
  const lang = navigator.language.split('-')[0] ?? 'en';
  const mine = all.filter((v) => v.lang.startsWith(lang));
  return mine.length > 0 ? mine : all;
};

/** Installed voices, narrowed to the browser's language. Chrome fills the list asynchronously, hence `voiceschanged`. */
export function useVoices(): SpeechSynthesisVoice[] {
  const [voices, setVoices] = useState(readVoices);
  useEffect(() => {
    const s = synth();
    if (!s) return undefined;
    const read = () => setVoices(readVoices());
    s.addEventListener('voiceschanged', read);
    return () => s.removeEventListener('voiceschanged', read);
  }, []);
  return voices;
}
