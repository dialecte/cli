/** `lot close`'s keep rules that look beyond git status: ignored files, the HEAD reflog, links into the worktree, a second hand-over. */
import {
	chmodSync,
	existsSync,
	mkdirSync,
	readFileSync,
	realpathSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
	git,
	initializeRepository,
	isolateGitConfig,
	temporaryFolder,
	writeFiles,
} from '../../test/scratch-repository.ts'
import { LOCK_TEXT, POOL_COMMAND_CASE_MS } from '../../test/worktree-pool.constants.ts'
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
import { startRun } from '../lib/mutation/run-store.ts'
import { probeCaseInsensitive } from '../lib/store/brief.ts'
import { runLotClose } from './lot-close.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

// the scenario helpers stay in the file, as in the other lot close tests
/** Whether the temporary volume treats a path and its case-swapped spelling as one (the macOS default). */
const CASE_INSENSITIVE = probeCaseInsensitive({ path: tmpdir() })

const NOW = new Date('2026-11-09T10:00:00Z')

type Scenario = { workspace: string; repository: string; worktreesFolder: string }

/** A workspace (real path) with the main checkout `repo` ignoring `.env`, `.dialecte/`, `*.xsd` and node_modules. */
function createScenario(): Scenario {
	isolateGitConfig()
	const workspace = realpathSync(temporaryFolder('dialecte-lot-close-keep-'))
	const repository = initializeRepository({
		root: join(workspace, 'repo'),
		files: {
			'.gitignore': 'node_modules\n.env\n.dialecte/\n*.xsd\n',
			'package.json': '{ "name": "demo" }\n',
			'package-lock.json': LOCK_TEXT,
			'src/a.ts': 'a\n',
		},
	})
	return { workspace, repository, worktreesFolder: join(workspace, '.worktrees') }
}

/** A second repository of the workspace (`other`), with a fake node_modules whose `@dialecte/core` points to `coreTarget`. */
function createOtherRepository(params: { scenario: Scenario; coreTarget: string }): string {
	const other = initializeRepository({
		root: join(params.scenario.workspace, 'other'),
		files: { '.gitignore': 'node_modules\n', 'package.json': '{ "name": "other" }\n' },
	})
	createFakeNodeModules({
		folder: join(other, 'node_modules'),
		outsideTarget: params.coreTarget,
	})
	return other
}

/**
 * A hand-over worktree `.worktrees/<index>-repo-<tail>` on `feat/<tail>` with one commit of its own, registered
 * `committed` (a name, its branch) unless `register` is false. `coreTarget` is where its fake
 * `node_modules/@dialecte/core` link points.
 */
function createLot(params: {
	scenario: Scenario
	index: string
	tail: string
	register?: boolean
	coreTarget?: string
}): { name: string; worktree: string; branch: string } {
	const { repository, worktreesFolder } = params.scenario
	const branch = `feat/${params.tail}`
	const worktree = join(worktreesFolder, `${params.index}-repo-${params.tail}`)
	git({ root: repository, args: ['worktree', 'add', '-q', '-b', branch, worktree] })
	writeFiles({ root: worktree, files: { [`src/${params.tail}.ts`]: 'export {}\n' } })
	git({ root: worktree, args: ['add', '-A'] })
	git({ root: worktree, args: ['commit', '-q', '-m', `feat: ${params.tail}`] })
	createFakeNodeModules({
		folder: join(worktree, 'node_modules'),
		marker: `lot ${params.tail}\n`,
		outsideTarget: params.coreTarget,
	})
	if (params.register === false) return { name: '', worktree, branch }
	const folder = realpathSync(temporaryFolder('dialecte-handover-'))
	const name = registerHandover({ root: worktree, folder, branch, now: NOW })
	recordHandoverState({ store: handoverStoreOf(repository), folder, state: 'committed' })
	return { name, worktree, branch }
}

/** Registers another hand-over of `root` on `branch` in `state` (`pending` when not recorded); returns its name. */
function registerAnother(params: {
	scenario: Scenario
	root: string
	branch: string
	state?: 'committed' | 'abandoned'
}): string {
	const folder = realpathSync(temporaryFolder('dialecte-handover-'))
	const name = registerHandover({ root: params.root, folder, branch: params.branch, now: NOW })
	if (params.state)
		recordHandoverState({
			store: handoverStoreOf(params.scenario.repository),
			folder,
			state: params.state,
		})
	return name
}

/**
 * One `lot close` of `name` in the scenario, with the spawner that records the background removals (or, with
 * `executing`, runs them). The worktree's tree is read when this is called, after the case's setup.
 */
function closing(params: {
	scenario: Scenario
	name: string
	worktree: string
	branch: string
	executing?: boolean
}) {
	const { scenario, worktree, branch } = params
	const { spawner, calls } = params.executing ? createExecutingSpawner() : createRecordingSpawner()
	const before = readTree(worktree)
	function close() {
		return runLotClose({
			cwd: scenario.repository,
			argv: [params.name],
			now: NOW,
			spawner,
			listProcesses: () => [],
			// no scratch root: the machine's own temporary folders are never scanned
			scratchRoots: [],
		})
	}
	// a kept worktree: still where it was, listed by git, its tree and node_modules links as they were (no relink,
	// no park before the decision), the branch there, nothing in the pool or the trash, nothing started
	function expectNothingMoved() {
		expect(existsSync(worktree)).toBe(true)
		expect(git({ root: scenario.repository, args: ['worktree', 'list', '--porcelain'] })).toContain(
			`worktree ${worktree}\n`,
		)
		expect(readTree(worktree)).toEqual(before)
		expect(git({ root: scenario.repository, args: ['branch', '--list', branch] })).toContain(branch)
		expect(poolEntriesOf(scenario.worktreesFolder)).toEqual([])
		expect(trashedNamesOf(scenario.worktreesFolder)).toEqual([])
		expect(calls).toEqual([])
	}
	return { close, expectNothingMoved }
}

/**
 * A closed worktree: gone from its path, exactly one `_trash/` entry for it; any other entry is a cache the park
 * sent to its own entry (`.vite-<time>`, `.cache-<time>`).
 */
function expectClosed(params: { scenario: Scenario; worktree: string; tail: string }) {
	expect(existsSync(params.worktree)).toBe(false)
	const names = trashedNamesOf(params.scenario.worktreesFolder)
	const worktreePattern = new RegExp(`-repo-${params.tail}-\\d`)
	expect(names.filter((name) => worktreePattern.test(name))).toHaveLength(1)
	const others = names.filter((name) => !worktreePattern.test(name))
	expect(others.every((name) => /^\.(vite|cache)-\d/.test(name))).toBe(true)
}

/** The link a sibling or another repository holds into the candidate, as `lot close` words it. */
function linkReason(link: string): string {
	return `the link ${link} points to it`
}

describe('lot close: keep rules beyond git status', { timeout: POOL_COMMAND_CASE_MS }, () => {
	afterEach(function restoreEnvironment() {
		vi.unstubAllEnvs()
	})

	it('a clean committed hand-over worktree with an ignored .env → kept, .env named, nothing moved, .env intact', () => {
		const scenario = createScenario()
		const lot = createLot({ scenario, index: '0001', tail: 'x' })
		writeFileSync(join(lot.worktree, '.env'), 'SECRET=1\n')
		const { close, expectNothingMoved } = closing({ scenario, ...lot })

		const outcome = close()

		expect(outcome.exitCode).toBe(1)
		expect(outcome.output).toContain('ignored files git worktree remove would delete: .env')
		expect(readFileSync(join(lot.worktree, '.env'), 'utf8')).toBe('SECRET=1\n')
		expectNothingMoved()
	})

	it('a dirty worktree with an ignored .env → the dirty reason comes first', () => {
		const scenario = createScenario()
		const lot = createLot({ scenario, index: '0001', tail: 'x' })
		writeFiles({ root: lot.worktree, files: { 'scratch.txt': 'not committed\n', '.env': 'S=1\n' } })
		const { close, expectNothingMoved } = closing({ scenario, ...lot })

		const outcome = close()

		expect(outcome.exitCode).toBe(1)
		expect(outcome.output).toContain('(dirty:')
		expect(outcome.output).not.toContain('ignored files git worktree remove would delete')
		expectNothingMoved()
	})

	it('only a .dialecte/lot link and an empty .dialecte/lot.json → closed, exit 0, the lot folder untouched by the executed removal', () => {
		const scenario = createScenario()
		const lot = createLot({ scenario, index: '0001', tail: 'x' })
		const lotFolder = join(scenario.workspace, 'lots', 'x')
		writeFiles({ root: lotFolder, files: { 'a.md': 'a\n', 'deep/b.md': 'b\n' } })
		const before = readTree(lotFolder)
		mkdirSync(join(lot.worktree, '.dialecte'))
		symlinkSync(lotFolder, join(lot.worktree, '.dialecte/lot'))
		writeFileSync(join(lot.worktree, '.dialecte/lot.json'), '{}\n')
		// the removal runs here, so the folder the link points to is checked after it
		const { close } = closing({ scenario, ...lot, executing: true })

		const outcome = close()

		expect(outcome.exitCode).toBe(0)
		// the executed removal took the trashed worktree away with its link, never what the link points to
		expect(existsSync(lot.worktree)).toBe(false)
		expect(trashedNamesOf(scenario.worktreesFolder)).toEqual([])
		expect(readTree(lotFolder)).toEqual(before)
	})

	it('a .dialecte/notes.md → kept, named, nothing moved', () => {
		const scenario = createScenario()
		const lot = createLot({ scenario, index: '0001', tail: 'x' })
		writeFiles({ root: lot.worktree, files: { '.dialecte/notes.md': 'mine\n' } })
		const { close, expectNothingMoved } = closing({ scenario, ...lot })

		const outcome = close()

		expect(outcome.exitCode).toBe(1)
		expect(outcome.output).toContain(
			'ignored files git worktree remove would delete: .dialecte/notes.md',
		)
		expectNothingMoved()
	})

	it('four ignored files kept → the first three named in sorted order, the count given', () => {
		const scenario = createScenario()
		const lot = createLot({ scenario, index: '0001', tail: 'x' })
		writeFiles({
			root: lot.worktree,
			files: Object.fromEntries(
				['d', 'b', 'a', 'c'].map((name) => [`fixtures/${name}.xsd`, `${name}\n`]),
			),
		})
		const { close, expectNothingMoved } = closing({ scenario, ...lot })

		const outcome = close()

		expect(outcome.exitCode).toBe(1)
		expect(outcome.output).toContain(
			'4 ignored files git worktree remove would delete, first: fixtures/a.xsd, fixtures/b.xsd, fixtures/c.xsd',
		)
		expectNothingMoved()
	})

	it('an ignored file byte-equal, mode included, to the main checkout one → closed', () => {
		const scenario = createScenario()
		const lot = createLot({ scenario, index: '0001', tail: 'x' })
		for (const root of [scenario.repository, lot.worktree]) {
			writeFiles({ root, files: { 'fixtures/a.xsd': '<schema/>\n' } })
			chmodSync(join(root, 'fixtures/a.xsd'), 0o644)
		}
		const { close } = closing({ scenario, ...lot })

		const outcome = close()

		expect(outcome.exitCode).toBe(0)
		expectClosed({ scenario, worktree: lot.worktree, tail: 'x' })
	})

	for (const row of [
		{ label: 'other bytes', worktreeText: '<schema a="1"/>\n', worktreeMode: 0o644 },
		{ label: 'only the executable bit', worktreeText: '<schema/>\n', worktreeMode: 0o755 },
	])
		it(`an ignored file differing from the main checkout one (${row.label}) → kept, named, nothing moved`, () => {
			const scenario = createScenario()
			const lot = createLot({ scenario, index: '0001', tail: 'x' })
			writeFiles({ root: scenario.repository, files: { 'fixtures/a.xsd': '<schema/>\n' } })
			chmodSync(join(scenario.repository, 'fixtures/a.xsd'), 0o644)
			writeFiles({ root: lot.worktree, files: { 'fixtures/a.xsd': row.worktreeText } })
			chmodSync(join(lot.worktree, 'fixtures/a.xsd'), row.worktreeMode)
			const { close, expectNothingMoved } = closing({ scenario, ...lot })

			const outcome = close()

			expect(outcome.exitCode).toBe(1)
			expect(outcome.output).toContain(
				'ignored files git worktree remove would delete: fixtures/a.xsd',
			)
			expectNothingMoved()
		})

	it('a commit made on a detached HEAD, then the worktree switched back to its branch → kept, the HEAD reflog named', () => {
		const scenario = createScenario()
		const lot = createLot({ scenario, index: '0001', tail: 'x' })
		git({ root: lot.worktree, args: ['switch', '-q', '--detach'] })
		writeFiles({ root: lot.worktree, files: { 'src/detached.ts': 'export {}\n' } })
		git({ root: lot.worktree, args: ['add', '-A'] })
		git({ root: lot.worktree, args: ['commit', '-q', '-m', 'wip: detached'] })
		git({ root: lot.worktree, args: ['switch', '-q', lot.branch] })
		const { close, expectNothingMoved } = closing({ scenario, ...lot })

		const outcome = close()

		expect(outcome.exitCode).toBe(1)
		expect(outcome.output).toContain(
			`its HEAD reflog reaches 1 commit(s) that neither ${lot.branch}, main nor a remote-tracking ref holds`,
		)
		expectNothingMoved()
	})

	it('the detached commit is reachable from a remote-tracking ref → the reflog is no reason, closed', () => {
		const scenario = createScenario()
		const lot = createLot({ scenario, index: '0001', tail: 'x' })
		git({ root: lot.worktree, args: ['switch', '-q', '--detach'] })
		writeFiles({ root: lot.worktree, files: { 'src/detached.ts': 'export {}\n' } })
		git({ root: lot.worktree, args: ['add', '-A'] })
		git({ root: lot.worktree, args: ['commit', '-q', '-m', 'wip: detached'] })
		const detached = git({ root: lot.worktree, args: ['rev-parse', 'HEAD'] }).trim()
		git({ root: lot.worktree, args: ['update-ref', 'refs/remotes/origin/wip', detached] })
		git({ root: lot.worktree, args: ['switch', '-q', lot.branch] })
		const { close } = closing({ scenario, ...lot })

		const outcome = close()

		expect(outcome.exitCode).toBe(0)
		expectClosed({ scenario, worktree: lot.worktree, tail: 'x' })
	})

	it('another commit made on the hand-over branch itself → the reflog is no reason, closed', () => {
		const scenario = createScenario()
		const lot = createLot({ scenario, index: '0001', tail: 'x' })
		writeFiles({ root: lot.worktree, files: { 'src/more.ts': 'export {}\n' } })
		git({ root: lot.worktree, args: ['add', '-A'] })
		git({ root: lot.worktree, args: ['commit', '-q', '-m', 'feat: more'] })
		const { close } = closing({ scenario, ...lot })

		const outcome = close()

		expect(outcome.exitCode).toBe(0)
		expectClosed({ scenario, worktree: lot.worktree, tail: 'x' })
	})

	for (const row of [
		{ label: 'its node_modules/@dialecte/core', link: 'node_modules/@dialecte/core', into: '' },
		{
			label: 'its node_modules/@dialecte/core to a folder inside',
			link: 'node_modules/@dialecte/core',
			into: 'src',
		},
		{ label: 'a top-level node_modules/foo', link: 'node_modules/foo', into: '' },
	])
		it(`a sibling worktree ${row.label} linking into the worktree → kept, the link named, nothing moved`, () => {
			const { link, into } = row
			const scenario = createScenario()
			const lot = createLot({ scenario, index: '0001', tail: 'x' })
			const target = into ? join(lot.worktree, into) : lot.worktree
			const sibling = createLot({
				scenario,
				index: '0002',
				tail: 'y',
				register: false,
				coreTarget: link === 'node_modules/@dialecte/core' ? target : undefined,
			})
			if (link !== 'node_modules/@dialecte/core') symlinkSync(target, join(sibling.worktree, link))
			const { close, expectNothingMoved } = closing({ scenario, ...lot })

			const outcome = close()

			expect(outcome.exitCode).toBe(1)
			expect(outcome.output).toContain(linkReason(join(sibling.worktree, link)))
			expectNothingMoved()
		})

	it.skipIf(!CASE_INSENSITIVE)(
		'a sibling link whose target spells the worktree path in another letter case → kept, the link named (skipped on a case-sensitive volume: there is no other spelling)',
		() => {
			const scenario = createScenario()
			const lot = createLot({ scenario, index: '0001', tail: 'x' })
			const respelled = join(scenario.worktreesFolder, '0001-REPO-X')
			const sibling = createLot({
				scenario,
				index: '0002',
				tail: 'y',
				register: false,
				coreTarget: respelled,
			})
			const { close, expectNothingMoved } = closing({ scenario, ...lot })

			const outcome = close()

			expect(outcome.exitCode).toBe(1)
			expect(outcome.output).toContain(
				linkReason(join(sibling.worktree, 'node_modules/@dialecte/core')),
			)
			expectNothingMoved()
		},
	)

	it('the main checkout node_modules/@dialecte/core link into the worktree → kept, the link named', () => {
		const scenario = createScenario()
		const lot = createLot({ scenario, index: '0001', tail: 'x' })
		createFakeNodeModules({
			folder: join(scenario.repository, 'node_modules'),
			outsideTarget: lot.worktree,
		})
		const { close, expectNothingMoved } = closing({ scenario, ...lot })

		const outcome = close()

		expect(outcome.exitCode).toBe(1)
		expect(outcome.output).toContain(
			linkReason(join(scenario.repository, 'node_modules/@dialecte/core')),
		)
		expectNothingMoved()
	})

	it('the main checkout of another repository of the workspace linking core into the worktree → kept, the link named', () => {
		const scenario = createScenario()
		const lot = createLot({ scenario, index: '0001', tail: 'x' })
		const other = createOtherRepository({ scenario, coreTarget: lot.worktree })
		const { close, expectNothingMoved } = closing({ scenario, ...lot })

		const outcome = close()

		expect(outcome.exitCode).toBe(1)
		expect(outcome.output).toContain(linkReason(join(other, 'node_modules/@dialecte/core')))
		expectNothingMoved()
	})

	for (const row of [
		{ label: 'under _commit-plan/', place: '_commit-plan/handover-x' },
		{ label: 'at the workspace root', place: 'x-link' },
	])
		it(`a link ${row.label} pointing into the worktree → kept, the link named`, () => {
			const scenario = createScenario()
			const lot = createLot({ scenario, index: '0001', tail: 'x' })
			const link = join(scenario.workspace, row.place)
			mkdirSync(join(link, '..'), { recursive: true })
			symlinkSync(lot.worktree, link)
			const { close, expectNothingMoved } = closing({ scenario, ...lot })

			const outcome = close()

			expect(outcome.exitCode).toBe(1)
			expect(outcome.output).toContain(linkReason(link))
			expectNothingMoved()
		})

	it('a link inside the worktree itself (its own node_modules/x to its own src) → never keeps it, closed', () => {
		const scenario = createScenario()
		const lot = createLot({ scenario, index: '0001', tail: 'x' })
		symlinkSync('../src', join(lot.worktree, 'node_modules/x'))
		const { close } = closing({ scenario, ...lot })

		const outcome = close()

		expect(outcome.exitCode).toBe(0)
		expectClosed({ scenario, worktree: lot.worktree, tail: 'x' })
	})

	it.skipIf(!CASE_INSENSITIVE)(
		'a mutation run started from the worktree spelled in another letter case → kept (a mutation run), nothing moved (skipped on a case-sensitive volume: there is no other spelling)',
		() => {
			const scenario = createScenario()
			const lot = createLot({ scenario, index: '0001', tail: 'x' })
			startRun({
				root: join(scenario.worktreesFolder, '0001-REPO-X'),
				pid: process.pid,
				lot: lot.branch,
				tree: 'a'.repeat(40),
				mode: 'changed',
			})
			const { close, expectNothingMoved } = closing({ scenario, ...lot })

			const outcome = close()

			expect(outcome.exitCode).toBe(1)
			expect(outcome.output).toContain('mutation')
			expectNothingMoved()
		},
	)

	it('a second hand-over of the same worktree registered pending → kept, its name given, nothing moved', () => {
		const scenario = createScenario()
		const lot = createLot({ scenario, index: '0001', tail: 'x' })
		const second = registerAnother({ scenario, root: lot.worktree, branch: lot.branch })
		const { close, expectNothingMoved } = closing({ scenario, ...lot })

		const outcome = close()

		expect(second).not.toBe(lot.name)
		expect(outcome.exitCode).toBe(1)
		expect(outcome.output).toContain(second)
		expectNothingMoved()
	})

	it('a pending hand-over of the same worktree on another branch → kept, its name given', () => {
		const scenario = createScenario()
		const lot = createLot({ scenario, index: '0001', tail: 'x' })
		const second = registerAnother({ scenario, root: lot.worktree, branch: 'feat/other' })
		const { close, expectNothingMoved } = closing({ scenario, ...lot })

		const outcome = close()

		expect(outcome.exitCode).toBe(1)
		expect(outcome.output).toContain(second)
		expectNothingMoved()
	})

	it('a pending hand-over of the same branch for another worktree path → no reason, closed', () => {
		const scenario = createScenario()
		const lot = createLot({ scenario, index: '0001', tail: 'x' })
		const sibling = createLot({ scenario, index: '0002', tail: 'y', register: false })
		registerAnother({ scenario, root: sibling.worktree, branch: lot.branch })
		const { close } = closing({ scenario, ...lot })

		const outcome = close()

		expect(outcome.exitCode).toBe(0)
		expectClosed({ scenario, worktree: lot.worktree, tail: 'x' })
	})

	it.each(['committed', 'abandoned'] as const)(
		'a second hand-over of the same worktree that is %s too → no reason, closed',
		(state) => {
			const scenario = createScenario()
			const lot = createLot({ scenario, index: '0001', tail: 'x' })
			registerAnother({ scenario, root: lot.worktree, branch: lot.branch, state })
			const { close } = closing({ scenario, ...lot })

			const outcome = close()

			expect(outcome.exitCode).toBe(0)
			expectClosed({ scenario, worktree: lot.worktree, tail: 'x' })
		},
	)
})
