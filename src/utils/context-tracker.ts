export interface ContextUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  available: number;
}

export function parseContextUsage(
  resultMessage: Record<string, unknown>,
  maxContext: number
): ContextUsage {
  const usage = (resultMessage.usage ?? {}) as Record<string, number>;
  const inputTokens = usage.input_tokens ?? 0;
  const outputTokens = usage.output_tokens ?? 0;
  const totalTokens = inputTokens + outputTokens;

  return {
    inputTokens,
    outputTokens,
    totalTokens,
    available: maxContext,
  };
}

export function formatContextFooter(
  usage: ContextUsage,
  model: string,
  sessionId: string
): string {
  const used = usage.totalTokens.toLocaleString();
  const available = usage.available.toLocaleString();
  return `\u{1f4ca} Context: ${used} / ${available} tokens \u00b7 Model: ${model} \u00b7 Session: \`${sessionId.slice(0, 8)}\``;
}
