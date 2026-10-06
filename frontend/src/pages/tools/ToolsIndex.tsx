import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import MarketingPageShell from '../../components/landing/MarketingPageShell'
import PageMeta from '../../components/seo/PageMeta'
import StructuredData from '../../components/seo/StructuredData'
import { PROSE, SECTION_HEADING } from '../../components/tools/tool-styles'
import { FREE_TOOLS, servedPath, type FreeTool } from '../../lib/free-tools'
import { jsonLdGraph, organizationSchema, toolsIndexNodes } from '../../lib/structured-data'

function ToolCardLink({ tool }: { tool: FreeTool }) {
  return (
    <Link
      to={tool.route}
      className="group flex flex-col rounded-2xl border border-outline-variant/30 bg-white p-6 shadow-xs transition-all hover:border-primary/40 hover:shadow-md"
    >
      <h3 className="mb-2 text-lg font-bold text-on-surface">{tool.name}</h3>
      <p className="mb-5 flex-1 text-sm leading-relaxed text-on-surface-variant md:text-base">{tool.summary}</p>
      <span className="inline-flex items-center gap-2 text-sm font-bold text-primary">
        {tool.action}
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
      </span>
    </Link>
  )
}

export default function ToolsIndex() {
  return (
    <>
      <PageMeta
        title="Free WhatsApp and Real Estate Tools — Vyostra AI"
        description="Free tools from Vyostra AI: WhatsApp QR codes, text formatting, links and a commission calculator. No sign-up, and nothing you type leaves your browser."
        path="/tools/"
      />
      <StructuredData
        data={jsonLdGraph([organizationSchema(), ...toolsIndexNodes(FREE_TOOLS.map((tool) => ({ name: tool.name, path: servedPath(tool.route) })))])}
      />
      <MarketingPageShell
        badge="FREE TOOLS"
        headline="Free WhatsApp and real estate tools"
        lead="Vyostra AI's free tools help a business get more out of WhatsApp: make a QR code that opens a chat with your number, format a message with bold text and lists, build a click-to-chat link with a pre-filled message, or work out an agent's commission on a sale. Every tool is free, needs no sign-up, and runs entirely in your browser."
      >
        <section className="mx-auto mb-20 max-w-5xl">
          <h2 className={SECTION_HEADING}>Which tool do you need?</h2>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {FREE_TOOLS.map((tool) => (
              <ToolCardLink key={tool.route} tool={tool} />
            ))}
          </div>
        </section>
        <section className="mx-auto max-w-3xl">
          <h2 className={SECTION_HEADING}>What happens to what you type?</h2>
          <div className={PROSE}>
            <p>
              Nothing leaves your browser. Each tool does its work on your own device, so the numbers and messages you type are never sent to Vyostra AI
              and are gone when you close the page. No account is needed, and there is no limit on how often you use a tool.
            </p>
            <p>
              The tools are made by the team behind Vyostra AI, which builds AI chat, voice and WhatsApp agents with a built-in lead CRM. See{' '}
              <Link to="/features" className="font-semibold text-primary hover:underline">what the product does</Link>.
            </p>
          </div>
        </section>
      </MarketingPageShell>
    </>
  )
}
