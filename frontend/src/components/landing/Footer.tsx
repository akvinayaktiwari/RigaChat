import { LinkedInIcon, WhatsAppIcon, XIcon, ZohoIcon } from './BrandIcons'
import { FREE_TOOLS, TOOLS_HUB } from '../../lib/free-tools'
import { SOCIAL_PROFILES, type SocialProfile } from '../../lib/social-profiles'
import VyostraLogo from '../VyostraLogo'

const LINK_COLUMNS = [
  {
    heading: 'Product',
    links: [
      { label: 'Features', href: '/features' },
      { label: 'Integrations', href: '/integrations' },
      { label: 'For Real Estate', href: '/industries/real-estate' },
      { label: 'Pricing', href: '/pricing' },
      { label: 'FAQ', href: '/faq' },
    ],
  },
  {
    heading: 'Free Tools',
    links: [...FREE_TOOLS.map((tool) => ({ label: tool.name, href: tool.route })), { label: 'All free tools', href: TOOLS_HUB.route }],
  },
  {
    heading: 'Company',
    links: [
      { label: 'About Us', href: '/about-us' },
      { label: 'Blog', href: '/blog' },
      { label: 'Help Center', href: '/help' },
      { label: 'Developer Docs', href: '/docs' },
      { label: 'Careers', href: '/careers' },
      { label: 'Contact Us', href: '/contact' },
    ],
  },
  {
    heading: 'Legal',
    links: [
      { label: 'Privacy Policy', href: '/privacy-policy' },
      { label: 'Terms of Service', href: '/terms-of-service' },
    ],
  },
]

const SOCIAL_ICONS: Record<SocialProfile['id'], (props: { className?: string }) => JSX.Element> = {
  linkedin: LinkedInIcon,
  x: XIcon,
}

/**
 * The company's profiles, as icon links. Each is a 44px target with a name a
 * screen reader can say; the icon alone names nothing. rel="me" marks the
 * profile as ours, the same claim the Organization schema makes with sameAs.
 */
function SocialLinks() {
  return (
    <ul className="mt-5 flex items-center gap-2">
      {SOCIAL_PROFILES.map((profile) => {
        const Icon = SOCIAL_ICONS[profile.id]
        return (
          <li key={profile.id}>
            <a
              href={profile.url}
              target="_blank"
              rel="me noopener noreferrer"
              aria-label={`Vyostra AI on ${profile.network}`}
              className="flex h-11 w-11 items-center justify-center rounded-full border border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 transition-colors"
            >
              <Icon className="h-4 w-4" />
            </a>
          </li>
        )
      })}
    </ul>
  )
}

export default function Footer() {
  return (
    <footer className="border-t border-gray-100 py-12 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-8 mb-12">
          <div className="col-span-2 md:col-span-3 lg:col-span-2">
            <a href="/" className="flex items-center gap-2.5 mb-4">
              <VyostraLogo size={32} animate={false} />
              <span className="font-bold text-gray-900 text-lg" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                Vyostra AI
              </span>
            </a>
            <p className="text-sm text-gray-500 leading-relaxed max-w-56">
              AI chat, voice and WhatsApp agents with a built-in lead CRM.
            </p>
            <SocialLinks />
          </div>

          {LINK_COLUMNS.map((col) => (
            <div key={col.heading}>
              <p
                className="font-semibold text-gray-900 text-sm mb-4"
                style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
              >
                {col.heading}
              </p>
              <ul className="space-y-3">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <a href={link.href} className="text-sm text-gray-500 hover:text-gray-900 transition-colors">
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="border-t border-gray-100 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-gray-500">© 2026 Vyostra AI, a product of Aashirwad Trading Enterprises. All rights reserved.</p>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <WhatsAppIcon className="w-3.5 h-3.5 text-green-600" />
              WhatsApp
            </div>
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <ZohoIcon className="w-3.5 h-3.5 text-red-600" />
              Zoho
            </div>
            <span className="text-gray-500 text-xs">+2 more</span>
          </div>
        </div>
      </div>
    </footer>
  )
}
