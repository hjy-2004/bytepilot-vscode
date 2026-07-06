/**
 * Configuration validator tests.
 *
 * Run with: npx ts-node --esm src/__tests__/validator.test.ts
 */
import { validateConfig } from '../config/validator';
import type { ProviderConfig } from '../types/ai';
import assert from 'node:assert';

function makeConfig(overrides: Partial<ProviderConfig> = {}): ProviderConfig {
  return {
    provider: 'anthropic',
    chatModel: 'claude-sonnet-4-6',
    completionModel: 'claude-haiku-4-5-20251001',
    options: { temperature: 0.7, maxTokens: 4096 },
    ...overrides,
  };
}

function run(): void {
  // ── Valid config with API key ──
  {
    const warnings = validateConfig(makeConfig(), true);
    assert.equal(warnings.length, 0, 'Should have no warnings for valid config with key');
    console.log('  PASS: valid config with API key — no warnings');
  }

  // ── Missing API key ──
  {
    const warnings = validateConfig(makeConfig(), false);
    assert.ok(warnings.some(w => w.includes('No API key')), 'Should warn about missing API key');
    console.log('  PASS: missing API key — warning raised');
  }

  // ── Ollama doesn't need API key ──
  {
    const warnings = validateConfig(makeConfig({ provider: 'ollama' }), false);
    assert.ok(!warnings.some(w => w.includes('No API key')), 'Ollama should not require API key');
    console.log('  PASS: ollama without API key — no API key warning');
  }

  // ── Missing chat model ──
  {
    const warnings = validateConfig(makeConfig({ chatModel: '' }), true);
    assert.ok(warnings.some(w => w.includes('No chat model')), 'Should warn about missing chat model');
    console.log('  PASS: missing chat model — warning raised');
  }

  // ── Missing completion model ──
  {
    const warnings = validateConfig(makeConfig({ completionModel: '' }), true);
    assert.ok(warnings.some(w => w.includes('No completion model')), 'Should warn about missing completion model');
    console.log('  PASS: missing completion model — warning raised');
  }

  // ── Invalid temperature (too low) ──
  {
    const warnings = validateConfig(makeConfig({ options: { temperature: -0.5, maxTokens: 4096 } }), true);
    assert.ok(warnings.some(w => w.includes('Temperature')), 'Should warn about invalid temperature');
    console.log('  PASS: temperature < 0 — warning raised');
  }

  // ── Invalid temperature (too high) ──
  {
    const warnings = validateConfig(makeConfig({ options: { temperature: 2.5, maxTokens: 4096 } }), true);
    assert.ok(warnings.some(w => w.includes('Temperature')), 'Should warn about too high temperature');
    console.log('  PASS: temperature > 2 — warning raised');
  }

  // ── Max tokens too low ──
  {
    const warnings = validateConfig(makeConfig({ options: { temperature: 0.7, maxTokens: 100 } }), true);
    assert.ok(warnings.some(w => w.includes('Max tokens')), 'Should warn about too low maxTokens');
    console.log('  PASS: maxTokens < 256 — warning raised');
  }

  // ── Boundary: temperature 0 is valid ──
  {
    const warnings = validateConfig(makeConfig({ options: { temperature: 0, maxTokens: 4096 } }), true);
    assert.ok(!warnings.some(w => w.includes('Temperature')), 'Temperature 0 should be valid');
    console.log('  PASS: temperature = 0 — no warning');
  }

  // ── Boundary: temperature 2 is valid ──
  {
    const warnings = validateConfig(makeConfig({ options: { temperature: 2, maxTokens: 4096 } }), true);
    assert.ok(!warnings.some(w => w.includes('Temperature')), 'Temperature 2 should be valid');
    console.log('  PASS: temperature = 2 — no warning');
  }

  // ── Boundary: maxTokens 256 is valid ──
  {
    const warnings = validateConfig(makeConfig({ options: { temperature: 0.7, maxTokens: 256 } }), true);
    assert.ok(!warnings.some(w => w.includes('Max tokens')), 'maxTokens 256 should be valid');
    console.log('  PASS: maxTokens = 256 — no warning');
  }

  // ── DeepSeek with key ──
  {
    const warnings = validateConfig(makeConfig({ provider: 'deepseek' }), true);
    assert.equal(warnings.length, 0, 'DeepSeek with key should have no warnings');
    console.log('  PASS: deepseek with key — no warnings');
  }

  console.log('\nPASS: validator.test.ts — all tests passed');
}

run();
