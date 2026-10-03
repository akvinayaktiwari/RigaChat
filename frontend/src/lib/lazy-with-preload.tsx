import { lazy, type ComponentType } from 'react'
import { importOrReload } from './chunk-reload'

/** Route components take no props, which is all this needs to support. */
type Loader = () => Promise<{ default: ComponentType }>

export type PreloadableComponent = ComponentType & {
  /** Fetches the chunk. Once it settles, the component renders without suspending. */
  preload: () => Promise<void>
}

/**
 * React.lazy, plus a way to have the chunk in hand before the first render.
 *
 * A plain lazy() component always suspends on its first render, even when its
 * chunk is already cached. During hydration that leaves its Suspense boundary
 * "dehydrated" until the chunk resolves, and any state update that reaches the
 * boundary in the meantime (a provider settling, the animation engine loading)
 * makes React give up on the server markup and render the boundary again
 * (error #421). On a slow connection that is every load: the prerendered page
 * blanks to the fallback and comes back.
 *
 * After preload() resolves, the component renders the real one directly, so
 * main.tsx can await it and hydrate a tree that has nothing left to wait for.
 */
export function lazyWithPreload(loader: Loader): PreloadableComponent {
  // Rendering recovers from a chunk a deploy deleted; preload() below still
  // rejects, because main.tsx falls back to hydrating without the route.
  const Lazy = lazy(() => importOrReload(loader))
  let Loaded: ComponentType | null = null

  function Preloadable() {
    const Component = Loaded ?? Lazy
    return <Component />
  }

  Preloadable.preload = async (): Promise<void> => {
    const module = await loader()
    Loaded = module.default
  }

  return Preloadable
}
