import type { FaqItem } from '../../lib/structured-data'

/**
 * Questions with their answers printed in full.
 *
 * No accordion on purpose: these pages publish FAQPage schema from the same
 * array, and an answer collapsed out of the prerendered HTML is an answer the
 * schema claims and the page does not show.
 */
export default function FaqList({ items }: { items: readonly FaqItem[] }) {
  return (
    <div className="space-y-4">
      {items.map((item) => (
        <div key={item.question} className="bg-white border border-outline-variant/30 rounded-2xl p-6 shadow-xs">
          <h3 className="font-bold text-on-surface text-base md:text-lg leading-snug">{item.question}</h3>
          <p className="mt-2 text-sm md:text-base text-on-surface-variant leading-relaxed">{item.answer}</p>
        </div>
      ))}
    </div>
  )
}
