import { describe, expect, it } from 'vitest'
import {
  DEFAULT_QR_ERROR_LEVEL,
  DEFAULT_QR_MARGIN,
  DEFAULT_QR_SIZE,
  QR_CREDIT_TEXT,
  QR_ERROR_LEVELS,
  QR_MARGINS,
  QR_SIZES,
  contrastRatio,
  isHexColour,
  qrColourProblem,
  qrFileName,
  qrLayout,
  qrRuns,
  qrSvgMarkup,
  type QrStyle,
} from './qr-code'
import { qrModules } from './qr-encode'

const PLAIN: QrStyle = { margin: 4, foreground: '#000000', background: '#ffffff', credit: false }
const LINK = 'https://wa.me/14155550132?text=Hi%20there'

describe('the options the form offers', () => {
  it('defaults to values that are on each list', () => {
    expect(QR_ERROR_LEVELS.map((option) => option.level)).toContain(DEFAULT_QR_ERROR_LEVEL)
    expect(QR_SIZES).toContain(DEFAULT_QR_SIZE)
    expect(QR_MARGINS).toContain(DEFAULT_QR_MARGIN)
  })

  // The source page states a restoration rate in text for M and Q only.
  it('quotes a restoration rate only for the two levels the source states one for', () => {
    const quoted = QR_ERROR_LEVELS.filter((option) => /%/.test(option.note))
    expect(quoted.map((option) => option.level)).toEqual(['M', 'Q'])
    expect(quoted.map((option) => option.note.match(/\d+%/)?.[0])).toEqual(['15%', '25%'])
  })
})

describe('qrModules', () => {
  it('returns a square grid with the three finder corners dark', () => {
    const modules = qrModules(LINK, 'M')
    const size = modules.length
    expect(modules.every((row) => row.length === size)).toBe(true)
    expect([modules[0][0], modules[0][size - 1], modules[size - 1][0]]).toEqual([true, true, true])
  })

  it('makes a denser code at a higher error correction level', () => {
    expect(qrModules(LINK, 'H').length).toBeGreaterThan(qrModules(LINK, 'L').length)
  })

  it('makes a denser code for a longer message', () => {
    expect(qrModules(`${LINK}${'%20more'.repeat(20)}`, 'M').length).toBeGreaterThan(qrModules(LINK, 'M').length)
  })
})

describe('qrRuns', () => {
  it('merges neighbouring dark squares on a row and keeps gaps apart', () => {
    const runs = qrRuns([
      [true, true, false, true],
      [false, false, false, false],
      [false, true, true, true],
    ])
    expect(runs).toEqual([
      { x: 0, y: 0, length: 2 },
      { x: 3, y: 0, length: 1 },
      { x: 1, y: 2, length: 3 },
    ])
  })

  it('accounts for every dark square exactly once', () => {
    const modules = qrModules(LINK, 'Q')
    const dark = modules.flat().filter(Boolean).length
    expect(qrRuns(modules).reduce((sum, run) => sum + run.length, 0)).toBe(dark)
  })
})

describe('qrLayout', () => {
  const modules = qrModules(LINK, 'M')

  it('is a square with the blank border on every side', () => {
    const layout = qrLayout(modules, PLAIN)
    expect(layout.width).toBe(modules.length + 8)
    expect(layout.height).toBe(layout.width)
    expect(layout.offset).toBe(4)
    expect(layout.credit).toBeNull()
  })

  it('puts the credit line below the border, never over the code', () => {
    const layout = qrLayout(modules, { ...PLAIN, credit: true })
    expect(layout.credit?.text).toBe(QR_CREDIT_TEXT)
    expect(layout.height).toBeGreaterThan(layout.width)
    const top = (layout.credit?.y ?? 0) - (layout.credit?.fontSize ?? 0)
    expect(top).toBeGreaterThanOrEqual(layout.width)
  })

  it('leaves the code itself identical with and without the credit line', () => {
    expect(qrLayout(modules, { ...PLAIN, credit: true }).runs).toEqual(qrLayout(modules, PLAIN).runs)
  })
})

describe('qrSvgMarkup', () => {
  const modules = qrModules(LINK, 'M')

  it('draws the chosen colours at the chosen width', () => {
    const svg = qrSvgMarkup(qrLayout(modules, { ...PLAIN, foreground: '#123456', background: '#fefefe' }), 512)
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"')).toBe(true)
    expect(svg).toContain('<rect width="100%" height="100%" fill="#fefefe"/>')
    expect(svg).toContain('<path fill="#123456"')
    expect(svg).not.toContain('<text')
  })

  it('adds the credit line only when asked', () => {
    expect(qrSvgMarkup(qrLayout(modules, { ...PLAIN, credit: true }), 512)).toContain(`>${QR_CREDIT_TEXT}</text>`)
  })
})

describe('colours', () => {
  it('accepts six-digit hex colours only', () => {
    expect(isHexColour('#1a2B3c')).toBe(true)
    expect(['#fff', 'black', '#12345g', '123456'].map(isHexColour)).toEqual([false, false, false, false])
  })

  it('measures black on white as the highest contrast there is', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5)
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 5)
    expect(contrastRatio('#777777', '#777777')).toBeCloseTo(1, 5)
  })

  it('passes a dark code on a light background', () => {
    expect(qrColourProblem('#000000', '#ffffff')).toBeNull()
    expect(qrColourProblem('#075e54', '#ffffff')).toBeNull()
  })

  it('names a light code on a dark background', () => {
    expect(qrColourProblem('#ffffff', '#000000')).toBe('inverted')
  })

  it('names colours that are too close together', () => {
    expect(qrColourProblem('#9ca3af', '#ffffff')).toBe('low_contrast')
  })

  it('names a value that is not a colour', () => {
    expect(qrColourProblem('green', '#ffffff')).toBe('invalid')
  })
})

describe('qrFileName', () => {
  it('names the file after the number, digits only', () => {
    expect(qrFileName('14155550132', 'png')).toBe('whatsapp-qr-14155550132.png')
    expect(qrFileName('+1 (415) 555-0132', 'svg')).toBe('whatsapp-qr-14155550132.svg')
  })
})
