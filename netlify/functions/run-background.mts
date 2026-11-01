import { authenticate } from '../lib/auth.ts';
import { runPipeline } from '../lib/orchestrator.ts';

// Background function (name ends in -background): Netlify returns 202 immediately and allows up to 15 minutes.
export default async (req: Request) => {
  if (!(await authenticate(req)).ok) return new Response('Unauthorized', { status: 401 });
  const { runId } = (await req.json()) as { runId: string };
  await runPipeline(runId);
};
