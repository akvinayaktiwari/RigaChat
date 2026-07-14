import { Star } from 'lucide-react'

// TODO: replace with real customer testimonials
const TESTIMONIALS = [
  {
    quote:
      'We set up the AI agent in under 5 minutes. It now handles 70% of our after-hours inquiries and the leads go straight into our CRM.',
    author: 'Rahul M.',
    role: 'Real Estate Developer, Bengaluru',
    avatar: 'RM',
    avatarColor: 'from-violet-500 to-purple-600',
  },
  {
    quote:
      'The Zoho integration alone saved us 2 hours a day. Leads from the AI agent sync automatically — no manual entry.',
    author: 'Priya S.',
    role: 'Marketing Head, EdTech Startup',
    avatar: 'PS',
    avatarColor: 'from-amber-400 to-orange-500',
  },
  {
    quote: 'Deployed on our clinic website in minutes. Patients can now book appointments and get FAQs answered at 2am.',
    author: 'Dr. Ankit V.',
    role: 'Healthcare Clinic Owner',
    avatar: 'AV',
    avatarColor: 'from-emerald-400 to-teal-500',
  },
]

export default function TestimonialsSection() {
  return (
    <section className="py-24 px-4 bg-gray-50/60">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-14">
          <p className="text-sm font-semibold text-violet-600 uppercase tracking-widest mb-3">Testimonials</p>
          <h2
            className="text-4xl sm:text-5xl font-extrabold text-gray-900 tracking-tight"
            style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
          >
            Teams that already <br className="hidden sm:block" />
            switched
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {TESTIMONIALS.map((t) => (
            <div
              key={t.author}
              className="bg-white border border-black/5 rounded-2xl p-6 hover:shadow-lg hover:shadow-black/5 transition-all duration-300"
            >
              <div className="flex gap-0.5 mb-5">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="w-4 h-4 fill-amber-400 text-amber-400" />
                ))}
              </div>
              <p className="text-gray-700 text-sm leading-relaxed mb-6">&quot;{t.quote}&quot;</p>
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-full bg-linear-to-br ${t.avatarColor} flex items-center justify-center text-white text-xs font-bold shrink-0`}
                >
                  {t.avatar}
                </div>
                <div>
                  <p className="font-semibold text-gray-900 text-sm">{t.author}</p>
                  <p className="text-xs text-gray-500">{t.role}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
