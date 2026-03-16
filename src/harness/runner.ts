import * as exec from '@actions/exec';
import * as core from '@actions/core';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
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
  dangerouslySkipPermissions: boolean;
}

const CLAUDE_HOME = path.join(os.homedir(), '.claude');

// Files that contain auth credentials — excluded from session backups
// so they never get committed to a branch.
const AUTH_EXCLUDE_PATTERNS = [
  '.credentials.json',
  'credentials.json',
  'auth.json',
  'oauth*',
  'statsig',
  'config.json',
];

export async function installClaude(): Promise<void> {
  core.info('Installing Claude Code CLI...');
  await exec.exec('npm', ['install', '-g', '@anthropic-ai/claude-code']);
  core.info('Claude Code CLI installed');
}

export async function restoreAuthCredentials(base64Tarball: string): Promise<void> {
  core.info('Restoring Claude auth credentials from secret...');
  fs.mkdirSync(CLAUDE_HOME, { recursive: true });

  const tarball = Buffer.from(base64Tarball, 'base64');
  const tmpFile = path.join(os.tmpdir(), 'claude-auth.tar.gz');
  fs.writeFileSync(tmpFile, tarball);

  await exec.exec('tar', ['xzf', tmpFile, '-C', os.homedir()]);
  fs.unlinkSync(tmpFile);
  core.info('Claude auth credentials restored');
}

export async function backupClaudeSession(): Promise<void> {
  if (!fs.existsSync(CLAUDE_HOME)) {
    core.debug('No .claude directory to backup');
    return;
  }

  const backupFile = sessionBackupPath();
  core.info(`Backing up Claude session to ${backupFile}`);

  // Exclude auth-related files so credentials never get committed to a branch
  const excludeArgs = AUTH_EXCLUDE_PATTERNS.flatMap(p => ['--exclude', `.claude/${p}`]);
  await exec.exec('tar', ['czf', backupFile, ...excludeArgs, '-C', os.homedir(), '.claude']);
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

  args.push(options.prompt);

  const env: Record<string, string> = {
    ...process.env as Record<string, string>,
  };

  // Only set ANTHROPIC_API_KEY when using API key auth.
  // When using claude_credentials (Max subscription), auth comes
  // from the restored ~/.claude/ credentials files instead.
  if (options.apiKey) {
    env.ANTHROPIC_API_KEY = options.apiKey;
  }

  let stdout = '';
  let stderr = '';

  const exitCode = await exec.exec('claude', args, {
    cwd: options.workingDirectory,
    env,
    listeners: {
      stdout: (data: Buffer) => { stdout += data.toString(); },
      stderr: (data: Buffer) => { stderr += data.toString(); },
    },
    ignoreReturnCode: true,
  });

  if (exitCode !== 0 && !stdout) {
    core.error(`Claude Code exited with code ${exitCode}: ${stderr}`);
    return {
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
    };
  }

  return parseStreamOutput(stdout, options.sessionId);
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
