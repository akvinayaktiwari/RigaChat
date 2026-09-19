/**
 * One self-contained definition of the product, high on the homepage.
 *
 * This is the passage an answer engine should lift when asked "what is
 * Vyostra AI", so it is written to stand alone: it opens with "Vyostra AI is",
 * names every channel, and carries the price floor. Answer engines cite
 * passages of roughly 134-167 words most often; the test holds it there.
 *
 * Every sentence has to be true of the shipped product. No figures that are
 * not on the pricing page, no customer counts, no performance claims.
 *
 * Plain markup with no motion wrapper: the homepage is prerendered, and an
 * entrance animation would ship this at opacity 0 to crawlers that never run JS.
 */
export const WHAT_IS_VYOSTRA: readonly string[] = [
  'Vyostra AI is a lead-capture platform for businesses that sell through enquiries. You train an AI agent on your website and your own knowledge base, and it answers visitors on website chat, voice and WhatsApp at any hour.',
  "When a conversation turns into interest, the agent collects the lead's details and writes them into a built-in lead CRM, so every enquiry lands in one queue with its transcript. Leads from lead forms and Meta lead ads arrive in the same place.",
  'Follow-up journeys then keep the conversation going on WhatsApp, waiting for a real reply rather than firing on a timer, and hand the lead to your team when it needs a person. The agent answers only from the content you give it; when the answer is not there, it says so.',
  'Plans start at $49 a month. Vyostra AI is built in Bangalore, India.',
]

export default function WhatIsVyostra() {
  return (
    <section id="what-is-vyostra" className="py-20 px-4">
      <div className="max-w-3xl mx-auto">
        <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight mb-6">What is Vyostra AI?</h2>
        {WHAT_IS_VYOSTRA.map((paragraph) => (
          <p key={paragraph.slice(0, 24)} className="text-lg text-gray-600 leading-relaxed mb-4">
            {paragraph}
          </p>
        ))}
      </div>
    </section>
  )
}
