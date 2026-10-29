import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { SESSION_CHECK_COMMAND } from '../stations/session-check.constants.ts'
import { detectProjectVendor, resolveSyncVendor } from './resolve-sync-vendor.ts'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { VendorId } from './model-tiers.types.ts'

let root: string

function touch(path: string): void {
	mkdirSync(dirname(join(root, path)), { recursive: true })
	writeFileSync(join(root, path), '')
}

function resolve(params: { given?: string; remembered?: VendorId; interactive?: boolean }) {
	return resolveSyncVendor({
		given: params.given,
		remembered: params.remembered,
		cwd: root,
		interactive: params.interactive ?? false,
	})
}

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), 'resolve-vendor-'))
})

afterEach(() => {
	rmSync(root, { recursive: true, force: true })
})

describe('resolveSyncVendor', () => {
	it('no TTY, no vendor, nothing detected -> fail naming --vendor', () => {
		const resolution = resolve({})

		expect(resolution.kind).toBe('fail')
		expect(resolution.kind === 'fail' && resolution.output).toContain('--vendor')
	})

	it('--vendor openai -> set, without detecting', () => {
		touch('.claude/settings.json')

		expect(resolve({ given: 'openai' })).toEqual({ kind: 'set', vendor: 'openai' })
	})

	it('--vendor acme -> rejected with the known ids', () => {
		expect(() => resolve({ given: 'acme' })).toThrow('anthropic, openai, google')
	})

	it('a remembered vendor wins over detection', () => {
		touch('.claude/settings.json')

		expect(resolve({ remembered: 'google' })).toEqual({ kind: 'set', vendor: 'google' })
	})

	it('.claude/ only -> anthropic', () => {
		touch('.claude/settings.json')

		expect(resolve({})).toEqual({ kind: 'set', vendor: 'anthropic' })
	})

	it('a multi-vendor host on a TTY -> ask among every vendor; without a TTY -> fail', () => {
		touch('.github/copilot-instructions.md')

		expect(resolve({ interactive: true })).toEqual({
			kind: 'ask',
			candidates: ['anthropic', 'openai', 'google'],
		})
		expect(resolve({}).kind).toBe('fail')
	})

	it('nothing detected on a TTY -> ask among every vendor', () => {
		expect(resolve({ interactive: true }).kind).toBe('ask')
	})

	it('.claude holding only the skills a sync wrote is no evidence of Claude Code', () => {
		touch('.claude/skills/.dialecte-skills.json')
		writeFileSync(join(root, '.claude/skills/.dialecte-skills.json'), '{"installed":[]}')

		expect(resolve({}).kind).toBe('unset')
	})

	it('.claude holding anything else as well -> anthropic', () => {
		touch('.claude/skills/.dialecte-skills.json')
		touch('.claude/settings.json')

		expect(resolve({})).toEqual({ kind: 'set', vendor: 'anthropic' })
	})

	it('.claude holding only what a sync wrote (skills, station agents, its session check) is no evidence; a key of the user in settings.json is', () => {
		mkdirSync(join(root, '.claude/skills'), { recursive: true })
		writeFileSync(
			join(root, '.claude/skills/.dialecte-skills.json'),
			'{"installed":[],"stationAgents":["dialecte-reviewer.md"],"sessionCheck":true}',
		)
		mkdirSync(join(root, '.claude/agents'), { recursive: true })
		writeFileSync(join(root, '.claude/agents/dialecte-reviewer.md'), 'x')
		const check = { hooks: { command: SESSION_CHECK_COMMAND } }
		writeFileSync(
			join(root, '.claude/settings.json'),
			JSON.stringify({ hooks: { SessionStart: [{ hooks: [check.hooks] }] } }),
		)
		expect(detectProjectVendor(root)).toEqual({ kind: 'none' })

		writeFileSync(join(root, '.claude/settings.json'), JSON.stringify({ permissions: {} }))
		expect(detectProjectVendor(root)).toMatchObject({ kind: 'one', vendor: 'anthropic' })
	})

	it('.github/skills holding only synced skills is no evidence of Copilot; with its own skill it is', () => {
		touch('.github/skills/.dialecte-skills.json')
		writeFileSync(join(root, '.github/skills/.dialecte-skills.json'), '{"installed":[]}')
		expect(detectProjectVendor(root)).toEqual({ kind: 'none' })

		touch('.github/skills/my-own-skill/SKILL.md')
		expect(detectProjectVendor(root).kind).toBe('choose')
	})
})
