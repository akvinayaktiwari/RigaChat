import type { DocMeta } from '../../../../types/docs'

const meta: DocMeta = {
  slug: 'build-with-ai-assistants',
  title: 'Build an integration with Claude, ChatGPT or Cursor',
  metaTitle: 'Integrate a Chatbot API Using Claude, ChatGPT or Cursor',
  description: 'A ready-to-paste brief that gives Claude, ChatGPT, Cursor or any AI coding assistant what it needs to write a working Vyostra AI integration.',
  lead: 'To have Claude, ChatGPT, Cursor or another AI coding assistant write a Vyostra AI integration for you, paste the brief on this page into the conversation first. It states the endpoints, the authentication header, the response shapes and the limits of the Vyostra AI API, so the assistant writes working code instead of guessing.',
  section: 'Guides',
  order: 3,
  publishedAt: '2026-10-05',
  authorId: 'vinayak-tiwari',
  faq: [
    {
      question: 'Can Claude or ChatGPT add the Vyostra AI chatbot to my website?',
      answer: 'Yes. Adding the Vyostra AI chatbot is one script tag with your bot id, so an AI assistant that can edit your site files can place it for you. Give it the tag from your dashboard and ask it to add the tag before the closing body tag of your shared layout.',
    },
    {
      question: 'Is there a Vyostra AI MCP server or SDK for AI agents?',
      answer: 'Not yet. There is no official Vyostra AI SDK and no public MCP server today. An AI assistant works with the API the same way a developer does: by sending HTTPS requests with an API key, using the brief on this page as its reference.',
    },
    {
      question: 'Is it safe to give an AI assistant my Vyostra AI API key?',
      answer: 'Do not paste a Vyostra AI API key into the chat. Keep it in an environment variable and let the assistant write code that reads it from there. If the assistant runs commands on your machine, create a separate key with only the scopes the task needs and revoke it when the work is done.',
    },
  ],
}

export default meta
