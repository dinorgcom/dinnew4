import { eq, desc } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { cases, evidence, witnesses, consultants } from '@/db/schema';
import { runCourtSimulation, type CourtSimulationResult, type CourtTranscriptEntry } from '@/lib/court-simulation';
import { getAuthorizedCase, createCaseActivity } from '@/server/cases/mutations';
import { getCaseDetail } from '@/server/cases/queries';
import type { ProvisionedAppUser } from '@/server/auth/provision';

interface RunnerOptions {
  maxRounds?: number;
  maxTokens?: number;
  onTranscriptEntry?: (entry: CourtTranscriptEntry) => void;
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
  evidence: Array<{
    title: string;
    type: string;
    description: string;
    status: string;
    notes: string;
    uploaderRole: 'claimant' | 'respondent';
  }>;
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

function convertCaseDetailToSimulationCase(detail: NonNullable<Awaited<ReturnType<typeof getCaseDetail>>>): SimulationCase {
  return {
    id: detail.case.id,
    caseNumber: detail.case.caseNumber,
    title: detail.case.title,
    description: detail.case.description || '',
    category: detail.case.category || '',
    claimAmount: Number(detail.case.claimAmount) || 0,
    currency: detail.case.currency || 'USD',
    claimantName: detail.case.claimantName || '',
    respondentName: detail.case.respondentName || '',
    claimantLawyerKey: detail.case.claimantLawyerKey || '',
    respondentLawyerKey: detail.case.respondentLawyerKey || '',
    claimantClaims: Array.isArray(detail.case.claimantClaims) 
    ? detail.case.claimantClaims.map(claim => JSON.stringify(claim)).join('\n')
    : '',
    respondentClaims: Array.isArray(detail.case.respondentClaims)
    ? detail.case.respondentClaims.map(claim => JSON.stringify(claim)).join('\n')
    : '',
    evidence: detail.evidence.map(item => ({
      title: item.title,
      type: item.type,
      description: item.description || '',
      status: item.status,
      notes: item.notes || '',
      uploaderRole: item.submittedBy === 'claimant' ? 'claimant' : 'respondent', // Map from participantKind to PartyRole
    })),
    witnesses: detail.witnesses.map(item => ({
      fullName: item.fullName || '',
      relationship: item.relationship || '',
      statement: item.statement || '',
      status: item.status || 'pending',
    })),
    consultants: detail.consultants.map(item => ({
      fullName: item.fullName || '',
      company: item.company || '',
      expertise: item.expertise || '',
      role: item.role || '',
      report: item.report || '',
      status: item.status || 'pending',
    })),
  };
}

export async function runAndPersistCourtSimulation(
  user: ProvisionedAppUser | null,
  caseId: string,
  options: RunnerOptions = {}
): Promise<CourtSimulationResult> {
  // Ensure user is authenticated and has admin/moderator role
  if (!user || (user.role !== 'moderator' && user.role !== 'admin')) {
    throw new Error('Moderator access required');
  }

  // For admins and moderators, we can bypass the case association check
  // but we still need to verify the case exists
  const db = getDb();
  const caseRows = await db.select().from(cases).where(eq(cases.id, caseId)).limit(1);
  const caseItem = caseRows[0];

  if (!caseItem) {
    throw new Error('Case not found');
  }

  // Check if simulation is already running or recently completed
  const existingCases = await db
    .select({
      simulationSessionId: cases.simulationSessionId,
      simulationCompletedAt: cases.simulationCompletedAt,
    })
    .from(cases)
    .where(eq(cases.id, caseId))
    .limit(1);
  const existingCase = existingCases[0];

  if (existingCase?.simulationSessionId && !existingCase.simulationCompletedAt) {
    throw new Error('Simulation is already in progress for this case');
  }

  // Get detailed case information - admins should get full access
  const detail = await getCaseDetail(user, caseId);
  if (!detail) {
    // If getCaseDetail fails for admin, create a minimal detail object
    const [evidenceRows, witnessRows, consultantRows] = await Promise.all([
      db.select().from(evidence).where(eq(evidence.caseId, caseId)),
      db.select().from(witnesses).where(eq(witnesses.caseId, caseId)),
      db.select().from(consultants).where(eq(consultants.caseId, caseId)),
    ]);

    const minimalDetail = {
      case: caseItem,
      role: user.role as 'admin' | 'moderator',
      evidence: evidenceRows,
      witnesses: witnessRows,
      consultants: consultantRows,
      activities: [],
      expertiseRequests: [],
      messages: [],
      conversations: [],
      claimantLawyerKey: caseItem.claimantLawyerKey || '',
      respondentLawyerKey: caseItem.respondentLawyerKey || '',
    };

    // Convert to simulation format
    const simulationCase = convertCaseDetailToSimulationCase(minimalDetail as any);

    // Run the simulation
    const simulation = await runCourtSimulation(simulationCase, {
      ...options,
      onTranscriptEntry: options.onTranscriptEntry,
    });

    // Convert simulation outcome to judgement format for storage
    const judgementJson = convertSimulationOutcomeToJudgement(simulation.outcome);
    const finalDecision = `${simulation.outcome.type}: ${simulation.outcome.summary}`;

    // Update the case with simulation results
    const updated = await db
      .update(cases)
      .set({
        judgementJson,
        finalDecision,
        settlementAmount: simulation.outcome.type === 'Settlement' && simulation.outcome.amount 
          ? simulation.outcome.amount.toString() 
          : null,
        // Store simulation-specific data
        simulationSessionId: simulation.sessionId,
        simulationShareToken: simulation.shareToken,
        simulationOutcomeType: simulation.outcome.type,
        simulationStoppingReason: simulation.stoppingReason,
        simulationRounds: simulation.roundsCompleted.toString(),
        simulationTokensUsed: simulation.tokensUsed.toString(),
        simulationResult: simulation as any,
        simulationTimeline: simulation.timeline as any,
        simulationCompletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(cases.id, caseId))
      .returning();

    // Create activity log
    const actorName = user?.fullName || user?.email || 'Unknown user';
    await createCaseActivity(
      caseId,
      'decision',
      'Court simulation completed',
      `${simulation.outcome.type} reached: ${simulation.outcome.summary}`,
      actorName,
    );

    return simulation;
  }

  // Convert to simulation format
  const simulationCase = convertCaseDetailToSimulationCase(detail);

  // Run the simulation
  const simulation = await runCourtSimulation(simulationCase, {
    ...options,
    onTranscriptEntry: options.onTranscriptEntry,
  });

  // Convert simulation outcome to judgement format for storage
  const judgementJson = convertSimulationOutcomeToJudgement(simulation.outcome);
  const finalDecision = `${simulation.outcome.type}: ${simulation.outcome.summary}`;

  // Update the case with simulation results
  const updated = await db
    .update(cases)
    .set({
      judgementJson,
      finalDecision,
      settlementAmount: simulation.outcome.type === 'Settlement' && simulation.outcome.amount 
        ? simulation.outcome.amount.toString() 
        : null,
      // Store simulation-specific data
      simulationSessionId: simulation.sessionId,
      simulationShareToken: simulation.shareToken,
      simulationOutcomeType: simulation.outcome.type,
      simulationStoppingReason: simulation.stoppingReason,
      simulationRounds: simulation.roundsCompleted.toString(),
      simulationTokensUsed: simulation.tokensUsed.toString(),
      simulationResult: simulation as any,
      simulationTimeline: simulation.timeline as any,
      simulationCompletedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(cases.id, caseId))
    .returning();

  // Create activity log
  const actorName = user?.fullName || user?.email || 'Unknown user';
  await createCaseActivity(
    caseId,
    'decision',
    'Court simulation completed',
    `${simulation.outcome.type} reached: ${simulation.outcome.summary}`,
    actorName,
  );

  return simulation;
}

function convertSimulationOutcomeToJudgement(outcome: any): Record<string, any> {
  switch (outcome.type) {
    case 'Settlement':
      return {
        summary: outcome.summary,
        claims_analysis: [{
          claim: 'Settlement reached',
          finding: 'Both parties agreed to settle',
          reasoning: outcome.summary,
        }],
        evidence_assessment: 'Evidence was sufficient to reach a settlement agreement',
        prevailing_party: 'split',
        judgement_summary: outcome.summary,
        remedies_ordered: outcome.terms || [],
        award_amount: outcome.amount || 0,
        detailed_rationale: `Settlement reached with terms: ${(outcome.terms || []).join(', ')}`,
      };

    case 'Verdict':
      return {
        summary: outcome.summary,
        claims_analysis: [{
          claim: 'Final verdict rendered',
          finding: `${outcome.winner === 'PartyA' ? 'Claimant' : 'Respondent'} prevails`,
          reasoning: outcome.reasoning,
        }],
        evidence_assessment: 'Evidence was reviewed and verdict rendered based on available facts',
        prevailing_party: outcome.winner === 'PartyA' ? 'claimant' : 'respondent',
        judgement_summary: outcome.summary,
        remedies_ordered: [outcome.relief],
        award_amount: 0, // Verdicts don't typically include amounts unless specified
        detailed_rationale: outcome.reasoning,
      };

    case 'Abort':
      return {
        summary: outcome.summary,
        claims_analysis: [{
          claim: 'Simulation aborted',
          finding: 'Could not reach resolution',
          reasoning: outcome.reason,
        }],
        evidence_assessment: 'Insufficient evidence for fair determination',
        prevailing_party: 'split',
        judgement_summary: outcome.summary,
        remedies_ordered: outcome.evidenceRequests || [],
        award_amount: 0,
        detailed_rationale: outcome.reason,
      };

    default:
      return {
        summary: 'Unknown outcome',
        claims_analysis: [],
        evidence_assessment: 'No assessment available',
        prevailing_party: 'split',
        judgement_summary: 'No summary available',
        remedies_ordered: [],
        award_amount: 0,
        detailed_rationale: 'No rationale available',
      };
  }
}

export async function getStoredSimulation(user: ProvisionedAppUser | null, caseId: string): Promise<CourtSimulationResult | null> {
  // Ensure user is authenticated and has admin/moderator role
  if (!user || (user.role !== 'moderator' && user.role !== 'admin')) {
    throw new Error('Forbidden');
  }

  const detail = await getCaseDetail(user, caseId);
  if (!detail || !detail.case.simulationResult) {
    return null;
  }

  try {
    const result = typeof detail.case.simulationResult === 'string' 
      ? JSON.parse(detail.case.simulationResult) 
      : detail.case.simulationResult;
    return result as CourtSimulationResult;
  } catch (error) {
    console.error('Failed to parse stored simulation result:', error);
    return null;
  }
}
