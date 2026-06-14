import { useState, useEffect } from 'react';

export function useMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(() => {
    // Use matchMedia for the initial value — same source of truth as the
    // effect listener. On real devices window.innerWidth can disagree with
    // the CSS viewport (e.g. before layout paint, or on high-dpi screens
    // where the browser hasn't applied device-width scaling yet).
    return window.matchMedia(`(max-width: ${breakpoint - 1}px)`).matches;
  });

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    // Sync once on mount in case the media query result changed between
    // the initial render and the effect running (rare but possible on mobile).
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [breakpoint]);

  return isMobile;
}