/**
 * Body-wide cursor and selection lock for the duration of a drag interaction
 * (canvas move / resize / rotate / marquee). Plan D1.
 *
 * Lives outside any component on purpose: the React Compiler treats a write
 * to `document.body.style` inside a component-scope function as a global
 * mutation and bails out of compiling the whole component (Canvas.jsx).
 * From a plain module the same write is an ordinary side effect.
 */

export function beginBodyInteraction(cursor: string): void {
  document.body.style.cursor = cursor;
  document.body.style.userSelect = 'none';
}

export function endBodyInteraction(): void {
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
}
