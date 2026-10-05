import type { DocMeta } from '../../../../types/docs'

const meta: DocMeta = {
  slug: 'authentication',
  title: 'API keys and authentication',
  metaTitle: 'API Key Authentication: Keys, Scopes and Rotation',
  description: 'How Vyostra AI API keys work: creating and revoking keys, the Bearer header, the four permission scopes, plan requirements, and how to rotate a key safely.',
  lead: 'The Vyostra AI API authenticates every request with an API key sent in the Authorization header as a Bearer token. Keys are created in the dashboard under Settings, start with vy_live_, carry only the permissions you tick, and can be revoked at any moment. A revoked key is rejected on the very next request.',
  section: 'Get started',
  order: 2,
  publishedAt: '2026-10-05',
  authorId: 'vinayak-tiwari',
  faq: [
    {
      question: 'Can I see a Vyostra AI API key again after creating it?',
      answer: 'No. The full key is displayed once, at the moment it is created. Vyostra AI stores only a SHA-256 hash of it, so nobody, including Vyostra AI staff, can show it to you again. If you lose a key, revoke it and create a new one.',
    },
    {
      question: 'How many API keys can one Vyostra AI account have?',
      answer: 'A Vyostra AI account can hold up to 10 API keys. Use a separate key for each integration, so that revoking one does not break the others and the last-used date tells you which integrations are still running.',
    },
    {
      question: 'What happens to my API keys if I downgrade or cancel?',
      answer: 'The keys are not deleted, but they stop working. Every Vyostra AI API request checks that the account plan includes API access, and a request from an account without it gets a 403 response with the code api_access_disabled. The keys work again once the plan includes API access.',
    },
  ],
}

export default meta
