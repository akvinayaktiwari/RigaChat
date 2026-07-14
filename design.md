# VyostraAI Landing Page — Design System

Source: Figma export (Build_landing_page_design_new.zip)
Last updated: July 2026

---

## Fonts

```
Primary (headings): Plus Jakarta Sans
  Weights: 400, 500, 600, 700, 800
  Google Fonts: https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800

Secondary (body): Inter
  Weights: 400, 500, 600
  Google Fonts: https://fonts.googleapis.com/css2?family=Inter:ital,wght@0,400;0,500;0,600

Usage rule:
  All h1, h2, h3, logo, step numbers, stat values → Plus Jakarta Sans
  All body text, nav links, descriptions, captions → Inter
```

---

## Color Tokens (CSS Variables)

```css
:root {
  --background:        #ffffff;
  --foreground:        #0d0d18;
  --primary:           #7c3aed;   /* violet-600 */
  --primary-foreground: #ffffff;
  --secondary:         #f5f3ff;
  --secondary-foreground: #5b21b6;
  --muted:             #f8f8fc;
  --muted-foreground:  #6b7280;
  --accent:            #f5f3ff;
  --accent-foreground: #7c3aed;
  --border:            rgba(0, 0, 0, 0.07);
  --input-background:  #f5f5fa;
  --ring:              #c4b5fd;
  --radius:            1rem;      /* 16px base radius */
}
```

---

## Brand Gradient

```
Primary gradient: from-violet-600 to-purple-500
  Hex: #7c3aed → #a855f7
  Used on: CTA buttons, hero h1 highlight, step numbers,
           widget header, logo icon, navbar CTA

Gradient text: bg-gradient-to-r from-violet-600 to-purple-500
  bg-clip-text text-transparent
  Used on: hero headline accent word

CTA section bg: from-violet-600 via-purple-600 to-indigo-600
```

---

## Typography Scale

```
Hero h1:        text-5xl sm:text-6xl, font-extrabold, tracking-tight, leading-[1.1]
                font-family: Plus Jakarta Sans

Section h2:     text-4xl sm:text-5xl, font-extrabold, tracking-tight
                font-family: Plus Jakarta Sans

Card h3:        text-lg–text-xl, font-bold
                font-family: Plus Jakarta Sans

Section label:  text-sm, font-semibold, text-violet-600,
                uppercase, tracking-widest
                (used above every section heading)

Body large:     text-lg, text-gray-500, leading-relaxed
Body default:   text-sm, text-gray-500, leading-relaxed
Caption:        text-xs, text-gray-400

Stat value:     text-3xl, font-extrabold, text-gray-900
                font-family: Plus Jakarta Sans
```

---

## Spacing & Layout

```
Max content width:  max-w-6xl (1152px)
Section padding:    py-24 px-4
Stats bar:          py-12 px-4
Navbar:             px-5 py-3
Hero:               pt-28 pb-20 px-4

Grid systems:
  Hero:             grid-cols-1 lg:grid-cols-2, gap-16
  Stats:            grid-cols-2 lg:grid-cols-4, gap-8
  Bento features:   grid-cols-1 sm:grid-cols-2 lg:grid-cols-3, gap-4
  Integrations:     grid-cols-1 sm:grid-cols-2, gap-5
  How it works:     grid-cols-1 md:grid-cols-3, gap-8
  Testimonials:     grid-cols-1 md:grid-cols-3, gap-5
  Footer:           grid-cols-2 md:grid-cols-5, gap-8
```

---

## Border Radius

```
--radius: 1rem (16px) — base

Navbar:           rounded-2xl (16px)
Cards:            rounded-2xl (16px)
Buttons primary:  rounded-xl (12px)
Icon containers:  rounded-xl (12px)
Step numbers:     rounded-2xl (16px)
CTA section:      rounded-3xl (24px)
Logo icon:        rounded-xl (12px)
Widget header:    rounded-2xl top only
Avatar circles:   rounded-full
Badge/pill:       rounded-full
```

---

## Shadows

```
Navbar:         shadow-lg shadow-black/[0.04]
Cards hover:    shadow-lg shadow-black/[0.06]
Widget:         shadow-2xl shadow-violet-100/60
CTA buttons:    shadow-lg shadow-violet-200/70
Step numbers:   shadow-lg shadow-violet-200/60
CTA section:    shadow-2xl shadow-violet-300/40
Integration:    hover:shadow-xl hover:shadow-black/[0.06]
```

---

## Background Patterns

```
Hero section:
  - bg-violet-200/30 blur-3xl top-left orb
  - bg-pink-200/25 blur-3xl top-right orb
  - bg-sky-200/20 blur-3xl bottom orb

Widget glow:
  - bg-violet-300/25 blur-3xl top-right
  - bg-pink-300/20 blur-3xl bottom-left
  - bg-sky-300/15 blur-2xl top-left

Sections with bg:
  - Integrations section: bg-gray-50/60
  - Testimonials section: bg-gray-50/60
  - All other sections: bg-white

CTA section:
  - bg-white/10 blur-3xl top-right orb
  - bg-purple-400/20 blur-3xl bottom-left orb
```

---

## Navbar

```
Position: fixed top-0, z-50
Container: max-w-6xl, mx-auto
Style: bg-white/80 backdrop-blur-xl border border-black/[0.06]
       rounded-2xl shadow-lg shadow-black/[0.04]
       px-5 py-3
Top padding: pt-4 (floats 16px from top)

Logo:
  Icon: 32×32px, bg-gradient violet-600→purple-500,
        rounded-xl, shadow-md shadow-violet-200
  Text: font-bold, text-lg, Plus Jakarta Sans, text-gray-900

Nav links: text-sm, text-gray-500, hover:text-gray-900,
           font-medium, gap-7

CTA button: gradient violet-600→purple-500, text-white,
            font-semibold, px-4 py-2, rounded-xl,
            shadow-md shadow-violet-200/60

Mobile menu: bg-white/95 backdrop-blur-xl,
             rounded-2xl, shadow-xl, p-4
```

---

## Hero Section

```
Layout: 2-col grid (lg), left copy + right widget
Left col sections:
  1. Badge pill (violet-50 bg, violet-100 border, violet-700 text)
     Animated pulse dot + ChevronRight icon
  2. h1 — 5xl/6xl, extrabold, Plus Jakarta Sans
     Last phrase in gradient violet→purple
  3. Subtext — text-lg, text-gray-500, max-w-lg
  4. CTA buttons row:
     Primary: gradient bg, shadow-lg shadow-violet-200/70
     Secondary: white bg, border-gray-200
  5. Social proof: stacked avatar circles + 5 stars + text

Widget (right col):
  - w-80 sm:w-96 container
  - glassmorphism: bg-white/75 backdrop-blur-2xl
    border border-white/80 rounded-2xl shadow-2xl
  - Header: gradient violet-600→purple-500
  - Messages: gradient-to-b from-white/60 to-white/80
  - Quick reply chips: violet-200 border, white bg
  - Floating badge: white card, top-right, shadow-lg
  - Glow orbs behind widget
```

---

## Bento Features Grid

```
Section label: "Features" — violet-600, uppercase, tracking-widest
Heading: "Everything to automate your customer conversations"

Cards: 6 total in 3-col grid
  Large cards (col-span-2): min-h-44
  Small cards (col-span-1): min-h-36

Each card:
  bg-gradient-to-br (unique per card, see below)
  border border-black/[0.05] rounded-2xl p-6
  hover:shadow-lg transition-all duration-300

  Icon container: w-10 h-10, rounded-xl, mb-4
    group-hover:scale-105 transition-transform
  Title: font-bold, text-gray-900, text-lg, Plus Jakarta Sans
  Description: text-gray-500, text-sm, leading-relaxed

Card gradients:
  1. Train on KB (large):   from-violet-50 via-purple-50 to-white
                            icon: bg-violet-100, text-violet-600
  2. Live in 3 min (small): from-amber-50 to-orange-50
                            icon: bg-amber-100, text-amber-600
  3. Analytics (small):     from-sky-50 to-blue-50
                            icon: bg-sky-100, text-sky-600
  4. Human handoff (large): from-emerald-50 via-teal-50 to-white
                            icon: bg-emerald-100, text-emerald-600
  5. 95+ languages (small): from-pink-50 to-rose-50
                            icon: bg-rose-100, text-rose-500
  6. Security (small):      from-slate-50 to-gray-50
                            icon: bg-slate-100, text-slate-600
```

---

## Integrations Section

```
Background: bg-gray-50/60
Section label: "Integrations"
Heading: "Plugs into your existing stack"

Cards: 2×2 grid, gap-5
Each card:
  bg-white, border (color-specific), rounded-2xl p-7
  hover:shadow-xl transition-all duration-300
  Subtle gradient overlay (40% opacity) inside

  Icon: w-12 h-12 rounded-xl, group-hover:scale-105
  Name: font-bold, text-xl, Plus Jakarta Sans
  Description: text-sm, text-gray-500
  Perks list: CheckCircle icon + text-sm text-gray-600
  "Learn more" link: text-xs font-semibold + ChevronRight

Integrations (4 cards):
  WhatsApp:   border-green-100,  icon: text-green-600,  bg: from-green-50 to-emerald-50
  HubSpot:    border-orange-100, icon: text-orange-500, bg: from-orange-50 to-amber-50
  Zoho CRM:   border-red-100,    icon: text-red-600,    bg: from-red-50 to-rose-50
  Salesforce: border-sky-100,    icon: text-sky-600,    bg: from-sky-50 to-blue-50
```

---

## How It Works Section

```
Section label: "How it works"
Heading: "From zero to live in three steps"

3-col grid, relative positioned
Connector: hidden md:block absolute horizontal line
           bg-gradient-to-r from-transparent via-violet-200 to-transparent
           h-px at top-10

Each step:
  Step number box: w-14 h-14 rounded-2xl
                   bg-gradient-to-br from-violet-600 to-purple-500
                   shadow-lg shadow-violet-200/60
                   text-white font-extrabold text-sm
                   Plus Jakarta Sans
  Title: font-bold text-xl text-gray-900 Plus Jakarta Sans
  Description: text-sm text-gray-500 leading-relaxed
  Mobile connector: w-px h-8 bg-violet-200 (between steps)
```

---

## Testimonials Section

```
Background: bg-gray-50/60
Section label: "Testimonials"
Heading: "Teams that already switched"

3-col grid
Each card:
  bg-white border border-black/[0.05] rounded-2xl p-6
  hover:shadow-lg transition-all duration-300

  5 gold stars (fill-amber-400 text-amber-400)
  Quote: text-gray-700 text-sm leading-relaxed mb-6
  Author avatar: w-10 h-10 rounded-full gradient bg
  Author name: font-semibold text-gray-900 text-sm
  Author role: text-xs text-gray-500

Avatar gradients:
  SC: from-violet-500 to-purple-600
  MT: from-amber-400 to-orange-500
  PN: from-emerald-400 to-teal-500
```

---

## CTA Section

```
Section id: #pricing
Container: max-w-4xl mx-auto

Card: bg-gradient-to-br from-violet-600 via-purple-600 to-indigo-600
      rounded-3xl px-8 py-16 text-center
      shadow-2xl shadow-violet-300/40
      overflow-hidden (for orb clipping)

Orbs inside: bg-white/10 and bg-purple-400/20

Top badge: bg-white/15 border-white/20 text-white
           green dot + "14-day free trial · No credit card"

h2: text-4xl sm:text-5xl font-extrabold text-white
    Plus Jakarta Sans

Subtext: text-white/70 text-lg max-w-md

Buttons:
  Primary: bg-white text-violet-700 font-bold px-7 py-4 rounded-xl
  Secondary: bg-white/10 border-white/20 text-white px-7 py-4 rounded-xl

Footer note: text-white/50 text-xs "Plans from ₹X/mo · Cancel anytime"
```

---

## Footer

```
Border: border-t border-gray-100 py-12 px-4
Grid: 2-col mobile → 5-col desktop

Brand col (col-span-2):
  Same logo as navbar
  Tagline: text-sm text-gray-500 max-w-56

Link columns (3): Product, Company, Legal
  Heading: font-semibold text-gray-900 text-sm Plus Jakarta Sans mb-4
  Links: text-sm text-gray-500 hover:text-gray-900

Bottom bar:
  Copyright: text-xs text-gray-400
  Integration badges: icon + name text-xs text-gray-400
```

---

## Interaction Patterns

```
All cards:        hover:shadow-lg/xl transition-all duration-300
Icon containers:  group-hover:scale-105 transition-transform
Buttons:          hover:opacity-90 transition-opacity
Nav links:        hover:text-gray-900 transition-colors
CTA secondary:    hover:bg-white/20 transition-colors

Animated elements:
  Hero badge dot: animate-pulse (violet-500)
  Widget glow orbs: static (no animation in design)
```

---

## Component Sizing Reference

```
Logo icon:          w-8 h-8 (32px)
Nav CTA button:     px-4 py-2
Primary CTA button: px-6 py-3.5
Large CTA button:   px-7 py-4
Bento icon:         w-10 h-10 (40px) container, w-5 h-5 icon
Integration icon:   w-12 h-12 (48px) container, w-6 h-6 icon
Step number box:    w-14 h-14 (56px)
Avatar (social):    w-8 h-8 (32px), -space-x-2 stacked
Avatar (testimonial): w-10 h-10 (40px)
Star icons:         w-3.5 h-3.5 (hero), w-4 h-4 (testimonials)
Widget width:       w-80 sm:w-96 (320px → 384px)
```

---

## VyostraAI Content Mapping

When implementing, replace Aika/design content with:

```
Brand name:       VyostraAI
Logo icon:        MessageSquare (keep same)
Tagline:          "AI chatbot with native CRM — built for Indian SMBs"

Hero headline:    "Deploy AI chatbots your customers love to talk to."
Hero subtext:     "Train on your website content, capture leads automatically,
                   and sync to your CRM — all in one platform."

CTA primary:      "Start free — no card needed"
CTA secondary:    "Watch 2-min demo"

Stats (replace):
  Leads captured: "50,000+"
  Setup time:     "3 min"
  Response rate:  "94%"
  Businesses:     "500+"

Nav links:        Features, Integrations, How it works, Pricing
Footer copyright: © 2026 VyostraAI. All rights reserved.
Pricing note:     "Plans from ₹1,999/mo · Cancel anytime"

Features (6 bento cards):
  1. Train on your website (large) — Database icon
  2. Live in 3 minutes (small) — Zap icon
  3. Built-in CRM (small) — BarChart3 icon  ← KEY DIFFERENTIATOR
  4. WhatsApp notifications (large) — MessageSquare icon
  5. Multi-language support (small) — Globe icon
  6. Lead capture forms (small) — Shield icon

Integrations (4 cards):
  WhatsApp (live)    → Gupshup/Meta
  Zoho CRM (live)    → existing integration
  HubSpot (planned)  → Phase 2
  Salesforce (planned) → Phase 2

CTA section:
  Headline: "Your AI chatbot is 3 minutes away."
  Subtext:  "Join 500+ businesses automating conversations
             with VyostraAI. Start free, upgrade when you scale."
```

---

## Files to Create in Frontend

```
frontend/src/pages/LandingPage.tsx     ← main page
frontend/src/components/landing/
  Navbar.tsx
  HeroSection.tsx
  StatsBar.tsx
  FeaturesSection.tsx
  IntegrationsSection.tsx
  HowItWorksSection.tsx
  TestimonialsSection.tsx
  CTASection.tsx
  Footer.tsx
  ChatWidget.tsx                       ← hero widget mockup

frontend/src/styles/ (already exists)
  No new CSS files — Tailwind v4 only
```

---

## Critical Rules for Implementation

```
1. NO CSS modules — Tailwind v4 only
2. Plus Jakarta Sans for ALL headings — import from Google Fonts
3. Inter for ALL body text — already imported in project
4. Exact color values from this doc — no approximations
5. Gradient directions must match exactly
6. hover: transitions on all interactive elements
7. backdrop-blur on navbar (bg-white/80 backdrop-blur-xl)
8. All section headings preceded by uppercase violet label
9. Mobile responsive — all grids collapse correctly
10. shadow values must be exact (shadow-black/[0.06] not shadow-md)
```

---

## Dashboard Design System

Source: VyostraAI dashboard redesign
Applies to: All 9 dashboard pages + auth pages
Design principle: Match landing page aesthetic

---

### Dashboard Colors

```
Primary:     #7c3aed (violet-600)
Gradient:    from-violet-600 to-purple-500
Page bg:     #ffffff
Sidebar bg:  #fafafa (gray-50)
Surface:     #ffffff (cards)
Muted bg:    #f8f8fc
Border:      rgba(0,0,0,0.07)
Success:     #10b981 (emerald-500)
Warning:     #f59e0b (amber-500)
Danger:      #ef4444 (red-500)
```

---

### Dashboard Typography

```
Page headings:   Plus Jakarta Sans
                 font-extrabold text-gray-900
Section headings: Plus Jakarta Sans
                  font-bold text-gray-900
Labels/body:     Inter (existing)
Table headers:   Inter text-xs uppercase
                 tracking-wider text-gray-500
```

---

### Sidebar

```
Width:      w-64 (256px) desktop
            hidden on mobile (drawer)
Background: bg-white border-r border-gray-100

Logo section:
  Icon: MessageSquare w-8 h-8
        bg-gradient-to-br from-violet-600
        to-purple-500 rounded-xl
        shadow-md shadow-violet-200
  Text: "VyostraAI" font-bold text-lg
        Plus Jakarta Sans text-gray-900

Nav items:
  Default: text-sm text-gray-600
           font-medium px-3 py-2.5
           rounded-xl gap-3
           hover:bg-gray-50
           hover:text-gray-900
           transition-all duration-150

  Active:  bg-violet-50 text-violet-700
           font-semibold
           border-l-0 (no left border)

  Icons:   lucide-react w-4.5 h-4.5
           text-gray-400 (default)
           text-violet-600 (active)

Bottom section:
  User avatar: w-8 h-8 rounded-full
               bg-gradient-to-br
               from-violet-600 to-purple-500
               text-white text-xs font-bold
  User name: text-sm font-medium text-gray-900
  User email: text-xs text-gray-500
```

---

### Top Navbar

```
Height:     h-16
Background: bg-white border-b border-gray-100
            shadow-sm
Content:    Page title (Plus Jakarta Sans
            font-bold text-xl text-gray-900)
            + right side actions
```

---

### Cards

```
Base card:
  bg-white rounded-2xl
  border border-black/[0.05]
  shadow-sm
  hover:shadow-md
  transition-all duration-200

Raised card (modals/featured):
  bg-white rounded-2xl
  border border-gray-100
  shadow-lg shadow-black/[0.06]
```

---

### Stat Cards

```
Container: bg-white rounded-2xl p-6
           border border-black/[0.05]
           shadow-sm

Icon container: w-12 h-12 rounded-xl
  bg-gradient-to-br from-violet-600
  to-purple-500 (primary stat)
  OR bg-emerald-50 (success stat)
  OR bg-amber-50 (warning stat)
  flex items-center justify-center

Icon: w-6 h-6 text-white (on gradient)
      OR text-emerald-600 (on light)

Value: text-3xl font-extrabold text-gray-900
       Plus Jakarta Sans mb-1

Label: text-sm text-gray-500 font-medium

Trend: text-xs font-semibold mt-1
       text-emerald-600 (positive)
       text-red-500 (negative)
```

---

### Buttons

```
Primary:
  bg-gradient-to-r from-violet-600
  to-purple-500 text-white font-semibold
  px-4 py-2.5 rounded-xl text-sm
  shadow-md shadow-violet-200/50
  hover:opacity-90 transition-opacity

Secondary:
  bg-white text-gray-700 font-medium
  px-4 py-2.5 rounded-xl text-sm
  border border-gray-200
  hover:bg-gray-50 transition-colors

Danger:
  bg-red-500 text-white font-semibold
  px-4 py-2.5 rounded-xl text-sm
  hover:bg-red-600 transition-colors

Ghost:
  text-gray-600 font-medium px-3 py-2
  rounded-xl text-sm
  hover:bg-gray-100 transition-colors
```

---

### Tables

```
Wrapper: bg-white rounded-2xl
         border border-black/[0.05]
         overflow-hidden shadow-sm

Header row:
  bg-gray-50/80
  text-xs font-semibold uppercase
  tracking-wider text-gray-500
  px-6 py-3.5

Data rows:
  border-b border-gray-50
  hover:bg-violet-50/20
  transition-colors duration-100
  px-6 py-4 text-sm text-gray-700
```

---

### Badges

```
Active/Live:
  bg-emerald-50 text-emerald-700
  border border-emerald-200
  text-xs font-semibold px-2.5 py-1
  rounded-full

Processing:
  bg-violet-50 text-violet-700
  border border-violet-200
  text-xs font-semibold px-2.5 py-1
  rounded-full

Failed/Error:
  bg-red-50 text-red-700
  border border-red-200
  text-xs font-semibold px-2.5 py-1
  rounded-full

New (leads):
  bg-blue-50 text-blue-700
  border border-blue-200
  text-xs font-semibold px-2.5 py-1
  rounded-full
```

---

### Form Inputs

```
Input/Select/Textarea:
  border border-gray-200 rounded-xl
  px-4 py-2.5 text-sm text-gray-700
  bg-white outline-none
  focus:border-violet-400
  focus:ring-2 focus:ring-violet-100
  transition-colors

Label:
  text-sm font-medium text-gray-700 mb-1.5

Helper text:
  text-xs text-gray-400 mt-1

Error text:
  text-xs text-red-500 mt-1
```

---

### Modals

```
Overlay: bg-black/40 backdrop-blur-sm
         fixed inset-0 z-50

Container: bg-white rounded-2xl
           shadow-2xl shadow-black/[0.08]
           border border-gray-100
           max-w-lg w-full mx-4
           p-6

Header: font-bold text-xl text-gray-900
        Plus Jakarta Sans mb-4
```

---

### Empty States

```
Container: flex flex-col items-center
           justify-center py-16 px-4

Icon: w-14 h-14 rounded-2xl
      bg-violet-50 flex items-center
      justify-center mb-4
      Icon: w-7 h-7 text-violet-400

Heading: text-xl font-bold text-gray-900
         Plus Jakarta Sans mb-2

Subtext: text-sm text-gray-500
         text-center max-w-xs mb-6

CTA: Primary button (see buttons above)
```

---

### Page Layout

```
Each dashboard page:
  Padding: p-6 sm:p-8
  Max width: max-w-7xl mx-auto

  Page header row:
    flex items-center justify-between mb-8
    Left: page title + subtitle
    Right: primary action button

  Title: text-2xl font-extrabold text-gray-900
         Plus Jakarta Sans
  Subtitle: text-sm text-gray-500 mt-1
```

---

### Critical Rules

```
1. Plus Jakarta Sans for ALL headings,
   page titles, stat values, modal titles
   Use style={{ fontFamily: "'Plus Jakarta
   Sans', sans-serif" }} on these elements

2. Every primary button uses the violet
   gradient — never solid violet bg alone

3. All cards use rounded-2xl not rounded-lg

4. Hover states on all interactive elements

5. No hardcoded hex colors — use Tailwind
   classes mapped to DESIGN.md values

6. Mobile responsive — sidebar hidden on
   mobile, all grids collapse correctly
```