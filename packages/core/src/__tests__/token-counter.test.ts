/**
 * Token counter tests.
 *
 * Run with: npx ts-node --esm src/__tests__/token-counter.test.ts
 * Or wire into your test framework of choice.
 */
import { estimateTokens, estimateMessageTokens, trimContextToBudget, checkContextBudget } from '../utils/token-counter';
import assert from 'node:assert';

function run(): void {
  // ── estimateTokens ──
  // ASCII text
  {
    const t = estimateTokens('Hello, this is a test message.', false);
    assert.ok(t > 0, 'ASCII text should produce positive token count');
    // Expected: ~34 chars / 4.0 ≈ 9 tokens
    assert.ok(t >= 5 && t <= 15, `ASCII estimate should be ~9, got ${t}`);
  }

  // Chinese text
  {
    const t = estimateTokens('这是一条中文测试消息', false);
    assert.ok(t > 0, 'Chinese text should produce positive token count');
    // Expected: 9 CJK chars / 1.5 ≈ 6 tokens
    assert.ok(t >= 3 && t <= 12, `Chinese estimate should be ~6, got ${t}`);
  }

  // Mixed CJK + ASCII
  {
    const t = estimateTokens('你好World这是test', false);
    assert.ok(t > 0, 'Mixed text should produce positive token count');
    // Expected: 6 CJK (~4 tokens) + 9 ASCII (~2.25 tokens) ≈ 7
    assert.ok(t >= 4 && t <= 15, `Mixed estimate should be ~7, got ${t}`);
  }

  // Code
  {
    const t = estimateTokens('function hello() { return "world"; }', true);
    assert.ok(t > 0, 'Code should produce positive token count');
    // Expected: 39 chars / 3.5 ≈ 12 tokens
    assert.ok(t >= 8 && t <= 20, `Code estimate should be ~12, got ${t}`);
  }

  // Empty string
  {
    const t = estimateTokens('', false);
    assert.equal(t, 0, 'Empty string should be 0 tokens');
  }

  // ── estimateMessageTokens ──
  {
    const t = estimateMessageTokens({ role: 'user', content: 'Hello world' });
    // role "user" = 4 chars / 4 ≈ 1, content "Hello world" = 11 / 4 ≈ 3
    assert.ok(t >= 3 && t <= 8, `Message token estimate should be ~4, got ${t}`);
  }

  // With array content blocks
  {
    const t = estimateMessageTokens({
      role: 'user',
      content: [{ type: 'text', text: 'Hello' }, { type: 'text', text: 'World' }],
    });
    assert.ok(t >= 2 && t <= 8, `Array content estimate should be small, got ${t}`);
  }

  // ── trimContextToBudget ──
  {
    const text = 'line1\nline2\nline3\nline4\nline5\nline6\nline7\nline8\nline9\nline10\n';
    const { trimmed, wasTrimmed } = trimContextToBudget(text, 2); // very tight budget
    assert.ok(wasTrimmed, 'Should have trimmed with tight budget');
    assert.ok(trimmed.length > 0, 'Trimmed result should not be empty');
    assert.ok(trimmed.includes('truncated'), 'Trimmed result should mention truncation');
  }

  {
    const text = 'short text';
    const { wasTrimmed } = trimContextToBudget(text, 1000);
    assert.ok(!wasTrimmed, 'Should not trim when budget is large enough');
  }

  // ── checkContextBudget ──
  {
    const result = checkContextBudget(500, 10, 50000, 128000);
    assert.equal(result.warning, null, 'No warning when under budget');
    assert.ok(result.remaining > 0);
  }

  {
    const result = checkContextBudget(1000, 100, 120000, 128000);
    assert.ok(result.warning !== null, 'Should warn when near limit');
    assert.ok(result.warning!.includes('nearly full'));
  }

  console.log('PASS: token-counter.test.ts — all tests passed');
}

run();
