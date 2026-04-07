import { ok, fail } from "@/server/api/responses";
import { ensureAppUser } from "@/server/auth/provision";
import { getDb } from "@/db/client";
import { hearings, hearingTranscripts, hearingParticipants } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "crypto";

interface RouteProps {
  params: Promise<{ hearingId: string }>;
}

export async function POST(request: Request, { params }: RouteProps) {
  try {
    const { hearingId } = await params;
    const user = await ensureAppUser();
    const db = getDb();

    // Get hearing details
    const hearing = await db.query.hearings.findFirst({
      where: eq(hearings.id, hearingId),
    });

    if (!hearing) {
      return fail("HEARING_NOT_FOUND", "Hearing not found", 404);
    }

    if (hearing.status !== 'scheduled') {
      return fail("HEARING_NOT_SCHEDULED", "Hearing must be scheduled to start", 400);
    }

    // Check if hearing is scheduled for future (more than 5 minutes from now)
    const now = new Date();
    const scheduledStart = new Date(hearing.scheduledStartTime);
    const timeDiffMs = scheduledStart.getTime() - now.getTime();
    const timeDiffMinutes = timeDiffMs / (1000 * 60);
    
    if (timeDiffMinutes > 5) {
      return fail("HEARING_TOO_EARLY", `Hearing is scheduled for ${scheduledStart.toLocaleString()}. AI agents can only join within 5 minutes of start time. Current time: ${now.toLocaleString()}`, 400);
    }

    // Create dynamic system prompt with hearing context
    const createSystemPrompt = (role: string, hearing: any) => {
      const context = `HEARING CONTEXT:
Case: ${hearing.caseNumber || 'Unknown'}
Title: ${hearing.title || 'Court Hearing'}
Scheduled: ${new Date(hearing.scheduledStartTime).toLocaleString()}
Participants: ${hearing.participants?.map((p: any) => p.name).join(', ') || 'TBD'}

`;
      
      const rolePrompts = {
        judge: `${context}You are Judge AI for this court hearing. 
RESPONSIBILITIES:
- Maintain courtroom order and proper procedure
- Ensure all parties have opportunity to present their case
- Make fair and impartial rulings based on evidence and applicable law
- Ask clarifying questions when necessary
- Keep proceedings efficient and respectful

COMMUNICATION STYLE:
- Authoritative but fair
- Clear and concise legal language
- Reference relevant procedures when making rulings
- Maintain judicial decorum at all times`,
        
        claimant_lawyer: `${context}You are Claimant Lawyer AI representing the plaintiff/petitioner.
RESPONSIBILITIES:
- Present compelling arguments supporting the claim
- Cite relevant laws, precedents, and evidence
- Cross-examine opposing witnesses effectively
- Object to improper questioning or evidence
- Advocate zealously but ethically for your client

COMMUNICATION STYLE:
- Professional and persuasive
- Reference specific legal authorities
- Anticipate and counter opposing arguments
- Maintain respectful courtroom demeanor`,
        
        respondent_lawyer: `${context}You are Respondent Lawyer AI representing the defendant.
RESPONSIBILITIES:
- Defend against claims with solid legal arguments
- Challenge evidence and witness credibility appropriately
- File timely objections to improper procedures
- Present counter-evidence and alternative interpretations
- Protect your client's legal rights

COMMUNICATION STYLE:
- Analytical and defensive
- Focus on legal loopholes and procedural defenses
- Remain calm under pressure
- Maintain professional courtroom conduct`
      };
      
      return rolePrompts[role as keyof typeof rolePrompts] || rolePrompts.judge;
    };

    // Create AI agents using Pika Skills
    const aiAgents = [
      {
        id: randomUUID(),
        hearingId,
        participantType: "ai_judge",
        role: "judge",
        displayName: "Judge AI",
        aiConfig: {
          voiceId: 'pNInz6obpgDQGcFmaJgB',
          personality: 'authoritative_fair',
          systemPrompt: createSystemPrompt('judge', hearing)
        },
        voiceId: 'pNInz6obpgDQGcFmaJgB',
        personality: 'authoritative_fair',
        joinedAt: new Date(),
        isActive: 'true',
      },
      // Commented out to save Pika credits - only using Judge AI for now
      /*
      {
        id: randomUUID(),
        hearingId,
        participantType: "ai_lawyer",
        role: "claimant_lawyer",
        displayName: "Claimant Lawyer AI",
        aiConfig: {
          voiceId: 'AZnzlk1XvdvUeBnXmlld',
          personality: 'analytical_defensive',
          systemPrompt: 'You are Claimant Lawyer AI. Present compelling arguments for the claimant\'s case, cite relevant laws and precedents.'
        },
        voiceId: 'AZnzlk1XvdvUeBnXmlld',
        personality: 'analytical_defensive',
        joinedAt: new Date(),
        isActive: 'true',
      },
      {
        id: randomUUID(),
        hearingId,
        participantType: "ai_lawyer",
        role: "respondent_lawyer",
        displayName: "Respondent Lawyer AI",
        aiConfig: {
          voiceId: 'AZnzlk1XvdvUeBnXmlld',
          personality: 'analytical_defensive',
          systemPrompt: 'You are Respondent Lawyer AI. Defend against claims, challenge evidence, and protect respondent\'s interests.'
        },
        voiceId: 'AZnzlk1XvdvUeBnXmlld',
        personality: 'analytical_defensive',
        joinedAt: new Date(),
        isActive: 'true',
      }
      */
    ];

    // Add AI participants to database
    await db.insert(hearingParticipants).values(aiAgents);

    // Start Pika session for each AI agent
    console.log('🤖 Starting Pika sessions for', aiAgents.length, 'AI agents');
    const pikaSessions: Array<{agentId: string, sessionId: string, status: string}> = [];
    
    for (const agent of aiAgents) {
      console.log('🎭 Creating Pika session for agent:', agent.role);
      
      const pikaResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/pika-skills`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meetUrl: hearing.meetingUrl,
          botName: agent.displayName,
          voiceId: agent.voiceId,
          systemPrompt: agent.aiConfig.systemPrompt,
          timeoutSec: 30
        }),
        signal: AbortSignal.timeout(300000) // 5 minutes timeout
      });

      console.log('📡 Pika API response for', agent.role, ':', pikaResponse.status);

      if (!pikaResponse.ok) {
        const errorData = await pikaResponse.json();
        console.error('❌ Failed to start Pika session for', agent.role, ':', errorData);
        throw new Error(`Failed to start Pika session for ${agent.role}: ${errorData.error?.message || 'Unknown error'}`);
      }

      const pikaResult = await pikaResponse.json();
      console.log('✅ Pika session created for', agent.role, ':', pikaResult);

      // Update participant with Pika session ID
      await db.update(hearingParticipants)
        .set({
          pikaParticipantId: pikaResult.data?.sessionId || pikaResult.sessionId
        })
        .where(eq(hearingParticipants.id, agent.id));

      pikaSessions.push({
        agentId: agent.id,
        sessionId: pikaResult.data?.sessionId || pikaResult.sessionId,
        status: pikaResult.data?.status || 'starting'
      });
    }

    // Update hearing status
    await db.update(hearings)
      .set({
        status: 'ai_ready',
        transcriptionSessionId: randomUUID(),
        pikaSessionId: pikaSessions.length > 0 ? pikaSessions[0].sessionId : null
      })
      .where(eq(hearings.id, hearingId));

    return ok({
      success: true,
      message: "AI agents activated for hearing",
      agents: aiAgents.map(agent => ({
        id: agent.id,
        name: agent.displayName,
        role: agent.role,
        voiceId: agent.voiceId,
      })),
      pikaSessions,
      meetingUrl: hearing.meetingUrl,
      instructions: {
        judge: "The Judge AI will maintain order and make rulings",
        claimantLawyer: "Claimant Lawyer AI disabled to save Pika credits",
        respondentLawyer: "Respondent Lawyer AI disabled to save Pika credits",
        pikaStatus: pikaSessions.length > 0 ? "Judge AI is joining the meeting" : "Failed to start Pika session"
      },
    });

  } catch (error) {
    console.error('Failed to activate AI agents:', error);
    const message = error instanceof Error ? error.message : "Failed to activate AI agents";
    return fail("AI_ACTIVATION_FAILED", message, 500);
  }
}

export async function DELETE(request: Request, { params }: RouteProps) {
  try {
    const { hearingId } = await params;
    const user = await ensureAppUser();
    const db = getDb();

    // Get active AI participants with Pika session IDs
    const activeParticipants = await db.query.hearingParticipants.findMany({
      where: and(
        eq(hearingParticipants.hearingId, hearingId),
        eq(hearingParticipants.isActive, 'true'),
        eq(hearingParticipants.participantType, 'ai_judge')
      ),
    });

    // Terminate all active Pika sessions
    const terminationResults = [];
    for (const participant of activeParticipants) {
      if (participant.pikaParticipantId) {
        try {
          console.log(`🛑 Terminating Pika session ${participant.pikaParticipantId} for ${participant.displayName}`);
          
          const terminateResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/pika-skills?sessionId=${participant.pikaParticipantId}`, {
            method: 'DELETE',
            signal: AbortSignal.timeout(30000) // 30 seconds timeout
          });

          if (terminateResponse.ok) {
            const result = await terminateResponse.json();
            terminationResults.push({
              sessionId: participant.pikaParticipantId,
              agentName: participant.displayName,
              success: true,
              meetingNotes: result.data?.meetingNotes || null
            });
            console.log(`✅ Successfully terminated session for ${participant.displayName}`);
          } else {
            terminationResults.push({
              sessionId: participant.pikaParticipantId,
              agentName: participant.displayName,
              success: false,
              error: `HTTP ${terminateResponse.status}`
            });
            console.error(`❌ Failed to terminate session for ${participant.displayName}: ${terminateResponse.status}`);
          }
        } catch (error) {
          terminationResults.push({
            sessionId: participant.pikaParticipantId,
            agentName: participant.displayName,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
          console.error(`❌ Error terminating session for ${participant.displayName}:`, error);
        }
      }
    }

    // Update hearing status - back to scheduled, AI removed
    await db.update(hearings)
      .set({
        status: 'scheduled',
        transcriptionSessionId: null,
        pikaSessionId: null
      })
      .where(eq(hearings.id, hearingId));

    // Mark AI participants as inactive
    await db.update(hearingParticipants)
      .set({
        isActive: 'false',
        leftAt: new Date(),
      })
      .where(and(
        eq(hearingParticipants.hearingId, hearingId),
        eq(hearingParticipants.participantType, 'ai_judge')
      ));

    await db.update(hearingParticipants)
      .set({
        isActive: 'false',
        leftAt: new Date(),
      })
      .where(and(
        eq(hearingParticipants.hearingId, hearingId),
        eq(hearingParticipants.participantType, 'ai_lawyer')
      ));

    return ok({
      success: true,
      message: "AI agents deactivated and Pika sessions terminated",
      terminatedSessions: terminationResults,
      creditsSaved: terminationResults.filter(r => r.success).length
    });

  } catch (error) {
    console.error('Failed to deactivate AI agents:', error);
    const message = error instanceof Error ? error.message : "Failed to deactivate AI agents";
    return fail("AI_DEACTIVATION_FAILED", message, 500);
  }
}
