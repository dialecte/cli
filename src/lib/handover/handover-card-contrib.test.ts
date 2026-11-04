/** The hand-over card per profile: a consumer's gates, a contributor's contrib section, and the verdict they give. */

import {
	CONTRIB_NEVER_RUN,
	MUTATION_DECLARATION,
} from '../../../test/handover-profile.constants.ts'
import {
	cardOf,
	editAgain,
	moveHeadWithSameTree,
	editedPackage,
	recordGateAndContrib,
} from '../../../test/handover-profile.ts'
import { reportRun } from '../../../test/mutation-hooks.ts'
import { survivorOf } from '../../../test/mutation-package.ts'
import { noRepositoryCli } from '../../../test/repository-cli-probe.ts'
import { SCRATCH_REPOSITORY_TIMEOUT, WRITER_CLI } from '../../../test/scratch-checks.constants.ts'
import { createCounter, gateLinesOf, runFolder, runGateIn } from '../../../test/scratch-checks.ts'
import { SOURCE_FILE } from '../../../test/scratch-contrib.constants.ts'
import { counterStep } from '../../../test/scratch-contrib.ts'
import { writeFiles } from '../../../test/scratch-repository.ts'
import { runHandover } from '../../commands/handover.ts'
import { runRules } from '../../commands/rules.ts'

import { describe, expect, it } from 'vitest'

import type { GateStep } from '../gate/gate-config.types.ts'

/** The lines of the gates a consumer's card must not hold: the contributor checks. */
const CONTRIBUTOR_ONLY_LINES = ['rules', 'docs', 'type-bench', 'release']

/** The package steps the cards count: docs and type-bench, both passing. */
function passingSteps(): GateStep[] {
	const counter = createCounter()
	return [counterStep({ counter, name: 'docs' }), counterStep({ counter, name: 'type-bench' })]
}

/** The package steps with a type bench that fails. */
function failingBenchSteps(): GateStep[] {
	const counter = createCounter()
	return [
		counterStep({ counter, name: 'docs' }),
		counterStep({ counter, name: 'type-bench', exitCode: 1 }),
	]
}

/** The package steps with a type bench the package has no script for: the row is skipped. */
function skippedBenchSteps(): GateStep[] {
	return [
		counterStep({ counter: createCounter(), name: 'docs' }),
		{ name: 'type-bench', run: 'npm run type-bench:check' },
	]
}

describe('the card of a consumer', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('gates hold the gate steps, the review and the standard; no rules, docs, type-bench, release nor mutation line; no contrib section', async () => {
		const root = editedPackage({ profile: null })
		await runGateIn({ cwd: root, argv: [] })
		runRules({ cwd: root, argv: [] })

		const { data, text } = cardOf({ root })

		const names = data.gates.map((line) => line.name)
		expect(names).toEqual(expect.arrayContaining(['check', 'review', 'standard']))
		expect(names.filter((name) => [...CONTRIBUTOR_ONLY_LINES, 'mutation'].includes(name))).toEqual(
			[],
		)
		expect(data.profile).toBe('consumer')
		expect(data.contrib).toBeUndefined()
		expect(text).not.toContain('contrib')
	})

	it('a declared mutation scope → a mutation line in gates', async () => {
		const root = editedPackage({ profile: null, mutation: MUTATION_DECLARATION })
		await runGateIn({ cwd: root, argv: [] })

		const { data } = cardOf({ root })

		expect(data.gates.filter((line) => line.name === 'mutation')).toEqual([
			expect.objectContaining({ status: 'passed' }),
		])
		expect(data.contrib).toBeUndefined()
	})

	it('handover --legend lists the contrib and standard terms', () => {
		const legend = runHandover({
			argv: ['--legend'],
			cliPath: WRITER_CLI,
			columns: 300,
			probe: noRepositoryCli,
		})

		const terms = legend.output.split('\n').map((line) => line.split('  ')[0])
		expect(terms).toEqual(expect.arrayContaining(['contrib', 'standard']))
	})
})

describe('the card of a contributor', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('every contrib row green → one contrib line in the contrib section, verdict READY', async () => {
		const root = editedPackage({ steps: passingSteps() })
		await recordGateAndContrib(root)

		const { data, text } = cardOf({ root })

		expect(text).toMatch(/^├─ contrib /m)
		expect(gateLinesOf(text)).toContain('✓ contrib rules · docs · type-bench · release')
		expect(
			gateLinesOf(text).filter((line) => /^[✓!✗] (rules|docs|type-bench|release)\b/.test(line)),
		).toEqual([])
		expect(data.contrib).toEqual([
			{ name: 'rules', status: 'passed', detail: expect.any(String) },
			{ name: 'docs', status: 'passed', detail: expect.any(String) },
			{ name: 'type-bench', status: 'passed', detail: expect.any(String) },
			{ name: 'release', status: 'passed', detail: expect.any(String) },
		])
		expect(data.verdict).toBe('READY')
	})

	it('one ! contrib row (a skipped step) → one line per row, verdict READY', async () => {
		const root = editedPackage({ steps: skippedBenchSteps() })
		await recordGateAndContrib(root)

		const { data, text } = cardOf({ root })

		const lines = gateLinesOf(text)
		expect(lines).toEqual(
			expect.arrayContaining([
				expect.stringMatching(/^✓ rules\b/),
				expect.stringMatching(/^✓ docs\b/),
				expect.stringMatching(/^! type-bench\b/),
				expect.stringMatching(/^✓ release\b/),
			]),
		)
		expect(lines.filter((line) => line.startsWith('✓ contrib'))).toEqual([])
		expect(data.verdict).toBe('READY')
	})

	it('a failed type-bench row → one line per row, verdict BLOCKED naming type-bench', async () => {
		const root = editedPackage({ steps: failingBenchSteps() })
		await recordGateAndContrib(root)

		const { data, text } = cardOf({ root })

		expect(gateLinesOf(text)).toEqual(
			expect.arrayContaining([
				expect.stringMatching(/^✓ rules\b/),
				expect.stringMatching(/^✗ type-bench\b/),
			]),
		)
		expect(data.verdict).toBe('BLOCKED')
		expect(data.failedGates).toContain('type-bench')
	})

	it('no contrib record → ✗ contrib never run: dialecte contrib, verdict BLOCKED', async () => {
		const root = editedPackage({ steps: passingSteps() })
		await runGateIn({ cwd: root, argv: [] })

		const { data, text } = cardOf({ root })

		expect(gateLinesOf(text)).toContain(`✗ contrib ${CONTRIB_NEVER_RUN}`)
		expect(data.verdict).toBe('BLOCKED')
		expect(data.failedGates).toContain('contrib')
	})

	it('a contrib record of another tree → the section stale, verdict BLOCKED by the other-tree gates', async () => {
		const root = editedPackage({ steps: passingSteps() })
		await recordGateAndContrib(root)
		editAgain(root)
		await runGateIn({ cwd: root, argv: [] })

		const { data, text } = cardOf({ root })

		expect(gateLinesOf(text)).toEqual(
			expect.arrayContaining([expect.stringMatching(/^! rules .*\(the tree changed since\)$/)]),
		)
		expect(data.contrib?.map((line) => line.name)).toEqual([
			'rules',
			'docs',
			'type-bench',
			'release',
		])
		expect(data.contrib?.every((line) => line.stale)).toBe(true)
		expect(data.gates.filter((line) => line.name === 'rules')).toEqual([])
		expect(data.verdict).toBe('BLOCKED')
		expect(data.otherTreeGates).toEqual(['rules', 'docs', 'type-bench', 'release'])
		expect(data.failedGates).toEqual([])
	})

	it('contrib run at one HEAD, a commit moves HEAD with the same state tree, then the hand-over is written → the contrib section is not current (says HEAD moved), BLOCKED, and the run refuses at contrib too', async () => {
		const root = editedPackage({ steps: passingSteps() })
		await recordGateAndContrib(root)
		moveHeadWithSameTree(root)

		const { data, out } = cardOf({ root })
		const run = await runFolder({ out })

		expect(data.verdict).toBe('BLOCKED')
		expect(
			data.contrib?.map((line) => line.detail).filter((detail) => detail.includes('HEAD')),
		).not.toEqual([])
		expect(data.contrib?.some((line) => line.detail.includes('the tree changed since'))).toBe(false)
		expect(run.text).toMatch(/^✗ contrib\b/m)
	})

	it('a new mutation survivor → the mutation row failed in contrib, not in gates', async () => {
		const root = editedPackage({ steps: passingSteps(), mutation: MUTATION_DECLARATION })
		await recordGateAndContrib(root)
		reportRun({ root, survivors: [survivorOf({ key: 'k1' })] })

		const { data } = cardOf({ root })

		expect(data.contrib?.filter((line) => line.name === 'mutation')).toEqual([
			expect.objectContaining({ status: 'failed' }),
		])
		expect(data.gates.filter((line) => line.name === 'mutation')).toEqual([])
		expect(data.verdict).toBe('BLOCKED')
		expect(data.failedGates).toContain('mutation')
	})

	it('no rules line in gates, even with a rules record of the tree', async () => {
		const root = editedPackage({ steps: passingSteps() })
		await recordGateAndContrib(root)
		runRules({ cwd: root, argv: [] })

		const { data } = cardOf({ root })

		expect(data.gates.filter((line) => line.name === 'rules')).toEqual([])
	})

	for (const row of [
		{
			name: 'two errors',
			source: 'export function read() {\n\tconst write = () => 2\n\tconst make = () => 3\n}\n',
			line: /^✗ rules 2 errors · 0 warnings\b/,
		},
		{
			name: 'warnings only',
			source:
				'export function read(first: string, count: number) {}\nexport function write(first: string, count: number) {}\n',
			line: /^✓ rules 0 errors · 2 warnings$/,
		},
		{
			name: 'one error and one warning',
			source: 'export function read(first: string, count: number) {\n\tconst write = () => 2\n}\n',
			line: /^✗ rules 1 error · 1 warning\b/,
		},
	])
		it(`the rules row with ${row.name} → the expanded contrib section prints it`, async () => {
			const root = editedPackage({ steps: skippedBenchSteps() })
			writeFiles({ root, files: { [SOURCE_FILE]: row.source } })
			await recordGateAndContrib(root)

			const { text, data } = cardOf({ root })

			expect(data.gates.filter((line) => line.name === 'rules')).toEqual([])
			expect(gateLinesOf(text).filter((line) => /^[✓!✗] rules\b/.test(line))).toEqual([
				expect.stringMatching(row.line),
			])
		})

	it('--json → the profile and the contrib lines with name, status and detail', async () => {
		const root = editedPackage({ steps: skippedBenchSteps() })
		await recordGateAndContrib(root)

		const { data } = cardOf({ root })

		expect(data.profile).toBe('contributor')
		expect(data.contrib).toEqual([
			{ name: 'rules', status: 'passed', detail: expect.any(String) },
			{ name: 'docs', status: 'passed', detail: expect.any(String) },
			{ name: 'type-bench', status: 'warning', detail: expect.any(String) },
			{ name: 'release', status: 'passed', detail: expect.any(String) },
		])
	})
})
