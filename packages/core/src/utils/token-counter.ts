/**
 * Simple token estimator for context window management.
 * Uses character-based heuristics: ~3.5 chars per token for code, ~4 chars for natural language.
 * This is intentionally conservative to avoid exceeding model limits.
 */

const CHARS_PER_TOKEN_CODE = 3.5;
const CHARS_PER_TOKEN_TEXT = 4.0;

/** Estimate token count from a string. For code, use ~3.5 chars/token; for natural language ~4. */
export function estimateTokens(text: string, isCode = false): number {
  const ratio = isCode ? CHARS_PER_TOKEN_CODE : CHARS_PER_TOKEN_TEXT;
  return Math.ceil(text.length / ratio);
}

/** Estimate token count for a message object (role + content). */
export function estimateMessageTokens(message: {
  role: string;
  content: string | unknown[];
}): number {
  const roleTokens = estimateTokens(message.role, false);
  let contentTokens = 0;
  if (typeof message.content === 'string') {
    contentTokens = estimateTokens(message.content, false);
  } else if (Array.isArray(message.content)) {
    for (const block of message.content) {
      if (typeof block === 'string') {
        contentTokens += estimateTokens(block, false);
      } else if (block && typeof block === 'object' && 'text' in block) {
        contentTokens += estimateTokens(String((block as any).text), false);
      }
    }
  }
  return roleTokens + contentTokens;
}

/**
 * Trim context to fit within the model's remaining token budget.
 * Ensures critical context (first part) is preserved while truncating less critical parts.
 */
export function trimContextToBudget(
  context: string,
  maxTokens: number,
): { trimmed: string; estimatedTokens: number; wasTrimmed: boolean } {
  const estimated = estimateTokens(context, true);
  if (estimated <= maxTokens) {
    return { trimmed: context, estimatedTokens: estimated, wasTrimmed: false };
  }
  // Trim from the end preserving the beginning which typically has project structure / rules
  const targetChars = Math.floor(maxTokens * CHARS_PER_TOKEN_CODE * 0.9); // 10% safety margin
  const lines = context.split('\n');
  let chars = 0;
  let cutoff = lines.length;
  for (let i = 0; i < lines.length; i++) {
    chars += lines[i].length + 1; // +1 for newline
    if (chars > targetChars) {
      cutoff = i;
      break;
    }
  }
  const trimmed = lines.slice(0, cutoff).join('\n') +
    `\n\n... (truncated ${lines.length - cutoff} lines to fit context window)`;
  return { trimmed, estimatedTokens: estimateTokens(trimmed, true), wasTrimmed: true };
}

/**
 * Warn if conversation is approaching the context limit.
 * Returns { warning: string | null, estimatedTotal: number, remaining: number }.
 */
export function checkContextBudget(
  systemPromptLength: number,
  historyMessageCount: number,
  totalEstimatedTokens: number,
  contextLimit: number,
): { warning: string | null; estimatedTotal: number; remaining: number } {
  const remaining = Math.max(0, contextLimit - totalEstimatedTokens);
  if (remaining < contextLimit * 0.1) {
    return {
      warning: `Context window nearly full (${totalEstimatedTokens}/${contextLimit} tokens). Consider starting a new chat.`,
      estimatedTotal: totalEstimatedTokens,
      remaining,
    };
  }
  return { warning: null, estimatedTotal: totalEstimatedTokens, remaining };
}
