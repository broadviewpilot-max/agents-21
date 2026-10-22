const BASE = 'https://projects.propublica.org/nonprofits/api/v2';

export interface PPOrg { ein: number; strein: string; name: string; city: string; state: string; ntee_code?: string }
export interface PPFiling { tax_prd_yr?: number; pdf_url?: string; formtype_str?: string; totrevenue?: number; totfuncexpns?: number; grntspaid?: number }

export async function searchOrgs(q: string): Promise<PPOrg[]> {
  try {
    const res = await fetch(`${BASE}/search.json?${new URLSearchParams({ q })}`);
    if (!res.ok) return [];
    return ((await res.json()) as { organizations?: PPOrg[] }).organizations ?? [];
  } catch {
    return [];
  }
}

export async function orgFilings(ein: string): Promise<{ org?: PPOrg; filings: PPFiling[] }> {
  try {
    const res = await fetch(`${BASE}/organizations/${ein.replace(/\D/g, '')}.json`);
    if (!res.ok) return { filings: [] };
    const j = (await res.json()) as { organization?: PPOrg; filings_with_data?: PPFiling[] };
    return { org: j.organization, filings: j.filings_with_data ?? [] };
  } catch {
    return { filings: [] };
  }
}

export const nonprofitPage = (ein: string) => `https://projects.propublica.org/nonprofits/organizations/${ein.replace(/\D/g, '')}`;
