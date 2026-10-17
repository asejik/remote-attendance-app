import { useCallback, useRef } from 'react';

// Applies only the newest load's result. Without it, a slow first load (e.g.
// on opening a page) could finish after a reload made by a save and put the
// old list back, so a just-added item seemed to disappear.
export const useLatestOnly = () => {
  const counter = useRef(0);
  return useCallback(<T,>(load: Promise<T>, apply: (value: T) => void) => {
    const n = ++counter.current;
    return load.then((value) => {
      if (n === counter.current) apply(value);
    });
  }, []);
};
