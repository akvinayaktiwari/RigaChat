import { encode } from 'uqr'
import type { QrErrorLevel } from './qr-code'

/**
 * Text to a QR code's grid: one row per array, true for a dark square.
 *
 * The only module that imports the encoder, and the page loads it on demand,
 * which keeps the library out of the bundle every other page ships. The level
 * asked for is the level used: the encoder is told not to raise it, so the
 * setting on the page means what it says.
 */
export function qrModules(text: string, errorLevel: QrErrorLevel): boolean[][] {
  return encode(text, { ecc: errorLevel, border: 0, boostEcc: false }).data
}
