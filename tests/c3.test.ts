import { describe, it, expect } from 'vitest'

/**
 * Phase C3 smoke tests — verify all C3 modules can be imported without error.
 * These tests run in Node (not a browser), so they only validate that the
 * TypeScript compilation and module resolution succeed.  UI behaviour is
 * verified manually via the dev server.
 */
describe('Phase C3 — Chat UI modules', () => {
  it('react-markdown can be resolved', async () => {
    // Dynamic import so failures give a clear message
    const mod = await import('react-markdown')
    expect(typeof mod.default).toBe('function')
  })

  it('useChat hook exports the expected symbols', async () => {
    // Hooks import React internals so we can only verify the module shape here
    const mod = await import('../src/hooks/useChat')
    expect(typeof mod.useChat).toBe('function')
  })

  it('useChatHistory hook exports the expected symbols', async () => {
    const mod = await import('../src/hooks/useChatHistory')
    expect(typeof mod.useChatHistory).toBe('function')
  })
})
