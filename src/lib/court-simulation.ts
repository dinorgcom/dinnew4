import { generateText } from 'ai';
import { nanoid } from 'nanoid';
import { generateStructuredObject, generatePlainText } from '@/server/ai/service';
import { z } from 'zod';

// Helper function to get lawyer names from keys
async function getLawyerName(lawyerKey: string, side: 'claimant' | 'respondent'): Promise<string> {
  if (!lawyerKey) {
    return side === 'claimant' ? 'Rick Smith' : 'Tom Wellbro'; // Fallback to hardcoded names
  }
  
  try {
    // Import lawyers dynamically to avoid circular dependencies
    const { claimantLawyers, respondentLawyers } = await import('@/lib/lawyers');
    const lawyers = side === 'claimant' ? claimantLawyers : respondentLawyers;
    const lawyer = lawyers.find((l: any) => l.id === lawyerKey); // Use 'id' not 'key'
    
    return lawyer?.name || (side === 'claimant' ? 'Rick Smith' : 'Tom Wellbro');
  } catch (error) {
    console.error('Failed to load lawyer names:', error);
    return side === 'claimant' ? 'Rick Smith' : 'Tom Wellbro';
  }
}

type PartyRole = 'claimant' | 'respondent';
type Speaker = 'judge' | 'barrister_a' | 'barrister_b';
type EventType = 'round_open' | 'argument' | 'judge_intervention' | 'outcome';

interface SimulationEvidence {
  title: string;
  type: string;
  description: string;
  status: string;
  notes: string;
  uploaderRole: PartyRole;
}

interface SimulationCase {
  id: string;
  caseNumber: string;
  title: string;
  description: string;
  category: string;
  claimAmount: number;
  currency: string;
  claimantName: string;
  respondentName: string;
  claimantLawyerKey: string;
  respondentLawyerKey: string;
  claimantClaims: string;
  respondentClaims: string;
  evidence: SimulationEvidence[];
  witnesses: Array<{
    fullName: string;
    relationship: string;
    statement: string;
    status: string;
  }>;
  consultants: Array<{
    fullName: string;
    company: string;
    expertise: string;
    role: string;
    report: string;
    status: string;
  }>;
}

interface SimulationOptions {
  maxRounds?: number;
  maxTokens?: number;
  onTranscriptEntry?: (entry: CourtTranscriptEntry) => void;
}

export interface CourtTranscriptEntry {
  id: string;
  round: number;
  speaker: Speaker;
  content: string;
  createdAt: string;
}

interface StopAssessment {
  hasNewSubstance: boolean;
  reason: string;
}

interface GovernanceDecision {
  stopNow: boolean;
  reasonType: 'needs_more_evidence' | 'continue' | 'no_progress';
  reason: string;
  evidenceRequests: string[];
}

interface SettlementOutcome {
  type: 'Settlement';
  summary: string;
  terms: string[];
  amount: number | null;
}

interface VerdictOutcome {
  type: 'Verdict';
  summary: string;
  winner: 'PartyA' | 'PartyB';
  reasoning: string;
  relief: string;
}

interface AbortOutcome {
  type: 'Abort';
  summary: string;
  reason: string;
  keyPoints: string[];
  needsMoreEvidence: boolean;
  evidenceRequests: string[];
}

type CourtOutcome = SettlementOutcome | VerdictOutcome | AbortOutcome;

interface RawOutcome {
  type?: string;
  summary?: string;
  terms?: unknown;
  amount?: unknown;
  winner?: string;
  reasoning?: string;
  relief?: string;
  reason?: string;
  keyPoints?: unknown;
  needsMoreEvidence?: boolean;
  evidenceRequests?: unknown;
}

export interface CourtTimelineStep {
  id: string;
  round: number;
  type: EventType;
  speaker: Speaker;
  label: string;
  highlight: string;
  createdAt: string;
}

export interface CourtTimeline {
  sessionId: string;
  shareToken: string;
  caseId: string;
  createdAt: string;
  publicSharePath: string;
  steps: CourtTimelineStep[];
  outcomeBadge: {
    label: 'Settlement' | 'Verdict' | 'Abort';
    color: 'emerald' | 'blue' | 'rose';
  };
}

export interface CourtSimulationResult {
  sessionId: string;
  shareToken: string;
  stoppingReason: string;
  roundsCompleted: number;
  tokensUsed: number;
  transcript: CourtTranscriptEntry[];
  outcome: CourtOutcome;
  timeline: CourtTimeline;
  summary: string;
}

interface UsageLike {
  totalTokens?: number;
  inputTokens?: number;
  outputTokens?: number;
  promptTokens?: number;
  completionTokens?: number;
}

function truncate(text: string, length = 260): string {
  if (text.length <= length) return text;
  return `${text.slice(0, length - 3)}...`;
}

function parseJsonObject<T>(text: string): T | null {
  const codeBlockMatch = text.match(/```json\s*([\s\S]*?)\s*```/i);
  const candidate = codeBlockMatch ? codeBlockMatch[1] : text;

  try {
    return JSON.parse(candidate) as T;
  } catch {
    const objectMatch = candidate.match(/\{[\s\S]*\}/);
    if (!objectMatch) return null;
    try {
      return JSON.parse(objectMatch[0]) as T;
    } catch {
      return null;
    }
  }
}

function readTokenUsage(usage: unknown): number {
  if (!usage || typeof usage !== 'object') return 0;
  const u = usage as UsageLike;
  if (typeof u.totalTokens === 'number') return u.totalTokens;
  const prompt = typeof u.inputTokens === 'number' ? u.inputTokens : u.promptTokens ?? 0;
  const completion = typeof u.outputTokens === 'number' ? u.outputTokens : u.completionTokens ?? 0;
  return prompt + completion;
}

function buildCaseContext(caseData: SimulationCase): string {
  const lines: string[] = [];

  lines.push(`Case: ${caseData.title} (${caseData.caseNumber})`);
  lines.push(`Claimed amount: ${caseData.currency} ${caseData.claimAmount.toLocaleString()}`);
  lines.push(`Party A (Claimant): ${caseData.claimantName}`);
  lines.push(`Party B (Respondent): ${caseData.respondentName}`);
  lines.push('');
  lines.push('Dispute summary:');
  lines.push(caseData.description);
  lines.push('');
  
  if (caseData.claimantClaims) {
    lines.push('Claimant claims:');
    lines.push(caseData.claimantClaims);
    lines.push('');
  }
  
  if (caseData.respondentClaims) {
    lines.push('Respondent claims:');
    lines.push(caseData.respondentClaims);
    lines.push('');
  }

  lines.push('Evidence record:');
  if (caseData.evidence.length === 0) {
    lines.push('- No evidence submitted.');
  } else {
    caseData.evidence.forEach((item, index) => {
      lines.push(
        `- [${item.uploaderRole === 'claimant' ? 'Party A' : 'Party B'}] ${item.title} (${item.type})`
      );
      if (item.description) {
        lines.push(`  Description: ${item.description}`);
      }
      if (item.notes) {
        lines.push(`  Notes: ${item.notes}`);
      }
    });
  }

  if (caseData.witnesses.length > 0) {
    lines.push('');
    lines.push('Witness statements:');
    caseData.witnesses.forEach((witness) => {
      lines.push(`- ${witness.fullName} (${witness.relationship}): ${witness.statement}`);
    });
  }

  if (caseData.consultants.length > 0) {
    lines.push('');
    lines.push('Expert reports:');
    caseData.consultants.forEach((consultant) => {
      lines.push(`- ${consultant.fullName} (${consultant.expertise}): ${consultant.report}`);
    });
  }

  return lines.join('\n');
}

function buildTranscriptText(transcript: CourtTranscriptEntry[]): string {
  if (transcript.length === 0) return 'No prior simulation statements.';
  return transcript
    .map((entry) => `[Round ${entry.round}] ${entry.speaker}: ${entry.content}`)
    .join('\n');
}

function normalizeOutcome(raw: RawOutcome): CourtOutcome {
  const type = raw.type?.toLowerCase();

  if (type === 'settlement') {
    const terms = Array.isArray(raw.terms)
      ? raw.terms.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : [];
    const amount = typeof raw.amount === 'number' && Number.isFinite(raw.amount) ? Math.round(raw.amount) : null;
    return {
      type: 'Settlement',
      summary: raw.summary?.trim() || 'Settlement reached based on the final negotiation posture.',
      terms: terms.length > 0 ? terms : ['Mutual release of all claims after performance.'],
      amount,
    };
  }

  if (type === 'verdict') {
    const winner = raw.winner?.toLowerCase() === 'partyb' ? 'PartyB' : 'PartyA';
    return {
      type: 'Verdict',
      summary: raw.summary?.trim() || 'The judge issued a final reasoned verdict.',
      winner,
      reasoning: raw.reasoning?.trim() || 'Reasoning was not fully specified by the model.',
      relief: raw.relief?.trim() || 'No specific relief provided.',
    };
  }

  const keyPoints = Array.isArray(raw.keyPoints)
    ? raw.keyPoints.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
  const evidenceRequests = Array.isArray(raw.evidenceRequests)
    ? raw.evidenceRequests.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];

  return {
    type: 'Abort',
    summary: raw.summary?.trim() || 'The process ended without a reliable resolution.',
    reason: raw.reason?.trim() || 'Arguments remained unresolved or contradictory.',
    keyPoints: keyPoints.length > 0 ? keyPoints : ['Material conflict could not be resolved from available evidence.'],
    needsMoreEvidence: raw.needsMoreEvidence === true,
    evidenceRequests:
      evidenceRequests.length > 0
        ? evidenceRequests
        : raw.needsMoreEvidence === true
        ? ['Provide additional documentary proof directly tied to disputed factual points.']
        : [],
  };
}

function normalizeGovernanceDecision(raw: Partial<GovernanceDecision> | null): GovernanceDecision {
  const reasonType =
    raw?.reasonType === 'needs_more_evidence' || raw?.reasonType === 'no_progress'
      ? raw.reasonType
      : 'continue';
  const evidenceRequests = Array.isArray(raw?.evidenceRequests)
    ? raw.evidenceRequests.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];

  return {
    stopNow: raw?.stopNow === true,
    reasonType,
    reason: raw?.reason?.trim() || 'No governance reason provided.',
    evidenceRequests,
  };
}

function buildTimeline(
  caseId: string,
  sessionId: string,
  shareToken: string,
  transcript: CourtTranscriptEntry[],
  outcome: CourtOutcome
): CourtTimeline {
  const steps: CourtTimelineStep[] = transcript.map((entry, index) => ({
    id: `step_${index + 1}`,
    round: entry.round,
    type: entry.speaker === 'judge'
      ? (entry.content.toLowerCase().includes('directive') ? 'round_open' : 'judge_intervention')
      : 'argument',
    speaker: entry.speaker,
    label:
      entry.speaker === 'judge'
        ? 'Judge Intervention'
        : entry.speaker === 'barrister_a'
        ? 'Barrister A Argument'
        : 'Barrister B Argument',
    highlight: truncate(entry.content, 240),
    createdAt: entry.createdAt,
  }));

  steps.push({
    id: `step_${steps.length + 1}`,
    round: transcript.length > 0 ? transcript[transcript.length - 1].round : 1,
    type: 'outcome',
    speaker: 'judge',
    label: `Outcome: ${outcome.type}`,
    highlight: truncate(outcome.summary, 240),
    createdAt: new Date().toISOString(),
  });

  const badge =
    outcome.type === 'Settlement'
      ? { label: 'Settlement' as const, color: 'emerald' as const }
      : outcome.type === 'Verdict'
      ? { label: 'Verdict' as const, color: 'blue' as const }
      : { label: 'Abort' as const, color: 'rose' as const };

  return {
    sessionId,
    shareToken,
    caseId,
    createdAt: new Date().toISOString(),
    publicSharePath: `/simulations/${shareToken}`,
    steps,
    outcomeBadge: badge,
  };
}

function newTranscriptEntry(round: number, speaker: Speaker, content: string): CourtTranscriptEntry {
  return {
    id: nanoid(12),
    round,
    speaker,
    content: content.trim(),
    createdAt: new Date().toISOString(),
  };
}

export async function runCourtSimulation(
  caseData: SimulationCase,
  options: SimulationOptions = {}
): Promise<CourtSimulationResult> {
  const maxRounds = options.maxRounds ?? 8;
  const maxTokens = options.maxTokens ?? 40_000;
  const emitTranscriptEntry = options.onTranscriptEntry;

  const sessionId = nanoid(16);
  const shareToken = nanoid(22);
  const transcript: CourtTranscriptEntry[] = [];
  let tokensUsed = 0;
  let roundsCompleted = 0;
  let stoppingReason = 'Judge determined that substantive novelty was exhausted.';
  let earlyOutcome: CourtOutcome | null = null;

  const caseContext = buildCaseContext(caseData);
  const claimantLabel = caseData.claimantName;
  const defendantLabel = caseData.respondentName;
  const appendEntry = (entry: CourtTranscriptEntry) => {
    transcript.push(entry);
    emitTranscriptEntry?.(entry);
  };

  for (let round = 1; round <= maxRounds; round += 1) {
    const transcriptText = buildTranscriptText(transcript);

    // Judge round directive
    const judgeRound = await generateText({
      model: await getModel(),
      system:
        'You are a neutral judge orchestrating an adversarial civil dispute simulation. Keep control instructions concise and process-focused.',
      prompt: [
        `Round: ${round}`,
        'Task: issue one short directive for this round with the key unresolved questions.',
        'Return plain text only, 2-3 sentences.',
        '',
        'Case context:',
        caseContext,
        '',
        'Transcript so far:',
        transcriptText,
      ].join('\n'),
    });
    tokensUsed += readTokenUsage(judgeRound.usage);
    appendEntry(newTranscriptEntry(round, 'judge', `Round directive: ${judgeRound.text}`));

    // Barrister A argument
    const claimantLawyerName = await getLawyerName(caseData.claimantLawyerKey, 'claimant');
    const barristerA = await generateText({
      model: await getModel(),
      system:
        `You are Barrister A for Party A (Claimant). Be adversarial: defend Party A, attack Party B weaknesses, and cite record facts. No fabrication.
Use light markdown formatting with short paragraphs and occasional bullet points.
For round 1, your first sentence must be exactly: "My name is ${claimantLawyerName}, Attorney at law, for ${claimantLabel}."
After round 1, refer to yourself as "Attorney ${claimantLabel}" and the opponent as "Attorney ${defendantLabel}".`,
      prompt: [
        `Round: ${round}`,
        'Provide your argument in 1-2 paragraphs. Include at least one direct rebuttal point.',
        '',
        'Case context:',
        caseContext,
        '',
        'Current judge directive:',
        judgeRound.text,
        '',
        'Transcript so far:',
        buildTranscriptText(transcript),
      ].join('\n'),
    });
    tokensUsed += readTokenUsage(barristerA.usage);
    appendEntry(newTranscriptEntry(round, 'barrister_a', barristerA.text));

    // Barrister B rebuttal
    const respondentLawyerName = await getLawyerName(caseData.respondentLawyerKey, 'respondent');
    const barristerB = await generateText({
      model: await getModel(),
      system:
        `You are Barrister B for Party B (Respondent). Be adversarial: defend Party B, attack Party A weaknesses, and cite record facts. No fabrication.
Use light markdown formatting with short paragraphs and occasional bullet points.
For round 1, your first sentence must be exactly: "Hi, this is ${respondentLawyerName}, Attorney for ${defendantLabel}."
After round 1, refer to yourself as "Attorney ${defendantLabel}" and the opponent as "Attorney ${claimantLabel}".`,
      prompt: [
        `Round: ${round}`,
        'Provide your rebuttal in 1-2 paragraphs responding directly to Barrister A.',
        '',
        'Case context:',
        caseContext,
        '',
        'Barrister A argument:',
        barristerA.text,
        '',
        'Transcript so far:',
        buildTranscriptText(transcript),
      ].join('\n'),
    });
    tokensUsed += readTokenUsage(barristerB.usage);
    appendEntry(newTranscriptEntry(round, 'barrister_b', barristerB.text));

    // Judge interjection
    const judgeInterjection = await generateText({
      model: await getModel(),
      system:
        'You are a judge. Ask one hard clarification question and provide one line of basic domain guidance. Stay neutral.',
      prompt: [
        `Round: ${round}`,
        'Return plain text only, max 4 sentences.',
        '',
        'Case context:',
        caseContext,
        '',
        'Latest arguments:',
        `Barrister A: ${barristerA.text}`,
        `Barrister B: ${barristerB.text}`,
      ].join('\n'),
    });
    tokensUsed += readTokenUsage(judgeInterjection.usage);
    appendEntry(newTranscriptEntry(round, 'judge', judgeInterjection.text));

    // Governance check
    const governanceCheck = await generateText({
      model: await getModel(),
      system:
        'You are the judge governance controller. Decide if the simulation must stop immediately. Return strict JSON only.',
      prompt: [
        `Round: ${round}`,
        'Return JSON exactly with keys:',
        '{',
        '  "stopNow": boolean,',
        '  "reasonType": "needs_more_evidence" | "continue" | "no_progress",',
        '  "reason": string,',
        '  "evidenceRequests": string[]',
        '}',
        '',
        'Rule: if current record is insufficient for fair adjudication, set stopNow=true and reasonType="needs_more_evidence" with concrete evidenceRequests.',
        'Rule: if process should continue, set stopNow=false and reasonType="continue".',
        '',
        'Case context:',
        caseContext,
        '',
        'Latest arguments:',
        `Barrister A: ${barristerA.text}`,
        `Barrister B: ${barristerB.text}`,
        '',
        'Judge intervention:',
        judgeInterjection.text,
      ].join('\n'),
    });
    tokensUsed += readTokenUsage(governanceCheck.usage);

    const governanceDecision = normalizeGovernanceDecision(
      parseJsonObject<GovernanceDecision>(governanceCheck.text)
    );
    if (governanceDecision.stopNow && governanceDecision.reasonType === 'needs_more_evidence') {
      roundsCompleted = round;
      stoppingReason = `Judge demanded further evidence: ${governanceDecision.reason}`;
      earlyOutcome = {
        type: 'Abort',
        summary: 'Judge requested further evidence before the dispute can continue.',
        reason: governanceDecision.reason,
        keyPoints: ['The current record is insufficient for a fair determination.'],
        needsMoreEvidence: true,
        evidenceRequests:
          governanceDecision.evidenceRequests.length > 0
            ? governanceDecision.evidenceRequests
            : ['Provide additional documentary evidence responsive to the judge questions.'],
      };
      break;
    }

    // Barrister A reply to judge
    const barristerAReply = await generateText({
      model: await getModel(),
      system:
        `You are Barrister A for Party A (Claimant). Respond directly to the judge question and attack Barrister B on unresolved contradictions.
Use light markdown formatting. Refer to yourself as "Attorney ${claimantLabel}" and the opponent as "Attorney ${defendantLabel}".`,
      prompt: [
        `Round: ${round}`,
        'Return a concise final response for this round.',
        '',
        'Judge question/interjection:',
        judgeInterjection.text,
        '',
        'Barrister B position:',
        barristerB.text,
        '',
        'Case context:',
        caseContext,
      ].join('\n'),
    });
    tokensUsed += readTokenUsage(barristerAReply.usage);
    appendEntry(newTranscriptEntry(round, 'barrister_a', barristerAReply.text));

    roundsCompleted = round;

    // Stop check - this is the key logic you requested
    const stopCheck = await generateText({
      model: await getModel(),
      system:
        'You are a judge deciding whether another adversarial round is useful. Respond with JSON only.',
      prompt: [
        `Round: ${round}`,
        'Return JSON exactly with keys: hasNewSubstance (boolean), reason (string).',
        '',
        'Case context:',
        caseContext,
        '',
        'Full transcript:',
        buildTranscriptText(transcript),
      ].join('\n'),
    });
    tokensUsed += readTokenUsage(stopCheck.usage);

    const parsedStopCheck = parseJsonObject<StopAssessment>(stopCheck.text);
    const hasNewSubstance = parsedStopCheck?.hasNewSubstance ?? false;
    const reason = parsedStopCheck?.reason?.trim() || 'No additional substantive movement detected.';

    if (!hasNewSubstance) {
      stoppingReason = `Judge stop decision: ${reason}`;
      break;
    }

    if (tokensUsed >= maxTokens) {
      stoppingReason = `Token limit reached (${tokensUsed} / ${maxTokens}).`;
      break;
    }
  }

  if (roundsCompleted >= maxRounds && !stoppingReason.toLowerCase().includes('token')) {
    stoppingReason = `Maximum rounds reached (${maxRounds}).`;
  }

  let outcome: CourtOutcome;
  if (earlyOutcome) {
    outcome = earlyOutcome;
  } else {
    // Final deliberation and verdict
    const deliberationSchema = z.object({
      type: z.enum(['Settlement', 'Verdict', 'Abort']),
      summary: z.string(),
      terms: z.array(z.string()).optional(),
      amount: z.number().nullable().optional(),
      winner: z.enum(['PartyA', 'PartyB']).optional(),
      reasoning: z.string().optional(),
      relief: z.string().optional(),
      reason: z.string().optional(),
      keyPoints: z.array(z.string()).optional(),
      needsMoreEvidence: z.boolean().optional(),
      evidenceRequests: z.array(z.string()).optional(),
    });

    const deliberation = await generateStructuredObject([
      'You are the final judge. Decide the dispute with one outcome: Settlement, Verdict, or Abort.',
      'Choose the single most defensible outcome.',
      'If evidence is insufficient to conclude fairly, choose Abort with needsMoreEvidence=true and specific evidenceRequests.',
      '',
      'Case context:',
      caseContext,
      '',
      'Full transcript:',
      buildTranscriptText(transcript),
      '',
      `Stopping reason: ${stoppingReason}`,
    ].join('\n'), deliberationSchema);

    const rawOutcome = deliberation as RawOutcome;
    outcome = normalizeOutcome(rawOutcome);
  }

  const timeline = buildTimeline(caseData.id, sessionId, shareToken, transcript, outcome);

  return {
    sessionId,
    shareToken,
    stoppingReason,
    roundsCompleted,
    tokensUsed,
    transcript,
    outcome,
    timeline,
    summary: outcome.summary,
  };
}

async function getModel() {
  // Import dynamically to avoid circular dependencies
  const { isAiConfigured, getModel } = await import('@/server/ai/service');
  
  if (!isAiConfigured()) {
    throw new Error("AI providers are not configured yet.");
  }
  
  // Use the actual AI model from the service
  return await getModel();
}
