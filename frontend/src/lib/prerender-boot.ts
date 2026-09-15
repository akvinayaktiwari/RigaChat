/**
 * Facts about how this page load started, for components that animate in.
 *
 * Prerendered pages ship their content as static HTML (scripts/prerender.mjs),
 * and main.tsx then boots with createRoot, which discards that markup and
 * renders afresh. Two consequences an entrance animation has to respect:
 *
 *  - On the SERVER nothing ever animates, so an `initial={{ opacity: 0 }}`
 *    would ship the content invisible, forever, to every crawler.
 *  - On the CLIENT, a page that booted from prerendered HTML already showed its
 *    above-the-fold content. Replaying the entrance there makes it blink out
 *    and fade back in.
 */

export function isServerRender(): boolean {
  return typeof window === 'undefined'
}

/**
 * The path whose static HTML was on screen when the bundle booted, or null.
 *
 * Read at module evaluation, which runs before main.tsx calls createRoot():
 * after that the root's children are React's, not the prerender's.
 */
const prerenderedPath: string | null =
  typeof document !== 'undefined' && document.getElementById('root')?.hasChildNodes()
    ? window.location.pathname
    : null

/** True on the client when the current page's content arrived prerendered. */
export function bootedFromPrerender(): boolean {
  return prerenderedPath !== null && !isServerRender() && window.location.pathname === prerenderedPath
}
