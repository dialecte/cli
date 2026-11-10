/** How `lot close` moves a worktree: real paths, a deletion that is git's without --force, caches in their own trash entries, the printed line. */
import { existsSync, readdirSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
	git,
	initializeRepository,
	isolateGitConfig,
	temporaryFolder,
} from '../../test/scratch-repository.ts'
import { LOCK_TEXT, MARKER_FILE, POOL_COMMAND_CASE_MS } from '../../test/worktree-pool.constants.ts'
import {
	createExecutingSpawner,
	createFakeNodeModules,
	createRecordingSpawner,
	poolEntriesOf,
	readTree,
	trashedNamesOf,
} from '../../test/worktree-pool.ts'
import {
	handoverStoreOf,
	recordHandoverState,
	registerHandover,
} from '../lib/handover/handover-store.ts'
import { probeCaseInsensitive } from '../lib/store/brief.ts'
import { DISCARDED_CACHES_PREFIX } from '../lib/worktree/worktree.constants.ts'
import { runLotClose } from './lot-close.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { BackgroundSpawner } from '../lib/worktree/worktree.types.ts'

// the scenario helpers stay in the file, as in the other lot close tests
const NOW = new Date('2026-11-09T10:00:00Z')

type Scenario = { workspace: string; repository: string; worktreesFolder: string }

function createScenario(): Scenario {
	isolateGitConfig()
	const workspace = realpathSync(temporaryFolder('dialecte-lot-close-move-'))
	const repository = initializeRepository({
		root: join(workspace, 'repo'),
		files: {
			'.gitignore': 'node_modules\n',
			'package.json': '{ "name": "demo" }\n',
			'package-lock.json': LOCK_TEXT,
			'src/a.ts': 'a\n',
		},
	})
	return { workspace, repository, worktreesFolder: join(workspace, '.worktrees') }
}

/**
 * A committed hand-over worktree `.worktrees/<index>-repo-<tail>` on `feat/<tail>` with a commit of its own and a
 * fake node_modules (with its `.vite` and `.cache`). `registeredAs` is the path spelling the registry holds.
 */
function createLot(params: {
	scenario: Scenario
	index: string
	tail: string
	state?: 'committed' | 'pending'
	registeredAs?: string
}): { name: string; worktree: string } {
	const { repository, worktreesFolder } = params.scenario
	const branch = `feat/${params.tail}`
	const worktree = join(worktreesFolder, `${params.index}-repo-${params.tail}`)
	git({ root: repository, args: ['worktree', 'add', '-q', '-b', branch, worktree] })
	git({ root: worktree, args: ['commit', '-q', '--allow-empty', '-m', `feat: ${params.tail}`] })
	createFakeNodeModules({ folder: join(worktree, 'node_modules'), marker: `lot ${params.tail}\n` })
	const folder = realpathSync(temporaryFolder('dialecte-handover-'))
	const name = registerHandover({
		root: params.registeredAs ?? worktree,
		folder,
		branch,
		now: NOW,
	})
	if (params.state !== 'pending')
		recordHandoverState({ store: handoverStoreOf(repository), folder, state: 'committed' })
	return { name, worktree }
}

function closeLots(params: {
	scenario: Scenario
	names: string[]
	spawner: BackgroundSpawner
	json?: boolean
}) {
	return runLotClose({
		cwd: params.scenario.repository,
		argv: [...params.names, ...(params.json ? ['--json'] : [])],
		now: NOW,
		spawner: params.spawner,
		listProcesses: () => [],
		// no scratch root: the machine's own temporary folders are never scanned
		scratchRoots: [],
	})
}

/** The names under `_trash/` that start with `prefix`. */
function trashedStarting(params: { scenario: Scenario; prefix: string }): string[] {
	return trashedNamesOf(params.scenario.worktreesFolder).filter((name) =>
		name.startsWith(params.prefix),
	)
}

/** Whether the temporary volume treats a path and its case-swapped spelling as one (the macOS default). */
const CASE_INSENSITIVE = probeCaseInsensitive({ path: tmpdir() })

describe('lot close: the move', { timeout: POOL_COMMAND_CASE_MS }, () => {
	afterEach(function restoreEnvironment() {
		vi.unstubAllEnvs()
	})

	it('a worktree with node_modules/.vite and .cache → the background removal is git worktree remove without --force, the caches have their own _trash/ entries and removals, no discarded-caches folder in the trashed worktree', () => {
		const scenario = createScenario()
		const { name } = createLot({ scenario, index: '0001', tail: 'x' })
		const { spawner, calls } = createRecordingSpawner()

		const outcome = closeLots({ scenario, names: [name], spawner })

		expect(outcome.exitCode).toBe(0)
		const trashedNames = trashedStarting({ scenario, prefix: '0001-repo-x-' })
		const viteNames = trashedStarting({ scenario, prefix: '.vite-' })
		const cacheNames = trashedStarting({ scenario, prefix: '.cache-' })
		expect(trashedNames).toHaveLength(1)
		expect(viteNames).toHaveLength(1)
		expect(cacheNames).toHaveLength(1)
		const [trashedName] = trashedNames
		const [vite] = viteNames
		const [cache] = cacheNames
		const trashed = join(scenario.worktreesFolder, '_trash', trashedName)
		expect(calls.filter((call) => call.command === 'git')).toEqual([
			{ command: 'git', args: ['worktree', 'remove', trashed], cwd: scenario.repository },
		])
		// the removal of the worktree starts last, once the park and the caches' own removals have started
		expect(calls.at(-1)).toEqual({
			command: 'git',
			args: ['worktree', 'remove', trashed],
			cwd: scenario.repository,
		})
		expect(vite).toEqual(expect.stringMatching(/^\.vite-\d/))
		expect(cache).toEqual(expect.stringMatching(/^\.cache-\d/))
		expect(calls.filter((call) => call.command === 'rm')).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ args: ['-rf', join(scenario.worktreesFolder, '_trash', vite)] }),
				expect.objectContaining({ args: ['-rf', join(scenario.worktreesFolder, '_trash', cache)] }),
			]),
		)
		expect(
			readdirSync(trashed).filter((entry) => entry.startsWith(DISCARDED_CACHES_PREFIX)),
		).toEqual([])
		// the parked node_modules no longer holds them
		const [pooled] = poolEntriesOf(scenario.worktreesFolder)
		expect(existsSync(join(scenario.worktreesFolder, pooled, 'node_modules/.vite'))).toBe(false)
		expect(existsSync(join(scenario.worktreesFolder, pooled, 'node_modules/.cache'))).toBe(false)
	})

	it('the removals executed → git accepts the trashed worktree without --force: it is gone, forgotten by git, nothing left in _trash/', () => {
		const scenario = createScenario()
		const { name } = createLot({ scenario, index: '0001', tail: 'x' })
		const { spawner, calls } = createExecutingSpawner()

		const outcome = closeLots({ scenario, names: [name], spawner })

		expect(outcome.exitCode).toBe(0)
		expect(calls.filter((call) => call.command === 'git')).toEqual([
			{
				command: 'git',
				args: ['worktree', 'remove', expect.any(String)],
				cwd: scenario.repository,
			},
		])
		expect(trashedNamesOf(scenario.worktreesFolder)).toEqual([])
		// the park came first: the pooled node_modules still holds what the worktree's held
		const [pooled] = poolEntriesOf(scenario.worktreesFolder)
		expect(readTree(join(scenario.worktreesFolder, pooled, 'node_modules'))[MARKER_FILE]).toBe(
			'lot x\n',
		)
		expect(
			git({ root: scenario.repository, args: ['worktree', 'list', '--porcelain'] }),
		).not.toContain('_trash')
	})

	it.skipIf(!CASE_INSENSITIVE)(
		'a hand-over registered with its worktree path spelled in another case → its worktree is found and closed (skipped on a case-sensitive volume: there is no other spelling)',
		() => {
			const scenario = createScenario()
			const worktree = join(scenario.worktreesFolder, '0001-repo-x')
			const { name } = createLot({
				scenario,
				index: '0001',
				tail: 'x',
				registeredAs: join(scenario.worktreesFolder, '0001-REPO-X'),
			})
			const { spawner } = createRecordingSpawner()

			const outcome = closeLots({ scenario, names: [name], spawner })

			expect(outcome.output).not.toContain('is no worktree of the repository')
			expect(outcome.exitCode).toBe(0)
			expect(existsSync(worktree)).toBe(false)
		},
	)

	it('two worktrees closed in one call → one line, once, saying the deletion is git without --force, may be refused, and where a refused one waits', () => {
		const scenario = createScenario()
		const first = createLot({ scenario, index: '0001', tail: 'x' })
		const second = createLot({ scenario, index: '0002', tail: 'y' })
		const { spawner } = createRecordingSpawner()

		const outcome = closeLots({ scenario, names: [first.name, second.name], spawner })

		const trash = join(scenario.worktreesFolder, '_trash')
		const lines = outcome.output.split('\n').filter((line) => line.includes('without --force'))
		expect(outcome.exitCode).toBe(0)
		expect(lines).toHaveLength(1)
		expect(lines[0]).toContain('git worktree remove')
		expect(lines[0]).toContain('refused')
		expect(lines[0]).toContain(trash)
	})

	it('nothing closed (a pending hand-over) → no such line', () => {
		const scenario = createScenario()
		const { name } = createLot({ scenario, index: '0001', tail: 'x', state: 'pending' })
		const { spawner } = createRecordingSpawner()

		const outcome = closeLots({ scenario, names: [name], spawner })

		expect(outcome.exitCode).toBe(1)
		expect(outcome.output).not.toContain('without --force')
		expect(outcome.output).not.toContain('refused')
	})

	it('--json after a close → the same shape as before: one { handover, closed } per argument', () => {
		const scenario = createScenario()
		const { name } = createLot({ scenario, index: '0001', tail: 'x' })
		const { spawner } = createRecordingSpawner()

		const outcome = closeLots({ scenario, names: [name], spawner, json: true })

		expect(JSON.parse(outcome.output)).toEqual([{ handover: name, closed: true }])
	})
})
