const STEPS = [
  {
    step: '01',
    title: 'Create your bot',
    description:
      'Add your website URL. Our AI crawler visits every page, extracts content, and builds your chatbot’s knowledge base in minutes.',
  },
  {
    step: '02',
    title: 'Configure & embed',
    description:
      'Customize your chatbot’s appearance, set up lead capture fields, and embed with one line of code. Connect WhatsApp or your CRM in one click.',
  },
  {
    step: '03',
    title: 'Go live and capture leads',
    description:
      'Your chatbot answers questions 24/7, captures leads automatically, and syncs everything to your CRM dashboard in real time.',
  },
]

export default function HowItWorksSection() {
  return (
    <section id="how-it-works" className="py-24 px-4">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-16">
          <p className="text-sm font-semibold text-violet-600 uppercase tracking-widest mb-3">How it works</p>
          <h2
            className="text-4xl sm:text-5xl font-extrabold text-gray-900 tracking-tight"
            style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
          >
            From zero to live <br className="hidden sm:block" />
            in three steps
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
          <div className="hidden md:block absolute top-10 left-1/3 right-1/3 h-px bg-linear-to-r from-transparent via-violet-200 to-transparent" />

          {STEPS.map((item, i) => (
            <div key={item.step} className="relative">
              <div className="w-14 h-14 rounded-2xl bg-linear-to-br from-violet-600 to-purple-500 flex items-center justify-center mb-5 shadow-lg shadow-violet-200/60">
                <span
                  className="text-white font-extrabold text-sm"
                  style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
                >
                  {item.step}
                </span>
              </div>

              <h3
                className="font-bold text-gray-900 text-xl mb-3"
                style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
              >
                {item.title}
              </h3>
              <p className="text-gray-500 text-sm leading-relaxed">{item.description}</p>

              {i < STEPS.length - 1 && (
                <div className="md:hidden flex items-center justify-center py-4">
                  <div className="w-px h-8 bg-violet-200" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
