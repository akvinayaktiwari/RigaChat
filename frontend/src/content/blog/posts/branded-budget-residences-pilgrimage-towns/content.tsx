import {
  Callout,
  CheckList,
  Cite,
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
  StatRow,
  StatTile,
} from '../../../../components/blog/BlogPrimitives'

/**
 * Source: "Branded Budget Residences - Pilgrimage Towns" (13pp, Aug 2026),
 * attached to this post as a download. Figures are transcribed from that
 * document; its own three-bucket confidence flagging (sourced / reasoned /
 * modeled) is preserved rather than flattened, since most numbers here are
 * planning estimates rather than observed data.
 */
export default function BrandedBudgetResidencesContent() {
  return (
    <>
      <ScrollReveal>
        <h2 className="text-2xl font-bold text-white md:text-3xl" style={JAKARTA_FONT}>
          How this model is built
        </h2>
        <Prose>
          <p className="mt-4">
            This is a working model, not a press release. Every number below falls into one of three buckets, flagged consistently throughout so you can adapt it
            into your own underwriting.
          </p>
        </Prose>
      </ScrollReveal>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <NumberedCard number="①" title="Sourced data">
          Footfall figures, hotel-room supply figures, construction cost benchmarks and OTA commission rates are pulled from government tourism data, temple trust
          (TTD/Sansthan) releases, and 2025–26 industry cost reports (Hotelivate–Savills, HVS Anarock).
        </NumberedCard>
        <NumberedCard number="②" title="Reasoned build-up">
          The capex and opex tables for the specific no-frills branded format are bottom-up estimates, built by stripping cited industry benchmarks down to a
          lean, no-F&amp;B spec. Not independently sourced.
        </NumberedCard>
        <NumberedCard number="③" title="Modeled assumption">
          Occupancy curves, staffing headcounts, wage bands and the Ayodhya case-study P&amp;L are explicitly estimates — reasonable planning assumptions for a
          first pass, not guarantees. Validate locally before committing capital.
        </NumberedCard>
      </div>

      <PullQuote>
        Every pilgrim town in India has two accommodation extremes — a ₹300 dharamshala bed and a ₹6,000 hotel room — and almost nothing clean, predictable, and
        branded in between. That gap is the entire thesis of this document.
      </PullQuote>

      <Section
        index="1"
        title="City shortlist — where the white space is widest"
        intro={
          <p>
            Tier-1 pilgrim towns plus underrated markets, screened on footfall scale, current budget-supply gap, ADR headroom versus the ₹2,000–2,500 target
            band, and how difficult land or property acquisition realistically is on the ground.
          </p>
        }
      >
        <StatRow>
          <StatTile value="~60x" label="Ayodhya footfall growth since temple opening (2024)" />
          <StatTile value="12,500" label="Rooms Ayodhya is projected to need by 2031" accent="cyan" />
          <StatTile value="₹1,000–5,000" label="Current private hotel range near Tirumala" />
          <StatTile value="10–30 cr" label="Pilgrims projected for Simhastha 2028 (Ujjain, one month)" accent="cyan" />
        </StatRow>

        <Callout title="Note on the footfall numbers">
          Government-reported figures for Varanasi and Ayodhya count cumulative visits (including repeat local visits to multiple sites) rather than unique
          out-of-town pilgrims. Useful for gauging scale and hotel-night demand, but not directly comparable person-for-person across cities with different
          counting methodologies.
        </Callout>

        <ScrollReveal>
          <h3 className="mb-3 mt-10 text-lg font-bold text-white" style={JAKARTA_FONT}>
            How the opportunity score is built
          </h3>
          <Prose>
            <p>
              Each city is scored 1–5 as a weighted read of four inputs: footfall scale (30%), current budget-supply gap relative to demand (30%), ADR headroom
              versus the ₹2,000–2,500 target band (20%), and ease of land or property acquisition (20%). Ayodhya and Ujjain score highest because they combine
              explosive or imminent demand growth with the widest, most clearly documented supply gaps. Varanasi scores lower despite huge footfall because
              heritage-zone land acquisition is genuinely difficult.
            </p>
          </Prose>
        </ScrollReveal>

        <div className="mt-8">
          <DataTable
            headers={['City', 'Tier', 'Annual footfall', 'Peak months', 'Current supply gap', 'Score', 'Why']}
            columnClasses={['whitespace-nowrap', 'whitespace-nowrap', 'whitespace-nowrap', '', '', 'whitespace-nowrap text-center', '']}
            rows={[
              [
                <Emphasis>Ayodhya, UP</Emphasis>,
                'Tier-1',
                <>
                  13.5 cr<Cite n="1" />
                </>,
                'Jan (anniversary), Oct–Nov (Deepotsav), Ram Navami (Mar–Apr)',
                <>
                  Rooms grew 3,500→5,000 (2020→2025) against a projected need of 12,500 by 2031 — the single widest gap on this list
                  <Cite n="1" />
                </>,
                <Emphasis>5.0</Emphasis>,
                'Fastest-growing footfall base in India post-temple; branded supply still near zero; land prices rising but still below Varanasi',
              ],
              [
                <Emphasis>Varanasi, UP</Emphasis>,
                'Tier-1',
                <>
                  7.26 cr<Cite n="2" />
                </>,
                'Oct–Mar (Dev Deepawali, winter season)',
                <>
                  Near-full occupancy reported across hotels, guesthouses and homestays year-round<Cite n="2" />; budget segment still fragmented and informal
                </>,
                <Emphasis>2.5</Emphasis>,
                'Massive scale, but land near the ghats and corridor is expensive and heritage-zone approvals are slow — acquisition is the binding constraint',
              ],
              [
                <Emphasis>Tirupati / Tirumala, AP</Emphasis>,
                'Tier-1',
                <>
                  2.5 cr<Cite n="3" />
                </>,
                'Sep–Oct (Brahmotsavam), Dec–Jan (Vaikuntha Ekadashi)',
                <>
                  TTD itself runs most budget cottages and choultries at Tirumala; the real white space is in Tirupati town (foothill) where private hotels run
                  ₹1,000–5,000<Cite n="4" />
                </>,
                <Emphasis>3.5</Emphasis>,
                "Predictable, temple-managed queueing gives steady demand; but TTD's own subsidized inventory caps upside on the hill — build in the town, not the hill",
              ],
              [
                <Emphasis>Shirdi, MH</Emphasis>,
                'Tier-1',
                <>
                  ~0.85 cr<Cite n="5" />
                </>,
                'Sep–Nov (Punyatithi / Ram Navami), Diwali',
                <>
                  ~25,000/day average visitors<Cite n="5" /> against a small permanent town of 30,000 residents — accommodation is almost entirely private and
                  unbranded lodges
                </>,
                <Emphasis>4.0</Emphasis>,
                'Single-purpose pilgrim town with almost no non-religious distraction, tight radius, road-connected (no altitude or terrain issues) — easy execution',
              ],
              [
                <Emphasis>Puri, Odisha</Emphasis>,
                'Tier-1',
                '~0.55 cr*',
                'Jun–Jul (Rath Yatra), Dec–Jan',
                <>
                  Beach-tourism overlap inflates ADRs near the seafront; budget dharamshala stock is large but unbranded and basic<Cite n="6" />
                </>,
                <Emphasis>3.0</Emphasis>,
                'Dual demand driver (pilgrimage + beach leisure) smooths seasonality somewhat, but coastal-zone (CRZ) land rules add real regulatory friction',
              ],
              [
                <Emphasis>Madurai, TN</Emphasis>,
                'Tier-1',
                <>
                  ~0.55 cr<Cite n="7" />
                </>,
                'Apr (Chithirai festival), Dec–Jan',
                <>
                  ~15,000 devotees/day<Cite n="7" />; Madurai is also a business and education city, so budget supply is comparatively deeper already
                </>,
                <Emphasis>3.0</Emphasis>,
                'Lowest execution risk (established city infrastructure, easy land, good staffing pool) but also the smallest pure-pilgrim white space of the tier-1 set',
              ],
              [
                <Emphasis>Ujjain, MP</Emphasis>,
                'Underrated',
                '~2.0 cr*',
                <>
                  Jul–Aug (Shravan, &gt;100k/day on Mondays)<Cite n="8" />
                </>,
                <>
                  Government targeting 10,000–15,000 registered homestay rooms by late 2027<Cite n="8" /> ahead of Simhastha 2028
                </>,
                <Emphasis>4.5</Emphasis>,
                'Simhastha 2028 concentrates a projected 10–30 crore pilgrims into roughly one month — the largest single demand event on this list',
              ],
            ]}
            caption={
              <>
                * Reasoned estimate rather than a directly sourced figure. Superscripts refer to the source notes in the attached PDF. Scores are a weighted read
                of footfall (30%), supply gap (30%), ADR headroom (20%) and acquisition ease (20%).
              </>
            }
          />
        </div>
      </Section>

      <Section
        index="2"
        title="Two operating models, sized"
        intro={
          <p>
            Both models assume a lean, no-F&amp;B, no-frills branded format: hot water, daily housekeeping, and a 1–2 person light concierge desk handling
            darshan slot bookings, taxi arrangement and luggage help. Two build paths are costed for each size — a ground-up build on owned or long-leased land,
            and an asset-light lease-and-renovate of an existing structure.
          </p>
        }
      >
        <ScrollReveal>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-lg font-bold text-white" style={JAKARTA_FONT}>
              Model A — 12 keys
            </h3>
            <span className="rounded-full border border-cyan-400/30 bg-cyan-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-cyan-300">
              10–15 key format
            </span>
          </div>
          <Prose>
            <p className="mt-3">
              Right-sized for a secondary pilgrim town, or a Tier-1 town's secondary micro-market away from the immediate temple frontage where land is
              scarcest. A single unit manager can run the property with a lean team.
            </p>
          </Prose>
        </ScrollReveal>

        <div className="mt-6">
          <DataTable
            headers={['Item', 'Lease + renovate', 'Ground-up']}
            columnClasses={['', 'whitespace-nowrap text-right', 'whitespace-nowrap text-right']}
            rows={[
              ['Land', 'N/A (leased)', '₹60L–1.4Cr*'],
              ['Civil / interiors', '₹18–22L', '₹1.1–1.3Cr'],
              ['Plumbing & hot water systems', '₹8–11L', '₹16–20L'],
              ['Furniture & FF&E', '₹14–18L', '₹28–34L'],
              ['Branding / signage', '₹3–4L', '₹8–10L'],
              ['Soft costs (design, PM, licenses, contingency)', '₹7–9L', '₹18–22L'],
              [<Emphasis>Total capex</Emphasis>, <Emphasis>~₹65–75L</Emphasis>, <Emphasis>~₹1.9–2.2Cr</Emphasis>],
              ['Security deposit (lease model, 6–10 mo rent)', '~₹10–15L', '—'],
            ]}
          />
        </div>

        <ScrollReveal>
          <div className="mt-12 flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-lg font-bold text-white" style={JAKARTA_FONT}>
              Model B — 25 keys
            </h3>
            <span className="rounded-full border border-violet-400/30 bg-violet-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-violet-300">
              Scale format
            </span>
          </div>
          <Prose>
            <p className="mt-3">
              Justifies a full-time unit manager, a dedicated maintenance role, and better OTA and marketing economics per key. Best suited to Tier-1 towns with
              sustained footfall — Ayodhya, Varanasi, Tirupati, and Ujjain pre-Simhastha.
            </p>
          </Prose>
        </ScrollReveal>

        <div className="mt-6">
          <DataTable
            headers={['Item', 'Lease + renovate', 'Ground-up']}
            columnClasses={['', 'whitespace-nowrap text-right', 'whitespace-nowrap text-right']}
            rows={[
              ['Land', 'N/A (leased)', '₹1.3–2.8Cr*'],
              ['Civil / interiors', '₹38–45L', '₹2.3–2.7Cr'],
              ['Plumbing & hot water systems', '₹16–20L', '₹34–40L'],
              ['Furniture & FF&E', '₹30–38L', '₹58–68L'],
              ['Branding / signage', '₹5–7L', '₹14–18L'],
              ['Soft costs (design, PM, licenses, contingency)', '₹15–18L', '₹38–45L'],
              [<Emphasis>Total capex</Emphasis>, <Emphasis>~₹1.4–1.7Cr</Emphasis>, <Emphasis>~₹4.1–4.6Cr</Emphasis>],
              ['Security deposit (lease model, 6–10 mo rent)', '~₹18–24L', '—'],
            ]}
            caption={
              <>
                Bottom-up estimates built for a no-frills, no-F&amp;B branded format — deliberately leaner than Hotelivate–Savills' 2025 industry-wide benchmark
                of ~₹1.04Cr median / ~₹1.36Cr average per key, which spans midscale-to-luxury full-service prototypes with much larger room footprints and public
                areas. *Land costs vary 3–5x by town and by proximity to the temple corridor — treat as illustrative only, and get three local quotes before
                underwriting.
              </>
            }
          />
        </div>

        <ScrollReveal>
          <h3 className="mb-3 mt-12 text-lg font-bold text-white" style={JAKARTA_FONT}>
            The phased asset-light path
          </h3>
          <Prose>
            <p>
              For a first property, or for entering a town where land ownership is contentious — many pilgrim towns have trust-owned or disputed parcels — a
              phased lease-and-renovate approach de-risks the entry.
            </p>
          </Prose>
        </ScrollReveal>

        <div className="mt-6">
          <PhaseTimeline
            phases={[
              {
                phase: '0',
                timeline: 'Month 0–2',
                action:
                  'Identify an existing 2–3 star lodge or large residential structure within 1.5km of the main darshan route; negotiate a 9-year lease (Section 106 leave-and-license or registered lease) with a 3-year lock-in.',
              },
              {
                phase: '1',
                timeline: 'Month 2–4',
                action:
                  'Renovate 6–8 rooms first — plumbing, hot water, paint, branding, one shared concierge desk — then open and start generating cash while the rest is under renovation.',
              },
              {
                phase: '2',
                timeline: 'Month 4–6',
                action: 'Complete the remaining rooms using Phase 1 cash flow plus remaining capex; onboard OTA listings and the direct booking channel.',
              },
              {
                phase: '3',
                timeline: 'Month 12–18',
                action:
                  'Once the unit is stabilized (proof of concept plus local reputation), evaluate a second town or a ground-up build in the same town on freehold land, using retained earnings and a smaller debt ticket.',
              },
            ]}
          />
        </div>

        <Callout title="The trade-off">
          This phased path cuts Day-1 capital at risk by roughly 60–70% versus ground-up, at the cost of a rent line that never goes away and a lease-renewal risk
          at year 9. It is the more realistic entry point for a first-time operator in this category.
        </Callout>
      </Section>

      <Section
        index="3"
        title="Monthly operating cost breakdown"
        intro={
          <p>
            Staffing is the single biggest controllable lever in this format. Wage bands reflect typical small-town (non-metro Tier-2/3) hospitality pay as of
            2025–26 — flagged as estimate; validate against local minimum-wage notifications, which vary by state.
          </p>
        }
      >
        <ScrollReveal>
          <h3 className="mb-4 text-lg font-bold text-white" style={JAKARTA_FONT}>
            Model A — 12 keys
          </h3>
        </ScrollReveal>
        <DataTable
          headers={['Role', 'Count', '₹/mo each', 'Monthly total']}
          columnClasses={['', 'text-center whitespace-nowrap', 'text-right whitespace-nowrap', 'text-right whitespace-nowrap']}
          rows={[
            ['Unit manager', '1', '20–25K', '₹22K'],
            ['Front desk / concierge (2 shifts)', '2', '13–15K', '₹28K'],
            ['Housekeeping', '2', '10–12K', '₹22K'],
            ['Caretaker-cum-night security', '2', '10–12K', '₹22K'],
            [<Emphasis>Staffing subtotal</Emphasis>, <Emphasis>7</Emphasis>, '', <Emphasis>~₹91K</Emphasis>],
            ['Utilities (power + water, incl. geysers)', '', '', '₹35–45K'],
            ['Housekeeping / laundry consumables', '', '', '₹25–35K'],
            ['Repairs & maintenance', '', '', '₹15–20K'],
            ['OTA / booking commission (blended)', '', '', '~11% of rev.'],
            ['Marketing (local + digital)', '', '', '₹15–20K'],
            ['Insurance (property + liability)', '', '', '₹8–10K'],
            ['Municipal / trade license / FSSAI / renewals', '', '', '₹8–12K'],
            ['Brand / franchise royalty (if branded)', '', '', '~6% of rev.'],
            ['Lease rent (lease + renovate model only)', '', '', '₹80K–1.0L'],
          ]}
        />

        <ScrollReveal>
          <h3 className="mb-4 mt-12 text-lg font-bold text-white" style={JAKARTA_FONT}>
            Model B — 25 keys
          </h3>
        </ScrollReveal>
        <DataTable
          headers={['Role', 'Count', '₹/mo each', 'Monthly total']}
          columnClasses={['', 'text-center whitespace-nowrap', 'text-right whitespace-nowrap', 'text-right whitespace-nowrap']}
          rows={[
            ['Unit manager', '1', '25–30K', '₹28K'],
            ['Front office (3 incl. relief)', '3', '13–16K', '₹43K'],
            ['Housekeeping', '4', '10–12K', '₹44K'],
            ['Maintenance / handyman', '1', '12–15K', '₹13K'],
            ['Security / caretaker (night)', '2', '10–12K', '₹22K'],
            ['Concierge / guest relations', '1', '13–15K', '₹14K'],
            [<Emphasis>Staffing subtotal</Emphasis>, <Emphasis>12</Emphasis>, '', <Emphasis>~₹168K</Emphasis>],
            ['Utilities (power + water, incl. geysers)', '', '', '₹70–90K'],
            ['Housekeeping / laundry consumables', '', '', '₹50–70K'],
            ['Repairs & maintenance', '', '', '₹30–40K'],
            ['OTA / booking commission (blended)', '', '', '~11% of rev.'],
            ['Marketing (local + digital)', '', '', '₹25–35K'],
            ['Insurance (property + liability)', '', '', '₹15–18K'],
          ]}
          caption="Model B's opex table is transcribed as far as the source document lists it; the source's per-line detail ends at insurance."
        />
      </Section>

      <Section
        index="4"
        title="Revenue and financial model"
        intro={
          <p>
            Modeled at a blended ADR of ₹2,200, the midpoint of the ₹2,000–2,500 target band. Peak season occupancy of 80–90% and lean season 40–55% blend to a
            stabilized annual average of around 65%.
          </p>
        }
      >
        <StatRow>
          <StatTile value="65–68%" label="Stabilized annual occupancy" />
          <StatTile value="~40%" label="Monthly breakeven occupancy (lease model)" accent="cyan" />
          <StatTile value="18–24 mo" label="Time to reach stabilized occupancy" />
          <StatTile value="30–45%" label="EBITDA margin range (lease vs. owned)" accent="cyan" />
        </StatRow>

        <ScrollReveal>
          <h3 className="mb-4 mt-10 text-lg font-bold text-white" style={JAKARTA_FONT}>
            Stabilized-year P&amp;L, both models
          </h3>
        </ScrollReveal>
        <DataTable
          headers={['Metric', 'Model A (12 keys)', 'Model B (25 keys)']}
          columnClasses={['', 'text-right whitespace-nowrap', 'text-right whitespace-nowrap']}
          rows={[
            ['Room-nights available / year', '4,380', '9,125'],
            ['Stabilized occupancy', '65%', '65%'],
            ['Room-nights sold / year', '~2,850', '~5,930'],
            ['Blended ADR', '₹2,200', '₹2,200'],
            [<Emphasis>Annual revenue</Emphasis>, <Emphasis>~₹62.6L</Emphasis>, <Emphasis>~₹1.30Cr</Emphasis>],
            ['Monthly revenue (avg)', '~₹5.2L', '~₹10.9L'],
            ['Total opex excl. rent', '~₹36.5L/yr', '~₹71.1L/yr'],
            [
              <Emphasis>EBITDA — owned / ground-up (no rent line)</Emphasis>,
              <Emphasis>~₹25.9L/yr (41%)</Emphasis>,
              <Emphasis>~₹59.7L/yr (46%)</Emphasis>,
            ],
            ['Lease rent (asset-light model)', '~₹10.8L/yr', '~₹21L/yr'],
            [<Emphasis>EBITDA — lease + renovate</Emphasis>, <Emphasis>~₹15.1L/yr (24%)</Emphasis>, <Emphasis>~₹38.7L/yr (30%)</Emphasis>],
          ]}
          caption="Opex excluding rent covers staffing, utilities, housekeeping, OTA commission, marketing, insurance, licenses and brand fee."
        />

        <Callout title="Reading the payback">
          The lease-and-renovate path is 2–2.5 years faster to payback despite a lower absolute EBITDA margin, because the capital at risk is 60–70% lower. Scale
          (Model B) improves payback in the lease structure meaningfully more than in the ground-up structure — staffing and utilities don't scale linearly with
          keys, but land and shell construction do.
        </Callout>
      </Section>

      <Section index="5" title="Key risks specific to pilgrimage towns">
        <div className="space-y-4">
          <NumberedCard number="01" title="Extreme, calendar-driven seasonality">
            Unlike business or leisure hotels, demand here is tied to lunar-calendar festival dates that shift every year (Ekadashi cycles, Brahmotsavam, Shravan
            Mondays). A property built for one town's rhythm cannot simply copy another's — Puri's Rath Yatra and Ujjain's Simhastha both concentrate enormous
            demand into narrow windows, a blessing for peak ADR but a real cash-flow risk in the 5–7 lean months. A working capital buffer of at least three lean
            months' fixed costs is a reasonable planning minimum.
          </NumberedCard>
          <NumberedCard number="02" title="Land title, trust ownership and regulatory friction">
            A meaningful share of land near temple corridors is trust-owned, endowment (devasthanam) land, or under heritage/CRZ restrictions — as in Puri's
            coastal zone or Varanasi's heritage corridor. Title diligence takes materially longer here than in a standard urban market: budget 3–6 extra months
            versus a typical Tier-2 city acquisition, and prefer leasehold structures until title is fully clean.
          </NumberedCard>
          <NumberedCard number="03" title="Brand trust has to be earned town by town">
            Pilgrims are a conservative, word-of-mouth-driven customer base, often visiting with elderly family members and prioritizing perceived safety and
            predictability over novelty. A national brand name means little on the ground in month 1 — trust is built through consistent hot water, honest pricing
            with no festival-week gouging, and visible cleanliness, reinforced by temple-priest and local travel-agent referral relationships more than digital
            marketing.
          </NumberedCard>
          <NumberedCard number="04" title="Small-town staffing depth and turnover">
            Trained hospitality staff — multi-skilled housekeeping, basic English/Hindi front-desk service — are scarcer outside metro labor pools, and turnover is
            higher when staff can shift to family agriculture cycles or migrate to bigger cities. Plan for a longer hiring runway of 60–90 days pre-opening,
            in-house training rather than lateral hires, and modestly above-market wages to reduce churn. The wage bands in Section 3 sit at the higher end of
            local norms deliberately.
          </NumberedCard>
          <NumberedCard number="05" title="Concentration and event risk">
            Single-deity, single-event towns (Shirdi, Rameswaram, and Ujjain outside Simhastha years) carry more concentrated risk than multi-driver towns such as
            Puri with its beach tourism or Madurai with its broader city economy. A single adverse event — temple renovation closure, a security incident, or a
            shift in a Sansthan trust's darshan policy — can move footfall materially in a way that diversified-demand cities absorb more easily.
          </NumberedCard>
        </div>
      </Section>

      <Section
        index="6"
        title="Worked example — Ayodhya, 15 keys"
        intro={
          <p>
            Ayodhya tops the opportunity score for a reason: footfall crossed 13.5 crore in the most recent full year on record while branded room supply remains
            under 40% of the room count the market is projected to need by 2031. This case study runs a 15-key lease-and-renovate property end to end.
          </p>
        }
      >
        <div className="grid gap-4 md:grid-cols-3">
          <FactCard label="Site">1.2 km from the Ram Mandir darshan route; leased 2-star lodge structure, 15 rooms plus a small lobby and concierge desk.</FactCard>
          <FactCard label="Capex">~₹82L total (interiors, hot water and plumbing, FF&amp;E, branding, soft costs) plus ₹13L security deposit — ~₹95L all-in.</FactCard>
          <FactCard label="Target ADR">₹2,300 blended. Ayodhya's supply gap supports pricing toward the upper half of the ₹2,000–2,500 band.</FactCard>
        </div>

        <div className="mt-8">
          <DataTable
            headers={['Line item', 'Monthly (stabilized)', 'Annual (stabilized)']}
            columnClasses={['', 'text-right whitespace-nowrap', 'text-right whitespace-nowrap']}
            rows={[
              ['Room-nights sold (15 keys, 66% occupancy)', '~301', '~3,613'],
              [<Emphasis>Revenue (₹2,300 ADR)</Emphasis>, <Emphasis>₹6.92L</Emphasis>, <Emphasis>₹83.1L</Emphasis>],
              ['Staffing (8 heads incl. dedicated darshan/taxi concierge)', '₹1.05L', '₹12.6L'],
              ['Utilities, housekeeping, maintenance', '₹1.0L', '₹12.0L'],
              ['OTA commission (~11% blended)', '₹0.76L', '₹9.1L'],
              ['Marketing, insurance, municipal / license', '₹0.45L', '₹5.4L'],
              ['Brand / franchise royalty (~6%)', '₹0.42L', '₹5.0L'],
              ['Lease rent', '₹1.05L', '₹12.6L'],
              [<Emphasis>EBITDA</Emphasis>, <Emphasis>₹2.19L (~32%)</Emphasis>, <Emphasis>~₹26.3L</Emphasis>],
            ]}
          />
        </div>
      </Section>

      <Section index="7" title="Adapting this for your own underwriting">
        <CheckList
          items={[
            <>
              <Emphasis>Re-run Section 4's P&amp;L with local numbers.</Emphasis> Get three real lease quotes and two real construction quotes for your
              shortlisted town before trusting any capex figure in this document.
            </>,
            <>
              <Emphasis>Validate footfall with the local tourism department or temple trust directly.</Emphasis> The estimates flagged in Section 1 are reasoned
              from partial data and can be off by 20–30% in either direction.
            </>,
            <>
              <Emphasis>Talk to two or three existing budget lodge owners in the town</Emphasis> about actual achieved ADR and occupancy — posted rates and
              achieved rates diverge significantly in most of these markets.
            </>,
            <>
              <Emphasis>Start with the lease-and-renovate path</Emphasis> unless you already own land in the town. The payback and capital-at-risk math strongly
              favors it for a first property.
            </>,
            <>
              <Emphasis>Time your launch to a peak season.</Emphasis> The case study shows how much faster breakeven arrives when month 1–2 coincides with a major
              festival window rather than a lean month.
            </>,
          ]}
        />

        <Callout tone="warning" title="Not investment advice">
          This document is a starting model for research and content purposes, not investment advice. Land, licensing, and construction costs in pilgrimage towns
          move quickly with infrastructure announcements — new expressways, airport upgrades, corridor projects. Treat every number here as a planning baseline to
          be re-verified at the point of decision.
        </Callout>
      </Section>
    </>
  )
}
