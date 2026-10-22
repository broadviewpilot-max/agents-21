import type { Funder } from '../../shared/types.ts';

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
const ymd = (iso: string) => iso.replace(/-/g, '');
function nextDay(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Minimal RFC 5545 all-day events for dated, non-unknown deadlines. */
export function buildIcs(funders: Funder[], stamp = new Date()): string {
  const dtstamp = stamp.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Aimsir Foundation//Funder Command Center//EN', 'CALSCALE:GREGORIAN'];
  for (const f of funders) {
    (f.deadlines ?? []).forEach((d, i) => {
      if (!d.date || d.status === 'unknown') return;
      lines.push(
        'BEGIN:VEVENT',
        `UID:${f.id}-${i}@aimsir-funder-command-center`,
        `DTSTAMP:${dtstamp}`,
        `DTSTART;VALUE=DATE:${ymd(d.date)}`,
        `DTEND;VALUE=DATE:${ymd(nextDay(d.date))}`,
        `SUMMARY:${esc(`${f.name}: ${d.label}${d.status === 'inferred' ? ' (UNVERIFIED)' : ''}`)}`,
        `DESCRIPTION:${esc(d.sourceUrl ? `Source: ${d.sourceUrl}` : 'No source link. Verify with funder.')}`,
        'END:VEVENT',
      );
    });
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}
