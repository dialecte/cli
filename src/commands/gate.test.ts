import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { createScratchRepository } from '../../test/scratch-repository.ts'
import { runGate } from './gate.ts'

import { describe, expect, it } from 'vitest'

import type { GateStep } from '../lib/gate/gate-config.types.ts'

/** A package whose gate runs the given steps. */
function packageWith(params: {
	fast?: GateStep[]
	full?: GateStep[]
	generatedDocs?: string[]
	scripts?: Record<string, string>
	files?: Record<string, string>
}): string {
	return createScratchRepository({
		'package.json': JSON.stringify({
			name: 'demo',
			scripts: params.scripts ?? {},
			dialecte: {
				gate: { fast: params.fast, full: params.full },
				generatedDocs: params.generatedDocs,
			},
		}),
		...params.files,
	})
}

describe('runGate', () => {
	it('a step whose output says passed but exits non-zero → failed, the next step not run', () => {
		const root = packageWith({
			fast: [
				{ name: 'check', run: `printf ' Tests  4 passed (4)\\n'; exit 3` },
				{ name: 'tests', run: 'echo never', counts: 'tests' },
			],
		})

		const result = runGate({ cwd: root, argv: [] })

		expect(result.exitCode).toBe(1)
		expect(result.output.split('\n').slice(0, 3)).toEqual([
			'FAIL  check  exit 3  tests 4 passed / 4',
			'--    tests  not run: an earlier step failed',
			'gate --fast: failed at check',
		])
	})

	it('a docs build rewrote a declared generated file → restored byte-exact, even when the step fails', () => {
		const original = Buffer.from([0x7b, 0x0a, 0x09, 0x22, 0xe2, 0x9c, 0x93, 0x22, 0x0d, 0x0a, 0x7d])
		const root = packageWith({
			full: [
				{
					name: 'docs',
					run: 'printf rewritten > doc/data/catalog.json; exit 1',
					restoresGeneratedDocs: true,
				},
			],
			generatedDocs: ['doc/data/catalog.json'],
			files: { 'doc/data/catalog.json': 'x' },
		})
		writeFileSync(join(root, 'doc/data/catalog.json'), original)

		const result = runGate({ cwd: root, argv: ['--full'] })

		expect(readFileSync(join(root, 'doc/data/catalog.json')).equals(original)).toBe(true)
		expect(result.output.split('\n')[0]).toBe('FAIL  docs  exit 1  restored doc/data/catalog.json')
	})

	it('a test step that counts no test, or exits 0 with a failed test → failed', () => {
		const silent = packageWith({
			fast: [
				{
					name: 'tests',
					run: `printf 'No test files found, exiting with code 0\n'`,
					counts: 'tests',
				},
			],
		})
		const failing = packageWith({
			fast: [{ name: 'tests', run: `printf ' Tests  1 failed | 3 passed (4)\n'`, counts: 'tests' }],
		})

		expect(runGate({ cwd: silent, argv: [] }).output.split('\n')[0]).toBe(
			'FAIL  tests  exit 0  no test ran',
		)
		expect(runGate({ cwd: failing, argv: [] }).output.split('\n')[0]).toBe(
			'FAIL  tests  exit 0  tests 3 passed, 1 failed / 4  1 test(s) failed',
		)
	})

	it('an npm script the package lacks → skipped; the rest green → exit 0 with the counts', () => {
		const root = packageWith({
			scripts: { check: `printf 'Found 0 warnings and 0 errors.\n'` },
			fast: [
				{ name: 'check', run: 'npm run check' },
				{ name: 'skills', run: 'npm run skills:check' },
			],
		})

		expect(runGate({ cwd: root, argv: [] })).toEqual({
			exitCode: 0,
			output: [
				'ok    check  exit 0  0 error(s), 0 warning(s)',
				'skip  skills  no npm script "skills:check"',
				'gate --fast: green',
			].join('\n'),
		})
	})

	it('a hand-over script holds the repository → refused, no step run', () => {
		const root = packageWith({ fast: [{ name: 'check', run: 'touch ran' }] })
		writeFileSync(join(root, '.git/dialecte-handover.lock'), '/plans/commit.sh\n')

		const result = runGate({ cwd: root, argv: [] })

		expect(result.exitCode).toBe(1)
		expect(result.output).toContain('held by the hand-over /plans/commit.sh')
		expect(result.output).toContain(`delete ${join(root, '.git/dialecte-handover.lock')}`)
		expect(existsSync(join(root, 'ran'))).toBe(false)
	})
})
