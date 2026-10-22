export interface Opp { id: string; number: string; title: string; agency: string; openDate?: string; closeDate?: string; status?: string }

/** Grants.gov search2: public, no auth. Dates come back as MM/DD/YYYY. */
export async function searchOpportunities(keyword: string, rows = 8): Promise<Opp[]> {
  try {
    const res = await fetch('https://api.grants.gov/v1/api/search2', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ keyword, oppStatuses: 'forecasted|posted', rows }),
    });
    if (!res.ok) return [];
    const j = (await res.json()) as { data?: { oppHits?: Record<string, string>[] } };
    return (j.data?.oppHits ?? []).map((h) => ({
      id: h.id, number: h.number, title: h.title, agency: h.agency ?? h.agencyCode,
      openDate: h.openDate, closeDate: h.closeDate, status: h.oppStatus,
    }));
  } catch {
    return [];
  }
}

export const oppUrl = (id: string) => `https://www.grants.gov/search-results-detail/${id}`;

export function toIso(d?: string): string | undefined {
  if (!d) return undefined;
  const m = d.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[1]}-${m[2]}`;
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : undefined;
}
