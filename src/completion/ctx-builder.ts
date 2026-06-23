import * as vscode from 'vscode';

const MAX_PREFIX_LINES = 100;
const MAX_SUFFIX_LINES = 20;
const MAX_FILE_SIZE = 100 * 1024; // 100KB

/**
 * Builds the prompt context for inline code completion requests.
 */
export class CompletionCtxBuilder {
  /**
   * Extract prefix (before cursor) and suffix (after cursor) text
   * for Fill-in-the-Middle style completion.
   */
  build(
    document: vscode.TextDocument,
    position: vscode.Position
  ): { prefix: string; suffix: string; language: string } | null {
    // Skip large files
    const fullText = document.getText();
    if (fullText.length > MAX_FILE_SIZE) {
      return null;
    }

    const language = document.languageId;
    const offset = document.offsetAt(position);

    // Prefix: everything before the cursor (capped to last MAX_PREFIX_LINES)
    const prefixText = fullText.substring(0, offset);
    const prefixLines = prefixText.split('\n');
    const prefix = prefixLines.slice(-MAX_PREFIX_LINES).join('\n');

    // Suffix: everything after the cursor (capped to MAX_SUFFIX_LINES)
    const suffixText = fullText.substring(offset);
    const suffixLines = suffixText.split('\n');
    const suffix = suffixLines.slice(0, MAX_SUFFIX_LINES).join('\n');

    return { prefix, suffix, language };
  }

  /**
   * Build a prompt string for the AI model.
   */
  formatPrompt(prefix: string, suffix: string, language: string): string {
    return `You are a code completion engine. Complete the code at the cursor position indicated by <cursor/>.
Only return the completion code. Do NOT include any explanation, preamble, or markdown formatting.
Do NOT repeat the prefix or suffix code. Return ONLY the new code to insert.

Language: ${language}

<file>
${prefix}<cursor/>${suffix}
</file>

Complete the code:`;
  }
}
