import AsyncStorage from '@react-native-async-storage/async-storage';
import { type AudioPlayer, createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

/**
 * All sounds are generated in code (scripts/make-sounds.mjs), so they are original and free.
 * Effects are on by default; music is off by default (the host reads questions out loud).
 */
const SOURCES = {
  tap: require('../../assets/sounds/tap.wav'),
  tick: require('../../assets/sounds/tick.wav'),
  whoosh: require('../../assets/sounds/whoosh.wav'),
  correct: require('../../assets/sounds/correct.wav'),
  wrong: require('../../assets/sounds/wrong.wav'),
  chime: require('../../assets/sounds/chime.wav'),
  splash: require('../../assets/sounds/splash.wav'),
  push: require('../../assets/sounds/push.wav'),
  horn: require('../../assets/sounds/horn.wav'),
  win: require('../../assets/sounds/win.wav'),
};
const MUSIC = require('../../assets/sounds/music.wav');

export type SoundName = keyof typeof SOURCES;

const VOLUME: Record<SoundName, number> = {
  tap: 0.35,
  tick: 0.5,
  whoosh: 0.6,
  correct: 0.8,
  wrong: 0.7,
  chime: 0.7,
  splash: 0.85,
  push: 0.9,
  horn: 0.8,
  win: 0.9,
};
const MUSIC_VOLUME = 0.3;
const KEY = 'jawla.sound.v1';

type Settings = { sfx: boolean; music: boolean };
let settings: Settings = { sfx: true, music: false };
const listeners = new Set<() => void>();
const players: Partial<Record<SoundName, AudioPlayer>> = {};
let musicPlayer: AudioPlayer | null = null;
let started = false;

function emit() {
  listeners.forEach((l) => l());
}

function syncMusic() {
  const active = AppState.currentState === 'active' || AppState.currentState == null;
  if (settings.music && active) {
    try {
      if (!musicPlayer) {
        musicPlayer = createAudioPlayer(MUSIC);
        musicPlayer.loop = true;
        musicPlayer.volume = MUSIC_VOLUME;
      }
      musicPlayer.play();
    } catch {
      // Audio can be unavailable (e.g. the browser blocks it until a tap). Silence is fine.
    }
  } else {
    musicPlayer?.pause();
  }
}

/** Call once at app start. Loads saved settings and prepares audio. */
export function startSound() {
  if (started) return;
  started = true;
  setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'mixWithOthers' }).catch(() => {});
  AsyncStorage.getItem(KEY)
    .then((raw) => {
      if (!raw) return;
      const saved = JSON.parse(raw) as Partial<Settings>;
      settings = { sfx: saved.sfx !== false, music: saved.music === true };
      emit();
      syncMusic();
    })
    .catch(() => {});
  AppState.addEventListener('change', syncMusic);
}

/** Play a short sound effect (does nothing when effects are muted). */
export function play(name: SoundName) {
  if (!settings.sfx) return;
  try {
    let p = players[name];
    if (!p) {
      p = createAudioPlayer(SOURCES[name]);
      p.volume = VOLUME[name];
      players[name] = p;
    }
    p.seekTo(0).catch(() => {});
    p.play();
  } catch {
    // Never let a sound problem break the game.
  }
}

/** Play a sound after a short delay (for little sequences like horn → fanfare). */
export function playLater(name: SoundName, ms: number) {
  setTimeout(() => play(name), ms);
}

function update(patch: Partial<Settings>) {
  settings = { ...settings, ...patch };
  AsyncStorage.setItem(KEY, JSON.stringify(settings)).catch(() => {});
  emit();
  syncMusic();
}

export const toggleSfx = () => update({ sfx: !settings.sfx });
export const toggleMusic = () => update({ music: !settings.music });

/** Current sound settings; re-renders when they change. */
export function useSoundSettings(): Settings {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => settings,
    () => settings,
  );
}
