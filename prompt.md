# Landing Page Implementation Prompt

---

```
PROJECT CONTEXT:
  VyostraAI (formerly BeepBoop) AI Chatbot SaaS.
  Frontend: React 18 + TypeScript + Vite + Tailwind v4.
  No CSS modules. lucide-react for icons.
  Current app lives at /dashboard routes.
  Landing page will live at / (root route).

  Read DESIGN.md at project root before writing
  any code. It contains every color, font, spacing,
  gradient, shadow, and component spec extracted
  from the Figma design export.

  Also read:
  - frontend/src/styles/index.css
  - frontend/src/styles/theme.css
  - frontend/src/App.tsx or main router file
    to understand current route structure

TASK: Build the VyostraAI landing page exactly
matching the Figma design. Content is VyostraAI's
own (specified in DESIGN.md under Content Mapping).
Design, colors, layout, typography, gradients,
shadows — all must match exactly.

Do NOT modify any dashboard pages or components.
Do NOT touch any backend files.
Do NOT change routing for /dashboard/* routes.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 1: FONTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Add to frontend/index.html <head>:
  Google Fonts import for Plus Jakarta Sans:
  weights 400, 500, 600, 700, 800

Check if Inter is already imported. If not, add it.
Inter weights needed: 400, 500, 600.

Use preconnect for performance:
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 2: CSS VARIABLES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Check frontend/src/styles/theme.css.
If these variables are not already present, add them:

  --primary: #7c3aed
  --primary-foreground: #ffffff
  --secondary: #f5f3ff
  --secondary-foreground: #5b21b6
  --muted: #f8f8fc
  --muted-foreground: #6b7280
  --border: rgba(0, 0, 0, 0.07)
  --input-background: #f5f5fa
  --ring: #c4b5fd
  --radius: 1rem

Do not remove or change any existing variables.
Only add what is missing.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 3: FILE STRUCTURE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Create these files:

frontend/src/pages/LandingPage.tsx
  — assembles all sections, exports default

frontend/src/components/landing/Navbar.tsx
frontend/src/components/landing/HeroSection.tsx
frontend/src/components/landing/StatsBar.tsx
frontend/src/components/landing/FeaturesSection.tsx
frontend/src/components/landing/IntegrationsSection.tsx
frontend/src/components/landing/HowItWorksSection.tsx
frontend/src/components/landing/TestimonialsSection.tsx
frontend/src/components/landing/CTASection.tsx
frontend/src/components/landing/Footer.tsx
frontend/src/components/landing/ChatWidget.tsx

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 4: ROUTING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Find the main router file (App.tsx or routes file).
Add route: path="/" → LandingPage component.
Ensure /dashboard/* routes are unchanged.
Ensure /login route is unchanged.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 5: COMPONENT SPECS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Implement each component EXACTLY as in DESIGN.md.
Below are the critical specs for each.

─────────────────────────────────────────
Navbar.tsx
─────────────────────────────────────────
- Fixed top-0, z-50, flex justify-center px-4 pt-4
- Inner nav: max-w-6xl, bg-white/80 backdrop-blur-xl
  border border-black/[0.06] rounded-2xl
  shadow-lg shadow-black/[0.04] px-5 py-3
- Logo: w-8 h-8 gradient violet-600→purple-500
  rounded-xl + "VyostraAI" text Plus Jakarta Sans
- Nav links: Features, Integrations, How it works, Pricing
  text-sm text-gray-500 hover:text-gray-900 font-medium gap-7
- Right: "Sign in" link + "Get started free" gradient button
  with ArrowRight icon
- Mobile: hamburger → dropdown menu rounded-2xl

─────────────────────────────────────────
ChatWidget.tsx (hero mockup, NOT real widget)
─────────────────────────────────────────
- This is a VISUAL MOCKUP only — static, no functionality
- Container: relative w-80 sm:w-96
- 3 glow orbs behind (violet/pink/sky blurs)
- Card: bg-white/75 backdrop-blur-2xl border border-white/80
  rounded-2xl shadow-2xl shadow-violet-100/60
- Header: gradient violet-600→purple-500 px-5 py-4
  Bot avatar (w-9 h-9 bg-white/20 rounded-xl Bot icon)
  "Aika Assistant" name + green online dot
  3 traffic light dots (red/yellow/green)
- Messages area: gradient from-white/60 to-white/80 px-4 py-5
  Message 1 (bot): gray bg, rounded, "Hi! I can help..."
  Message 2 (user): gradient violet bg, "How does WhatsApp..."
  Message 3 (bot): gray bg, reply about WhatsApp
  Quick replies: "Show me a demo" + "View pricing" chips
- Input bar: gray-50 bg rounded-xl, send button gradient
- Floating badge top-right: "↑ 94%" green + "resolution rate"

─────────────────────────────────────────
HeroSection.tsx
─────────────────────────────────────────
- min-h-screen flex items-center pt-28 pb-20 px-4
- Background orbs (3): violet/pink/sky blurs, absolute
- Grid: max-w-6xl grid-cols-1 lg:grid-cols-2 gap-16 items-center

Left col:
  1. Badge: inline-flex, bg-violet-50, border-violet-100,
     text-violet-700, rounded-full px-3.5 py-1.5
     Pulse dot (animate-pulse) + "Now with WhatsApp Business API"
     + ChevronRight

  2. h1: text-5xl sm:text-6xl font-extrabold tracking-tight
     leading-[1.1] mb-6 Plus Jakarta Sans text-gray-900
     Text: "Deploy AI chatbots your customers "
     Gradient span: "love to talk to."
     (bg-gradient-to-r from-violet-600 to-purple-500
      bg-clip-text text-transparent)

  3. p: text-lg text-gray-500 leading-relaxed mb-8 max-w-lg
     "Train on your website content, capture leads automatically,
     and sync to your CRM — all in one platform."

  4. Button row: flex-col sm:flex-row gap-3 mb-10
     Primary: gradient violet, shadow-lg shadow-violet-200/70
     Text: "Start free — no card needed" + ArrowRight
     Secondary: white bg border-gray-200
     Text: "Watch 2-min demo"

  5. Social proof: 4 stacked avatars (-space-x-2)
     Gradients: violet/amber/emerald/sky
     Initials: V, A, S, M
     5 amber stars + "Loved by 500+ businesses"

Right col: <ChatWidget />

─────────────────────────────────────────
StatsBar.tsx
─────────────────────────────────────────
- py-12 px-4 border-y border-gray-100/80
- max-w-5xl grid-cols-2 lg:grid-cols-4 gap-8
- 4 stats, centered:
  "50,000+" / "Leads captured"
  "3 min"   / "Average setup time"
  "94%"     / "Resolution rate"
  "500+"    / "Businesses live"
- Value: text-3xl font-extrabold text-gray-900 Plus Jakarta Sans
- Label: text-sm text-gray-500

─────────────────────────────────────────
FeaturesSection.tsx
─────────────────────────────────────────
- py-24 px-4, max-w-6xl
- Label: "Features" violet uppercase tracking-widest
- h2: "Everything to automate your customer conversations"
- Subtext: "From knowledge ingestion to CRM sync..."

6 bento cards in 3-col grid (gap-4):
All: border border-black/[0.05] rounded-2xl p-6
     hover:shadow-lg hover:shadow-black/[0.06]
     transition-all duration-300

1. "Train on your knowledge base" (large, col-span-2, min-h-44)
   Gradient: from-violet-50 via-purple-50 to-white
   Icon: Database, bg-violet-100, text-violet-600
   "Upload docs, URLs, or paste text..."

2. "Live in 3 minutes" (small, min-h-36)
   Gradient: from-amber-50 to-orange-50
   Icon: Zap, bg-amber-100, text-amber-600
   "Embed with one line of code..."

3. "Built-in CRM" (small, min-h-36)
   Gradient: from-sky-50 to-blue-50
   Icon: BarChart3, bg-sky-100, text-sky-600
   "Every lead lands directly in your CRM.
   No Zapier. No third-party integrations."

4. "WhatsApp notifications" (large, col-span-2, min-h-44)
   Gradient: from-emerald-50 via-teal-50 to-white
   Icon: MessageSquare, bg-emerald-100, text-emerald-600
   "Get instant WhatsApp alerts when a new lead
   is captured. Never miss a hot lead again."

5. "Multi-language widget" (small, min-h-36)
   Gradient: from-pink-50 to-rose-50
   Icon: Globe, bg-rose-100, text-rose-500
   "Auto-detect and reply in your customer's
   native language."

6. "Embeddable lead forms" (small, min-h-36)
   Gradient: from-slate-50 to-gray-50
   Icon: Shield, bg-slate-100, text-slate-600
   "Custom embeddable forms that sync leads
   directly to your CRM."

─────────────────────────────────────────
IntegrationsSection.tsx
─────────────────────────────────────────
- py-24 px-4 bg-gray-50/60, max-w-6xl
- Label: "Integrations"
- h2: "Plugs into your existing stack"
- Subtext: "One OAuth click. Your tools stay in sync."

4 cards in 2×2 grid (gap-5):
Each: bg-white rounded-2xl p-7
      hover:shadow-xl hover:shadow-black/[0.06]
      Gradient overlay inside (40% opacity)

1. WhatsApp (LIVE ✓)
   border-green-100, icon: text-green-600, bg-green-100
   bg: from-green-50 to-emerald-50
   Perks: "Lead notifications", "Rich media support",
          "WhatsApp chatbot (coming soon)"
   Note badge: "Live" green badge

2. Zoho CRM (LIVE ✓)
   border-red-100, icon: text-red-600, bg-red-100
   bg: from-red-50 to-rose-50
   Perks: "Lead capture", "Activity logging",
          "Custom field mapping"

3. HubSpot (Coming Soon)
   border-orange-100, icon: text-orange-500, bg-orange-100
   bg: from-orange-50 to-amber-50
   Perks: "Auto contact creation", "Deal pipeline sync",
          "Workflow triggers"
   Note badge: "Coming soon" gray badge

4. Salesforce (Coming Soon)
   border-sky-100, icon: text-sky-600, bg-sky-100
   bg: from-sky-50 to-blue-50
   Perks: "Real-time sync", "Custom object support",
          "Flow builder integration"
   Note badge: "Coming soon" gray badge

For "Live" badge:
  bg-green-50 text-green-700 text-xs font-semibold
  px-2 py-0.5 rounded-full border border-green-200
  position: top-right of card, absolute

For "Coming soon" badge:
  bg-gray-100 text-gray-500 text-xs font-medium
  px-2 py-0.5 rounded-full

─────────────────────────────────────────
HowItWorksSection.tsx
─────────────────────────────────────────
- py-24 px-4, max-w-5xl
- Label: "How it works"
- h2: "From zero to live in three steps"
- 3-col grid md, gap-8, relative
- Connector line: hidden md:block absolute
  top-10, left-1/3 right-1/3, h-px
  bg-gradient-to-r from-transparent via-violet-200 to-transparent

3 steps:
01: "Create your bot"
    "Add your website URL. Our AI crawler visits
    every page, extracts content, and builds your
    chatbot's knowledge base in minutes."

02: "Configure & embed"
    "Customize your chatbot's appearance, set up
    lead capture fields, and embed with one line
    of code. Connect WhatsApp or your CRM in one click."

03: "Go live and capture leads"
    "Your chatbot answers questions 24/7, captures
    leads automatically, and syncs everything to
    your CRM dashboard in real time."

Step number box: w-14 h-14 rounded-2xl
gradient violet-600→purple-500
shadow-lg shadow-violet-200/60
text-white font-extrabold text-sm Plus Jakarta Sans

─────────────────────────────────────────
TestimonialsSection.tsx
─────────────────────────────────────────
- py-24 px-4 bg-gray-50/60, max-w-6xl
- Label: "Testimonials"
- h2: "Teams that already switched"
- 3-col grid md, gap-5

3 testimonials (use placeholder names for now,
mark TODO: replace with real testimonials):
1. "We set up the chatbot in under 5 minutes.
   It now handles 70% of our after-hours inquiries
   and the leads go straight into our CRM."
   — Rahul M., Real Estate Developer, Bengaluru
   Avatar: from-violet-500 to-purple-600, initials: RM

2. "The Zoho integration alone saved us 2 hours
   a day. Leads from the chatbot sync automatically
   — no manual entry."
   — Priya S., Marketing Head, EdTech Startup
   Avatar: from-amber-400 to-orange-500, initials: PS

3. "Deployed on our clinic website in minutes.
   Patients can now book appointments and get
   FAQs answered at 2am."
   — Dr. Ankit V., Healthcare Clinic Owner
   Avatar: from-emerald-400 to-teal-500, initials: AV

─────────────────────────────────────────
CTASection.tsx
─────────────────────────────────────────
- py-24 px-4, max-w-4xl mx-auto
- Card: bg-gradient-to-br from-violet-600 via-purple-600 to-indigo-600
  rounded-3xl px-8 py-16 text-center
  shadow-2xl shadow-violet-300/40 overflow-hidden

Top badge: "14-day free trial · No credit card"
           bg-white/15 border-white/20

h2: "Your AI chatbot is 3 minutes away."
    text-4xl sm:text-5xl font-extrabold text-white
    Plus Jakarta Sans

Subtext: text-white/70 text-lg max-w-md
  "Join 500+ businesses automating conversations
  with VyostraAI. Start free, upgrade when you scale."

Buttons:
  Primary: bg-white text-violet-700 font-bold
           px-7 py-4 rounded-xl shadow-lg
           "Start free trial" + ArrowRight
           href="/login" (routes to existing login)

  Secondary: bg-white/10 border-white/20 text-white
             px-7 py-4 rounded-xl
             "Talk to sales"
             href="mailto:admin@drsyeta.in"

Footer note: text-white/50 text-xs
  "Plans from ₹1,999/mo · Cancel anytime"

─────────────────────────────────────────
Footer.tsx
─────────────────────────────────────────
- border-t border-gray-100 py-12 px-4
- max-w-6xl grid 2-col mobile → 5-col desktop

Brand col (col-span-2):
  Same logo as navbar
  Tagline: "Conversational AI chatbots with native CRM
            for Indian businesses."

3 link columns:
  Product: Features, Integrations, Pricing, Changelog
  Company: About, Blog, Careers, Contact
  Legal: Privacy, Terms, Security

Bottom bar:
  "© 2026 VyostraAI by Drsyeta Corp. All rights reserved."
  Integration badges: WhatsApp (green), Zoho (red) + "+2 more"

All footer links: href="#" for now (mark TODO)
except: Privacy → /privacy, Terms → /terms
(these pages already exist in the app)

─────────────────────────────────────────
LandingPage.tsx
─────────────────────────────────────────
Assemble all sections:
  <Navbar />
  <HeroSection />
  <StatsBar />
  <FeaturesSection />
  <IntegrationsSection />
  <HowItWorksSection />
  <TestimonialsSection />
  <CTASection />
  <Footer />

Root div: min-h-screen bg-white overflow-x-hidden
          font-family: Inter

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ICONS TO USE (all from lucide-react)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Menu, X, ArrowRight, Zap, BarChart3, Shield,
Bot, Globe, Headphones, Database, CheckCircle,
Star, ChevronRight, MessageSquare

For WhatsApp/Zoho/HubSpot/Salesforce:
Use inline SVG icons as defined in the
Figma design source (see App.tsx in zip).
Copy them exactly.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CRITICAL RULES — DO NOT VIOLATE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Tailwind v4 only — no CSS modules, no
   inline style objects except where
   fontFamily must be set (Plus Jakarta Sans
   is not a default Tailwind font)

2. Use style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
   ONLY on elements that need it (headings,
   logo text, step numbers, stat values).
   Do not apply it globally.

3. TypeScript strict — no any types.
   All component props must be typed.

4. All colors must match DESIGN.md exactly.
   Do not approximate — use exact Tailwind
   classes or hex values from DESIGN.md.

5. All shadows must match exactly:
   shadow-black/[0.06] NOT shadow-md
   shadow-violet-200/70 NOT shadow-violet-200

6. Max 40 lines per function/component.
   Split into sub-components freely.

7. No new npm packages. Use only:
   - lucide-react (already installed)
   - React (already installed)
   - Tailwind (already installed)

8. Do not modify:
   - Any dashboard pages
   - Any backend files
   - Any existing routes except adding /
   - frontend/src/styles/theme.css existing vars

9. Mobile responsive required:
   - All grids must collapse on mobile
   - Navbar must have working mobile menu
   - Hero widget: hidden on mobile
     (lg:block, not shown on small screens)
   - CTA buttons: flex-col on mobile



━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SHARED COMPONENTS — REPLACE GLOBALLY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Navbar.tsx and Footer.tsx are shared across
all marketing pages. Do NOT create separate
landing-specific versions.

Instead: UPDATE the existing shared
Navbar.tsx and Footer.tsx with the new
VyostraAI design.

Before modifying either file:
1. Read current Navbar.tsx and Footer.tsx
2. Read ALL pages that import them:
   About, Careers, Contact, Features pages,
   Help, Privacy, Terms, Status pages
3. Note every prop, nav link, and footer
   link currently in use
4. Ensure new components:
   - Accept all existing props (or sensible defaults)
   - Render all existing nav links
   - Render all existing footer links
   - Do not break any page layout

New Navbar design: as specified in DESIGN.md
  (floating, glass, violet gradient CTA)

New Footer design: as specified in DESIGN.md
  (5-col grid, violet logo, link columns)

After updating shared components, verify
each of the 8 marketing pages still renders
correctly by checking their imports and
prop usage — fix any mismatches found.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RESPONSIVE BREAKPOINTS — EXPLICIT RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Breakpoints: mobile (<640px), tablet (640–1024px), desktop (>1024px)

NAVBAR:
  Mobile:  hamburger only, no links, no CTA button
           mobile menu dropdown appears below navbar
  Tablet:  same as mobile
  Desktop: full horizontal nav with links + CTA

HERO:
  Mobile:  single column, widget HIDDEN (lg:hidden)
           h1: text-4xl (not 5xl/6xl)
           buttons: flex-col, full width
           social proof: visible
  Tablet:  single column, widget HIDDEN
           h1: text-5xl
  Desktop: 2-col grid, widget visible on right

STATS BAR:
  Mobile:  2-col grid (already in spec)
  Desktop: 4-col grid

BENTO FEATURES:
  Mobile:  1-col (all cards full width, no col-span-2)
  Tablet:  2-col (large cards still full width)
  Desktop: 3-col (large cards col-span-2)
  NOTE: col-span-2 only applies at lg breakpoint
        On mobile/tablet all cards are equal width

INTEGRATIONS:
  Mobile:  1-col stack
  Tablet+: 2×2 grid

HOW IT WORKS:
  Mobile:  1-col stack, vertical connector line
           between steps (w-px h-8 bg-violet-200)
  Desktop: 3-col, horizontal connector line

TESTIMONIALS:
  Mobile:  1-col stack
  Tablet+: 3-col grid

CTA SECTION:
  Mobile:  px-6 py-12 (less padding)
           h2: text-3xl
           buttons: flex-col, full width
  Desktop: px-8 py-16

FOOTER:
  Mobile:  2-col grid (brand col-span-2 full width,
           3 link cols become 2-col grid)
  Desktop: 5-col grid

CHAT WIDGET (hero mockup):
  Mobile:  hidden entirely (hidden lg:flex)
  Desktop: visible, w-80 sm:w-96

GENERAL RULES:
  Touch targets: min 44px height on all buttons/links
  Font sizes never below text-sm on mobile
  No horizontal scroll on any breakpoint
  All sections: px-4 minimum side padding
  Images/cards: never overflow viewport
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VERIFY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Run: npx tsc --noEmit
Fix ALL TypeScript errors before committing.

Run: npm run build
Fix ALL build errors before committing.

Mental checklist:
  ✓ Plus Jakarta Sans loads on headings
  ✓ Violet gradient on primary buttons
  ✓ Navbar floats with backdrop blur
  ✓ Hero h1 has gradient text on last phrase
  ✓ Bento grid: large cards span 2 cols on lg
  ✓ Integrations: WhatsApp + Zoho show "Live" badge
  ✓ CTA section has dark violet gradient background
  ✓ Footer links to /privacy and /terms work
  ✓ / route shows landing, /dashboard still works
  ✓ Mobile menu opens/closes correctly

Generate verification report:
  Files created: list all new files
  Files modified: list only modified files
  TypeScript check: PASS or FAIL
  Build check: PASS or FAIL
  What was NOT touched: bullet points

Then commit:
  git add .
  git commit -m "feat: add VyostraAI landing page"
Do not git push.
```
