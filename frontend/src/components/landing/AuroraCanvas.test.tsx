import { StrictMode } from 'react'
import { render, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AuroraCanvas from './AuroraCanvas'
import { setReducedMotion } from '../../test-setup'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  setReducedMotion(false)
})

describe('AuroraCanvas', () => {
  // jsdom has no WebGL, so the shader itself cannot be exercised here. What can
  // be -- and what actually breaks in production -- is the guard ladder around
  // it: whether a frame is ever requested, and whether the GL context is handed
  // back on unmount.
  it('never requests a frame under prefers-reduced-motion', () => {
    setReducedMotion(true)
    const raf = vi.spyOn(globalThis, 'requestAnimationFrame')

    render(<AuroraCanvas />)

    expect(raf).not.toHaveBeenCalled()
  })

  it('renders no canvas at all under prefers-reduced-motion', () => {
    setReducedMotion(true)

    const { container } = render(<AuroraCanvas />)

    // Not merely paused: a canvas that exists still holds a GL context and a
    // compositor layer for a user who asked for less.
    expect(container.querySelector('canvas')).toBeNull()
    expect(container.querySelector('.aurora-ground')).not.toBeNull()
  })

  it('keeps the fallback ground painted when WebGL is unavailable', () => {
    // jsdom's getContext returns null for 'webgl', which is exactly the
    // no-WebGL production path.
    const { container } = render(<AuroraCanvas />)

    expect(container.querySelector('.aurora-ground')).not.toBeNull()
  })

  function stubWebGL(): { loseContext: ReturnType<typeof vi.fn>; contexts: HTMLCanvasElement[] } {
    const loseContext = vi.fn()
    const contexts: HTMLCanvasElement[] = []
    const gl = {
      createShader: vi.fn(() => ({})),
      shaderSource: vi.fn(),
      compileShader: vi.fn(),
      getShaderParameter: vi.fn(() => true),
      deleteShader: vi.fn(),
      createProgram: vi.fn(() => ({})),
      attachShader: vi.fn(),
      linkProgram: vi.fn(),
      getProgramParameter: vi.fn(() => true),
      deleteProgram: vi.fn(),
      createBuffer: vi.fn(() => ({})),
      bindBuffer: vi.fn(),
      bufferData: vi.fn(),
      getAttribLocation: vi.fn(() => 0),
      getUniformLocation: vi.fn(() => ({})),
      useProgram: vi.fn(),
      enableVertexAttribArray: vi.fn(),
      vertexAttribPointer: vi.fn(),
      enable: vi.fn(),
      blendFunc: vi.fn(),
      clearColor: vi.fn(),
      viewport: vi.fn(),
      uniform1f: vi.fn(),
      uniform2f: vi.fn(),
      clear: vi.fn(),
      drawArrays: vi.fn(),
      deleteBuffer: vi.fn(),
      getExtension: vi.fn(() => ({ loseContext })),
      VERTEX_SHADER: 0,
      FRAGMENT_SHADER: 1,
      COMPILE_STATUS: 2,
      LINK_STATUS: 3,
      ARRAY_BUFFER: 4,
      STATIC_DRAW: 5,
      FLOAT: 6,
      BLEND: 7,
      SRC_ALPHA: 8,
      ONE_MINUS_SRC_ALPHA: 9,
      COLOR_BUFFER_BIT: 10,
      TRIANGLES: 11,
    }
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
      this: HTMLCanvasElement,
    ) {
      contexts.push(this)
      return gl as unknown as WebGLRenderingContext
    })
    return { loseContext, contexts }
  }

  it('releases the WebGL context and its listeners on unmount', () => {
    const { loseContext } = stubWebGL()
    const removeListener = vi.spyOn(document, 'removeEventListener')

    const { unmount } = render(<AuroraCanvas />)
    unmount()

    // The one everyone forgets. Browsers cap live contexts at roughly 8-16, so
    // without this a dozen client-side navigations exhaust the pool and the
    // hero silently stops rendering with no error anywhere.
    expect(loseContext).toHaveBeenCalled()
    expect(removeListener).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
  })

  // The regression this file exists for. The canvas used to live in the JSX
  // behind a ref, so React handed the same DOM node to every run of the effect.
  // dispose() ends in loseContext(), which kills that element's context for
  // good -- so the second run got a dead context, drew nothing, and the hero
  // background never came back. Visible in dev via StrictMode's double-invoke,
  // but it fired in production too: `allowed` flips on any resize across 768px
  // or when the motion preference changes.
  //
  // Asserting "a canvas is present" would NOT catch it -- the dead canvas is
  // still in the DOM. Only "no canvas is ever asked for a context twice" does.
  it('never reuses a canvas whose context has been released', () => {
    const { contexts } = stubWebGL()

    render(
      <StrictMode>
        <AuroraCanvas />
      </StrictMode>,
    )

    expect(contexts.length).toBeGreaterThan(1)
    expect(new Set(contexts).size).toBe(contexts.length)
  })
})
