import { useState, useMemo } from 'react'
import {
  Rocket,
  MessageSquare,
  Cpu,
  Users,
  Receipt,
  Search,
  Mail,
  ChevronDown,
  ChevronUp,
  HelpCircle,
  LifeBuoy,
  X,
} from 'lucide-react'
import Navbar from '../components/landing/Navbar'
import Footer from '../components/landing/Footer'
import DemoModal from '../components/landing/modals/DemoModal'

interface HelpCategory {
  id: string
  label: string
  icon: 'Rocket' | 'MessageSquare' | 'Cpu' | 'Users' | 'Receipt'
  description: string
}

interface HelpArticle {
  id: string
  categoryId: string
  question: string
  answer: string
}

const HELP_CATEGORIES: HelpCategory[] = [
  {
    id: 'getting-started',
    label: 'Getting Started',
    icon: 'Rocket',
    description: 'Set up your chatbot and start capturing leads in under 5 minutes.',
  },
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    icon: 'MessageSquare',
    description: 'Configure lead notifications and weekly reports via WhatsApp.',
  },
  {
    id: 'integrations',
    label: 'Integrations',
    icon: 'Cpu',
    description: 'Connect Zoho CRM and other tools to sync leads automatically.',
  },
  {
    id: 'leads',
    label: 'Leads and Forms',
    icon: 'Users',
    description: 'Manage lead capture, form builder, and lead dashboard.',
  },
  {
    id: 'billing',
    label: 'Billing and Plans',
    icon: 'Receipt',
    description: 'Plans, pricing, and subscription management.',
  },
]

const HELP_ARTICLES: HelpArticle[] = [
  {
    id: 'art-1',
    categoryId: 'getting-started',
    question: 'How do I create my first chatbot?',
    answer:
      'Go to Chatbots in the sidebar and click Create New Bot. Enter your website URL and BeepBoop trains your AI chatbot automatically. It takes under 5 minutes.',
  },
  {
    id: 'art-2',
    categoryId: 'getting-started',
    question: 'How do I embed the chat widget on my website?',
    answer:
      'After creating your bot, go to bot settings and copy the embed code. Paste it before the closing body tag on your website. The widget appears immediately.',
  },
  {
    id: 'art-3',
    categoryId: 'getting-started',
    question: 'What is the knowledge base?',
    answer:
      'The knowledge base is the information your chatbot uses to answer questions. BeepBoop builds it automatically from your website URL. You can also add custom entries manually.',
  },
  {
    id: 'art-4',
    categoryId: 'whatsapp',
    question: 'How do I set up WhatsApp notifications?',
    answer:
      'Go to WhatsApp in the sidebar, click Connect WhatsApp, enter your Gupshup API key and phone number, then enable Lead Notifications.',
  },
  {
    id: 'art-5',
    categoryId: 'whatsapp',
    question: 'What is Gupshup and do I need an account?',
    answer:
      'Gupshup is a WhatsApp Business API provider. Sign up free at platform.gupshup.io, create an app, and paste your API key into BeepBoop.',
  },
  {
    id: 'art-6',
    categoryId: 'whatsapp',
    question: 'How do weekly reports work?',
    answer:
      'After connecting WhatsApp, enable Weekly Reports. You receive a summary every Monday at 9am IST covering leads, conversations, and top bots.',
  },
  {
    id: 'art-7',
    categoryId: 'integrations',
    question: 'How do I connect Zoho CRM?',
    answer:
      'Go to Settings, Integrations, Zoho CRM, Connect. Authorize BeepBoop in Zoho. All new leads sync automatically after that.',
  },
  {
    id: 'art-8',
    categoryId: 'integrations',
    question: 'Which CRMs does BeepBoop support?',
    answer: 'BeepBoop currently supports Zoho CRM. HubSpot and Salesforce are coming soon.',
  },
  {
    id: 'art-9',
    categoryId: 'leads',
    question: 'Where do I see my captured leads?',
    answer: 'All leads appear in the Leads section of your dashboard. Filter by date, bot, source, and status.',
  },
  {
    id: 'art-10',
    categoryId: 'leads',
    question: 'How do I create a lead capture form?',
    answer: 'Go to Forms in the sidebar, click Create Form, add your fields, and copy the embed code. Forms work independently of chatbots.',
  },
  {
    id: 'art-11',
    categoryId: 'billing',
    question: 'Is there a free trial?',
    answer: 'Yes. BeepBoop is free to start. No credit card required.',
  },
  {
    id: 'art-12',
    categoryId: 'billing',
    question: 'Can I change my plan later?',
    answer: 'Yes. Upgrade or downgrade anytime from Settings, Subscription Plans.',
  },
  {
    id: 'art-13',
    categoryId: 'billing',
    question: 'How do I cancel?',
    answer: 'Cancel anytime from Settings. Your account stays active until end of billing period.',
  },
]

function renderCategoryIcon(icon: HelpCategory['icon'], className = 'w-6 h-6') {
  switch (icon) {
    case 'Rocket':
      return <Rocket className={className} />
    case 'MessageSquare':
      return <MessageSquare className={className} />
    case 'Cpu':
      return <Cpu className={className} />
    case 'Users':
      return <Users className={className} />
    default:
      return <Receipt className={className} />
  }
}

function HelpHero({ searchQuery, onSearchChange }: { searchQuery: string; onSearchChange: (v: string) => void }) {
  return (
    <section className="relative py-16 md:py-24 overflow-hidden bg-gradient-to-br from-surface-container-high/80 via-surface to-background border-b border-outline-variant/30 rounded-3xl mb-12 text-center px-6">
      <div className="relative z-10 max-w-3xl mx-auto">
        <div className="flex items-center justify-center gap-2 mb-4">
          <LifeBuoy className="w-6 h-6 text-primary" />
          <span className="text-sm font-bold uppercase tracking-wider text-primary">BeepBoop Support Suite</span>
        </div>
        <h1 className="text-4xl md:text-5xl font-extrabold text-on-surface mb-5 tracking-tight">
          Help Center &amp; Knowledge Base
        </h1>
        <p className="text-base md:text-lg text-on-surface-variant max-w-2xl mx-auto mb-8 leading-relaxed">
          Search articles, explore features, and find answers to get the most out of BeepBoop.
        </p>
        <div className="relative max-w-2xl mx-auto w-full group">
          <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-primary w-5 h-5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full h-16 pl-13 pr-16 bg-white border border-outline-variant/60 focus:border-primary rounded-2xl shadow-sm focus:outline-hidden focus:ring-4 focus:ring-primary/10 text-on-surface text-sm md:text-base transition-all placeholder:text-outline"
            placeholder="Search for answers, guides, integration keys..."
            id="help-search-input"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-5 top-1/2 -translate-y-1/2 text-outline hover:text-primary transition-colors cursor-pointer"
              aria-label="Clear search"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>
    </section>
  )
}

function CategoryGrid({
  selectedCategoryId,
  onSelect,
}: {
  selectedCategoryId: string | null
  onSelect: (id: string) => void
}) {
  return (
    <section className="mb-12">
      <h2 className="text-xl md:text-2xl font-extrabold text-on-surface mb-6">Explore Help Categories</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {HELP_CATEGORIES.map((category) => {
          const isSelected = selectedCategoryId === category.id
          return (
            <button
              key={category.id}
              onClick={() => onSelect(category.id)}
              className={`p-6 text-left border rounded-2xl transition-all duration-300 hover:-translate-y-1 cursor-pointer flex flex-col gap-4 ${
                isSelected
                  ? 'bg-primary border-primary text-white shadow-md shadow-primary/25'
                  : 'bg-white border-outline-variant/30 text-on-surface hover:shadow-md'
              }`}
              id={`cat-card-${category.id}`}
            >
              <div
                className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                  isSelected ? 'bg-white/20 text-white' : 'bg-primary/10 text-primary'
                }`}
              >
                {renderCategoryIcon(category.icon)}
              </div>
              <div>
                <h3 className="font-bold text-base leading-snug">{category.label}</h3>
                <p className={`text-xs mt-1.5 leading-relaxed ${isSelected ? 'text-white/85' : 'text-on-surface-variant'}`}>
                  {category.description}
                </p>
              </div>
            </button>
          )
        })}
      </div>
    </section>
  )
}

function ArticleAccordion({ article, isExpanded, onToggle }: { article: HelpArticle; isExpanded: boolean; onToggle: () => void }) {
  const categoryLabel = HELP_CATEGORIES.find((cat) => cat.id === article.categoryId)?.label ?? article.categoryId
  return (
    <div
      className="bg-white border border-outline-variant/30 rounded-2xl overflow-hidden shadow-xs hover:shadow-sm transition-all duration-200"
      id={`article-accordion-${article.id}`}
    >
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-6 text-left font-bold text-on-surface hover:text-primary transition-colors cursor-pointer"
      >
        <div className="flex items-start gap-3.5 pr-4">
          <span className="text-xs px-2.5 py-1 bg-surface-container-high rounded-lg text-outline font-semibold uppercase tracking-wider shrink-0 mt-0.5">
            {categoryLabel}
          </span>
          <span className="text-base font-bold leading-snug">{article.question}</span>
        </div>
        {isExpanded ? (
          <ChevronUp className="w-5 h-5 text-primary shrink-0" />
        ) : (
          <ChevronDown className="w-5 h-5 text-outline shrink-0" />
        )}
      </button>
      <div className={`transition-all duration-300 overflow-hidden ${isExpanded ? 'max-h-96 border-t border-outline-variant/20' : 'max-h-0'}`}>
        <div className="p-6 bg-surface-container-low/40 text-on-surface-variant text-sm md:text-base leading-relaxed">
          {article.answer}
        </div>
      </div>
    </div>
  )
}

function ArticlesList({ articles, expandedId, onToggle }: { articles: HelpArticle[]; expandedId: string | null; onToggle: (id: string) => void }) {
  if (articles.length === 0) {
    return (
      <div className="text-center p-12 bg-white border border-outline-variant/30 rounded-2xl shadow-xs">
        <HelpCircle className="w-12 h-12 text-outline mx-auto mb-4" />
        <h3 className="text-lg font-bold text-on-surface mb-2">No Articles Found</h3>
        <p className="text-on-surface-variant max-w-sm mx-auto text-sm leading-relaxed">
          Try adjusting your search terms or category selection.
        </p>
      </div>
    )
  }
  return (
    <div className="space-y-4">
      {articles.map((article) => (
        <ArticleAccordion key={article.id} article={article} isExpanded={expandedId === article.id} onToggle={() => onToggle(article.id)} />
      ))}
    </div>
  )
}

function SupportCta() {
  return (
    <section className="bg-on-surface rounded-[2rem] p-8 md:p-12 text-center text-white relative overflow-hidden shadow-md">
      <div className="relative z-10 max-w-2xl mx-auto">
        <h2 className="text-2xl md:text-3xl font-extrabold text-white mb-4">Still need help?</h2>
        <p className="text-sm md:text-base text-white/80 max-w-xl mx-auto mb-8 leading-relaxed">
          Our team is available to help with any questions about BeepBoop.
        </p>
        <div className="flex flex-wrap justify-center gap-4">
          <a
            href="mailto:admin@drsyeta.in"
            className="bg-primary hover:bg-primary-container text-white px-8 py-4 rounded-xl text-sm font-bold flex items-center gap-2.5 hover:shadow-md transition-all cursor-pointer shadow-sm"
            id="cta-email-support"
          >
            <Mail className="w-4 h-4" />
            <span>Contact Support</span>
          </a>
          <a
            href="mailto:admin@drsyeta.in"
            className="bg-white/10 hover:bg-white/20 text-white border border-white/20 px-8 py-4 rounded-xl text-sm font-bold flex items-center gap-2.5 transition-all cursor-pointer"
            id="cta-book-demo"
          >
            <span>Book a Demo</span>
          </a>
        </div>
      </div>
    </section>
  )
}

export default function Help() {
  const [isDemoOpen, setIsDemoOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)
  const [expandedArticleId, setExpandedArticleId] = useState<string | null>(null)

  const filteredArticles = useMemo(() => {
    const query = searchQuery.toLowerCase().trim()
    return HELP_ARTICLES.filter((article) => {
      const matchesCategory = selectedCategoryId ? article.categoryId === selectedCategoryId : true
      const matchesSearch = query
        ? article.question.toLowerCase().includes(query) || article.answer.toLowerCase().includes(query)
        : true
      return matchesCategory && matchesSearch
    })
  }, [selectedCategoryId, searchQuery])

  function handleSelectCategory(id: string) {
    setSelectedCategoryId((prev) => (prev === id ? null : id))
    setExpandedArticleId(null)
  }

  function handleToggleArticle(id: string) {
    setExpandedArticleId((prev) => (prev === id ? null : id))
  }

  return (
    <div className="landing-page bg-background">
      <Navbar onOpenDemo={() => setIsDemoOpen(true)} />

      <main className="pt-36 pb-24 px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <HelpHero searchQuery={searchQuery} onSearchChange={setSearchQuery} />
          <CategoryGrid selectedCategoryId={selectedCategoryId} onSelect={handleSelectCategory} />
          <section className="mb-16">
            <ArticlesList articles={filteredArticles} expandedId={expandedArticleId} onToggle={handleToggleArticle} />
          </section>
          <SupportCta />
        </div>
      </main>

      <Footer />
      <DemoModal isOpen={isDemoOpen} onClose={() => setIsDemoOpen(false)} />
    </div>
  )
}
