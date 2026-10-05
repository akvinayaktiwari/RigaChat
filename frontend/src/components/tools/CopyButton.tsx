import { useState } from 'react'
import { Check, Copy } from 'lucide-react'

interface CopyButtonProps {
  text: string
  label: string
  /** Called after a successful copy. Report the copy here; never pass the text on. */
  onCopied?: () => void
}

export default function CopyButton({ text, label, onCopied }: CopyButtonProps) {
  const [copied, setCopied] = useState(false)

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      onCopied?.()
    } catch (error: unknown) {
      console.error('Could not copy to the clipboard; select the text and copy it by hand.', error)
    }
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-white shadow-sm transition-[background-color,scale] duration-200 active:scale-95 cursor-pointer ${
        copied ? 'bg-success' : 'bg-primary hover:bg-primary-hover'
      }`}
    >
      {copied ? <Check className="w-4 h-4" aria-hidden="true" /> : <Copy className="w-4 h-4" aria-hidden="true" />}
      {copied ? 'Copied' : label}
    </button>
  )
}
