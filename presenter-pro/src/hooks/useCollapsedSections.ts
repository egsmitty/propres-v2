import { useCallback, useState } from 'react';

/**
 * The filmstrip's per-section collapsed map, reset to "all collapsed" whenever
 * the presentation (by id) changes — plan D2 #9.
 *
 * This is React's documented "adjust state while rendering" pattern: the
 * previous presentation id is stored next to the map and compared during
 * render, instead of an effect that sets state after the render it should
 * have applied to. Sections added or removed under the same presentation id
 * do not reset the map (the caller collapses new sections itself), exactly as
 * before.
 */

type Section = { id: string };
export type CollapsedMap = Record<string, boolean>;
type Updater = CollapsedMap | ((current: CollapsedMap) => CollapsedMap);

export function collapseAll(sections: ReadonlyArray<Section> | null | undefined): CollapsedMap {
  const map: CollapsedMap = {};
  for (const section of sections ?? []) map[section.id] = true;
  return map;
}

export function useCollapsedSections(
  presentationId: string | number | null | undefined,
  sections: ReadonlyArray<Section> | null | undefined
): readonly [CollapsedMap, (updater: Updater) => void] {
  const key = presentationId ?? null;
  const [state, setState] = useState(() => ({ key, map: collapseAll(sections) }));

  let current = state;
  if (state.key !== key) {
    current = { key, map: collapseAll(sections) };
    setState(current);
  }

  const setCollapsed = useCallback((updater: Updater) => {
    setState((previous) => ({
      key: previous.key,
      map: typeof updater === 'function' ? updater(previous.map) : updater,
    }));
  }, []);

  return [current.map, setCollapsed] as const;
}
