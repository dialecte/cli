import { detectVendor } from './detect-vendor.ts'

import { describe, expect, it } from 'vitest'

function detect(...paths: string[]) {
	return detectVendor({ presentPaths: new Set(paths) })
}

describe('detectVendor', () => {
	it('.claude/ only -> anthropic', () => {
		expect(detect('.claude')).toEqual({ kind: 'one', vendor: 'anthropic', agent: 'claude-code' })
	})

	it('AGENTS.md + .codex/ -> openai; AGENTS.md alone -> nothing', () => {
		expect(detect('AGENTS.md', '.codex')).toEqual({ kind: 'one', vendor: 'openai', agent: 'codex' })
		expect(detect('AGENTS.md')).toEqual({ kind: 'none' })
	})

	it('.gemini/ -> google', () => {
		expect(detect('.gemini')).toEqual({ kind: 'one', vendor: 'google', agent: 'gemini-cli' })
	})

	it('.github/copilot-instructions.md -> copilot, needs a choice', () => {
		expect(detect('.github/copilot-instructions.md')).toEqual({
			kind: 'choose',
			candidates: ['anthropic', 'openai', 'google', 'microsoft'],
		})
		expect(detect('.github/skills')).toEqual({
			kind: 'choose',
			candidates: ['anthropic', 'openai', 'google', 'microsoft'],
		})
		expect(detect('.cursor')).toEqual({
			kind: 'choose',
			candidates: ['anthropic', 'openai', 'google'],
		})
	})

	it('a single-vendor host with a multi-family host -> the union, in vendor order, no repeat', () => {
		expect(detect('.claude', '.github/copilot-instructions.md')).toEqual({
			kind: 'choose',
			candidates: ['anthropic', 'openai', 'google', 'microsoft'],
		})
		expect(detect('.claude', '.cursor')).toEqual({
			kind: 'choose',
			candidates: ['anthropic', 'openai', 'google'],
		})
		expect(detect('.gemini', '.github/copilot-instructions.md')).toEqual({
			kind: 'choose',
			candidates: ['anthropic', 'openai', 'google', 'microsoft'],
		})
		expect(detect('.gemini', '.cursor')).toEqual({
			kind: 'choose',
			candidates: ['anthropic', 'openai', 'google'],
		})
	})

	it('several agents -> their vendors as candidates', () => {
		expect(detect('.claude', '.gemini')).toEqual({
			kind: 'choose',
			candidates: ['anthropic', 'google'],
		})
	})

	it('nothing -> none', () => {
		expect(detect()).toEqual({ kind: 'none' })
	})
})
