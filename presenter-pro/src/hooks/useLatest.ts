import { useEffect, useRef, type MutableRefObject } from 'react';

/**
 * A ref that always holds the value from the latest committed render.
 *
 * Use it inside subscription effects (window/document listeners, registries)
 * that must call the *current* handler without listing that handler as a
 * dependency — which would tear the subscription down and re-create it on
 * every render, because the handler is a new function each time. This is the
 * documented pattern behind React 19's `useEffectEvent`; the app is on
 * React 18. Plan D3.
 *
 * The ref is written in an effect, never during render, so the React
 * Compiler's ref rules hold. Declare it before the effect that reads it —
 * effects run in declaration order, so the ref is fresh by the time the
 * subscription effect runs.
 */
export function useLatest<T>(value: T): MutableRefObject<T> {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  });
  return ref;
}
