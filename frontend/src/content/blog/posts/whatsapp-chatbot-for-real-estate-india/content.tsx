import { Link } from 'react-router-dom'
import {
  Callout,
  CheckList,
  DataTable,
  Emphasis,
  FactCard,
  JAKARTA_FONT,
  NumberedCard,
  PhaseTimeline,
  Prose,
  PullQuote,
  ScrollReveal,
  Section,
} from '../../../../components/blog/BlogPrimitives'

/**
 * Platform behaviour described here (opt-in, the 24-hour customer service
 * window, template approval, quality rating) is WhatsApp Business Platform
 * policy, not a claim about any product. Pricing is deliberately not quoted:
 * Meta has changed the model more than once, so the post points at the current
 * docs instead of a number that dates badly.
 *
 * No performance figures appear anywhere in this post. Response-time and
 * conversion claims are the easiest thing in this category to invent, and an
 * uncited number is worth less than the paragraph it sits in.
 */
export default function WhatsAppChatbotRealEstateContent() {
  return (
    <>
      <ScrollReveal>
        <Prose>
          <p>
            A WhatsApp chatbot for real estate is an automated agent on a WhatsApp Business number that answers a property enquiry the moment it lands, asks the
            questions a site visit depends on — budget, locality, possession timeline, financing — writes the answers into your CRM, and either books the visit
            or hands the conversation to a human with the context already gathered.
          </p>
          <p className="mt-4">
            That much is easy to say. The reason most of these projects disappoint has nothing to do with the bot&apos;s replies: it is that WhatsApp is a
            permissioned channel with rules that decide what you may send and when, and a flow designed without them works beautifully in a demo and silently
            fails in production. This post is about those rules first, and the conversation design second.
          </p>
        </Prose>
      </ScrollReveal>

      <PullQuote>
        Your competition is not another chatbot. It is the broker who picks up the phone in ninety seconds — and, far more often, the enquiry nobody answered
        until the next morning.
      </PullQuote>

      <Section
        index="01"
        title="Why the enquiry ends up on WhatsApp anyway"
        intro={
          <>
            In India the property enquiry rarely stays where it started. It begins on a portal listing, a Meta ad, or a site&apos;s chat widget, and moves to
            WhatsApp because that is where the buyer already is. Nothing to install, no account to make, and a thread they can scroll back through a week later
            when they are comparing three projects.
          </>
        }
      >
        <div className="grid gap-4 md:grid-cols-3">
          <NumberedCard number="①" title="It is asynchronous">
            A call demands both people at once. A buyer comparing projects at 11pm answers a WhatsApp message; they do not answer a call.
          </NumberedCard>
          <NumberedCard number="②" title="It keeps the record">
            Floor plan, price, the locality you discussed — all still in the thread when the family sits down to decide. Email attachments do not get that.
          </NumberedCard>
          <NumberedCard number="③" title="It survives the handoff">
            The same thread carries from bot to site-visit coordinator to closing agent, without asking the buyer to repeat their budget three times.
          </NumberedCard>
        </div>
      </Section>

      <Section
        index="02"
        title="The four rules that decide your design"
        intro={
          <>
            These are WhatsApp Business Platform rules, not vendor limitations, and no software removes them. Read them as design constraints: every flow further
            down is shaped by these.
          </>
        }
      >
        <div className="grid gap-4 md:grid-cols-2">
          <FactCard label="Rule 1 — Opt-in first">
            A business needs permission before it messages someone, taken where the person can see what they are agreeing to. A lead who messages you first has
            given the cleanest opt-in there is. A purchased list is the fastest way to lose a number.
          </FactCard>
          <FactCard label="Rule 2 — The 24-hour window">
            Free-form replies are allowed only within 24 hours of the customer&apos;s last message. Once that window shuts, the only thing you can send is a
            pre-approved template.
          </FactCard>
          <FactCard label="Rule 3 — Templates are reviewed">
            Templates are submitted to Meta and approved, rejected or paused. They are categorised — marketing, utility, authentication — and the category
            affects both what you may write and what it costs.
          </FactCard>
          <FactCard label="Rule 4 — Quality is scored">
            Blocks and &ldquo;report&rdquo; taps lower your number&apos;s quality rating and can cut your messaging limits. Volume is not the lever people think
            it is; relevance is.
          </FactCard>
        </div>

        <div className="mt-8">
          <DataTable
            headers={['You want to send', 'Inside 24h window', 'Outside the window']}
            rows={[
              ['Answer a question the buyer just asked', 'Free-form message, no approval needed', 'Not possible — re-open with a template first'],
              ['Follow up on a lead who went quiet yesterday', 'Free-form, if their last message was under 24h ago', 'Approved template only'],
              ['Site-visit reminder for tomorrow', 'Free-form', 'Utility template'],
              ['New launch announcement', 'Allowed, but this is the one that gets you blocked', 'Marketing template, and only to people who opted in to that'],
            ]}
            caption="The window is measured from the customer's last message, not from your last one. A template is what re-opens a closed conversation."
          />
        </div>

        <Callout title="The mistake this rule causes" tone="warning">
          A follow-up sequence written as &ldquo;message on day 1, day 3, day 7&rdquo; assumes it can send whatever it likes whenever it likes. Day 3 and day 7
          are outside the window for any lead who went quiet, so they need approved templates — and if nobody submitted those templates, the sequence fails
          silently. The dashboard shows the step as sent. The buyer receives nothing.
        </Callout>
      </Section>

      <Section
        index="03"
        title="The flow that works: qualify, then get out of the way"
        intro={
          <>
            A good real-estate bot is not a long conversation. It is a short one that ends in a booked visit or a warm handoff. Five moves, in this order.
          </>
        }
      >
        <PhaseTimeline
          phases={[
            {
              phase: 'Reply',
              timeline: 'Seconds',
              action: (
                <>
                  Acknowledge the specific property they enquired about, by name. A generic &ldquo;Thanks for your interest!&rdquo; tells the buyer they are in a
                  queue.
                </>
              ),
            },
            {
              phase: 'Qualify',
              timeline: '3–5 questions',
              action: <>Budget band, preferred locality, possession timeline, financing status, and who else is deciding. Nothing you will not act on.</>,
            },
            {
              phase: 'Answer',
              timeline: 'On demand',
              action: <>Price range, carpet area, floor plan, distance to the school or metro line they asked about — from a knowledge base, not improvised.</>,
            },
            {
              phase: 'Book',
              timeline: 'Same conversation',
              action: <>Offer two or three concrete slots and confirm one. &ldquo;Someone will call to schedule&rdquo; is where interest goes to die.</>,
            },
            {
              phase: 'Hand off',
              timeline: 'On any real signal',
              action: <>Negotiation, an objection, an unusual request — hand to a human with the transcript, and tell the buyer a person is joining.</>,
            },
          ]}
        />

        <Prose>
          <p className="mt-8">
            Ask fewer questions than you want to. Every extra question is a chance to close the chat, and a lead who abandons at question six has told you
            nothing while costing you the conversation. Budget and locality alone already sort the enquiry pile into &ldquo;call today&rdquo; and
            &ldquo;nurture&rdquo;.
          </p>
        </Prose>

        <div className="mt-6">
          <CheckList
            items={[
              <>
                <Emphasis>Ask in their words, not your form&apos;s.</Emphasis> &ldquo;What budget range are you looking at?&rdquo; gets answered. &ldquo;Please
                select your budget bracket&rdquo; gets ignored.
              </>,
              <>
                <Emphasis>Accept a messy answer.</Emphasis> People type &ldquo;around 80L&rdquo;, &ldquo;1.2 cr max&rdquo;, &ldquo;depends on the floor&rdquo;.
                A bot that re-asks because it wanted a number is worse than no bot.
              </>,
              <>
                <Emphasis>Handle STOP properly, and immediately.</Emphasis> If someone asks to stop, the sequence ends there — not after one more scheduled
                message.
              </>,
              <>
                <Emphasis>Never invent inventory.</Emphasis> The one thing a property bot must not do is guess at availability, price or possession date. If it
                is not in the knowledge base, it says so and fetches a human.
              </>,
            ]}
          />
        </div>
      </Section>

      <Section
        index="04"
        title="Where leads actually come from, and what changes per source"
        intro={<>The source decides whether the 24-hour window is already open, which decides whether your first message can be free-form at all.</>}
      >
        <DataTable
          headers={['Source', 'Who messages first', 'What your first message must be']}
          rows={[
            ['Click-to-WhatsApp ad', 'The buyer — they tap and land in the chat', 'Free-form. The window is already open, so reply instantly and qualify.'],
            ['Meta lead ad form', 'Nobody — you receive a form submission', 'A template, delivered within seconds of the submission via webhook.'],
            ['Website chat or form', 'The buyer, on your site, not on WhatsApp', 'Depends on the opt-in you captured on the form. Say plainly that you will message on WhatsApp.'],
            ['Portal enquiry', 'Varies by portal', 'Usually a template. Check what consent the portal actually passes you.'],
          ]}
          caption="A webhook matters here for one reason: it is the difference between replying in seconds and replying after the next CRM export."
        />

        <Prose>
          <p className="mt-8">
            This is also where most &ldquo;the bot never messaged them&rdquo; reports come from. A number stored as <code>98765 43210</code> with a space, or
            without the country code, is not a number WhatsApp can deliver to. Normalise to international format at the point of capture, not in a cleanup script
            three weeks later.
          </p>
        </Prose>
      </Section>

      <Section
        index="05"
        title="Build, buy, or the free app: an honest comparison"
        intro={<>All three are legitimate. They fail in different places, and the failure is what should decide it.</>}
      >
        <DataTable
          headers={['Approach', 'Suits', 'Where it breaks']}
          rows={[
            [
              'WhatsApp Business app (free)',
              'A single agent, low volume, manual replies',
              'No automation worth the name, no CRM, and it cannot be driven by software. Away messages are not qualification.',
            ],
            [
              'Business Platform via a provider, built in-house',
              'Teams with engineers and an unusual process',
              'Template lifecycle, the window, retries, quality rating and opt-in records are all yours to build and keep working.',
            ],
            [
              'A platform that owns the flow end to end',
              'Most developers and brokerages',
              'You inherit someone else’s idea of a follow-up. Worth checking it can wait for a real reply rather than blasting on a timer.',
            ],
          ]}
        />

        <Callout title="The question to ask any vendor">
          &ldquo;Show me what happens when a lead does not reply for two days.&rdquo; If the answer is a scheduled message with no mention of a template, the
          product has not met the 24-hour window yet, and you will discover that after you have paid.
        </Callout>
      </Section>

      <Section
        index="06"
        title="Before you switch it on"
        intro={<>Short list, in order. Most of it is compliance and plumbing, which is exactly the part that gets skipped.</>}
      >
        <CheckList
          items={[
            <>
              <Emphasis>Get a real opt-in, and keep the record.</Emphasis> Say on the form or ad that you will message on WhatsApp. India&apos;s data-protection
              regime is tightening; keeping proof of consent is cheap now and expensive to reconstruct later.
            </>,
            <>
              <Emphasis>Submit templates before launch, not after.</Emphasis> Approval takes time and rejections happen. Write the follow-up ones first — they
              are the ones the flow cannot run without.
            </>,
            <>
              <Emphasis>Check what your state&apos;s RERA rules require in promotional messages.</Emphasis> A WhatsApp message advertising a project is
              advertising. Ask your legal advisor what has to appear in it.
            </>,
            <>
              <Emphasis>Decide the handoff rule and staff it.</Emphasis> A bot that escalates into an empty inbox at 9pm is worse than one that says the team
              replies at 10am.
            </>,
            <>
              <Emphasis>Sync to the CRM from day one.</Emphasis> Qualification answers trapped in a chat thread are not a pipeline. They should land as fields
              you can filter and assign.
            </>,
          ]}
        />
      </Section>

      <ScrollReveal>
        <div className="mt-20 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <h2 className="text-lg font-bold text-white" style={JAKARTA_FONT}>
            How Vyostra AI approaches this
          </h2>
          <Prose>
            <p className="mt-3">
              Our agents are built around the constraints above rather than on top of them: a follow-up journey waits for an actual reply instead of firing on a
              timer, ends the moment someone asks it to stop, and hands over to your team when the conversation stops being qualification. Leads arrive from
              website chat, forms and Meta lead ads, and land in the same place.
            </p>
            <p className="mt-3">
              Worth reading next: <Link to="/features/whatsapp" className="text-violet-300 underline decoration-violet-300/40 underline-offset-4">WhatsApp lead
              notifications and two-way replies</Link>, and <Link to="/features/crm" className="text-violet-300 underline decoration-violet-300/40 underline-offset-4">the
              built-in lead CRM</Link> the answers are written into.
            </p>
          </Prose>
        </div>
      </ScrollReveal>
    </>
  )
}
