import type { ReactNode } from 'react'
import { PANEL_HEADING, STEP_CHIP } from './tool-styles'

interface ToolCardProps {
  inputTitle: string
  outputTitle: string
  input: ReactNode
  /** Announced as it changes, so a screen reader hears the result without leaving the field. */
  output: ReactNode
}

/** The two-step card every free tool is built in: what you type on the left, what you get on the right. */
export default function ToolCard({ inputTitle, outputTitle, input, output }: ToolCardProps) {
  return (
    <div className="relative grid grid-cols-1 overflow-hidden rounded-3xl border border-outline-variant/40 bg-white shadow-xl shadow-primary/5 md:grid-cols-2">
      <span className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary to-primary-container" aria-hidden="true" />
      <div className="p-6 pt-8 md:p-8 md:pt-10">
        <h3 className={PANEL_HEADING}>
          <span className={STEP_CHIP} aria-hidden="true">1</span>
          {inputTitle}
        </h3>
        {input}
      </div>
      <div className="flex flex-col border-t border-outline-variant/40 bg-surface-container-low p-6 md:border-l md:border-t-0 md:p-8 md:pt-10">
        <h3 className={PANEL_HEADING}>
          <span className={STEP_CHIP} aria-hidden="true">2</span>
          {outputTitle}
        </h3>
        <div aria-live="polite" className="flex flex-1 flex-col">
          {output}
        </div>
      </div>
    </div>
  )
}
