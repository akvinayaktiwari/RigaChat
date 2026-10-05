/**
 * The company's own profiles on other sites, in one list.
 *
 * The footer links them and the Organization schema names them as sameAs, from
 * this list, so the schema can never claim a profile the site does not show.
 * Add a profile only once it is claimed and confirmed to be ours: a wrong
 * sameAs points the entity graph at someone else's company.
 */
export interface SocialProfile {
  id: 'linkedin' | 'x'
  /** The network's name, as its owner writes it. */
  network: string
  url: string
}

export const SOCIAL_PROFILES: readonly SocialProfile[] = [
  { id: 'linkedin', network: 'LinkedIn', url: 'https://www.linkedin.com/company/vyostra-ai' },
  { id: 'x', network: 'X', url: 'https://x.com/vyostra_ai' },
]

/** The X account a shared link is attributed to, for the twitter:site card tag. */
export const X_HANDLE = '@vyostra_ai'
