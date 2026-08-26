import { describe, expect, it } from 'vitest'
import { mapMetaFieldData } from './meta-field-mapping.js'

describe('mapMetaFieldData', () => {
  // The reason this mapper was revisited. Indian real-estate forms very often
  // ask for a "WhatsApp Number" rather than a phone number; the old chain
  // tested key.includes('phone'), so whatsapp_number matched nothing and the
  // lead was saved with an EMPTY phone -- the one field lead notifications,
  // journey outreach and the WhatsApp agent are all addressed by.
  it('maps a WhatsApp-labelled question onto phone', () => {
    for (const key of ['whatsapp_number', 'WhatsApp Number', 'whats_app_no', 'wa_number', 'mobile_number']) {
      expect(mapMetaFieldData([{ name: key, values: ['+919876543210'] }]).phone, key).toBe('+919876543210')
    }
  })

  it('still maps the standard Meta keys', () => {
    const mapped = mapMetaFieldData([
      { name: 'full_name', values: ['Ravi Kumar'] },
      { name: 'phone_number', values: ['+919876543210'] },
      { name: 'email', values: ['ravi@example.com'] },
    ])

    expect(mapped).toMatchObject({ name: 'Ravi Kumar', phone: '+919876543210', email: 'ravi@example.com' })
    expect(mapped.customFields).toEqual({})
  })

  // 'preferred_contact_time' is a common question and is not a phone number.
  // A too-greedy phone rule would put a time of day in the field the agent
  // sends WhatsApp messages to.
  it('does not treat every "contact" question as a phone number', () => {
    const mapped = mapMetaFieldData([{ name: 'preferred_contact_time', values: ['Evening'] }])

    expect(mapped.phone).toBeUndefined()
    expect(mapped.customFields).toEqual({ preferred_contact_time: 'Evening' })
  })

  // 'name' as a substring appears in company_name, project_name, society_name.
  it('does not treat every "name" question as the lead name', () => {
    const mapped = mapMetaFieldData([{ name: 'society_name', values: ['Skyline Residences'] }])

    expect(mapped.name).toBeUndefined()
    expect(mapped.customFields).toEqual({ society_name: 'Skyline Residences' })
  })

  it('composes a name from the split standard keys', () => {
    const mapped = mapMetaFieldData([
      { name: 'first_name', values: ['Ravi'] },
      { name: 'last_name', values: ['Kumar'] },
    ])

    expect(mapped.name).toBe('Ravi Kumar')
  })

  it('prefers a whole-name question over the split keys', () => {
    const mapped = mapMetaFieldData([
      { name: 'full_name', values: ['Ravi Kumar'] },
      { name: 'first_name', values: ['Ravi'] },
    ])

    expect(mapped.name).toBe('Ravi Kumar')
  })

  // The filed complaint: values[0] with the rest dropped and no trace.
  it('keeps every answer to a multi-select question', () => {
    const mapped = mapMetaFieldData([{ name: 'property_interest', values: ['2 BHK', '3 BHK'] }])

    expect(mapped.propertyInterest).toBe('2 BHK, 3 BHK')
  })

  // A single-valued target still takes one value -- phonesMatch and the
  // WhatsApp send both need ONE number, not a joined string -- but the extras
  // are parked rather than lost.
  it('parks the extras when a single-valued field carries several', () => {
    const mapped = mapMetaFieldData([{ name: 'phone_number', values: ['+919876543210', '+919000000000'] }])

    expect(mapped.phone).toBe('+919876543210')
    expect(mapped.customFields).toEqual({ phone_number_additional: '+919000000000' })
  })

  it('keeps every answer to a multi-select custom question', () => {
    const mapped = mapMetaFieldData([{ name: 'preferred_areas', values: ['Whitefield', 'Indiranagar'] }])

    expect(mapped.customFields).toEqual({ preferred_areas: 'Whitefield, Indiranagar' })
  })

  // Precedence, which used to be emergent from if/else source order and is now
  // stated: budget before property, so 'budget_for_property' is a budget.
  it('resolves an ambiguous key by the documented precedence', () => {
    expect(mapMetaFieldData([{ name: 'budget_for_property', values: ['1-2 Cr'] }]).budgetRange).toBe('1-2 Cr')
    expect(mapMetaFieldData([{ name: 'email_or_phone', values: ['ravi@example.com'] }]).email).toBe(
      'ravi@example.com'
    )
  })

  it('survives a question with no answer at all', () => {
    const mapped = mapMetaFieldData([{ name: 'phone_number', values: [] }])

    expect(mapped.phone).toBe('')
  })
})

// Layer 1. This is what the mapper should be doing almost all of the time --
// the shape below is a real response from the live Graph API, page
// 353635678632363, read on 2026-08-26.
describe('form schema (layer 1)', () => {
  const schema = [
    { key: 'email', label: 'Email', type: 'EMAIL' },
    { key: 'full_name', label: 'Full name', type: 'FULL_NAME' },
    { key: 'phone_number', label: 'Phone number', type: 'PHONE' },
  ]

  it('maps by Meta\'s declared type', () => {
    const mapped = mapMetaFieldData(
      [
        { name: 'email', values: ['ravi@example.com'] },
        { name: 'full_name', values: ['Ravi Kumar'] },
        { name: 'phone_number', values: ['+919876543210'] },
      ],
      schema
    )

    expect(mapped).toMatchObject({ name: 'Ravi Kumar', phone: '+919876543210', email: 'ravi@example.com' })
    expect(mapped.customFields).toEqual({})
  })

  // The declared type beats the key, which is the entire point of fetching the
  // schema: a client who labels a question 'Your best contact' still gets it in
  // `phone` when Meta says the question type is PHONE.
  it('trusts the declared type over the question key', () => {
    const mapped = mapMetaFieldData([{ name: 'your_best_contact', values: ['9876543210'] }], [
      { key: 'your_best_contact', label: 'Your best contact', type: 'PHONE' },
    ])

    expect(mapped.phone).toBe('9876543210')
  })

  it('treats a work address the same as a personal one', () => {
    const mapped = mapMetaFieldData(
      [
        { name: 'work_email', values: ['ravi@acme.com'] },
        { name: 'work_phone_number', values: ['+919876543210'] },
      ],
      [
        { key: 'work_email', type: 'WORK_EMAIL' },
        { key: 'work_phone_number', type: 'WORK_PHONE_NUMBER' },
      ]
    )

    expect(mapped).toMatchObject({ email: 'ravi@acme.com', phone: '+919876543210' })
  })

  it('composes the split name types', () => {
    const mapped = mapMetaFieldData(
      [
        { name: 'first_name', values: ['Ravi'] },
        { name: 'last_name', values: ['Kumar'] },
      ],
      [
        { key: 'first_name', type: 'FIRST_NAME' },
        { key: 'last_name', type: 'LAST_NAME' },
      ]
    )

    expect(mapped.name).toBe('Ravi Kumar')
  })

  // A schema that cannot be fetched has to degrade the mapping, never fail the
  // lead -- so no schema must behave exactly as it did before layer 1 existed.
  it('falls back to the heuristics when the schema is missing or empty', () => {
    const fieldData = [{ name: 'whatsapp_number', values: ['+919876543210'] }]

    expect(mapMetaFieldData(fieldData, []).phone).toBe('+919876543210')
    expect(mapMetaFieldData(fieldData, undefined).phone).toBe('+919876543210')
  })
})

// Layer 2's real input. The webhook carries only the slug, so the human label
// exists ONLY when the schema was fetched -- and it is the better signal.
describe('label-aware keywords (layer 2)', () => {
  it('reads the human label when the key is opaque', () => {
    const mapped = mapMetaFieldData([{ name: 'question_1', values: ['+919876543210'] }], [
      { key: 'question_1', label: 'WhatsApp Number', type: 'CUSTOM' },
    ])

    expect(mapped.phone).toBe('+919876543210')
  })
})

// Layer 3. The point of this layer is the case no keyword list can reach.
describe('value shape (layer 3)', () => {
  // No English keyword list can match a Hindi label. The answer still looks
  // exactly like a phone number.
  it('recognises a phone number under a non-English label', () => {
    const mapped = mapMetaFieldData([{ name: 'आपका नंबर', values: ['+91 98765 43210'] }], [
      { key: 'आपका नंबर', label: 'आपका नंबर', type: 'CUSTOM' },
    ])

    expect(mapped.phone).toBe('+91 98765 43210')
  })

  it('recognises an email under an opaque key', () => {
    const mapped = mapMetaFieldData([{ name: 'q2', values: ['ravi@example.com'] }])

    expect(mapped.email).toBe('ravi@example.com')
  })

  // The realistic false positive, and the reason the digit floor is 10 and any
  // letter disqualifies the value: a budget answer must never land in the field
  // the WhatsApp agent sends to.
  it('does not mistake a budget for a phone number', () => {
    for (const budget of ['5000000', '50 Lakh', '1-2 Cr', '₹75,00,000']) {
      const mapped = mapMetaFieldData([{ name: 'q3', values: [budget] }])
      expect(mapped.phone, budget).toBeUndefined()
      expect(mapped.customFields.q3).toBe(budget)
    }
  })

  it('leaves a genuinely unrecognisable answer in customFields', () => {
    const mapped = mapMetaFieldData([{ name: 'q4', values: ['Sometime next week'] }])

    expect(mapped.customFields).toEqual({ q4: 'Sometime next week' })
  })
})
