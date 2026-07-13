import { Share2, Mail } from 'lucide-react'

export default function Footer() {
  const links = {
    product: [
      { label: 'Features', href: '/features' },
      { label: 'AI Agent', href: '/features/chatbot' },
      { label: 'WhatsApp Automation', href: '/features/whatsapp' },
      { label: 'Lead CRM', href: '/features/crm' },
      { label: 'Dashboard', href: '/dashboard' },
    ],
    company: [
      { label: 'About Us', href: '/about-us' },
      { label: 'Careers', href: '/careers' },
    ],
    support: [
      { label: 'Help Center', href: '/help' },
      { label: 'Contact Us', href: '/contact' },
      { label: 'System Status', href: '/system-status' },
    ],
  }

  return (
    <footer className="bg-surface-container dark:bg-inverse-surface w-full py-16 border-t border-outline-variant/30 text-on-surface">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-12">
          {/* Brand col */}
          <div className="flex flex-col gap-5 md:col-span-2">
            <div className="flex items-center gap-2" id="footer-brand-logo">
              <div className="w-8 h-8 rounded-lg cta-accent flex items-center justify-center text-white font-extrabold text-sm">
                B
              </div>
              <span className="font-extrabold text-xl tracking-tight text-on-surface dark:text-white">BeepBoop</span>
            </div>
            <p className="text-on-surface-variant dark:text-outline-variant text-sm max-w-sm leading-relaxed">
              AI Agent that captures leads, sends WhatsApp alerts, and syncs to your CRM automatically. Built for
              businesses that never want to miss a lead.
            </p>
            <div className="flex gap-3">
              <a
                href="#"
                className="w-10 h-10 rounded-full bg-white/50 hover:bg-white dark:bg-white/10 dark:hover:bg-white/20 flex items-center justify-center text-primary transition-all hover:-translate-y-0.5 border border-outline-variant/20 shadow-sm"
                aria-label="Share BeepBoop"
                id="footer-share-link"
              >
                <Share2 className="w-4.5 h-4.5" />
              </a>
              <a
                href="mailto:admin@drsyeta.in"
                className="w-10 h-10 rounded-full bg-white/50 hover:bg-white dark:bg-white/10 dark:hover:bg-white/20 flex items-center justify-center text-primary transition-all hover:-translate-y-0.5 border border-outline-variant/20 shadow-sm"
                aria-label="Email BeepBoop Support"
                id="footer-email-link"
              >
                <Mail className="w-4.5 h-4.5" />
              </a>
            </div>
          </div>

          {/* Links cols */}
          <div>
            <h4 className="font-bold mb-5 uppercase text-xs tracking-widest text-primary">Product</h4>
            <ul className="flex flex-col gap-3.5 text-sm text-on-surface-variant dark:text-outline-variant">
              {links.product.map((link, i) => (
                <li key={i}>
                  <a href={link.href} className="hover:text-primary hover:underline transition-colors">
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="font-bold mb-5 uppercase text-xs tracking-widest text-primary">Company</h4>
            <ul className="flex flex-col gap-3.5 text-sm text-on-surface-variant dark:text-outline-variant">
              {links.company.map((link, i) => (
                <li key={i}>
                  <a href={link.href} className="hover:text-primary hover:underline transition-colors">
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="font-bold mb-5 uppercase text-xs tracking-widest text-primary">Support</h4>
            <ul className="flex flex-col gap-3.5 text-sm text-on-surface-variant dark:text-outline-variant">
              {links.support.map((link, i) => (
                <li key={i}>
                  <a href={link.href} className="hover:text-primary hover:underline transition-colors flex items-center gap-1">
                    {link.label}{' '}
                    {link.label === 'System Status' && <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Footer bottom */}
        <div className="mt-16 pt-8 border-t border-outline-variant/10 flex flex-col sm:flex-row justify-between items-center gap-6">
          <p className="text-on-surface-variant dark:text-outline-variant text-sm">
            © 2026 BeepBoop by Drsyeta Corp. All rights reserved.
          </p>
          <div className="flex gap-8 text-sm text-on-surface-variant dark:text-outline-variant font-medium">
            <a href="/privacy-policy" className="hover:text-primary transition-colors">
              Privacy Policy
            </a>
            <a href="/terms-of-service" className="hover:text-primary transition-colors">
              Terms of Service
            </a>
          </div>
        </div>
      </div>
    </footer>
  )
}
