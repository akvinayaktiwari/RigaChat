import type { BlogPostMeta } from '../../../../types/blog'

const meta: BlogPostMeta = {
  slug: 'facebook-lead-ads-whatsapp-auto-reply',
  title: 'How to Auto-Reply on WhatsApp to Facebook Lead Ads',
  excerpt:
    'A Facebook or Instagram lead form does not open a WhatsApp chat, so the first message has to be sent by you, as an approved template, to someone who opted in. Here is the whole chain: opt-in on the form, the lead webhook, the first template, and what changes when the lead replies.',
  publishedAt: '2026-10-05',
  authorId: 'vinayak-tiwari',
  category: 'WhatsApp',
  market: 'global',
  tags: ['WhatsApp', 'Meta Lead Ads', 'Lead Generation'],
  readingMinutes: 8,
  seoTitle: 'WhatsApp Auto-Reply to Facebook Lead Ads',
  seoDescription:
    'How to send an automatic WhatsApp message to every Facebook and Instagram lead ad: opt-in, the lead webhook, approved templates and the 24-hour window.',
  relatedFeatures: ['/features/whatsapp', '/features/crm'],
  faq: [
    {
      question: 'Can I send a WhatsApp message automatically to a Facebook lead ad submission?',
      answer:
        'Yes, if three things are in place: the person opted in to hear from your business, your software receives the lead the moment it is submitted through Meta’s lead webhook, and the first message is a WhatsApp template Meta has approved. The template is required because the lead filled in a form rather than messaging you, so no 24-hour customer service window is open yet.',
    },
    {
      question: 'Why can’t the first WhatsApp message to a lead be a normal message?',
      answer:
        'WhatsApp only allows free-form business messages within 24 hours of the customer’s last message to you. A person who submitted a lead form has not messaged you on WhatsApp at all, so the only message you can start the conversation with is a pre-approved template. Once they reply, the 24-hour window opens and normal messages are allowed.',
    },
    {
      question: 'Does a lead form count as WhatsApp opt-in?',
      answer:
        'It can. Meta’s opt-in policy requires that the person is clearly told they are opting in to receive messages and the name of the business sending them, and it allows opt-in to be collected on a website or form rather than inside WhatsApp. A lead form that says so plainly, for example in a custom disclaimer, meets that. A form that only asks for a phone number does not.',
    },
    {
      question: 'How fast can the WhatsApp message go out after the form is submitted?',
      answer:
        'As fast as your software reacts. Meta sends a webhook notification for each new lead as it is created, with a lead ID your system uses to fetch the answers through the Graph API. Software subscribed to that webhook can send the template within seconds. Downloading leads as a CSV from Meta Business Suite means the message waits until someone exports the file.',
    },
    {
      question: 'Should I use click-to-WhatsApp ads instead of lead form ads?',
      answer:
        'They solve different problems. A click-to-WhatsApp ad opens a chat the person starts themselves, so the conversation and the 24-hour window are open from the first message. A lead form ad captures structured answers and a phone number, but you have to start the WhatsApp conversation with a template. Many advertisers run both.',
    },
  ],
}

export default meta
