function csvEscape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
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
