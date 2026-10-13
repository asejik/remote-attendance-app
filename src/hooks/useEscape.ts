import { useEffect } from 'react';

// Closes a dialog when the Escape key is pressed.
export const useEscape = (onEscape: () => void) => {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onEscape();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onEscape]);
};
