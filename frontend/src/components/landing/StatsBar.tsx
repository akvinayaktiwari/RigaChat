const STATS = [
  { value: '50,000+', label: 'Leads captured' },
  { value: '3 min', label: 'Average setup time' },
  { value: '94%', label: 'Resolution rate' },
  { value: '500+', label: 'Businesses live' },
]

export default function StatsBar() {
  return (
    <section className="py-12 px-4 border-y border-gray-100/80">
      <div className="max-w-5xl mx-auto grid grid-cols-2 lg:grid-cols-4 gap-8">
        {STATS.map((stat) => (
          <div key={stat.label} className="text-center">
            <p
              className="text-3xl font-extrabold text-gray-900 mb-1"
              style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
            >
              {stat.value}
            </p>
            <p className="text-sm text-gray-500">{stat.label}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
