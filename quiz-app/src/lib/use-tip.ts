import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { hasSeenTip, TipId, TIPS_KEY, withTipSeen } from '@/game/tips';

// One read/write at a time, so two tips on the same screen never overwrite each other.
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(job: () => Promise<T>): Promise<T> {
  const run = queue.then(job);
  queue = run.catch(() => {});
  return run;
}

const read = () => AsyncStorage.getItem(TIPS_KEY).catch(() => null);

/**
 * True while a first-time tip should show. It is marked as seen when the moment ends
 * (the card closes), so it shows fully once and never again on this phone.
 */
export function useTip(id: TipId, active = true): boolean {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!active) return;
    let alive = true;
    let shown = false;
    serial(read).then((raw) => {
      if (!alive || hasSeenTip(raw, id)) return;
      shown = true;
      setShow(true);
    });
    return () => {
      alive = false;
      if (!shown) return;
      serial(async () => {
        const raw = await read();
        await AsyncStorage.setItem(TIPS_KEY, withTipSeen(raw, id)).catch(() => {});
      });
    };
  }, [id, active]);
  return active && show;
}
