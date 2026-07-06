/**
 * API client message format conversion tests.
 *
 * Run with: npx ts-node --esm src/__tests__/api-client.test.ts
 */
import type { Message } from '../ai/message-types';
import assert from 'node:assert';

/**
 * Replicates the toAnthropicMessages logic for standalone testing.
 * (The actual function is private; this is a copy for test verification.)
 */
function toAnthropicMessages(messages: Message[]): unknown[] {
  const filtered = messages.filter((m) => m.role !== 'system');
  const result: unknown[] = [];

  for (let i = 0; i < filtered.length; i++) {
    const m = filtered[i];

    if (m.role === 'tool') {
      const toolResults: unknown[] = [{ type: 'tool_result', tool_use_id: m.toolCallId || 'unknown', content: m.content }];
      while (i + 1 < filtered.length && filtered[i + 1].role === 'tool') {
        i++;
        toolResults.push({ type: 'tool_result', tool_use_id: filtered[i].toolCallId || 'unknown', content: filtered[i].content });
      }
      result.push({ role: 'user', content: toolResults });
      continue;
    }

    if (m.role === 'assistant' && m.toolCalls?.length) {
      const content: unknown[] = [];
      if (m.content) content.push({ type: 'text', text: m.content });
      for (const tc of m.toolCalls) {
        content.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.args });
      }
      result.push({ role: 'assistant', content });
      continue;
    }

    if (m.role === 'user' && m.attachments?.length) {
      const content: unknown[] = [];
      for (const att of m.attachments) {
        if (att.type === 'image' && att.content) {
          const b64 = att.content.replace(/^data:image\/\w+;base64,/, '');
          content.push({
            type: 'image',
            source: { type: 'base64', media_type: att.mimeType || 'image/png', data: b64 },
          });
        }
      }
      if (m.content) content.push({ type: 'text', text: m.content });
      result.push({ role: 'user', content });
      continue;
    }
    result.push({ role: m.role, content: m.content });
  }
  return result;
}

function run(): void {
  // ── Simple user message ──
  {
    const msgs: Message[] = [
      { role: 'user', content: 'Hello' },
    ];
    const result = toAnthropicMessages(msgs);
    assert.equal(result.length, 1);
    assert.deepStrictEqual(result[0], { role: 'user', content: 'Hello' });
    console.log('  PASS: simple user message');
  }

  // ── System message filtered out ──
  {
    const msgs: Message[] = [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'Hi' },
    ];
    const result = toAnthropicMessages(msgs);
    assert.equal(result.length, 1);
    assert.deepStrictEqual((result[0] as any).role, 'user');
    console.log('  PASS: system message filtered');
  }

  // ── Assistant with tool calls ──
  {
    const msgs: Message[] = [
      { role: 'user', content: 'Read file.ts' },
      {
        role: 'assistant',
        content: 'Let me read that file.',
        toolCalls: [{ id: 'tc1', name: 'read_file', args: { filePath: 'file.ts' } }],
      },
    ];
    const result = toAnthropicMessages(msgs);
    assert.equal(result.length, 2);
    const assistantMsg = result[1] as any;
    assert.equal(assistantMsg.role, 'assistant');
    assert.ok(Array.isArray(assistantMsg.content));
    assert.equal(assistantMsg.content.length, 2); // text + tool_use
    assert.equal(assistantMsg.content[0].type, 'text');
    assert.equal(assistantMsg.content[1].type, 'tool_use');
    assert.equal(assistantMsg.content[1].name, 'read_file');
    console.log('  PASS: assistant with tool calls');
  }

  // ── Consecutive tool results merged ──
  {
    const msgs: Message[] = [
      { role: 'user', content: 'Write two files' },
      {
        role: 'assistant',
        content: '',
        toolCalls: [
          { id: 'tc1', name: 'write_file', args: { filePath: 'a.ts' } },
          { id: 'tc2', name: 'write_file', args: { filePath: 'b.ts' } },
        ],
      },
      { role: 'tool', toolCallId: 'tc1', content: 'Wrote a.ts' },
      { role: 'tool', toolCallId: 'tc2', content: 'Wrote b.ts' },
    ];
    const result = toAnthropicMessages(msgs);
    // User + Assistant + User(tool_results merged)
    const toolMsg = result[result.length - 1] as any;
    assert.equal(toolMsg.role, 'user');
    assert.equal(toolMsg.content.length, 2, 'Both tool results should be in one user message');
    assert.equal(toolMsg.content[0].type, 'tool_result');
    assert.equal(toolMsg.content[1].type, 'tool_result');
    console.log('  PASS: consecutive tool results merged');
  }

  // ── User message with image attachment ──
  {
    const msgs: Message[] = [
      {
        role: 'user',
        content: 'What is this?',
        attachments: [{ type: 'image', content: 'data:image/png;base64,iVBORw0KGgo=', mimeType: 'image/png', name: 'screenshot.png' }],
      },
    ];
    const result = toAnthropicMessages(msgs);
    const userMsg = result[0] as any;
    assert.equal(userMsg.role, 'user');
    assert.ok(Array.isArray(userMsg.content));
    assert.equal(userMsg.content[0].type, 'image');
    assert.equal(userMsg.content[0].source.type, 'base64');
    assert.equal(userMsg.content[1].type, 'text');
    console.log('  PASS: user message with image');
  }

  // ── Empty history ──
  {
    const result = toAnthropicMessages([]);
    assert.equal(result.length, 0);
    console.log('  PASS: empty history');
  }

  // ── Assistant message without tool calls ──
  {
    const msgs: Message[] = [
      { role: 'user', content: 'Say hi' },
      { role: 'assistant', content: 'Hi there!' },
    ];
    const result = toAnthropicMessages(msgs);
    assert.equal(result.length, 2);
    assert.deepStrictEqual(result[1], { role: 'assistant', content: 'Hi there!' });
    console.log('  PASS: assistant without tool calls');
  }

  console.log('\nPASS: api-client.test.ts — all tests passed');
}

run();
