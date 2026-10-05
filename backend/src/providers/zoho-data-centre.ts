// Zoho runs separate data centres, and an account lives in exactly one of them.
// Its tokens are issued by that data centre's accounts server and are only
// valid against that data centre's API host -- a token minted at
// accounts.zoho.com is rejected by zohoapis.in, and the reverse.
//
// This list is an ALLOWLIST as much as a lookup. The OAuth callback tells us
// which accounts server to exchange the code with (`accounts-server`), and that
// exchange carries our client secret. The value arrives in a query string, so
// it is only ever used after matching one of these origins exactly.

export interface ZohoDataCentre {
  accountsServer: string
  apiDomain: string
}

// India: where the OAuth client is registered, and the only data centre any
// connection made before this file existed can belong to. A stored connection
// with no data centre recorded is therefore an India one.
export const DEFAULT_ZOHO_DATA_CENTRE: ZohoDataCentre = {
  accountsServer: 'https://accounts.zoho.in',
  apiDomain: 'https://www.zohoapis.in',
}

const ZOHO_DATA_CENTRES: readonly ZohoDataCentre[] = [
  DEFAULT_ZOHO_DATA_CENTRE,
  { accountsServer: 'https://accounts.zoho.com', apiDomain: 'https://www.zohoapis.com' },
  { accountsServer: 'https://accounts.zoho.eu', apiDomain: 'https://www.zohoapis.eu' },
  { accountsServer: 'https://accounts.zoho.com.au', apiDomain: 'https://www.zohoapis.com.au' },
  { accountsServer: 'https://accounts.zoho.jp', apiDomain: 'https://www.zohoapis.jp' },
  { accountsServer: 'https://accounts.zoho.sa', apiDomain: 'https://www.zohoapis.sa' },
  { accountsServer: 'https://accounts.zohocloud.ca', apiDomain: 'https://www.zohoapis.ca' },
]

function originOf(url: string): string | null {
  try {
    return new URL(url).origin
  } catch {
    return null
  }
}

/** The data centre for an accounts server, or null when it is not one of Zoho's. */
export function findZohoDataCentre(accountsServer: string): ZohoDataCentre | null {
  const origin = originOf(accountsServer)
  return ZOHO_DATA_CENTRES.find((dc) => dc.accountsServer === origin) ?? null
}

/**
 * The data centre an OAuth callback belongs to. No `accounts-server` param
 * means Zoho did not redirect across data centres, so it is the default one.
 * A value that is present but unrecognised throws: falling back would send the
 * code, and our client secret, to a server that cannot redeem it.
 */
export function zohoDataCentreForCallback(accountsServer: string | undefined): ZohoDataCentre {
  if (!accountsServer) return DEFAULT_ZOHO_DATA_CENTRE
  const dataCentre = findZohoDataCentre(accountsServer)
  // Quoted and cut short: the value is caller-supplied and ends up in a log line.
  if (!dataCentre) throw new Error(`Unrecognised Zoho accounts server: ${JSON.stringify(accountsServer.slice(0, 80))}`)
  return dataCentre
}

/** Zoho's own `api_domain` when it names a known API host, else the data centre's. */
export function zohoApiDomain(dataCentre: ZohoDataCentre, reported: string | undefined): string {
  const origin = reported ? originOf(reported) : null
  const known = ZOHO_DATA_CENTRES.some((dc) => dc.apiDomain === origin)
  return known && origin ? origin : dataCentre.apiDomain
}
