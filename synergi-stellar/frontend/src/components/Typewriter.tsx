'use client';

import { useEffect, useMemo, useState } from 'react';

type TypewriterProps = {
  text: string;
  startDelayMs?: number;
  stepMs?: number;
  className?: string;
  showCaret?: boolean;
};

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return true;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export default function Typewriter({
  text,
  startDelayMs = 250,
  stepMs = 28,
  className,
  showCaret = true
}: TypewriterProps) {
  const [visibleCount, setVisibleCount] = useState(() => (typeof window === 'undefined' ? text.length : 0));

  useEffect(() => {
    if (prefersReducedMotion()) {
      setVisibleCount(text.length);
      return;
    }

    setVisibleCount(0);
    let cancelled = false;
    let timeoutId: number | null = null;
    let intervalId: number | null = null;

    timeoutId = window.setTimeout(() => {
      if (cancelled) return;
      intervalId = window.setInterval(() => {
        setVisibleCount((current) => {
          const next = Math.min(text.length, current + 1);
          if (next >= text.length && intervalId) {
            window.clearInterval(intervalId);
            intervalId = null;
          }
          return next;
        });
      }, Math.max(16, stepMs));
    }, Math.max(0, startDelayMs));

    return () => {
      cancelled = true;
      if (timeoutId) window.clearTimeout(timeoutId);
      if (intervalId) window.clearInterval(intervalId);
    };
  }, [startDelayMs, stepMs, text]);

  const shown = useMemo(() => text.slice(0, visibleCount), [text, visibleCount]);

  return (
    <span className={className}>
      <span>{shown}</span>
      {showCaret ? <span className="type-caret" aria-hidden="true" /> : null}
    </span>
  );
}
