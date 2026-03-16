import * as core from '@actions/core';
import { RunResult, RunOptions, runClaude } from './runner';
import { readAllTurns } from './turn-logger';
import { SessionState, writeSession } from './session';

export async function handleCompaction(
  session: SessionState,
  fallbackMaxContext: number,
  runOptions: Omit<RunOptions, 'sessionId' | 'prompt' | 'maxContext'>
): Promise<RunResult> {
  core.info('Compaction detected — restarting session with extended context');

  // Mark the old session as compacted
  session.status = 'compacted';
  writeSession(session);

  // Build a replay prompt from stored turns
  const turns = readAllTurns();
  const replayParts: string[] = [
    'This is a continuation of a previous session that hit context limits.',
    'Here is the conversation history:',
    '',
  ];

  for (const turn of turns) {
    const roleLabel = turn.role === 'human' ? 'Human' : 'Assistant';
    replayParts.push(`--- ${roleLabel} (Turn ${turn.turnNumber}) ---`);
    replayParts.push(turn.content);
    replayParts.push('');
  }

  replayParts.push('--- End of history ---');
  replayParts.push('');
  replayParts.push('Continue where you left off. The context window has been expanded.');

  const replayPrompt = replayParts.join('\n');

  // Start a fresh session with higher context
  const result = await runClaude({
    ...runOptions,
    prompt: replayPrompt,
    maxContext: fallbackMaxContext,
    sessionId: undefined, // Fresh session
  });

  return result;
}
