import { FRAGMENT_SOURCE, VERTEX_SOURCE } from './shaders'

/**
 * Minimal WebGL wrapper for one fullscreen fragment shader.
 *
 * Deliberately not three.js or ogl: both exist to manage scene graphs, cameras
 * and geometry, and this draws a single triangle. The whole setup is below,
 * against ~150KB gzip for three.js on the page where LCP converts.
 */
export interface LatticeRenderer {
  /**
   * Tells the shader which hero layout it is painting behind, and picks the
   * render budget to match. Call before resize(): it changes the scale the
   * drawing buffer is sized at.
   */
  setStacked: (stacked: boolean) => void
  /** Matches the drawing buffer to the element's CSS size. Cheap when unchanged. */
  resize: () => void
  draw: (timeSeconds: number) => void
  /** Frees the GL objects AND the context itself. Must run on unmount. */
  dispose: () => void
}

interface Uniforms {
  resolution: WebGLUniformLocation | null
  time: WebGLUniformLocation | null
  stacked: WebGLUniformLocation | null
}

/** Browsers cap live contexts at roughly 8-16, so oversampling costs real memory. */
const MAX_PIXEL_RATIO = 1.5

/**
 * Render below CSS size and let the browser scale the canvas up. The field is
 * low-frequency and the grid lines are already smoothstep-feathered, so the
 * upscale is invisible -- while 0.75 on each axis is 44% fewer fragments to
 * shade every frame. This is the single largest lever on GPU cost here.
 */
const RESOLUTION_SCALE = 0.75

/**
 * Phones render at half. They are the devices least able to spend the GPU time
 * and the ones where the field occupies the least screen -- a corner glow, not
 * a full backdrop -- so the upscale has even less to give away than on desktop.
 */
const STACKED_RESOLUTION_SCALE = 0.5

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type)
  if (!shader) return null

  gl.shaderSource(shader, source)
  gl.compileShader(shader)

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader)
    return null
  }
  return shader
}

function link(
  gl: WebGLRenderingContext,
  vertex: WebGLShader,
  fragment: WebGLShader,
): WebGLProgram | null {
  const program = gl.createProgram()
  if (!program) return null

  gl.attachShader(program, vertex)
  gl.attachShader(program, fragment)
  gl.linkProgram(program)

  // The shaders are owned by the program once linked; dropping our references
  // here is what lets the driver reclaim them.
  gl.deleteShader(vertex)
  gl.deleteShader(fragment)

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program)
    return null
  }
  return program
}

/**
 * `alpha: true` with no clear colour is what lets the canvas composite over the
 * CSS gradient painted behind it, rather than replacing it. That gradient is
 * also the no-WebGL fallback, so the two paths are the same pixels and the
 * fade-in cannot flash.
 *
 * Returns null on every failure -- no context, a driver that rejects the
 * shader, a lost program. The caller's job is to leave the fallback showing,
 * not to report an error nobody can act on.
 */
export function createLatticeRenderer(canvas: HTMLCanvasElement): LatticeRenderer | null {
  const gl = canvas.getContext('webgl', {
    alpha: true,
    premultipliedAlpha: false,
    antialias: false,
    depth: false,
    stencil: false,
  })
  if (!gl) return null

  const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX_SOURCE)
  const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SOURCE)
  if (!vertex || !fragment) return null

  const program = link(gl, vertex, fragment)
  if (!program) return null

  const buffer = gl.createBuffer()
  if (!buffer) return null

  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)

  const position = gl.getAttribLocation(program, 'a_position')
  const uniforms: Uniforms = {
    resolution: gl.getUniformLocation(program, 'u_resolution'),
    time: gl.getUniformLocation(program, 'u_time'),
    stacked: gl.getUniformLocation(program, 'u_stacked'),
  }

  let stacked = false

  gl.useProgram(program)
  gl.enableVertexAttribArray(position)
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)
  gl.enable(gl.BLEND)
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
  // Persistent GL state -- set once, never per frame.
  gl.clearColor(0, 0, 0, 0)

  return {
    setStacked: (next: boolean) => {
      stacked = next
      gl.uniform1f(uniforms.stacked, next ? 1 : 0)
    },

    resize: () => {
      const scale = stacked ? STACKED_RESOLUTION_SCALE : RESOLUTION_SCALE
      const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO) * scale
      const width = Math.max(1, Math.round(canvas.clientWidth * ratio))
      const height = Math.max(1, Math.round(canvas.clientHeight * ratio))
      if (canvas.width === width && canvas.height === height) return

      canvas.width = width
      canvas.height = height
      gl.viewport(0, 0, width, height)
      // Resolution only changes on resize, so it is uploaded here rather than
      // re-sent on all 30 frames a second.
      gl.uniform2f(uniforms.resolution, width, height)
    },

    // One uniform upload, one clear, one draw call. Program, buffer, attribute,
    // blend mode and clear colour are all bound once at creation and never
    // disturbed, so there is nothing to re-bind per frame.
    //
    // The clear is NOT optional: blending composites against what is already in
    // the buffer, so skipping it accumulates every frame into an opaque slab.
    draw: (timeSeconds: number) => {
      gl.uniform1f(uniforms.time, timeSeconds)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    },

    dispose: () => {
      gl.deleteBuffer(buffer)
      gl.deleteProgram(program)
      // Without this the context survives the component. The landing page
      // mounts and unmounts on client-side nav, so a dozen round trips would
      // exhaust the browser's context pool and the hero would silently stop
      // rendering -- with no error anywhere.
      gl.getExtension('WEBGL_lose_context')?.loseContext()
    },
  }
}
