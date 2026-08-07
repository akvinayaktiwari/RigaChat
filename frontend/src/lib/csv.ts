import { OUTCOME_LABELS, SOURCE_LABELS, STATUS_LABELS } from './lead-display'
import type { Lead, UnifiedLead } from '../types/index'

// Leading =, +, -, or @ makes some spreadsheet apps (Excel, Sheets) treat a
// cell as a formula. lead.name/email/phone come from the public,
// unauthenticated chat widget with no format validation, so a submitted
// lead could carry a formula payload that executes when staff open the
// exported file. A leading apostrophe forces the cell to plain text and is
// stripped from the visible value by every major spreadsheet app.
function neutralizeFormula(value: string): string {
  return /^[=+\-@]/.test(value) ? `'${value}` : value
}

function csvEscape(value: string): string {
  const safe = neutralizeFormula(value)
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

/** Builds a CSV string from headers + row cells, escaping each cell. */
export function buildCsv(headers: string[], rows: string[][]): string {
  const escapedRows = rows.map((row) => row.map(csvEscape).join(','))
  return [headers.join(','), ...escapedRows].join('\n')
}

/** Triggers a browser download of `content` as a file named `filename`. */
export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

const LEADS_CSV_HEADERS = ['Name', 'Email', 'Phone', 'Bot', 'Date', 'Status']

/**
 * Shared row shape for lead CSV exports (DashboardHome's "export all" quick
 * action and LeadsPage's "export filtered" button both use this). Status is
 * always "New" — real per-lead status tracking doesn't exist in the data
 * model yet, so every captured lead is honestly reported as "New" rather
 * than showing a status that isn't real.
 */
function buildLeadsCsvRows(leads: Lead[], getBotName: (botId: string) => string): string[][] {
  return leads.map((lead) => [
    lead.name ?? '',
    lead.email ?? '',
    lead.phone ?? '',
    getBotName(lead.botId),
    new Date(lead.createdAt).toLocaleDateString(),
    'New',
  ])
}

/** Builds and downloads a leads CSV in the shared Name/Email/Phone/Bot/Date/Status shape. */
export function exportLeadsCsv(filename: string, leads: Lead[], getBotName: (botId: string) => string): void {
  downloadCsv(filename, buildCsv(LEADS_CSV_HEADERS, buildLeadsCsvRows(leads, getBotName)))
}

const INBOX_CSV_HEADERS = ['Name', 'Email', 'Phone', 'Source', 'Captured', 'Status', 'Outcome', 'Next action']

// Unlike buildLeadsCsvRows above, Status here is real: it comes from the
// lead_state row rather than being hardcoded to "New". A lead with no state
// row has genuinely never been touched, so it still reports as New.
function buildInboxCsvRows(leads: UnifiedLead[]): string[][] {
  return leads.map((lead) => [
    lead.name ?? '',
    lead.email ?? '',
    lead.phone ?? '',
    SOURCE_LABELS[lead.source],
    new Date(lead.createdAt).toLocaleDateString(),
    STATUS_LABELS[lead.state?.status ?? 'new'],
    lead.state?.outcome ? OUTCOME_LABELS[lead.state.outcome] : '',
    lead.state?.nextActionAt ? new Date(lead.state.nextActionAt).toLocaleDateString() : '',
  ])
}

/** Builds and downloads a CSV of the unified inbox, in whatever order it was given. */
export function exportInboxCsv(filename: string, leads: UnifiedLead[]): void {
  downloadCsv(filename, buildCsv(INBOX_CSV_HEADERS, buildInboxCsvRows(leads)))
}
