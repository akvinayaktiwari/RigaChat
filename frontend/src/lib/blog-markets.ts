import { BLOG_MARKETS, type BlogMarket } from '../types/blog'

interface MarketInfo {
  /** Shown on the post and in the blog index filter. */
  label: string
  /** The country as schema.org names it; absent for a post with no single country. */
  country?: string
}

const MARKETS: Record<BlogMarket, MarketInfo> = {
  global: { label: 'Global' },
  us: { label: 'United States', country: 'United States' },
  uk: { label: 'United Kingdom', country: 'United Kingdom' },
  ca: { label: 'Canada', country: 'Canada' },
  au: { label: 'Australia', country: 'Australia' },
  ae: { label: 'UAE', country: 'United Arab Emirates' },
  in: { label: 'India', country: 'India' },
}

export function isBlogMarket(value: unknown): value is BlogMarket {
  return typeof value === 'string' && (BLOG_MARKETS as readonly string[]).includes(value)
}

export function marketLabel(market: BlogMarket): string {
  return MARKETS[market].label
}

/** The country a market post covers, or undefined for a global post. */
export function marketCountry(market: BlogMarket): string | undefined {
  return MARKETS[market].country
}

/** The markets that have at least one post, in BLOG_MARKETS order. */
export function marketsInUse(markets: readonly BlogMarket[]): BlogMarket[] {
  return BLOG_MARKETS.filter((market) => markets.includes(market))
}
