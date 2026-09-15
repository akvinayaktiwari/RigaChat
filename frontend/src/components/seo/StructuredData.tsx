import { Helmet } from 'react-helmet-async'
import type { JsonLd } from '../../lib/structured-data'

/**
 * Serialises JSON-LD for a <script> body. "<" is escaped so a value containing
 * "</script>" cannot close the tag early.
 */
export function serializeJsonLd(data: JsonLd): string {
  return JSON.stringify(data).replace(/</g, '\\u003c')
}

export default function StructuredData({ data }: { data: JsonLd }) {
  return (
    <Helmet>
      <script type="application/ld+json">{serializeJsonLd(data)}</script>
    </Helmet>
  )
}
