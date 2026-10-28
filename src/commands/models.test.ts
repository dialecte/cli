import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { runModels } from './models.ts'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

let root: string

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), 'models-'))
	writeFileSync(join(root, 'package.json'), '{}')
})

afterEach(() => {
	rmSync(root, { recursive: true, force: true })
})

describe('runModels', () => {
	it('the vendor the manifest remembers -> its tier map; --vendor wins', () => {
		mkdirSync(join(root, '.claude/skills'), { recursive: true })
		writeFileSync(
			join(root, '.claude/skills/.dialecte-skills.json'),
			JSON.stringify({ installed: [], vendor: 'anthropic' }),
		)

		expect(runModels({ argv: [], cwd: root }).output).toMatch(/^standard {2}Sonnet 5\.5$/m)
		expect(runModels({ argv: ['--vendor', 'openai'], cwd: root }).output).toMatch(
			/^standard {2}Sol$/m,
		)
	})

	it('no vendor remembered, none given -> exit 2; unknown --vendor -> exit 1', () => {
		expect(runModels({ argv: [], cwd: root }).exitCode).toBe(2)
		expect(runModels({ argv: ['--vendor', 'acme'], cwd: root }).exitCode).toBe(1)
	})

	it('manifests that disagree -> a warning naming them, the most recently written wins, exit 0', () => {
		writeManifest({ folder: '.claude/skills', vendor: 'anthropic', writtenAt: 1_000 })
		writeManifest({ folder: '.agents/skills', vendor: 'openai', writtenAt: 2_000 })

		const result = runModels({ argv: [], cwd: root })

		expect(result.exitCode).toBe(0)
		expect(result.output).toMatch(/^standard {2}Sol$/m)
		expect(result.warnings).toContain('.claude/skills: anthropic')
		expect(result.warnings).toContain('.agents/skills: openai')
	})

	it('a remembered vendor that is no known id -> warned and ignored (exit 2, no vendor known)', () => {
		writeManifest({ folder: '.claude/skills', vendor: 'acme', writtenAt: 1_000 })

		const result = runModels({ argv: [], cwd: root })

		expect(result.exitCode).toBe(2)
		expect(result.warnings).toContain('unknown vendor "acme" ignored')
	})

	it('outside a package -> a usage error, exit 2', () => {
		rmSync(join(root, 'package.json'))

		expect(runModels({ argv: ['--vendor', 'openai'], cwd: root }).exitCode).toBe(2)
	})
})

function writeManifest(params: { folder: string; vendor: string; writtenAt: number }): void {
	const path = join(root, params.folder, '.dialecte-skills.json')
	mkdirSync(join(root, params.folder), { recursive: true })
	writeFileSync(path, JSON.stringify({ installed: [], vendor: params.vendor }))
	utimesSync(path, params.writtenAt, params.writtenAt)
}
