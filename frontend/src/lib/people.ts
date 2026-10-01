/**
 * The people named in structured data and in blog bylines.
 *
 * Every field here is already printed on /about-us (name, role, LinkedIn link),
 * and people.test.ts fails if that stops being true: a Person node that says
 * something the site does not show is the same spam-policy problem as an
 * unsourced FAQ, and a wrong sameAs points the entity graph at a stranger.
 */
export type PersonId = 'vinayak-tiwari' | 'adarsh-jee-pandey'

export interface Person {
  /** Fragment of the node's @id, e.g. "/#vinayak-tiwari". Never change it once published. */
  id: PersonId
  name: string
  /** Exactly as /about-us prints it. */
  role: string
  linkedinUrl: string
}

export const PEOPLE: Readonly<Record<PersonId, Person>> = {
  'vinayak-tiwari': {
    id: 'vinayak-tiwari',
    name: 'Vinayak Tiwari',
    role: 'Co-Founder & Builder',
    linkedinUrl: 'https://www.linkedin.com/in/vinayaktiwari-ai',
  },
  'adarsh-jee-pandey': {
    id: 'adarsh-jee-pandey',
    name: 'Adarsh Jee Pandey',
    role: 'Co-Founder & Performance Marketer',
    linkedinUrl: 'https://www.linkedin.com/in/adarshjeepandey',
  },
}

export const FOUNDERS: readonly Person[] = [PEOPLE['vinayak-tiwari'], PEOPLE['adarsh-jee-pandey']]
