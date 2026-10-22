import type { Funder } from '../../../shared/types.ts';
import type { Meter } from '../claude.ts';

export interface Ctx {
  funder: Funder;
  meter: Meter;
  pages: Map<string, string>;   // url -> page text (shared cache across agents)
  allowedUrls: Set<string>;     // every URL an agent actually saw; citations must come from here
  today: string;                // YYYY-MM-DD
}

export const GUARD = `Hard rules:
- Use ONLY the EVIDENCE provided. Never use outside knowledge for facts about the funder.
- status "confirmed" requires a sourceUrl copied exactly from the evidence. If you cannot cite, use "inferred" or "unknown".
- If something is not in the evidence, say so ("unknown"); never guess amounts, dates, or names.
- Keep values short and plain.`;

export function block(title: string, text: string) {
  return `=== ${title} ===\n${text}\n`;
}
