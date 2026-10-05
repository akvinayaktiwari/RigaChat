/**
 * Lays out and draws a QR code for the free WhatsApp QR code generator.
 *
 * Everything here is pure and has no dependency: it takes the grid of dark and
 * light squares that lib/qr-encode.ts produces and turns it into a drawing. The
 * split is deliberate. The encoder is the only part with a library behind it,
 * and the page loads it on demand, so the options below can render in the form
 * before a single byte of it has arrived.
 */

export type QrErrorLevel = 'L' | 'M' | 'Q' | 'H'

export interface QrErrorLevelOption {
  level: QrErrorLevel
  label: string
  /** When to pick it, in plain words. */
  note: string
}

/**
 * The four levels of the QR Code standard, lowest to highest. A higher level
 * survives more dirt and damage and makes a denser code.
 *
 * Source: DENSO WAVE (the inventor of the QR Code), "Error Correction Feature",
 * https://www.qrcode.com/en/about/error_correction.html, checked 2026-10-06. That
 * page gives the restoration rate in text for M (15%) and Q (25%) only, so those
 * are the only two figures quoted here.
 */
export const QR_ERROR_LEVELS: readonly QrErrorLevelOption[] = [
  { level: 'L', label: 'Low', note: 'The simplest code. For screens and clean, flat prints.' },
  { level: 'M', label: 'Medium', note: 'Restores about 15% of the code. The usual choice.' },
  { level: 'Q', label: 'High', note: 'Restores about 25% of the code. For prints that get handled or dirty.' },
  { level: 'H', label: 'Highest', note: 'The most forgiving and the densest code.' },
]
export const QR_ERROR_LEVEL_SOURCE = 'https://www.qrcode.com/en/about/error_correction.html'
export const DEFAULT_QR_ERROR_LEVEL: QrErrorLevel = 'M'

/** Download widths, in pixels. The largest is for print. */
export const QR_SIZES: readonly number[] = [256, 512, 1024, 2048]
export const DEFAULT_QR_SIZE = 1024

/** The blank border around the code, in squares of the code itself. */
export const QR_MARGINS: readonly number[] = [1, 2, 4, 6]
export const DEFAULT_QR_MARGIN = 4

export const DEFAULT_QR_FOREGROUND = '#000000'
export const DEFAULT_QR_BACKGROUND = '#ffffff'

/** The optional line under the code. Never drawn inside it. */
export const QR_CREDIT_TEXT = 'Made with vyostra.com'

/**
 * Below this contrast the page warns that a code may not scan. It is this
 * tool's own caution line, not a figure from the QR Code standard, and the
 * warning says to test the code rather than claiming it will fail.
 */
const CAUTION_CONTRAST_RATIO = 4

export interface QrStyle {
  margin: number
  foreground: string
  background: string
  credit: boolean
}

/** A horizontal run of dark squares, in squares, measured from the code's own top-left corner. */
export interface QrRun {
  x: number
  y: number
  length: number
}

export interface QrCredit {
  text: string
  /** Centre of the line. */
  x: number
  /** Text baseline. */
  y: number
  fontSize: number
}

/** A finished drawing, in squares: multiply by a scale to get pixels. */
export interface QrLayout {
  width: number
  height: number
  /** How far the code sits in from the top and left edges. */
  offset: number
  runs: QrRun[]
  foreground: string
  background: string
  credit: QrCredit | null
}

export function isHexColour(value: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(value)
}

/** Merges each row's dark squares into runs, so a drawing has hundreds of shapes instead of thousands. */
export function qrRuns(modules: readonly (readonly boolean[])[]): QrRun[] {
  const runs: QrRun[] = []
  modules.forEach((row, y) => {
    let start = -1
    for (let x = 0; x <= row.length; x++) {
      const dark = x < row.length && row[x]
      if (dark && start < 0) start = x
      if (!dark && start >= 0) {
        runs.push({ x: start, y, length: x - start })
        start = -1
      }
    }
  })
  return runs
}

function creditFor(width: number, codeBottom: number): { credit: QrCredit; height: number } {
  const fontSize = width * 0.045
  const baseline = codeBottom + fontSize * 1.1
  return {
    credit: { text: QR_CREDIT_TEXT, x: width / 2, y: baseline, fontSize },
    height: baseline + fontSize * 0.9,
  }
}

/**
 * Where everything goes. The credit line sits in its own band below the blank
 * border, so it can never touch the code or eat into the border a scanner
 * needs.
 */
export function qrLayout(modules: readonly (readonly boolean[])[], style: QrStyle): QrLayout {
  const width = modules.length + style.margin * 2
  const base = { width, offset: style.margin, runs: qrRuns(modules), foreground: style.foreground, background: style.background }
  if (!style.credit) return { ...base, height: width, credit: null }
  const { credit, height } = creditFor(width, width)
  return { ...base, height, credit }
}

function round(value: number): string {
  return String(Math.round(value * 1000) / 1000)
}

/** The same drawing as an SVG file. `size` is the width in pixels; an SVG scales to any size without blurring. */
export function qrSvgMarkup(layout: QrLayout, size: number): string {
  const path = layout.runs.map((run) => `M${run.x + layout.offset} ${run.y + layout.offset}h${run.length}v1h-${run.length}z`).join('')
  const height = round((size * layout.height) / layout.width)
  const credit = layout.credit
    ? `<text x="${round(layout.credit.x)}" y="${round(layout.credit.y)}" font-family="Arial, Helvetica, sans-serif" font-size="${round(layout.credit.fontSize)}" text-anchor="middle" fill="${layout.foreground}">${layout.credit.text}</text>`
    : ''
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${height}" viewBox="0 0 ${round(layout.width)} ${round(layout.height)}" shape-rendering="crispEdges">` +
    `<rect width="100%" height="100%" fill="${layout.background}"/>` +
    `<path fill="${layout.foreground}" d="${path}"/>${credit}</svg>`
  )
}

function channel(value: number): number {
  const scaled = value / 255
  return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4
}

/** Relative luminance as WCAG 2 defines it: 0 for black, 1 for white. */
function luminance(hex: string): number {
  const value = Number.parseInt(hex.slice(1), 16)
  return 0.2126 * channel((value >> 16) & 255) + 0.7152 * channel((value >> 8) & 255) + 0.0722 * channel(value & 255)
}

/** WCAG 2 contrast ratio between two colours, from 1 (identical) to 21 (black on white). */
export function contrastRatio(first: string, second: string): number {
  const [light, dark] = [luminance(first), luminance(second)].sort((a, b) => b - a)
  return (light + 0.05) / (dark + 0.05)
}

export type QrColourProblem = 'invalid' | 'inverted' | 'low_contrast'

/**
 * What is risky about a colour pair, or null when it is a dark code on a light
 * background with clear contrast. A light code on a dark background is called
 * out by name because some scanners do not read inverted codes at all.
 */
export function qrColourProblem(foreground: string, background: string): QrColourProblem | null {
  if (!isHexColour(foreground) || !isHexColour(background)) return 'invalid'
  if (luminance(foreground) > luminance(background)) return 'inverted'
  return contrastRatio(foreground, background) < CAUTION_CONTRAST_RATIO ? 'low_contrast' : null
}

/** A file name that says whose code it is, safe on every operating system. */
export function qrFileName(number: string, extension: 'png' | 'svg'): string {
  return `whatsapp-qr-${number.replace(/\D/g, '')}.${extension}`
}
