import type { DocMeta } from '../../../../types/docs'

const meta: DocMeta = {
  slug: 'errors-and-rate-limits',
  title: 'Errors and rate limits',
  metaTitle: 'API Errors and Rate Limits: Codes and Retry Rules',
  description: 'Every error code the Vyostra AI API returns, what each one means and how to fix it, plus the rate limit of 120 requests per minute per key and how to retry.',
  lead: 'The Vyostra AI API reports a failure with a standard HTTP status and a JSON body holding an error code and a message. Each API key may make 120 requests per minute. A request over that limit gets a 429 response with a Retry-After header saying how many seconds to wait before trying again.',
  section: 'API reference',
  order: 2,
  publishedAt: '2026-10-05',
  authorId: 'vinayak-tiwari',
  faq: [
    {
      question: 'What is the rate limit of the Vyostra AI API?',
      answer: 'Each Vyostra AI API key can make 120 requests per minute, counted in fixed one-minute windows. The limit is per key, not per account or per IP address, so two integrations with their own keys do not slow each other down.',
    },
    {
      question: 'Why does a valid-looking API key return 401?',
      answer: 'From the Vyostra AI API, a 401 with the code invalid_api_key means the key is not recognised: it was mistyped, cut short when copied, or has been revoked. A 401 with the code missing_api_key means the Authorization header was absent or did not start with the word Bearer.',
    },
    {
      question: 'Should I retry a 500 error from the Vyostra AI API?',
      answer: 'Yes, with a pause. A 500 with the code internal_error means the request failed on Vyostra AI servers and was not your fault. All endpoints are read-only, so repeating a request is always safe. Wait a few seconds, double the wait on each attempt, and stop after a handful of tries.',
    },
  ],
}

export default meta
