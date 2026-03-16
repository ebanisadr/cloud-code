import * as exec from '@actions/exec';
import * as core from '@actions/core';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawn } from 'child_process';
import { sessionBackupPath } from './session';
import { ToolCall } from '../utils/format-comment';
import { DONE_SIGNAL } from '../prompt/defaults';

export interface RunResult {
  sessionId: string;
  text: string;
  toolCalls: ToolCall[];
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  durationMs: number;
  isDone: boolean;
  isCompacted: boolean;
  isError: boolean;
}

export interface RunOptions {
  prompt: string;
  model: string;
  maxContext: number;
  sessionId?: string;
  workingDirectory: string;
  apiKey: string;
  oauthToken?: string;
  dangerouslySkipPermissions: boolean;
  timeoutMs: number;
}

const CLAUDE_HOME = path.join(os.homedir(), '.claude');

export async function installClaude(): Promise<void> {
  core.info('Installing Claude Code CLI...');
  await exec.exec('npm', ['install', '-g', '@anthropic-ai/claude-code']);
  core.info('Claude Code CLI installed');
}

export async function backupClaudeSession(): Promise<void> {
  if (!fs.existsSync(CLAUDE_HOME)) {
    core.debug('No .claude directory to backup');
    return;
  }

  const backupFile = sessionBackupPath();
  core.info(`Backing up Claude session to ${backupFile}`);

  await exec.exec('tar', ['czf', backupFile, '-C', os.homedir(), '.claude']);
}

export async function restoreClaudeSession(): Promise<void> {
  const backupFile = sessionBackupPath();
  if (!fs.existsSync(backupFile)) {
    core.debug('No Claude session backup to restore');
    return;
  }

  core.info('Restoring Claude session backup...');
  await exec.exec('tar', ['xzf', backupFile, '-C', os.homedir()]);
  core.info('Claude session restored');
}

export async function runClaude(options: RunOptions): Promise<RunResult> {
  const args = [
    '--print',
    '--verbose',
    '--output-format', 'stream-json',
    '--model', options.model,
    '--max-turns', '1',
  ];

  if (options.dangerouslySkipPermissions) {
    args.push('--dangerously-skip-permissions');
  }

  if (options.sessionId) {
    args.push('--resume', options.sessionId);
  }

  // Prompt is piped via stdin (not as a positional arg) to avoid
  // OS argument length limits and ensure proper delivery.

  const env: Record<string, string> = {
    ...process.env as Record<string, string>,
  };

  if (options.apiKey) {
    env.ANTHROPIC_API_KEY = options.apiKey;
  }

  if (options.oauthToken) {
    env.CLAUDE_CODE_OAUTH_TOKEN = options.oauthToken;
  }

  core.info(`Running Claude Code (timeout: ${options.timeoutMs / 60000}m)`);

  return new Promise<RunResult>((resolve) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const child = spawn('claude', args, {
      cwd: options.workingDirectory,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const timeout = setTimeout(() => {
      timedOut = true;
      core.warning(`Claude Code timed out after ${options.timeoutMs / 60000} minutes — killing process`);
      child.kill('SIGTERM');
      setTimeout(() => {
        if (!child.killed) child.kill('SIGKILL');
      }, 10_000);
    }, options.timeoutMs);

    child.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    // Pipe prompt via stdin and close to signal EOF
    child.stdin.write(options.prompt);
    child.stdin.end();

    child.on('close', (exitCode) => {
      clearTimeout(timeout);

      if (timedOut) {
        // Parse whatever output we got before the timeout
        const partial = stdout ? parseStreamOutput(stdout, options.sessionId) : null;
        resolve({
          sessionId: partial?.sessionId ?? options.sessionId ?? '',
          text: (partial?.text ?? '') + `\n\nError: Claude Code timed out after ${options.timeoutMs / 60000} minutes.`,
          toolCalls: partial?.toolCalls ?? [],
          inputTokens: partial?.inputTokens ?? 0,
          outputTokens: partial?.outputTokens ?? 0,
          costUsd: partial?.costUsd ?? 0,
          durationMs: options.timeoutMs,
          isDone: false,
          isCompacted: false,
          isError: true,
        });
        return;
      }

      if (exitCode !== 0 && !stdout) {
        core.error(`Claude Code exited with code ${exitCode}: ${stderr}`);
        resolve({
          sessionId: options.sessionId ?? '',
          text: `Error: Claude Code exited with code ${exitCode}\n${stderr}`,
          toolCalls: [],
          inputTokens: 0,
          outputTokens: 0,
          costUsd: 0,
          durationMs: 0,
          isDone: false,
          isCompacted: false,
          isError: true,
        });
        return;
      }

      resolve(parseStreamOutput(stdout, options.sessionId));
    });
  });
}

function parseStreamOutput(stdout: string, fallbackSessionId?: string): RunResult {
  const lines = stdout.trim().split('\n').filter(Boolean);

  let sessionId = fallbackSessionId ?? '';
  let text = '';
  const toolCalls: ToolCall[] = [];
  let inputTokens = 0;
  let outputTokens = 0;
  let costUsd = 0;
  let durationMs = 0;
  let isError = false;
  let isCompacted = false;

  // Track tool uses by ID so we can match them with results
  const pendingTools = new Map<string, ToolCall>();

  for (const line of lines) {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(line);
    } catch {
      core.debug(`Skipping non-JSON line: ${line.slice(0, 100)}`);
      continue;
    }

    const type = msg.type as string;

    if (type === 'system' || type === 'init') {
      if (msg.session_id) sessionId = msg.session_id as string;
    }

    if (type === 'assistant' || type === 'message') {
      const message = (msg.message ?? msg) as Record<string, unknown>;
      if (message.session_id) sessionId = message.session_id as string;

      const content = message.content as Array<Record<string, unknown>> | undefined;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === 'text' && typeof block.text === 'string') {
            text += block.text;
          }
          if (block.type === 'tool_use') {
            const tc: ToolCall = {
              name: block.name as string,
              input: block.input as Record<string, unknown>,
            };
            pendingTools.set(block.id as string, tc);
            toolCalls.push(tc);
          }
        }
      }

      // Check for usage in the message
      const usage = message.usage as Record<string, number> | undefined;
      if (usage) {
        inputTokens = Math.max(inputTokens, usage.input_tokens ?? 0);
        outputTokens += usage.output_tokens ?? 0;
      }
    }

    if (type === 'tool_result') {
      const toolUseId = msg.tool_use_id as string;
      const tc = pendingTools.get(toolUseId);
      if (tc) {
        const content = msg.content;
        if (typeof content === 'string') {
          tc.output = content;
        } else if (Array.isArray(content)) {
          tc.output = content
            .filter((b: Record<string, unknown>) => b.type === 'text')
            .map((b: Record<string, unknown>) => b.text)
            .join('\n');
        }
      }
    }

    if (type === 'result') {
      if (msg.session_id) sessionId = msg.session_id as string;
      costUsd = (msg.cost_usd as number) ?? 0;
      durationMs = (msg.duration_ms as number) ?? 0;
      isError = (msg.is_error as boolean) ?? false;
      if (typeof msg.result === 'string') {
        // The result field sometimes contains the final text
        if (!text) text = msg.result;
      }
    }

    // Detect compaction
    if (
      type === 'system' &&
      ((msg.subtype as string) === 'compaction' ||
        (typeof msg.message === 'string' && (msg.message as string).includes('compaction')))
    ) {
      isCompacted = true;
    }
  }

  const isDone = text.includes(DONE_SIGNAL);

  return {
    sessionId,
    text,
    toolCalls,
    inputTokens,
    outputTokens,
    costUsd,
    durationMs,
    isDone,
    isCompacted,
    isError,
  };
}
