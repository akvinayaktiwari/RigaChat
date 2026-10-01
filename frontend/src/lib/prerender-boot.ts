/**
 * Facts about how this page load started, for components that animate in.
 *
 * Prerendered pages ship their content as static HTML (scripts/prerender.mjs),
 * and main.tsx hydrates that markup in place. Two consequences an entrance
 * animation has to respect:
 *
 *  - On the SERVER nothing ever animates, so an `initial={{ opacity: 0 }}`
 *    would ship the content invisible, forever, to every crawler.
 *  - On the CLIENT, the first render of a page that booted from prerendered
 *    HTML has to produce the markup the server did. The content is already on
 *    screen at its final state, so an entrance that starts hidden would both
 *    disagree with it and blink the page out and back in.
 */

export function isServerRender(): boolean {
  return typeof window === 'undefined'
}

/**
 * The path whose static HTML was on screen when the bundle booted, or null.
 *
 * Read at module evaluation, which runs before main.tsx mounts React: after a
 * client-side navigation the root's children are no longer the prerender's.
 */
const prerenderedPath: string | null =
  typeof document !== 'undefined' && document.getElementById('root')?.hasChildNodes()
    ? window.location.pathname
    : null

/** True on the client when the current page's content arrived prerendered. */
export function bootedFromPrerender(): boolean {
  return prerenderedPath !== null && !isServerRender() && window.location.pathname === prerenderedPath
}
