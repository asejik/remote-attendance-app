import { useEffect, useRef } from 'react';

// Moves keyboard focus to an element when a dialog opens. React's autoFocus
// only works on form controls; this also works on a heading with tabIndex={-1}.
export const useFocusOnMount = <T extends HTMLElement>() => {
  const ref = useRef<T>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return ref;
};
