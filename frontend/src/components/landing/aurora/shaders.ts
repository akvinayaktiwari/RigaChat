/**
 * The hero's "lattice" background, as a pair of GLSL sources.
 *
 * A procedural grid revealed by a drifting noise field, with a slow pulse
 * crossing it left to right. Everything is authored in the product tokens --
 * #FAF5FF ground, #DDD6FE/#A78BFA/#7C3AED ramp, #0891B2 as the second light --
 * so the canvas cannot introduce a colour the design system does not already
 * have.
 *
 * The tuning constants live here rather than as uniforms: there is exactly one
 * caller, and a uniform the app never varies is just a slower constant.
 */

/** Covers clip space with a single oversized triangle -- no index buffer, no quad seam. */
export const VERTEX_SOURCE = `
attribute vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`

export const FRAGMENT_SOURCE = `
precision mediump float;

uniform vec2 u_resolution;
uniform float u_time;

// Product tokens, normalised to 0..1.
const vec3 C_GROUND = vec3(0.980, 0.961, 1.000); // #FAF5FF
const vec3 C_LOW    = vec3(0.867, 0.839, 0.996); // #DDD6FE
const vec3 C_MID    = vec3(0.655, 0.545, 0.980); // #A78BFA
const vec3 C_HIGH   = vec3(0.486, 0.227, 0.929); // #7C3AED
const vec3 C_CYAN   = vec3(0.033, 0.569, 0.698); // #0891B2

// Peak opacity of the whole layer. Tuned down from the 0.55 the review bench
// defaulted to: lattice carries more high-frequency detail than the other
// candidates, and the same alpha reads as busier.
const float INTENSITY = 0.46;

// How much cyan is allowed into the top of the ramp. It is a second light, not
// a co-primary -- above ~0.45 the hero stops reading as violet.
const float CYAN_MIX = 0.32;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

// Three octaves, not four. The fourth lands at a frequency finer than the grid
// lines drawn over it, so it cost 25% of the noise budget to be invisible.
float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 3; i++) {
    value += amplitude * noise(p);
    p *= 2.03;
    amplitude *= 0.5;
  }
  return value;
}

vec3 ramp(float s) {
  s = clamp(s, 0.0, 1.0);
  vec3 c = mix(C_GROUND, C_LOW, smoothstep(0.0, 0.45, s));
  c = mix(c, C_MID, smoothstep(0.45, 0.80, s));
  c = mix(c, C_HIGH, smoothstep(0.80, 1.0, s));
  c = mix(c, C_CYAN, smoothstep(0.84, 1.0, s) * CYAN_MIX);
  return c;
}

/**
 * Keeps the field out of the headline. The left ramp is deliberately wider than
 * the other candidates needed: the lattice's grid lines are the one element
 * that can still read through body copy at low alpha.
 */
float falloff(vec2 uv) {
  float left = smoothstep(0.10, 0.62, uv.x);
  float low = smoothstep(0.00, 0.30, uv.y);
  float high = 1.0 - smoothstep(0.88, 1.02, uv.y);
  return left * low * high;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;

  // Cheapest test first: where the layer is fully transparent -- the headline
  // column and the bottom third, ~40% of the hero -- there is no reason to
  // evaluate nine noise lookups and throw the result away.
  float visibility = falloff(uv);
  if (visibility <= 0.002) {
    gl_FragColor = vec4(0.0);
    return;
  }

  vec2 p = uv * vec2(u_resolution.x / max(u_resolution.y, 1.0), 1.0);

  float n = fbm(p * 2.0 + u_time * 0.022);

  vec2 cell = abs(fract((p + vec2(0.0, u_time * 0.010)) * 15.0) - 0.5);
  float line = smoothstep(0.055, 0.0, min(cell.x, cell.y));

  float pulse = smoothstep(0.35, 0.95, fract(p.x * 0.55 - u_time * 0.055));

  float s = smoothstep(0.20, 0.90, n * 0.52 + line * (0.30 + pulse * 0.55));
  float alpha = clamp(s, 0.0, 1.0) * visibility * INTENSITY;

  gl_FragColor = vec4(ramp(s), alpha);
}
`
