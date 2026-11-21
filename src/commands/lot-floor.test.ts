/** `dialecte lot`, spawned: a cli older than the version the repository asks for runs no verb (exit 2, nothing written). */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { briefWith } from '../../test/brief-workspace.ts'
import {
	ABOVE_VERSION,
	BELOW_VERSION,
	CLI_SOURCE,
	LOT_FULL_NAME,
	LOT_INDEX,
	OWN_VERSION,
	REFUSAL_WORD,
} from '../../test/cli-floor-workspace.constants.ts'
import {
	addFloorLot,
	bareFolder,
	cliManifestAt,
	commitOnBranch,
	createFloorLotWorkspace,
	createFloorStart,
	createPackageRepository,
	isolateState,
	jsonOrUndefined,
	manifestPinning,
	missingFrom,
	recordStartingCli,
	runLotCli,
} from '../../test/cli-floor-workspace.ts'
import {
	addOtherRepository,
	createdBy,
	createStartWorkspace,
	entriesOf,
	snapshotOf,
} from '../../test/lot-start-workspace.ts'
import { git, writeFiles } from '../../test/scratch-repository.ts'
import { CLI_PACKAGE } from '../lib/skills/cli-invocations.constants.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { LotRun } from '../../test/cli-floor-workspace.types.ts'

/** What an unknown lot id answers: the verb's own line, not the floor's. */
const UNKNOWN_LOT_LINE = 'no lot x'

/** The running cli's own checkout (a git work tree): the refusal hints a pull there. The hint to `npm install` for a stale install under node_modules stays untested: src/cli.ts cannot run under node_modules (type stripping is refused). */
const CHECKOUT_ROOT = realpathSync(join(CLI_SOURCE, '..', '..'))

const PIN_ABOVE = `^${ABOVE_VERSION}`
const PIN_OWN = `^${OWN_VERSION}`

/** `refused` when the answer is the floor's, else the verb's own text. */
function verdictOf(run: LotRun): string {
	return run.status === 2 && run.stderr.includes(REFUSAL_WORD) ? 'refused' : run.stderr.trim()
}

/** What the floor's refusal names for a pin at `spec` found in `root`. */
function pinFacts(params: { root: string; spec?: string }): string[] {
	return [
		OWN_VERSION,
		ABOVE_VERSION,
		`devDependencies ${CLI_PACKAGE} ${params.spec ?? PIN_ABOVE}`,
		CLI_SOURCE,
		realpathSync(params.root),
	]
}

describe('lot: the cli floor', () => {
	afterEach(function restoreEnvironment() {
		vi.unstubAllEnvs()
	})

	it('1. a pin above the running cli → exit 2 naming both versions, the source, the invoked path and the root; nothing written', () => {
		const state = isolateState()
		const root = createPackageRepository({ manifest: manifestPinning({ spec: PIN_ABOVE }) })
		const filesBefore = Object.keys(snapshotOf(root)).filter((name) => !name.startsWith('.git'))
		const stateBefore = snapshotOf(state)

		const run = runLotCli({ cwd: root, args: ['status', 'x'] })

		expect({
			exitCode: run.status,
			stdout: run.stdout,
			missing: missingFrom({
				text: run.stderr,
				parts: [...pinFacts({ root }), CHECKOUT_ROOT, 'pull'],
			}),
			files: Object.keys(snapshotOf(root)).filter((name) => !name.startsWith('.git')),
			state: snapshotOf(state),
		}).toEqual({ exitCode: 2, stdout: '', missing: [], files: filesBefore, state: stateBefore })
	})

	it('2. the same with --json → { error, next: null } on standard error, standard output empty', () => {
		isolateState()
		const root = createPackageRepository({ manifest: manifestPinning({ spec: PIN_ABOVE }) })

		const run = runLotCli({ cwd: root, args: ['land', 'x', '--json'] })
		const answer = jsonOrUndefined(run.stderr) as { error?: string; next?: unknown } | undefined

		expect({
			exitCode: run.status,
			stdout: run.stdout,
			next: answer?.next,
			missing: missingFrom({ text: answer?.error ?? '', parts: pinFacts({ root }) }),
		}).toEqual({ exitCode: 2, stdout: '', next: null, missing: [] })
	})

	const EQUAL_OR_OLDER: Array<{ name: string; spec: string }> = [
		{ name: 'a pin equal to the running version', spec: PIN_OWN },
		{ name: 'a pin below the running version', spec: `^${BELOW_VERSION}` },
	]
	for (const row of EQUAL_OR_OLDER)
		it(`3. ${row.name} → not refused: the verb answers itself`, () => {
			isolateState()
			const root = createPackageRepository({ manifest: manifestPinning({ spec: row.spec }) })

			const run = runLotCli({ cwd: root, args: ['status', 'x'] })

			expect(verdictOf(run)).toBe(UNKNOWN_LOT_LINE)
		})

	const CLI_REPOSITORIES: Array<{
		name: string
		version: string
		verdict: string
		named: string[]
	}> = [
		{
			name: 'its version above the running cli',
			version: ABOVE_VERSION,
			verdict: 'refused',
			named: ['its package.json version'],
		},
		{
			name: 'its version equal to the running cli',
			version: OWN_VERSION,
			verdict: UNKNOWN_LOT_LINE,
			named: [],
		},
	]
	for (const row of CLI_REPOSITORIES)
		it(`4. the cli repository with ${row.name} → ${row.verdict === 'refused' ? 'refused, its own version named' : 'allowed'}`, () => {
			isolateState()
			const root = createPackageRepository({ manifest: cliManifestAt({ version: row.version }) })

			const run = runLotCli({ cwd: root, args: ['status', 'x'] })

			expect({
				verdict: verdictOf(run),
				missing: missingFrom({ text: run.stderr, parts: row.named }),
			}).toEqual({ verdict: row.verdict, missing: [] })
		})

	const BASE_ROWS: Array<{
		name: string
		folder: string
		manifestPath: string
		mainSpec: string
		branchSpec: string
		verdict: string
		named: string[]
	}> = [
		{
			name: '5. main asks ^OWN, the branch ^ABOVE → allowed (the base decides)',
			folder: '',
			manifestPath: 'package.json',
			mainSpec: PIN_OWN,
			branchSpec: PIN_ABOVE,
			verdict: UNKNOWN_LOT_LINE,
			named: [],
		},
		{
			name: '5. main asks ^ABOVE too → refused, naming main',
			folder: '',
			manifestPath: 'package.json',
			mainSpec: PIN_ABOVE,
			branchSpec: PIN_ABOVE,
			verdict: 'refused',
			named: ['at main'],
		},
		{
			name: '5b. the package in a subfolder, main ^OWN, the branch ^ABOVE → allowed',
			folder: 'pkg',
			manifestPath: 'pkg/package.json',
			mainSpec: PIN_OWN,
			branchSpec: PIN_ABOVE,
			verdict: UNKNOWN_LOT_LINE,
			named: [],
		},
		{
			name: '5b. the package in a subfolder, main ^ABOVE too → refused, naming main',
			folder: 'pkg',
			manifestPath: 'pkg/package.json',
			mainSpec: PIN_ABOVE,
			branchSpec: PIN_ABOVE,
			verdict: 'refused',
			named: ['at main'],
		},
		{
			name: '5d. main asks ^ABOVE, the branch lowers its pin to ^OWN → allowed',
			folder: '',
			manifestPath: 'package.json',
			mainSpec: PIN_ABOVE,
			branchSpec: PIN_OWN,
			verdict: UNKNOWN_LOT_LINE,
			named: [],
		},
	]
	for (const row of BASE_ROWS)
		it(`${row.name}`, () => {
			isolateState()
			const root = createPackageRepository({ manifest: '{}\n' })
			writeFiles({ root, files: { [row.manifestPath]: manifestPinning({ spec: row.mainSpec }) } })
			git({ root, args: ['add', '-A'] })
			git({ root, args: ['commit', '-q', '-m', 'chore: pin on main'] })
			commitOnBranch({
				root,
				path: row.manifestPath,
				manifest: manifestPinning({ spec: row.branchSpec, version: '1.0.1' }),
			})

			const run = runLotCli({ cwd: join(root, row.folder), args: ['status', 'x'] })

			expect({
				verdict: verdictOf(run),
				missing: missingFrom({ text: run.stderr, parts: row.named }),
			}).toEqual({ verdict: row.verdict, missing: [] })
		})

	it('5c. a pin above in a folder that is no git repository → refused by the working floor, no git error printed', () => {
		isolateState()
		const folder = bareFolder()
		writeFiles({ root: folder, files: { 'package.json': manifestPinning({ spec: PIN_ABOVE }) } })

		const run = runLotCli({ cwd: folder, args: ['status', 'x'] })

		expect({
			verdict: verdictOf(run),
			gitError: /fatal|not a git repository/i.test(run.stderr),
		}).toEqual({ verdict: 'refused', gitError: false })
	})

	it('6. a folder with no package.json → allowed (no floor)', () => {
		isolateState()

		const run = runLotCli({ cwd: bareFolder(), args: ['status', 'x'] })

		expect(verdictOf(run)).toBe(UNKNOWN_LOT_LINE)
	})

	it('2b. a FIFO as a word, in a package pinning ^OWN → the verb answers itself, the FIFO is never read', () => {
		isolateState()
		const root = createPackageRepository({ manifest: manifestPinning({ spec: PIN_OWN }) })
		const fifo = join(root, 'pipe')
		const made = spawnSync('mkfifo', [fifo])
		expect({ status: made.status, exists: existsSync(fifo) }).toEqual({ status: 0, exists: true })

		const run = runLotCli({ cwd: root, args: ['status', fifo], timeoutMs: 8000 })

		expect({
			timedOut: run.timedOut,
			refused: run.stderr.includes(REFUSAL_WORD),
			status: run.status,
		}).toEqual({
			timedOut: false,
			refused: false,
			status: 2,
		})
	})

	it('7. lot --help with a pin above → the help, exit 0', () => {
		isolateState()
		const root = createPackageRepository({ manifest: manifestPinning({ spec: PIN_ABOVE }) })

		const run = runLotCli({ cwd: root, args: ['--help'] })

		expect({
			exitCode: run.status,
			refused: run.stderr.includes(REFUSAL_WORD),
			printsHelp: run.stdout.includes('lot'),
		}).toEqual({ exitCode: 0, refused: false, printsHelp: true })
	})
})

describe('lot: the cli floor of a lot named on the command line', () => {
	afterEach(function restoreEnvironment() {
		vi.unstubAllEnvs()
	})

	const NAMED_LOT_VERBS: Array<{ name: string; args: string[] }> = [
		{ name: 'lot status <index>', args: ['status', LOT_INDEX] },
		{ name: 'lot land <index>', args: ['land', LOT_INDEX] },
		{ name: 'lot land --json <index> (a flag before the id)', args: ['land', '--json', LOT_INDEX] },
		{
			name: 'lot stop <index> --reason <digits>',
			args: ['stop', LOT_INDEX, '--reason', '123456'],
		},
	]
	for (const row of NAMED_LOT_VERBS)
		it(`14. ${row.name} from a folder with no package, the lot's repository pins ^ABOVE → refused, naming that repository`, () => {
			const workspace = createFloorLotWorkspace({ manifest: manifestPinning({ spec: PIN_ABOVE }) })

			const run = runLotCli({ cwd: workspace.elsewhere, args: row.args })

			expect({
				exitCode: run.status,
				missing: missingFrom({
					text: run.stderr + run.stdout,
					parts: [OWN_VERSION, ABOVE_VERSION, workspace.start.repository, REFUSAL_WORD],
				}),
			}).toEqual({ exitCode: 2, missing: [] })
		})

	it('14. the same lot in a repository pinning ^OWN → not refused', () => {
		const workspace = createFloorLotWorkspace({ manifest: manifestPinning({ spec: PIN_OWN }) })

		const run = runLotCli({ cwd: workspace.elsewhere, args: ['status', LOT_INDEX] })

		expect({
			refused: (run.stderr + run.stdout).includes(REFUSAL_WORD),
			answersItself: run.stdout.includes(LOT_FULL_NAME),
		}).toEqual({ refused: false, answersItself: true })
	})

	it('14. its worktree exists and holds a lower pin → still refused through its repository', () => {
		const workspace = createFloorLotWorkspace({ manifest: manifestPinning({ spec: PIN_ABOVE }) })
		const worktree = join(workspace.start.worktreesFolder, LOT_FULL_NAME)
		mkdirSync(worktree, { recursive: true })
		writeFileSync(join(worktree, 'package.json'), manifestPinning({ spec: PIN_OWN }))

		const run = runLotCli({ cwd: workspace.elsewhere, args: ['land', LOT_INDEX] })

		expect({
			exitCode: run.status,
			missing: missingFrom({
				text: run.stderr,
				parts: [workspace.start.repository, REFUSAL_WORD],
			}),
		}).toEqual({ exitCode: 2, missing: [] })
	})

	it('14. its worktree was removed after the start and its repository pins ^ABOVE → lot status refused, naming the repository', () => {
		const workspace = createFloorLotWorkspace({ manifest: manifestPinning({ spec: PIN_ABOVE }) })
		const worktree = join(workspace.start.worktreesFolder, LOT_FULL_NAME)
		mkdirSync(worktree, { recursive: true })
		rmSync(worktree, { recursive: true })

		const run = runLotCli({ cwd: workspace.elsewhere, args: ['status', LOT_INDEX] })

		expect({
			exitCode: run.status,
			missing: missingFrom({
				text: run.stderr,
				parts: [workspace.start.repository, REFUSAL_WORD],
			}),
		}).toEqual({ exitCode: 2, missing: [] })
	})

	it('14c. an option value is a lot: lot start <brief> --on <index>, the parent lot’s repository pins ^ABOVE and the brief’s ^OWN → refused, naming the parent’s repository', () => {
		const start = createFloorStart({ manifest: manifestPinning({ spec: PIN_OWN }) })
		addOtherRepository(start)
		const otherRepository = join(start.workspace.workspace, 'other')
		writeFiles({
			root: otherRepository,
			files: { 'package.json': manifestPinning({ spec: PIN_ABOVE }) },
		})
		addFloorLot({ start, repository: realpathSync(otherRepository) })

		const run = runLotCli({
			cwd: bareFolder(),
			args: ['start', start.workspace.briefPath, '--on', LOT_INDEX],
		})

		expect({
			exitCode: run.status,
			missing: missingFrom({
				text: run.stderr,
				parts: [OWN_VERSION, ABOVE_VERSION, realpathSync(otherRepository), REFUSAL_WORD],
			}),
			briefRepositoryNamed: run.stderr.includes(start.repository),
		}).toEqual({ exitCode: 2, missing: [], briefRepositoryNamed: false })
	})

	it('14d. identity.cli is no floor: a lot started by a newer cli in a repository pinning ^OWN → not refused', () => {
		const workspace = createFloorLotWorkspace({ manifest: manifestPinning({ spec: PIN_OWN }) })
		recordStartingCli({ lotFolder: workspace.lotFolder, version: ABOVE_VERSION })

		const run = runLotCli({ cwd: workspace.elsewhere, args: ['status', LOT_INDEX] })

		expect({
			refused: (run.stderr + run.stdout).includes(REFUSAL_WORD),
			answersItself: run.stdout.includes(LOT_FULL_NAME),
		}).toEqual({ refused: false, answersItself: true })
	})

	it('14b. two folders: the cwd’s pin is allowed by its base, the named lot’s repository pins ^ABOVE at its base → refused, naming the lot’s repository', () => {
		const workspace = createFloorLotWorkspace({ manifest: manifestPinning({ spec: PIN_ABOVE }) })
		const cwdRepository = createPackageRepository({ manifest: manifestPinning({ spec: PIN_OWN }) })
		commitOnBranch({
			root: cwdRepository,
			path: 'package.json',
			manifest: manifestPinning({ spec: PIN_ABOVE, version: '1.0.1' }),
		})

		const run = runLotCli({ cwd: cwdRepository, args: ['land', LOT_INDEX] })

		expect({
			exitCode: run.status,
			missing: missingFrom({
				text: run.stderr,
				parts: [workspace.start.repository, REFUSAL_WORD],
			}),
			namesCwd: run.stderr.includes(realpathSync(cwdRepository)),
		}).toEqual({ exitCode: 2, missing: [], namesCwd: false })
	})
})

describe('lot: the cli floor of a brief’s repository', () => {
	afterEach(function restoreEnvironment() {
		vi.unstubAllEnvs()
	})

	const BRIEF_REPOSITORIES: Array<{ name: string; repository: string }> = [
		{ name: 'a relative repository', repository: '../../repo' },
		{ name: 'a bare name resolved through the workspace', repository: 'repo' },
	]
	for (const row of BRIEF_REPOSITORIES)
		it(`15. lot start <brief> from a folder that holds neither the brief nor a package, ${row.name} pinning ^ABOVE → refused, no lot created`, () => {
			const start = createStartWorkspace({ brief: briefWith({ repository: row.repository }) })
			writeFiles({
				root: start.repository,
				files: { 'package.json': manifestPinning({ spec: PIN_ABOVE }) },
			})
			const before = createdBy(start)

			const run = runLotCli({ cwd: bareFolder(), args: ['start', start.workspace.briefPath] })

			expect({
				exitCode: run.status,
				missing: missingFrom({
					text: run.stderr,
					parts: [OWN_VERSION, ABOVE_VERSION, start.repository, REFUSAL_WORD],
				}),
				created: createdBy(start),
				lots: entriesOf(start.store),
			}).toEqual({ exitCode: 2, missing: [], created: before, lots: [] })
		})
})

describe('lot: the cli floor of a linked or file-pinned install', () => {
	afterEach(function restoreEnvironment() {
		vi.unstubAllEnvs()
	})

	const LINKED_ENTRIES: Array<{ name: string; link: (root: string) => string }> = [
		{
			name: 'a folder link node_modules/@dialecte/cli to the checkout',
			link: function folderLink(root) {
				const link = join(root, 'node_modules', '@dialecte', 'cli')
				mkdirSync(join(link, '..'), { recursive: true })
				symlinkSync(join(CLI_SOURCE, '..', '..'), link)
				// Node resolves the main entry to its real path, which is why src/cli.ts runs at all through the link
				// (type stripping is refused under node_modules); the invoked path still names the link
				return join(link, 'src', 'cli.ts')
			},
		},
		{
			name: 'a file-level bin link bin/dialecte to src/cli.ts, as a global install leaves it',
			link: function binLink(root) {
				const link = join(root, 'bin', 'dialecte')
				mkdirSync(join(link, '..'), { recursive: true })
				symlinkSync(CLI_SOURCE, link)
				return link
			},
		},
	]
	for (const row of LINKED_ENTRIES)
		it(`16. ${row.name}, the package pinning ^ABOVE → refused, its own version read through the link, the link path and the real path named`, () => {
			isolateState()
			const root = createPackageRepository({ manifest: manifestPinning({ spec: PIN_ABOVE }) })
			const invoked = row.link(root)

			const run = runLotCli({ cwd: root, args: ['status', 'x'], entry: invoked })

			expect({
				exitCode: run.status,
				missing: missingFrom({
					text: run.stderr,
					parts: [OWN_VERSION, ABOVE_VERSION, invoked, realpathSync(CLI_SOURCE)],
				}),
			}).toEqual({ exitCode: 2, missing: [] })
		})

	const FILE_PINNED: Array<{ name: string; installed: string; verdict: string; named: string[] }> =
		[
			{
				name: 'installed above the running cli',
				installed: ABOVE_VERSION,
				verdict: 'refused',
				named: ['installed in node_modules'],
			},
			{
				name: 'installed at the running version',
				installed: OWN_VERSION,
				verdict: UNKNOWN_LOT_LINE,
				named: [],
			},
		]
	for (const row of FILE_PINNED)
		it(`17. a file: pin with the cli ${row.name} → ${row.verdict === 'refused' ? 'refused, source installed' : 'allowed'}`, () => {
			isolateState()
			const root = createPackageRepository({
				manifest: manifestPinning({ spec: 'file:./cli.tgz' }),
			})
			writeFiles({
				root,
				files: {
					'node_modules/@dialecte/cli/package.json': `${JSON.stringify({ name: CLI_PACKAGE, version: row.installed })}\n`,
				},
			})

			const run = runLotCli({ cwd: root, args: ['status', 'x'] })

			expect({
				verdict: verdictOf(run),
				missing: missingFrom({ text: run.stderr, parts: row.named }),
			}).toEqual({ verdict: row.verdict, missing: [] })
		})
})
