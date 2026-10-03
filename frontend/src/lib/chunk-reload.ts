import { lazy, type ComponentType } from 'react'

/**
 * Recovers a tab whose lazy route chunk no longer exists.
 *
 * Every deploy uploads new hashed chunks and deletes the old ones (ci.yml syncs
 * assets with --delete). A dashboard tab opened before a deploy still runs the
 * old bundle, so its next navigation asks for a chunk that is gone, the import
 * rejects, and with nothing to catch it React unmounts the whole app: a blank
 * white page. A tab left open long enough for its session to time out is the
 * tab most likely to have lived through a deploy, so it read as a session bug.
 *
 * A full reload fetches the current index.html and its current chunk names. If
 * the session has expired in the meantime, the reload's session restore clears
 * it and ProtectedRoute sends the user to /login.
 */

export const CHUNK_RELOAD_KEY = 'chunk_reload_at'

/** A chunk still missing this soon after a reload is not a stale tab. */
const RELOAD_GUARD_MS = 10_000

function reloadedRecently(now: number): boolean {
  try {
    const at = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY))
    return at > 0 && now - at < RELOAD_GUARD_MS
  } catch {
    // Storage is unreadable (private mode, blocked site data). Report "recent"
    // so the caller throws to the error screen instead of risking a reload loop.
    return true
  }
}

function markReloaded(now: number): boolean {
  try {
    sessionStorage.setItem(CHUNK_RELOAD_KEY, String(now))
    return true
  } catch {
    return false
  }
}

/**
 * Runs a dynamic import, and on failure reloads the page once instead of
 * rejecting. A second failure within the guard window is a broken deploy or a
 * dropped connection, not a stale tab: it rethrows, so the route error boundary
 * can say so rather than reloading forever.
 */
export async function importOrReload<T>(
  load: () => Promise<T>,
  reload: () => void = () => window.location.reload(),
): Promise<T> {
  try {
    return await load()
  } catch (error) {
    const now = Date.now()
    if (reloadedRecently(now) || !markReloaded(now)) throw error
    reload()
    // Never settles: the page is about to go away, and rejecting now would flash
    // the error screen for the moment before the reload lands.
    return await new Promise<T>(() => undefined)
  }
}

/** Route components take no props, which is all this needs to support (as in lazy-with-preload). */
type RouteLoader = () => Promise<{ default: ComponentType }>

/** React.lazy for a route, recovering from a chunk a deploy has deleted. */
export function lazyRoute(loader: RouteLoader) {
  return lazy(() => importOrReload(loader))
}
