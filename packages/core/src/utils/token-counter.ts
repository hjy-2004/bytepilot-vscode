/**
 * Token estimator for context window management.
 *
 * Uses character-based heuristics to estimate token counts. Different character
 * categories consume different numbers of tokens in modern tokenizers:
 * - CJK (Chinese/Japanese/Korean) characters: ~1.5 chars per token
 * - ASCII/European text: ~3.5 chars per token
 * - Code (mixed): ~3.5 chars per token (special chars take ~1 token each)
 *
 * This is intentionally conservative to avoid exceeding model limits.
 * For production use with precise limits, a real tokenizer like tiktoken
 * or the AI provider's token-counting endpoint should be used.
 */

const CHARS_PER_TOKEN_CODE = 3.5;
const CHARS_PER_TOKEN_TEXT = 4.0;
// CJK characters are typically 1-2 per token (most common: ~1.5)
const CHARS_PER_TOKEN_CJK = 1.5;

// Unicode ranges for CJK characters
const CJK_RANGES: [number, number][] = [
  [0x4E00, 0x9FFF],   // CJK Unified Ideographs
  [0x3400, 0x4DBF],   // CJK Unified Ideographs Extension A
  [0x20000, 0x2A6DF], // CJK Unified Ideographs Extension B
  [0x2A700, 0x2B73F], // CJK Unified Ideographs Extension C
  [0x2B740, 0x2B81F], // CJK Unified Ideographs Extension D
  [0x2B820, 0x2CEAF], // CJK Unified Ideographs Extension E
  [0xF900, 0xFAFF],   // CJK Compatibility Ideographs
  [0x2F800, 0x2FA1F], // CJK Compatibility Ideographs Supplement
  [0x3000, 0x303F],   // CJK Symbols and Punctuation
  [0xFF00, 0xFFEF],   // Halfwidth and Fullwidth Forms
  [0x3040, 0x309F],   // Hiragana
  [0x30A0, 0x30FF],   // Katakana
  [0xAC00, 0xD7AF],   // Hangul Syllables
];

function isCJK(codePoint: number): boolean {
  return CJK_RANGES.some(([start, end]) => codePoint >= start && codePoint <= end);
}

/** Count CJK vs non-CJK characters in a string. */
function countChars(text: string): { cjk: number; ascii: number } {
  let cjk = 0;
  let ascii = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0) || 0;
    if (isCJK(cp)) {
      cjk++;
    } else {
      ascii++;
    }
  }
  return { cjk, ascii };
}

/** Estimate token count from a string. Differentiates CJK from ASCII for better accuracy. */
export function estimateTokens(text: string, isCode = false): number {
  if (isCode) {
    // Code: use simple ratio (identifiers, punctuation, keywords are mostly ASCII)
    return Math.ceil(text.length / CHARS_PER_TOKEN_CODE);
  }
  const { cjk, ascii } = countChars(text);
  return Math.ceil(cjk / CHARS_PER_TOKEN_CJK + ascii / CHARS_PER_TOKEN_TEXT);
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
        contentTokens += estimateTokens(String((block as { text: unknown }).text), false);
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
