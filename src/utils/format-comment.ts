import { ContextUsage, formatContextFooter } from './context-tracker';

export interface ToolCall {
  name: string;
  input: Record<string, unknown>;
  output?: string;
  durationMs?: number;
}

export function formatToolCallsSection(toolCalls: ToolCall[]): string {
  if (toolCalls.length === 0) return '';

  const totalDuration = toolCalls.reduce((sum, tc) => sum + (tc.durationMs ?? 0), 0);
  const durationStr = (totalDuration / 1000).toFixed(1);

  const lines: string[] = [];
  for (const tc of toolCalls) {
    const inputStr = formatToolInput(tc);
    lines.push(`$ ${tc.name}: ${inputStr}`);
    if (tc.output) {
      const truncated = truncateOutput(tc.output, 200);
      lines.push(truncated);
    }
    lines.push('');
  }

  return [
    '<details>',
    `<summary>\u{1f527} Tool Calls (${toolCalls.length} calls, ${durationStr}s)</summary>`,
    '',
    '```',
    lines.join('\n').trimEnd(),
    '```',
    '',
    '</details>',
  ].join('\n');
}

function formatToolInput(tc: ToolCall): string {
  const input = tc.input;
  if (tc.name === 'Bash' && typeof input.command === 'string') {
    return input.command;
  }
  if (tc.name === 'Read' && typeof input.file_path === 'string') {
    return input.file_path;
  }
  if (tc.name === 'Write' && typeof input.file_path === 'string') {
    return `${input.file_path} (write)`;
  }
  if (tc.name === 'Edit' && typeof input.file_path === 'string') {
    return `${input.file_path} (edit)`;
  }
  if (tc.name === 'Grep' && typeof input.pattern === 'string') {
    return `grep "${input.pattern}"`;
  }
  if (tc.name === 'Glob' && typeof input.pattern === 'string') {
    return `glob "${input.pattern}"`;
  }
  return JSON.stringify(input).slice(0, 200);
}

function truncateOutput(output: string, maxLines: number): string {
  const lines = output.split('\n');
  if (lines.length <= maxLines) return output;
  return [
    ...lines.slice(0, maxLines),
    `[output truncated — ${lines.length - maxLines} more lines]`,
  ].join('\n');
}

export function formatComment(
  text: string,
  toolCalls: ToolCall[],
  usage: ContextUsage,
  model: string,
  sessionId: string
): string {
  const toolSection = formatToolCallsSection(toolCalls);
  const footer = formatContextFooter(usage, model, sessionId);

  return [
    toolSection,
    text.trim(),
    '',
    '---',
    footer,
  ]
    .filter(Boolean)
    .join('\n');
}
