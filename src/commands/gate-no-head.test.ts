/**
 * The gate in a repository with no commit yet (a package just scaffolded): the hook runs its test steps so the first
 * commit can be made; no mode reuses or keeps a record, since a record is keyed on HEAD; nothing throws.
 */
import { join } from 'node:path'

import { indexTreeOf } from '../../test/gate-hook.ts'
import { readRecordFile } from '../../test/gate-records.ts'
import {
	FAST_RECORD_FILE,
	FULL_RECORD_FILE,
	HOOK_RECORD_FILE,
	SCRATCH_REPOSITORY_TIMEOUT,
} from '../../test/scratch-checks.constants.ts'
import { countingStep, countRuns, createCounter, runGateIn } from '../../test/scratch-checks.ts'
import { git, temporaryFolder, writeFiles } from '../../test/scratch-repository.ts'
import { readTreeRecords } from '../lib/gate-records/check-store.ts'
import { GATE_NO_HEAD_LINE } from '../lib/gate-records/no-head.constants.ts'
import { readHeadOrNone } from '../lib/git.ts'

import { describe, expect, it } from 'vitest'

import type { GateStep } from '../lib/gate/gate-config.types.ts'

/** A repository with no commit, its package's files staged: `fast` and `full` run `steps`. */
function createUnbornPackage(steps: GateStep[]): string {
	const root = join(temporaryFolder('dialecte-unborn-'), 'pkg')
	git({ root: temporaryFolder('dialecte-unborn-cwd-'), args: ['init', '-q', '-b', 'main', root] })
	writeFiles({
		root,
		files: {
			'package.json': `${JSON.stringify({
				name: 'demo',
				scripts: {},
				dialecte: { gate: { fast: steps, full: steps } },
			})}\n`,
			'.gitignore': 'node_modules\n',
			'src/a.ts': 'export {}\n',
		},
	})
	git({ root, args: ['add', '-A'] })
	return root
}

/** A counting test step that runs only the tests the change affects: its command hash reads HEAD. */
function changedTestStep(counter: string): GateStep {
	return countingStep({ counter, name: 'tests', changedOnly: true })
}

describe('gate in a repository with no commit yet', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('gate --hook → the test step runs once, exit 0, the no-commit line; no hook record, nothing stored for the tree', async () => {
		const counter = createCounter()
		const root = createUnbornPackage([changedTestStep(counter)])

		const run = runGateIn({ cwd: root, argv: ['--hook'] })

		await expect(run).resolves.toMatchObject({ exitCode: 0 })
		const result = await run
		expect(result.output).toContain(GATE_NO_HEAD_LINE.replace('{command}', 'gate --hook'))
		expect(countRuns(counter)).toBe(1)
		expect(readRecordFile({ root, name: HOOK_RECORD_FILE })).toBeUndefined()
		expect(readTreeRecords({ root, tree: indexTreeOf({ root }) })).toEqual([])
	})

	it.each([
		{ mode: 'fast', file: FAST_RECORD_FILE, refusal: 'FAIL  hygiene  3 file(s) staged' },
		{ mode: 'full', file: FULL_RECORD_FILE, refusal: 'has no commit yet' },
	])(
		'gate --$mode → no throw, exit 1 at its first step ($refusal), the no-commit line; no record written or stored',
		async ({ mode, file, refusal }) => {
			const counter = createCounter()
			const root = createUnbornPackage([changedTestStep(counter)])

			const run = runGateIn({ cwd: root, argv: [`--${mode}`] })

			await expect(run).resolves.toMatchObject({ exitCode: 1 })
			const result = await run
			expect(result.output).toContain(refusal)
			expect(result.output).toContain(GATE_NO_HEAD_LINE.replace('{command}', `gate --${mode}`))
			expect(countRuns(counter)).toBe(0)
			expect(readRecordFile({ root, name: file })).toBeUndefined()
			expect(readTreeRecords({ root, tree: indexTreeOf({ root }) })).toEqual([])
		},
	)
})

describe('readHeadOrNone', () => {
	it('a repository with no commit → undefined; after its first commit → that commit, full sha', () => {
		const root = createUnbornPackage([])

		expect(readHeadOrNone(root)).toBeUndefined()
		git({
			root,
			args: [
				'-c',
				'user.name=reviewer',
				'-c',
				'user.email=reviewer@example.invalid',
				'-c',
				'commit.gpgsign=false',
				'commit',
				'-q',
				'-m',
				'first',
			],
		})

		expect(readHeadOrNone(root)).toBe(git({ root, args: ['rev-parse', 'HEAD'] }).trim())
	})
})
