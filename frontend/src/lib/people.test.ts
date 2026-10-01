import { describe, expect, it } from 'vitest'
import aboutSource from '../pages/About.tsx?raw'
import { PEOPLE } from './people'

describe('people', () => {
  // Schema may only say what the site shows. /about-us is where these people
  // are shown, so each fact published about them has to be printed there.
  it.each(Object.values(PEOPLE))('$name is on the about page with the same role and profile', (person) => {
    expect(aboutSource).toContain(`name: '${person.name}'`)
    expect(aboutSource).toContain(`role: '${person.role}'`)
    expect(aboutSource).toContain(`linkedinUrl: '${person.linkedinUrl}'`)
  })

  it('keys each person by their own id', () => {
    expect(Object.entries(PEOPLE).filter(([key, person]) => key !== person.id)).toEqual([])
  })
})
