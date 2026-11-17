import { useEffect, useRef } from 'react';
import { haptic } from '@/components/ui';
import { play, playLater } from '@/lib/sound';
import type { RaceState } from './engine';

/** Plays the right sound when the race changes (question, answer, move, finish). */
export function useRaceSounds(race: RaceState | null) {
  const prev = useRef<RaceState | null>(null);

  useEffect(() => {
    const before = prev.current;
    prev.current = race;
    if (!race || !before) return;

    if (race.lastMove && race.lastMove !== before.lastMove) {
      play(race.lastMove.kind === 'push' ? 'push' : 'splash');
      if (race.lastMove.kind === 'push') haptic('heavy');
    }

    if (race.phase !== before.phase) {
      if (race.phase === 'question') play('whoosh');
      else if (race.phase === 'steal') {
        play('wrong');
        playLater('chime', 450); // the other team gets a chance to steal
      } else if (race.phase === 'choose') play('correct');
      else if (race.phase === 'pick' && (before.phase === 'steal' || before.phase === 'question')) play('wrong');
      else if (race.phase === 'finished') {
        haptic('success');
        playLater('horn', 250);
        playLater('win', 1300);
      }
    }

    const unlocked = race.teams.some((t, i) => t.comeback === 'available' && before.teams[i].comeback !== 'available');
    if (unlocked) playLater('chime', 700);
  }, [race]);
}
