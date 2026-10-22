export type Status = 'confirmed' | 'inferred' | 'unknown';
export type FunderType = 'federal' | 'corporate' | 'private-foundation' | 'public-charity' | 'community-foundation' | 'state-local' | 'other';
export type Stage = 'researching' | 'brief-ready' | 'approved' | 'drafting' | 'submitted' | 'awarded' | 'declined';
export type BriefState = 'draft' | 'reviewed' | 'approved';

export interface Fact { label: string; value: string; status: Status; sourceUrl?: string }
export interface Award { recipient: string; amount?: number; year?: number; purpose?: string; sourceUrl?: string }
export interface Deadline { label: string; date?: string; kind: 'application' | 'loi' | 'rolling' | 'event' | 'other'; status: Status; sourceUrl?: string }
export interface Signal { text: string; date?: string; platform: string; sourceUrl?: string }

export interface CriterionScore { id: string; label: string; weight: number; score: number; rationale: string; evidence?: string }
export interface FitScore {
  total: number;
  criteria: CriterionScore[];
  flags: string[];
  recommendation: 'Pursue' | 'Cultivate' | 'Pass';
  matchedPrograms: string[];
}
export interface NarrativeSection { id: string; title: string; body: string; needsData: string[] }

export interface AwardStats { count: number; median?: number; min?: number; max?: number; years: number[] }

export interface IntelligenceResult {
  websiteUrl?: string;
  summary: string;
  priorities: Fact[];
  eligibility: Fact[];
  geography: Fact[];
  awardRange: Fact[];
  signals: Signal[];
  possiblePriorityShift?: string;
}
export interface AwardsResult { ein?: string; awards: Award[]; stats: AwardStats; coverageNote: string; filingsUrl?: string }
export interface DeadlinesResult { deadlines: Deadline[]; note: string }

export interface AgentLog { agent: string; ok: boolean; ms: number; note?: string }

export interface Funder {
  id: string; name: string; type: FunderType; url?: string; ein?: string; createdAt: string;
  stage: Stage; nextDeadline?: string; deadlines?: Deadline[]; notes?: string; latestRunId?: string; briefId?: string; fitTotal?: number; recommendation?: 'Pursue' | 'Cultivate' | 'Pass';
}
export interface Run {
  id: string; funderId: string; status: 'queued' | 'running' | 'done' | 'failed';
  startedAt: string; finishedAt?: string; error?: string; creditsUsed: { scrapeCreators: number; firecrawl: number; claudeCalls: number };
  logs: AgentLog[];
  intelligence?: IntelligenceResult; awards?: AwardsResult; deadlines?: DeadlinesResult;
  fit?: FitScore; narrative?: NarrativeSection[];
}
export interface Brief {
  id: string; funderId: string; runId: string; version: number; state: BriefState;
  headline: string; openItems: string[]; approvalNote?: string; overrideNote?: string;
  createdAt: string; updatedAt: string;
  narrative: NarrativeSection[];
}

export interface Program { id: string; name: string; status: 'draft' | 'confirmed'; summary: string; audience: string; geography: string; keywords: string[]; sources: string[] }
export interface ScoringConfig { criteria: { id: string; label: string; weight: number; guide: string }[]; thresholds: { pursue: number; cultivate: number }; hardStopCap: number }
