import { runPipeline } from '../lib/orchestrator.ts';
import { authorized } from '../lib/util.ts';

// Background function (name ends in -background): Netlify returns 202 immediately and allows up to 15 minutes.
export default async (req: Request) => {
  if (!authorized(req)) return new Response('Unauthorized', { status: 401 });
  const { runId } = (await req.json()) as { runId: string };
  await runPipeline(runId);
};
