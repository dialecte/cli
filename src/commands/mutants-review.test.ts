import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { EDITED_SCOPE_SOURCE, SCOPE_FILE } from '../../test/mutation-package.constants.ts'
import {
	fakeStryker,
	mutationPackage,
	reportOf,
	storedRuns,
	survivorOf,
} from '../../test/mutation-package.ts'
import { SCRATCH_REPOSITORY_TIMEOUT } from '../../test/scratch-checks.constants.ts'
import { git, writeFiles } from '../../test/scratch-repository.ts'
import { finishRun, startRun } from '../lib/mutation/run-store.ts'
import { runMutants } from './mutants.ts'

import { describe, expect, it } from 'vitest'

import type { StrykerCall } from '../../test/mutation-package.types.ts'
import type { StrykerOptions, StrykerRunner } from '../lib/mutation/mutation.types.ts'

const WORK_FOLDER = '.tmp/mutants'
const TREE = 'f'.repeat(40)
const ALL_KILLED = reportOf({ mutants: [{ id: '1', status: 'Killed', replacement: 'false' }] })
const TIMED_OUT = reportOf({
	mutants: [
		{ id: '1', status: 'Timeout', replacement: 'true' },
		{ id: '2', status: 'Survived', replacement: 'false' },
	],
})
const TIMEOUT_ALONE = reportOf({ mutants: [{ id: '1', status: 'Killed', replacement: 'true' }] })
const FULL_SURVIVES = reportOf({ mutants: [{ id: '2', status: 'Survived', replacement: 'false' }] })

/** What a Stryker call was given: its options and the text of the config file they name, read during the call. */
type SeenCall = { options: StrykerOptions; configText: string | undefined }

/** The fake Stryker, also reading the config file the options name while the call runs. */
function readingConfig(params: {
	root: string
	inner: StrykerRunner
	seen: SeenCall[]
}): StrykerRunner {
	const { root, inner, seen } = params
	return async function runReadingConfig({ options }) {
		const configFile = (options as StrykerOptions & { configFile?: string }).configFile
		const path = configFile === undefined ? undefined : resolve(root, configFile)
		seen.push({
			options,
			configText: path !== undefined && existsSync(path) ? readFileSync(path, 'utf8') : undefined,
		})
		return inner({ options })
	}
}

function editedPackage(params: { full?: boolean } = {}): string {
	const root = mutationPackage(params)
	writeFiles({ root, files: { [SCOPE_FILE]: EDITED_SCOPE_SOURCE } })
	return root
}

describe('mutants run: what Stryker is given', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('every tier names a config file holding an empty object, so no stryker config of the package is merged in', async () => {
		const root = editedPackage({ full: true })
		const calls: StrykerCall[] = []
		const seen: SeenCall[] = []
		const inner = fakeStryker({
			root,
			reports: { fast: TIMED_OUT, timeouts: TIMEOUT_ALONE, full: FULL_SURVIVES },
			calls,
		})

		await expect(
			runMutants({
				cwd: root,
				argv: ['run'],
				dependencies: { runStryker: readingConfig({ root, inner, seen }) },
			}),
		).resolves.toMatchObject({ exitCode: 0 })
		expect(
			seen.map(({ configText }) => (configText === undefined ? undefined : JSON.parse(configText))),
		).toEqual([{}, {}, {}])
	})

	it('the timeouts and full tiers say incremental: false', async () => {
		const root = editedPackage({ full: true })
		const calls: StrykerCall[] = []

		await expect(
			runMutants({
				cwd: root,
				argv: ['run'],
				dependencies: {
					runStryker: fakeStryker({
						root,
						reports: { fast: TIMED_OUT, timeouts: TIMEOUT_ALONE, full: FULL_SURVIVES },
						calls,
					}),
				},
			}),
		).resolves.toMatchObject({ exitCode: 0 })
		expect(calls.map(({ tier, options }) => [tier, options.incremental])).toEqual([
			['fast', true],
			['timeouts', false],
			['full', false],
		])
	})
})

describe('mutants run: the repository it runs in', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('audit in a repository with no main branch → runs: an audit needs no base', async () => {
		const root = mutationPackage()
		git({ root, args: ['branch', '-m', 'main', 'trunk'] })
		const calls: StrykerCall[] = []

		await expect(
			runMutants({
				cwd: root,
				argv: ['run', '--mode', 'audit'],
				dependencies: { runStryker: fakeStryker({ root, reports: { fast: ALL_KILLED }, calls }) },
			}),
		).resolves.toMatchObject({ exitCode: 0 })
		expect(calls.map(({ tier }) => tier)).toEqual(['fast'])
	})

	it('a detached HEAD → refused naming the branch to check out, no run started, no Stryker call', async () => {
		const root = editedPackage()
		git({ root, args: ['checkout', '-q', '--detach'] })
		const calls: StrykerCall[] = []

		await expect(
			runMutants({
				cwd: root,
				argv: ['run'],
				dependencies: { runStryker: fakeStryker({ root, reports: { fast: ALL_KILLED }, calls }) },
			}),
		).resolves.toMatchObject({ exitCode: 1, output: expect.stringMatching(/detached.*branch/s) })
		expect(calls).toEqual([])
		expect(storedRuns(root)).toEqual([])
	})

	it('a reported run → its work folder is gone', async () => {
		const root = editedPackage()
		const calls: StrykerCall[] = []

		await expect(
			runMutants({
				cwd: root,
				argv: ['run'],
				dependencies: { runStryker: fakeStryker({ root, reports: { fast: ALL_KILLED }, calls }) },
			}),
		).resolves.toMatchObject({ exitCode: 0 })
		const [{ runId, state }] = storedRuns(root)
		expect(state).toBe('reported')
		expect(existsSync(join(root, WORK_FOLDER, runId))).toBe(false)
	})
})

describe(
	'mutants status: a reported run whose ledger update was missed',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		it('--json → its survivor is new under the run’s lot', async () => {
			const root = mutationPackage()
			const { runId } = startRun({
				root,
				pid: process.pid,
				lot: 'lot-missed',
				tree: TREE,
				mode: 'changed',
			})
			expect(
				finishRun({
					root,
					runId,
					counts: { killed: 0, survived: 1, timedOut: 0, noCoverage: 0 },
					survivors: [survivorOf({ key: 'k1' })],
				}),
			).toMatchObject({ state: 'reported' })

			const json = runMutants({
				cwd: root,
				argv: ['status', '--json'],
				dependencies: { runStryker: fakeStryker({ root, reports: {}, calls: [] }) },
			}).then((result) => JSON.parse(result.output))

			await expect(json).resolves.toMatchObject({
				new: { 'lot-missed': [expect.objectContaining({ key: 'k1' })] },
			})
		})
	},
)
