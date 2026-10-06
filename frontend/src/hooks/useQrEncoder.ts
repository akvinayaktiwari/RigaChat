import { useEffect, useState } from 'react'
import type { QrErrorLevel } from '../lib/qr-code'

export type QrEncoder = (text: string, errorLevel: QrErrorLevel) => boolean[][]

/**
 * Loads the encoder after the page is on screen. It is the only part of a QR
 * tool with a library behind it, and this keeps it out of every other page.
 */
export function useQrEncoder(): { encode: QrEncoder | null; failed: boolean } {
  const [encode, setEncode] = useState<QrEncoder | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let active = true
    import('../lib/qr-encode')
      .then((module) => {
        if (active) setEncode(() => module.qrModules)
      })
      .catch((error: unknown) => {
        console.error('The QR code encoder did not load.', error)
        if (active) setFailed(true)
      })
    return () => {
      active = false
    }
  }, [])

  return { encode, failed }
}
