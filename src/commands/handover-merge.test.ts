import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
/** A merge as a hand-over lot: the conflicts as reviewed, their resolutions hash-checked, the tree as rehearsed. */
import {
	chmodSync,
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs'
import { join } from 'node:path'

import { createFakeClock } from '../../test/fake-clock.ts'
import { removeHookLogs } from '../../test/hook-logs.ts'
import { noRepositoryCli } from '../../test/repository-cli-probe.ts'
import {
	createScratchRepository,
	git,
	temporaryFolder,
	writeFiles,
} from '../../test/scratch-repository.ts'
import { HANDOVER_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { createRecordingSpawner } from '../../test/worktree-pool.ts'
import {
	HANDOVER_FILES,
	INSTALL_BACKUP_FOLDER,
	MERGE_MARKER_FILE,
} from '../lib/handover/handover.constants.ts'
import { runHandover, runHandoverRun } from './handover.ts'

import { describe, expect, it, onTestFinished } from 'vitest'

import type { LotPlan, MergeLot, MergeLotPlan } from '../lib/handover/handover.types.ts'

const SCRATCH_REPOSITORY_TIMEOUT = HANDOVER_CASE_TIMEOUT
const WRITER_CLI = '/opt/dialecte/dist/cli.js'
const MERGE_SUBJECT = 'merge: bring feat/x in'
const NOT_A_TREE = 'f'.repeat(40)
const MARKERS = `${'<'.repeat(7)} ours\nmain\n${'='.repeat(7)}\nfeature\n${'>'.repeat(7)} theirs\n`

type ScenarioOptions = {
	/** The branch also conflicts in `other.txt`, resolved too. */
	twoConflicts?: boolean
	/** The branch changes `clean.txt`, which merges cleanly; the lot resolves it anyway (an evil merge). */
	carried?: boolean
	/** The branch adds `extra.txt`. */
	extraFile?: boolean
	/** The branch adds `marked.txt` holding conflict markers, which merges cleanly. */
	markersInBranch?: boolean
	/** `block`: refuses a merge commit while `.git/block-merge` exists; `restage`: stages `hooked.txt`; `untracked`: leaves an untracked `new.txt`. */
	hook?: 'block' | 'restage' | 'untracked'
	/** The conflict is in `é.txt`, a non-ASCII path. */
	unicode?: boolean
	/** The branch deletes `gone.txt`, which main modified: a modify/delete conflict resolved by removing it. */
	modifyDelete?: boolean
	/** The branch and main both change the symlink `link`. */
	symlink?: boolean
	/** The branch changes `clean.txt` (a clean merge), not resolved. */
	cleanChange?: boolean
	/** A plain lot after the merge, editing this file in the working tree. */
	laterFile?: string
	/** A first, plain lot: `notes.txt` modified. */
	plainLot?: boolean
	/** The lot names a tag at the branch tip instead of the branch. */
	tag?: boolean
	/** The tree the merge must hold: given, or `rehearsed` (from a rehearsal of the same scenario). */
	tree?: string
	/** Written without a tree. */
	noTree?: boolean
}

type MergeScenario = {
	root: string
	out: string
	lotsPath: string
	head: string
	tip: string
}

function head(root: string): string {
	return git({ root, args: ['rev-parse', 'HEAD'] }).trim()
}

/**
 * `main` and `feat/x` both changed `conflict.txt` after their common commit: the merge of the branch
 * conflicts there, and the lot resolves it.
 */
function mergeScenario(options: ScenarioOptions = {}): MergeScenario {
	const root = createScratchRepository({
		'conflict.txt': 'base\n',
		'other.txt': 'one\n',
		'clean.txt': 'clean\n',
		'notes.txt': 'notes\n',
		'.gitignore': '.husky/_\nnode_modules\n',
		...(options.unicode && { 'é.txt': 'base\n' }),
		...(options.modifyDelete && { 'gone.txt': 'gone\n' }),
	})
	if (options.symlink) {
		symlinkSync('a', join(root, 'link'))
		git({ root, args: ['add', '-A'] })
		git({ root, args: ['commit', '-q', '-m', 'chore: a link'] })
	}
	git({ root, args: ['checkout', '-q', '-b', 'feat/x'] })
	writeFiles({
		root,
		files: {
			'conflict.txt': 'feature\n',
			'new.txt': 'new\n',
			...(options.twoConflicts && { 'other.txt': 'feature other\n' }),
			...(options.carried && { 'clean.txt': 'feature clean\n' }),
			...(options.extraFile && { 'extra.txt': 'extra\n' }),
			...(options.markersInBranch && { 'marked.txt': MARKERS }),
			...(options.unicode && { 'é.txt': 'feature\n' }),
			...(options.cleanChange && { 'clean.txt': 'feature clean\n' }),
		},
	})
	if (options.modifyDelete) rmSync(join(root, 'gone.txt'))
	if (options.symlink) {
		rmSync(join(root, 'link'))
		symlinkSync('b', join(root, 'link'))
	}
	git({ root, args: ['add', '-A'] })
	git({ root, args: ['commit', '-q', '-m', 'feat: the branch work'] })
	const tip = head(root)
	if (options.tag) git({ root, args: ['tag', 'v1', tip] })
	git({ root, args: ['checkout', '-q', 'main'] })
	writeFiles({
		root,
		files: {
			'conflict.txt': 'main\n',
			...(options.twoConflicts && { 'other.txt': 'main other\n' }),
			...(options.unicode && { 'é.txt': 'main\n' }),
			...(options.modifyDelete && { 'gone.txt': 'main modified\n' }),
		},
	})
	if (options.symlink) {
		rmSync(join(root, 'link'))
		symlinkSync('c', join(root, 'link'))
	}
	git({ root, args: ['add', '-A'] })
	git({ root, args: ['commit', '-q', '-m', 'feat: the main work'] })
	if (options.hook) {
		const script =
			options.hook === 'block'
				? 'git rev-parse -q --verify MERGE_HEAD >/dev/null && test -f "$(git rev-parse --git-dir)/block-merge" && exit 1\nexit 0\n'
				: options.hook === 'untracked'
					? '[ -f new.txt ] || echo hooked > new.txt\nexit 0\n'
					: 'echo hooked > hooked.txt\ngit add hooked.txt\nexit 0\n'
		writeFiles({ root, files: { '.husky/_/pre-commit': `#!/bin/sh\n${script}` } })
		git({ root, args: ['config', 'core.hooksPath', '.husky/_'] })
		chmodSync(join(root, '.husky/_/pre-commit'), 0o755)
	}
	if (options.plainLot) writeFiles({ root, files: { 'notes.txt': 'notes, edited\n' } })
	if (options.laterFile) writeFiles({ root, files: { [options.laterFile]: 'edited later\n' } })
	const out = temporaryFolder('dialecte-merge-handover-')
	writeFiles({
		root: out,
		files: {
			'resolved/conflict.txt': 'resolved\n',
			...(options.twoConflicts && { 'resolved/other.txt': 'resolved other\n' }),
			...(options.carried && { 'resolved/clean.txt': 'resolved clean\n' }),
			...(options.unicode && { 'resolved/é.txt': 'resolved é\n' }),
			...(options.symlink && { 'resolved/link': 'resolved link\n' }),
		},
	})
	const resolved: Record<string, string | null> = {
		'conflict.txt': 'resolved/conflict.txt',
		...(options.twoConflicts && { 'other.txt': 'resolved/other.txt' }),
		...(options.carried && { 'clean.txt': 'resolved/clean.txt' }),
		...(options.unicode && { 'é.txt': 'resolved/é.txt' }),
		...(options.modifyDelete && { 'gone.txt': null }),
		...(options.symlink && { link: 'resolved/link' }),
	}
	const { tree } = options
	const mergeLot: MergeLotPlan = {
		kind: 'merge',
		branch: options.tag ? 'v1' : 'feat/x',
		tip,
		// a null resolution removes the file (modify/delete)
		resolved: resolved as MergeLotPlan['resolved'],
		message: `${MERGE_SUBJECT}\n\nThe body.`,
		...(tree && { tree }),
	}
	const lotsPath = join(out, 'lots.json')
	writeFileSync(
		lotsPath,
		JSON.stringify({
			repository: root,
			branch: 'main',
			head: head(root),
			gates: 'npm run check',
			lots: [
				...(options.plainLot ? [{ paths: ['notes.txt'], message: 'docs(notes): edited' }] : []),
				mergeLot,
				...(options.laterFile
					? [{ paths: [options.laterFile], message: 'docs(later): edited after the merge' }]
					: []),
			],
		}),
	)
	return { root, out, lotsPath, head: head(root), tip }
}

function writeHandover(lotsPath: string) {
	return runHandover({ argv: [lotsPath], cliPath: WRITER_CLI, probe: noRepositoryCli })
}

async function runFolder(params: {
	out: string
	argv?: string[]
}): Promise<{ exitCode: number; lines: string[]; text: string }> {
	const lines: string[] = []
	removeHookLogs({ lines })
	const exitCode = await runHandoverRun({
		probe: noRepositoryCli,
		argv: [params.out, ...(params.argv ?? [])],
		write: (line) => lines.push(line),
		clock: createFakeClock(),
		colour: false,
		scratchRoot: temporaryFolder('dialecte-scratch-root-'),
		spawner: createRecordingSpawner().spawner,
	})
	return { exitCode, lines, text: lines.join('\n') }
}

/** The tree a scenario's rehearsal reports, awaited (the real run's check needs it before the lots file is written). */
async function treeOf(options: ScenarioOptions): Promise<string> {
	const scenario = mergeScenario({ ...options, noTree: true, hook: undefined, tag: undefined })
	expect(writeHandover(scenario.lotsPath).exitCode).toBe(0)
	const rehearsal = await runFolder({ out: scenario.out, argv: ['--rehearse'] })
	return /tree ([0-9a-f]{40})/.exec(rehearsal.text)?.[1] ?? NOT_A_TREE
}

const TREES = new Map<string, string>()

/** A scenario recording the tree its rehearsal reports (given, or the same for the same content), unless `noTree`. */
async function recordedScenario(options: ScenarioOptions = {}): Promise<MergeScenario> {
	if (options.noTree || options.tree !== undefined) return mergeScenario(options)
	const { hook: _hook, tag: _tag, ...content } = options
	const key = JSON.stringify(content)
	const known = TREES.get(key)
	const tree = known ?? (await treeOf(content))
	TREES.set(key, tree)
	return mergeScenario({ ...options, tree })
}

/** Written then run: a refusal at the write is a refusal before any commit too. */
async function refusedBeforeAnyCommit(
	scenario: MergeScenario,
): Promise<{ exitCode: number; text: string }> {
	const written = writeHandover(scenario.lotsPath)
	if (written.exitCode !== 0) return { exitCode: written.exitCode, text: written.output }
	const ran = await runFolder({ out: scenario.out })
	return { exitCode: ran.exitCode, text: ran.text }
}

/** Nothing of the merge is left: no merge in progress, nothing modified or staged, HEAD where it was. */
function untouched(root: string): { mergeInProgress: boolean; status: string; head: string } {
	return {
		mergeInProgress: existsSync(join(root, '.git', 'MERGE_HEAD')),
		status: git({ root, args: ['status', '--porcelain'] }).replace(/^\?\? .*\n/gm, ''),
		head: head(root),
	}
}

function cleanAt(scenario: MergeScenario): ReturnType<typeof untouched> {
	return { mergeInProgress: false, status: '', head: scenario.head }
}

describe('a merge lot: the hand-over written', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('a merge lot with its resolutions → written, the card names the merge, the branch and the subject', () => {
		const { lotsPath } = mergeScenario({ noTree: true })

		const result = writeHandover(lotsPath)

		expect(result.exitCode).toBe(0)
		expect(result.output).toContain(MERGE_SUBJECT)
		expect(result.output).toMatch(/merge[^\n]*feat\/x/)
	})

	it('a merge lot without a tree → written; the card says the tree is not recorded and to rehearse first', () => {
		const { lotsPath } = mergeScenario({ noTree: true })

		const result = writeHandover(lotsPath)

		expect(result.exitCode).toBe(0)
		expect(result.output).toContain('tree not recorded: rehearse first')
	})

	const REFUSALS: Record<
		string,
		{ change: (scenario: MergeScenario) => void; expected: (scenario: MergeScenario) => RegExp[] }
	> = {
		'the branch moved since the tip was reviewed → refused naming the recorded tip and saying it moved':
			{
				change: (scenario) => {
					git({ root: scenario.root, args: ['checkout', '-q', 'feat/x'] })
					git({ root: scenario.root, args: ['commit', '-q', '--allow-empty', '-m', 'feat: moved'] })
					git({ root: scenario.root, args: ['checkout', '-q', 'main'] })
				},
				expected: (scenario) => [new RegExp(scenario.tip.slice(0, 7)), /moved/],
			},
		'a branch that does not exist → refused naming it': {
			change: (scenario) => {
				git({ root: scenario.root, args: ['branch', '-q', '-D', 'feat/x'] })
			},
			expected: () => [/feat\/x/],
		},
		'a resolved file that does not exist → refused naming it': {
			change: (scenario) => {
				writeFileSync(
					scenario.lotsPath,
					readFileSync(scenario.lotsPath, 'utf8').replace(
						'resolved/conflict.txt',
						'resolved/missing.txt',
					),
				)
			},
			expected: () => [/resolved\/missing\.txt/],
		},
		'a resolution holding conflict markers → refused at the write, naming it': {
			change: (scenario) => {
				writeFileSync(join(scenario.out, 'resolved', 'conflict.txt'), MARKERS)
			},
			expected: () => [/conflict markers/, /conflict\.txt/],
		},
	}

	for (const [name, refusal] of Object.entries(REFUSALS))
		it(name, () => {
			const scenario = mergeScenario({ noTree: true })
			refusal.change(scenario)

			const result = writeHandover(scenario.lotsPath)

			expect(result.exitCode).toBe(1)
			expect(result.output).toMatch(/^handover refused/)
			for (const pattern of refusal.expected(scenario)) expect(result.output).toMatch(pattern)
		})
})

describe('a merge lot: handover run', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('conflicts as reviewed → the resolution is copied, the merge committed as a merge commit of the recorded tip, the tree holds the resolution', async () => {
		const scenario = await recordedScenario()
		expect(writeHandover(scenario.lotsPath).exitCode).toBe(0)

		const result = await runFolder({ out: scenario.out })

		const { root } = scenario
		expect(result.exitCode).toBe(0)
		expect(
			git({ root, args: ['rev-list', '--parents', '-1', 'HEAD'] })
				.trim()
				.split(' ')
				.slice(1),
		).toEqual([scenario.head, scenario.tip])
		expect(git({ root, args: ['log', '-1', '--format=%s'] }).trim()).toBe(MERGE_SUBJECT)
		expect(readFileSync(join(root, 'conflict.txt'), 'utf8')).toBe('resolved\n')
		expect(readFileSync(join(root, 'new.txt'), 'utf8')).toBe('new\n')
		expect(untouched(root).mergeInProgress).toBe(false)
		expect(git({ root, args: ['status', '--porcelain'] })).toBe('')
	})

	it('the lot names a tag at the tip instead of a branch → merged all the same', async () => {
		const scenario = await recordedScenario({ tag: true })
		expect(writeHandover(scenario.lotsPath).exitCode).toBe(0)

		const result = await runFolder({ out: scenario.out })

		expect(result.exitCode).toBe(0)
		expect(git({ root: scenario.root, args: ['rev-parse', 'HEAD^2'] }).trim()).toBe(scenario.tip)
	})

	it('a resolution covering a file that merged cleanly (an evil merge) → its resolution is what is committed', async () => {
		const scenario = await recordedScenario({ carried: true })
		expect(writeHandover(scenario.lotsPath).exitCode).toBe(0)

		const result = await runFolder({ out: scenario.out })

		expect(result.exitCode).toBe(0)
		expect(readFileSync(join(scenario.root, 'clean.txt'), 'utf8')).toBe('resolved clean\n')
		expect(readFileSync(join(scenario.root, 'conflict.txt'), 'utf8')).toBe('resolved\n')
	})

	it('the branch moved after the write → the run merges the recorded tip, and says the branch moved', async () => {
		const scenario = await recordedScenario()
		expect(writeHandover(scenario.lotsPath).exitCode).toBe(0)
		git({ root: scenario.root, args: ['checkout', '-q', 'feat/x'] })
		git({ root: scenario.root, args: ['commit', '-q', '--allow-empty', '-m', 'feat: moved'] })
		git({ root: scenario.root, args: ['checkout', '-q', 'main'] })

		const result = await runFolder({ out: scenario.out })

		expect(result.exitCode).toBe(0)
		expect(git({ root: scenario.root, args: ['rev-parse', 'HEAD^2'] }).trim()).toBe(scenario.tip)
		expect(result.text).toMatch(/moved/i)
	})

	it('a conflict nobody resolved (the branch also conflicts in other.txt) → refused naming it before any commit, nothing changed', async () => {
		const scenario = mergeScenario({ twoConflicts: true, tree: NOT_A_TREE })
		writeFileSync(
			scenario.lotsPath,
			readFileSync(scenario.lotsPath, 'utf8').replace(',"other.txt":"resolved/other.txt"', ''),
		)

		const result = await refusedBeforeAnyCommit(scenario)

		expect(result.exitCode).toBe(1)
		expect(result.text).toContain('other.txt')
		expect(untouched(scenario.root)).toEqual(cleanAt(scenario))
	})

	it('a resolution edited after the hand-over was written → refused naming it, nothing merged', async () => {
		const scenario = await recordedScenario()
		expect(writeHandover(scenario.lotsPath).exitCode).toBe(0)
		writeFileSync(join(scenario.out, 'resolved', 'conflict.txt'), 'edited since\n')

		const result = await runFolder({ out: scenario.out })

		expect(result.exitCode).toBe(1)
		expect(result.text).toContain('conflict.txt')
		expect(untouched(scenario.root)).toEqual(cleanAt(scenario))
	})

	it('a merge result holding conflict markers some other way (the branch carries them) → refused as conflict markers, the merge aborted', async () => {
		const scenario = mergeScenario({ markersInBranch: true, tree: NOT_A_TREE })

		const result = await refusedBeforeAnyCommit(scenario)

		expect(result.exitCode).toBe(1)
		expect(result.text).toContain('conflict markers')
		expect(untouched(scenario.root)).toEqual(cleanAt(scenario))
	})

	it('a merge lot with no tree → the run refuses: tree not recorded, rehearse first; nothing changed', async () => {
		const scenario = mergeScenario({ noTree: true })
		expect(writeHandover(scenario.lotsPath).exitCode).toBe(0)

		const result = await runFolder({ out: scenario.out })

		expect(result.exitCode).toBe(1)
		expect(result.text).toContain('tree not recorded: rehearse first')
		expect(untouched(scenario.root)).toEqual(cleanAt(scenario))
	})

	it('the rehearsal of a lot without a tree prints the tree; recording it lets the run commit, and the commit holds it', async () => {
		const rehearsed = mergeScenario({ noTree: true })
		expect(writeHandover(rehearsed.lotsPath).exitCode).toBe(0)
		const rehearsal = await runFolder({ out: rehearsed.out, argv: ['--rehearse'] })
		const tree = /tree ([0-9a-f]{40})/.exec(rehearsal.text)?.[1] ?? ''
		const recorded = await recordedScenario({ tree })
		expect(writeHandover(recorded.lotsPath).exitCode).toBe(0)

		const ran = await runFolder({ out: recorded.out })

		expect(rehearsal.exitCode).toBe(0)
		expect(tree).toMatch(/^[0-9a-f]{40}$/)
		expect(ran.exitCode).toBe(0)
		expect(git({ root: recorded.root, args: ['rev-parse', 'HEAD^{tree}'] }).trim()).toBe(tree)
	})

	it('a merge result that differs from the recorded tree although every resolution matches its hash (a file added after the rehearsal) → refused before the commit, both trees named, the merge aborted', async () => {
		const recordedTree = await treeOf({})
		const actualTree = await treeOf({ extraFile: true })
		const scenario = mergeScenario({ extraFile: true, tree: recordedTree })
		expect(writeHandover(scenario.lotsPath).exitCode).toBe(0)

		const result = await runFolder({ out: scenario.out })

		expect(result.exitCode).toBe(1)
		expect(result.text).toContain(recordedTree.slice(0, 12))
		expect(result.text).toContain(actualTree.slice(0, 12))
		expect(untouched(scenario.root)).toEqual(cleanAt(scenario))
	})

	it('a hook that restages another file → the commit holds another tree than recorded: refused, both trees named; the rerun refuses that commit too and commits nothing more', async () => {
		const scenario = await recordedScenario({ hook: 'restage' })
		const recordedTree = await treeOf({})
		expect(writeHandover(scenario.lotsPath).exitCode).toBe(0)

		const first = await runFolder({ out: scenario.out })
		const committed = head(scenario.root)
		const again = await runFolder({ out: scenario.out })

		expect(first.exitCode).toBe(1)
		expect(first.text).toMatch(/holds another tree than recorded/)
		expect(first.text).toContain(recordedTree.slice(0, 12))
		expect(committed).not.toBe(scenario.head)
		expect(again.exitCode).toBe(1)
		expect(again.text).toMatch(/holds another tree than recorded/)
		expect(head(scenario.root)).toBe(committed)
	})

	it('run again after a done merge → recognised by its subject, second parent and tree: nothing committed twice', async () => {
		const scenario = await recordedScenario()
		expect(writeHandover(scenario.lotsPath).exitCode).toBe(0)
		await runFolder({ out: scenario.out })
		const done = head(scenario.root)

		const again = await runFolder({ out: scenario.out })

		expect(again.exitCode).toBe(0)
		expect(again.text).toContain('every lot is committed already')
		expect(head(scenario.root)).toBe(done)
	})

	it('a plain commit with the merge subject on top of the recorded HEAD → refused, never taken for the merge, nothing more committed', async () => {
		const scenario = await recordedScenario()
		expect(writeHandover(scenario.lotsPath).exitCode).toBe(0)
		git({ root: scenario.root, args: ['commit', '-q', '--allow-empty', '-m', MERGE_SUBJECT] })
		const lookalike = head(scenario.root)

		const result = await runFolder({ out: scenario.out })

		expect(result.exitCode).toBe(1)
		expect(head(scenario.root)).toBe(lookalike)
	})

	it('a merge of another tip with the merge subject on top of the recorded HEAD → refused, never taken for the merge', async () => {
		const scenario = await recordedScenario()
		expect(writeHandover(scenario.lotsPath).exitCode).toBe(0)
		git({ root: scenario.root, args: ['checkout', '-q', '-b', 'feat/y'] })
		writeFiles({ root: scenario.root, files: { 'y.txt': 'y\n' } })
		git({ root: scenario.root, args: ['add', '-A'] })
		git({ root: scenario.root, args: ['commit', '-q', '-m', 'feat: y'] })
		git({ root: scenario.root, args: ['checkout', '-q', 'main'] })
		git({ root: scenario.root, args: ['merge', '-q', '--no-ff', '-m', MERGE_SUBJECT, 'feat/y'] })
		const other = head(scenario.root)

		const result = await runFolder({ out: scenario.out })

		expect(result.exitCode).toBe(1)
		expect(head(scenario.root)).toBe(other)
	})

	it('a merge of something else already in progress → refused, and left in progress (never aborted)', async () => {
		const scenario = await recordedScenario()
		expect(writeHandover(scenario.lotsPath).exitCode).toBe(0)
		git({ root: scenario.root, args: ['checkout', '-q', '-b', 'feat/y'] })
		writeFiles({ root: scenario.root, files: { 'y.txt': 'y\n' } })
		git({ root: scenario.root, args: ['add', '-A'] })
		git({ root: scenario.root, args: ['commit', '-q', '-m', 'feat: y'] })
		git({ root: scenario.root, args: ['checkout', '-q', 'main'] })
		git({ root: scenario.root, args: ['merge', '-q', '--no-ff', '--no-commit', 'feat/y'] })

		const result = await runFolder({ out: scenario.out })

		expect(result.exitCode).toBe(1)
		expect(existsSync(join(scenario.root, '.git', 'MERGE_HEAD'))).toBe(true)
		expect(head(scenario.root)).toBe(scenario.head)
	})

	it('a hook refusing the merge commit → the merge aborted for a clean rerun; the rerun after the hook allows it commits the merge', async () => {
		const scenario = await recordedScenario({ hook: 'block' })
		expect(writeHandover(scenario.lotsPath).exitCode).toBe(0)
		writeFileSync(join(scenario.root, '.git', 'block-merge'), '')

		const refused = await runFolder({ out: scenario.out })
		const afterRefusal = untouched(scenario.root)
		rmSync(join(scenario.root, '.git', 'block-merge'))
		const rerun = await runFolder({ out: scenario.out })

		expect(refused.exitCode).toBe(1)
		expect(afterRefusal).toEqual(cleanAt(scenario))
		expect(rerun.exitCode).toBe(0)
		expect(git({ root: scenario.root, args: ['log', '-1', '--format=%s'] }).trim()).toBe(
			MERGE_SUBJECT,
		)
	})
})

describe(
	'a plain lot and a merge lot in one lots.json',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		it('both committed in order: the plain commit first, the merge on top of it with the branch tip as its second parent', async () => {
			const scenario = await recordedScenario({ plainLot: true })
			expect(writeHandover(scenario.lotsPath).exitCode).toBe(0)

			const result = await runFolder({ out: scenario.out })

			const { root } = scenario
			const parents = git({ root, args: ['rev-list', '--parents', '-1', 'HEAD'] })
				.trim()
				.split(' ')
			expect(result.exitCode).toBe(0)
			expect(
				git({ root, args: ['log', '--format=%s', '-3', '--first-parent'] })
					.trim()
					.split('\n'),
			).toEqual([MERGE_SUBJECT, 'docs(notes): edited', 'feat: the main work'])
			expect(parents[2]).toBe(scenario.tip)
			expect(parents[1]).toBe(git({ root, args: ['rev-parse', 'HEAD~1'] }).trim())
		})

		it('the merge refused by the hook after the plain lot was committed → the rerun resumes at the merge', async () => {
			const scenario = await recordedScenario({ plainLot: true, hook: 'block' })
			expect(writeHandover(scenario.lotsPath).exitCode).toBe(0)
			writeFileSync(join(scenario.root, '.git', 'block-merge'), '')

			const refused = await runFolder({ out: scenario.out })
			const plainCommit = head(scenario.root)
			rmSync(join(scenario.root, '.git', 'block-merge'))
			const rerun = await runFolder({ out: scenario.out })

			expect(refused.exitCode).toBe(1)
			expect(
				git({ root: scenario.root, args: ['log', '-1', '--format=%s', plainCommit] }).trim(),
			).toBe('docs(notes): edited')
			expect(rerun.exitCode).toBe(0)
			expect(git({ root: scenario.root, args: ['rev-parse', 'HEAD~1'] }).trim()).toBe(plainCommit)
			expect(git({ root: scenario.root, args: ['log', '-1', '--format=%s'] }).trim()).toBe(
				MERGE_SUBJECT,
			)
		})
	},
)

/** Lot files whose lock changes: the installed packages are compared with the staged lock before the commit. */
describe(
	'a commit staging a changed lock: node_modules against the lock',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		const LOCK_ONE =
			'{\n\t"lockfileVersion": 3,\n\t"packages": {\n\t\t"": {},\n\t\t"node_modules/dep": { "version": "1.0.0" }\n\t}\n}\n'
		const LOCK_TWO = LOCK_ONE.replace('1.0.0', '2.0.0')

		/** A repository whose lot rewrites the lock to dep 2.0.0; dep `installed` in node_modules; a fake npm first on PATH. */
		function lockScenario(params: { installed: string; npm: 'installs' | 'rewrites the lock' }): {
			root: string
			out: string
			calls: string
			base: string
		} {
			const root = createScratchRepository({
				'package.json': '{ "name": "demo" }\n',
				'package-lock.json': LOCK_ONE,
				'.gitignore': 'node_modules\n',
			})
			writeFiles({
				root,
				files: {
					'node_modules/dep/package.json': `{ "name": "dep", "version": "${params.installed}" }\n`,
					'package-lock.json': LOCK_TWO,
				},
			})
			const bin = temporaryFolder('dialecte-fake-npm-')
			const calls = join(bin, 'calls.txt')
			writeFileSync(
				join(bin, 'npm'),
				[
					'#!/bin/sh',
					`echo "$@" >> '${calls}'`,
					...(params.npm === 'rewrites the lock' ? ['echo "{}" > package-lock.json'] : []),
					'mkdir -p node_modules/dep',
					'echo \'{ "name": "dep", "version": "2.0.0" }\' > node_modules/dep/package.json',
					'',
				].join('\n'),
			)
			chmodSync(join(bin, 'npm'), 0o755)
			const previous = process.env.PATH
			process.env.PATH = `${bin}:${previous ?? ''}`
			onTestFinished(function restorePath() {
				process.env.PATH = previous
			})
			const out = temporaryFolder('dialecte-lock-handover-')
			const lotsPath = join(out, 'lots.json')
			writeFileSync(
				lotsPath,
				JSON.stringify({
					repository: root,
					branch: 'main',
					head: head(root),
					lots: [{ paths: ['package-lock.json'], message: 'chore(deps): dep 2' }],
				}),
			)
			expect(writeHandover(lotsPath).exitCode).toBe(0)
			return { root, out, calls, base: head(root) }
		}

		it('node_modules already at the staged lock → no install, the commit goes through', async () => {
			const scenario = lockScenario({ installed: '2.0.0', npm: 'installs' })

			const result = await runFolder({ out: scenario.out })

			expect(result.exitCode).toBe(0)
			expect(existsSync(scenario.calls)).toBe(false)
			expect(head(scenario.root)).not.toBe(scenario.base)
		})

		it('node_modules behind the staged lock → the installer runs, then the commit goes through', async () => {
			const scenario = lockScenario({ installed: '1.0.0', npm: 'installs' })

			const result = await runFolder({ out: scenario.out })

			expect(result.exitCode).toBe(0)
			expect(existsSync(scenario.calls) ? readFileSync(scenario.calls, 'utf8') : '').toContain('ci')
			expect(head(scenario.root)).not.toBe(scenario.base)
		})

		it('an install that rewrites the lock → refused naming package-lock.json, nothing committed', async () => {
			const scenario = lockScenario({ installed: '1.0.0', npm: 'rewrites the lock' })

			const result = await runFolder({ out: scenario.out })

			expect(result.exitCode).toBe(1)
			expect(result.text).toContain('package-lock.json')
			expect(head(scenario.root)).toBe(scenario.base)
		})
	},
)

const LOCK_V1 =
	'{\n\t"lockfileVersion": 3,\n\t"packages": {\n\t\t"": {},\n\t\t"node_modules/dep": { "version": "1.0.0" }\n\t}\n}\n'
const LOCK_V2 = LOCK_V1.replace('1.0.0', '2.0.0')
const PACKAGE_V0 = '{ "name": "demo", "version": "0.0.0" }\n'
const PACKAGE_V2 = '{ "name": "demo", "version": "0.0.2", "dependencies": { "dep": "2.0.0" } }\n'

/** A fake `npm` first on PATH that runs `lines` (a shell script body) in the folder it is run in. */
function installFakeNpm(lines: string[]): void {
	const bin = temporaryFolder('dialecte-fake-npm-')
	writeFileSync(join(bin, 'npm'), ['#!/bin/sh', ...lines, ''].join('\n'))
	chmodSync(join(bin, 'npm'), 0o755)
	const previous = process.env.PATH
	process.env.PATH = `${bin}:${previous ?? ''}`
	onTestFinished(function restorePath() {
		process.env.PATH = previous
	})
}

const INSTALL_DEP_TWO =
	'mkdir -p node_modules/dep\necho \'{ "name": "dep", "version": "2.0.0" }\' > node_modules/dep/package.json'

describe('the lock sync installs the staged state', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	/**
	 * Two plain lots: the first commits the new lock, the second the newer package.json: while the first
	 * commits, the working package.json is not the staged one.
	 */
	function twoLotsScenario(npm: 'installs' | 'rewrites the lock'): {
		root: string
		out: string
		record: string
		base: string
	} {
		const root = createScratchRepository({
			'package.json': PACKAGE_V0,
			'package-lock.json': LOCK_V1,
			'.gitignore': 'node_modules\n',
		})
		writeFiles({
			root,
			files: {
				'node_modules/dep/package.json': '{ "name": "dep", "version": "1.0.0" }\n',
				'package-lock.json': LOCK_V2,
				'package.json': PACKAGE_V2,
			},
		})
		const record = join(temporaryFolder('dialecte-npm-record-'), 'record.txt')
		installFakeNpm([
			`{ echo "ARGS $*"; cat package.json package-lock.json; } >> '${record}'`,
			...(npm === 'rewrites the lock' ? ['echo "{}" > package-lock.json'] : []),
			INSTALL_DEP_TWO,
		])
		const out = temporaryFolder('dialecte-lock-handover-')
		const lotsPath = join(out, 'lots.json')
		writeFileSync(
			lotsPath,
			JSON.stringify({
				repository: root,
				branch: 'main',
				head: head(root),
				lots: [
					{ paths: ['package-lock.json'], message: 'chore(deps): dep 2' },
					{ paths: ['package.json'], message: 'chore(deps): the manifest' },
				],
			}),
		)
		expect(writeHandover(lotsPath).exitCode).toBe(0)
		return { root, out, record, base: head(root) }
	}

	it('the installer sees the staged lock and package.json, not the working copies of a later lot; the later lot files come back byte for byte, no false lock change', async () => {
		const scenario = twoLotsScenario('installs')

		const result = await runFolder({ out: scenario.out })

		const record = existsSync(scenario.record) ? readFileSync(scenario.record, 'utf8') : ''
		expect(result.exitCode).toBe(0)
		expect(record.match(/^ARGS /gm)).toHaveLength(1)
		expect(record).toMatch(/^ARGS ci\b/)
		expect(record).toContain(LOCK_V2)
		expect(record).toContain(PACKAGE_V0)
		expect(record).not.toContain('"version": "0.0.2"')
		expect(readFileSync(join(scenario.root, 'package.json'), 'utf8')).toBe(PACKAGE_V2)
		expect(readFileSync(join(scenario.root, 'package-lock.json'), 'utf8')).toBe(LOCK_V2)
		expect(result.text).not.toContain('install changed')
	})

	it('an installer that rewrites the lock → refused naming it, nothing committed, the working copies restored', async () => {
		const scenario = twoLotsScenario('rewrites the lock')

		const result = await runFolder({ out: scenario.out })

		expect(result.exitCode).toBe(1)
		expect(result.text).toContain('package-lock.json')
		expect(head(scenario.root)).toBe(scenario.base)
		expect(readFileSync(join(scenario.root, 'package.json'), 'utf8')).toBe(PACKAGE_V2)
		expect(readFileSync(join(scenario.root, 'package-lock.json'), 'utf8')).toBe(LOCK_V2)
	})
})

/** The installer as `handover run` runs it: npm ci with no install script. */
const INSTALL_ARGUMENTS = 'ci --ignore-scripts --prefer-offline --no-audit --no-fund'

describe('the lock sync runs no install scripts', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('the installer runs npm ci --ignore-scripts --prefer-offline --no-audit --no-fund; a lock with no install script → no install-scripts note', async () => {
		const root = createScratchRepository({
			'package.json': PACKAGE_V0,
			'package-lock.json': LOCK_V1,
			'.gitignore': 'node_modules\n',
		})
		writeFiles({
			root,
			files: {
				'node_modules/dep/package.json': '{ "name": "dep", "version": "1.0.0" }\n',
				'package-lock.json': LOCK_V2,
			},
		})
		const record = join(temporaryFolder('dialecte-npm-record-'), 'record.txt')
		installFakeNpm([`echo "$*" >> '${record}'`, INSTALL_DEP_TWO])
		const out = temporaryFolder('dialecte-lock-handover-')
		const lotsPath = join(out, 'lots.json')
		writeFileSync(
			lotsPath,
			JSON.stringify({
				repository: root,
				branch: 'main',
				head: head(root),
				lots: [{ paths: ['package-lock.json'], message: 'chore(deps): dep 2' }],
			}),
		)
		expect(writeHandover(lotsPath).exitCode).toBe(0)

		const result = await runFolder({ out })

		expect(result.exitCode).toBe(0)
		expect(existsSync(record) ? readFileSync(record, 'utf8') : '').toBe(`${INSTALL_ARGUMENTS}\n`)
		expect(result.text).toContain('node_modules brought to the staged lock')
		expect(result.text).not.toContain('install scripts not run')
	})

	it('npm ci reinstalls every package: the note names each installed package with an install script once, by its name, in lock order, five then a count: dep, plain, settled (already at its version), clock, dial and 1 more; a nested copy of dep not named again; one without a script → not named', async () => {
		function lockWithScripts(version: string): string {
			return `${JSON.stringify(
				{
					lockfileVersion: 3,
					packages: {
						'': {},
						'node_modules/dep': { version, hasInstallScript: true },
						'node_modules/plain': { version, hasInstallScript: true },
						'node_modules/bare': { version },
						'node_modules/settled': { version: '1.0.0', hasInstallScript: true },
						'node_modules/plain/node_modules/dep': { version: '1.0.0', hasInstallScript: true },
						'node_modules/clock': { version: '1.0.0', hasInstallScript: true },
						'node_modules/dial': { version: '1.0.0', hasInstallScript: true },
						'node_modules/edge': { version: '1.0.0', hasInstallScript: true },
					},
				},
				null,
				'\t',
			)}\n`
		}
		const root = createScratchRepository({
			'package.json': PACKAGE_V0,
			'package-lock.json': lockWithScripts('1.0.0'),
			'.gitignore': 'node_modules\n',
		})
		writeFiles({
			root,
			files: {
				'node_modules/dep/package.json': '{ "name": "dep", "version": "1.0.0" }\n',
				'node_modules/plain/package.json': '{ "name": "plain", "version": "1.0.0" }\n',
				'node_modules/bare/package.json': '{ "name": "bare", "version": "1.0.0" }\n',
				'node_modules/settled/package.json': '{ "name": "settled", "version": "1.0.0" }\n',
				'node_modules/plain/node_modules/dep/package.json':
					'{ "name": "dep", "version": "1.0.0" }\n',
				'node_modules/clock/package.json': '{ "name": "clock", "version": "1.0.0" }\n',
				'node_modules/dial/package.json': '{ "name": "dial", "version": "1.0.0" }\n',
				'node_modules/edge/package.json': '{ "name": "edge", "version": "1.0.0" }\n',
				'package-lock.json': lockWithScripts('2.0.0'),
			},
		})
		installFakeNpm([
			INSTALL_DEP_TWO,
			'mkdir -p node_modules/plain',
			`echo '{ "name": "plain", "version": "2.0.0" }' > node_modules/plain/package.json`,
			'mkdir -p node_modules/bare',
			`echo '{ "name": "bare", "version": "2.0.0" }' > node_modules/bare/package.json`,
		])
		const out = temporaryFolder('dialecte-lock-handover-')
		const lotsPath = join(out, 'lots.json')
		writeFileSync(
			lotsPath,
			JSON.stringify({
				repository: root,
				branch: 'main',
				head: head(root),
				lots: [{ paths: ['package-lock.json'], message: 'chore(deps): dep and plain 2' }],
			}),
		)
		expect(writeHandover(lotsPath).exitCode).toBe(0)

		const result = await runFolder({ out })

		expect(result.exitCode).toBe(0)
		expect(/install scripts not run: (.*)$/m.exec(result.text)?.[1]).toBe(
			'dep, plain, settled, clock, dial and 1 more',
		)
	})

	it('a failed install → the refusal names the command as run: npm ci --ignore-scripts --prefer-offline --no-audit --no-fund failed (exit 1)', async () => {
		const root = createScratchRepository({
			'package.json': PACKAGE_V0,
			'package-lock.json': LOCK_V1,
			'.gitignore': 'node_modules\n',
		})
		writeFiles({
			root,
			files: {
				'node_modules/dep/package.json': '{ "name": "dep", "version": "1.0.0" }\n',
				'package-lock.json': LOCK_V2,
			},
		})
		installFakeNpm(['echo boom >&2', 'exit 1'])
		const out = temporaryFolder('dialecte-failed-install-')
		const lotsPath = join(out, 'lots.json')
		writeFileSync(
			lotsPath,
			JSON.stringify({
				repository: root,
				branch: 'main',
				head: head(root),
				lots: [{ paths: ['package-lock.json'], message: 'chore(deps): dep 2' }],
			}),
		)
		expect(writeHandover(lotsPath).exitCode).toBe(0)

		const result = await runFolder({ out })

		expect(result.exitCode).toBe(1)
		expect(result.text).toContain(`npm ${INSTALL_ARGUMENTS} failed (exit 1)`)
	})
})

describe(
	'the lock sync leaves out what an install may not bring',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		/** A lock holding `dep` and the given extra packages, each with its flag. */
		function lockWith(extra: Record<string, Record<string, boolean>>): string {
			return `${JSON.stringify({
				lockfileVersion: 3,
				packages: {
					'': {},
					'node_modules/dep': { version: '2.0.0' },
					...Object.fromEntries(
						Object.entries(extra).map(([name, flags]) => [
							`node_modules/${name}`,
							{ version: '1.0.0', ...flags },
						]),
					),
				},
			})}\n`
		}
		const DEV_PACKAGES = { devonly: { dev: true }, devopt: { devOptional: true } }
		const LEFT_OUT_PACKAGES = { opt: { optional: true } }

		function absentScenario(params: { installed: string; lock: string }): {
			root: string
			out: string
			calls: string
			base: string
		} {
			const root = createScratchRepository({
				'package.json': PACKAGE_V0,
				'package-lock.json': LOCK_V1,
				'.gitignore': 'node_modules\n',
			})
			writeFiles({
				root,
				files: {
					'node_modules/dep/package.json': `{ "name": "dep", "version": "${params.installed}" }\n`,
					'package-lock.json': params.lock,
				},
			})
			const calls = join(temporaryFolder('dialecte-npm-record-'), 'calls.txt')
			installFakeNpm([`echo "$*" >> '${calls}'`, INSTALL_DEP_TWO])
			const out = temporaryFolder('dialecte-lock-handover-')
			const lotsPath = join(out, 'lots.json')
			writeFileSync(
				lotsPath,
				JSON.stringify({
					repository: root,
					branch: 'main',
					head: head(root),
					lots: [{ paths: ['package-lock.json'], message: 'chore(deps): dep 2' }],
				}),
			)
			expect(writeHandover(lotsPath).exitCode).toBe(0)
			return { root, out, calls, base: head(root) }
		}

		function callCount(calls: string): number {
			return existsSync(calls) ? readFileSync(calls, 'utf8').split('\n').filter(Boolean).length : 0
		}

		it('dev and devOptional packages absent from node_modules → refused by the install guard (exit 2), naming them, nothing committed', async () => {
			const scenario = absentScenario({
				installed: '2.0.0',
				lock: lockWith(DEV_PACKAGES),
			})

			const result = await runFolder({ out: scenario.out })

			expect(result.exitCode).toBe(2)
			const lines = result.text.split('\n')
			expect(lines).toContain('    devonly: missing')
			expect(lines).toContain('    devopt: missing')
			expect(head(scenario.root)).toBe(scenario.base)
		})

		it('an optional package absent from node_modules → nothing differs: no install, the commit goes through', async () => {
			const scenario = absentScenario({
				installed: '2.0.0',
				lock: lockWith(LEFT_OUT_PACKAGES),
			})

			const result = await runFolder({ out: scenario.out })

			expect(result.exitCode).toBe(0)
			expect(callCount(scenario.calls)).toBe(0)
			expect(head(scenario.root)).not.toBe(scenario.base)
		})

		it('node_modules behind, an installer that leaves the dev packages out → installed once, then the install guard refuses (exit 2), naming only the dev packages', async () => {
			const scenario = absentScenario({
				installed: '1.0.0',
				lock: lockWith({ ...DEV_PACKAGES, ...LEFT_OUT_PACKAGES }),
			})

			const result = await runFolder({ out: scenario.out })

			expect(result.exitCode).toBe(2)
			expect(callCount(scenario.calls)).toBe(1)
			const lines = result.text.split('\n')
			expect(lines).toContain('    devonly: missing')
			expect(lines).toContain('    devopt: missing')
			expect(lines.filter((line) => /^ {4}opt:/.test(line))).toEqual([])
			expect(head(scenario.root)).toBe(scenario.base)
		})
	},
)

describe(
	'a merge lot: the review hash and the trial',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		const EDITS: Record<
			string,
			(merges: Record<string, Record<string, unknown>>, out: string) => void
		> = {
			'its conflict list emptied': (merges) => {
				for (const merge of Object.values(merges)) merge.conflicts = []
			},
			'a resolution pointed at another file with that file hash': (merges, out) => {
				const other = join(out, 'resolved', 'other-file.txt')
				writeFileSync(other, 'another resolution\n')
				for (const merge of Object.values(merges)) {
					const [first] = merge.resolutions as { file: string; sha256: string }[]
					first.file = other
					first.sha256 = createHash('sha256').update(readFileSync(other)).digest('hex')
				}
			},
		}

		for (const [name, edit] of Object.entries(EDITS))
			it(`merges.json edited after the write (${name}) → the run refuses it as changed since the review; --rehash after a review accepts`, async () => {
				const scenario = await recordedScenario()
				expect(writeHandover(scenario.lotsPath).exitCode).toBe(0)
				const mergesPath = join(scenario.out, 'merges.json')
				const merges = JSON.parse(readFileSync(mergesPath, 'utf8')) as Record<
					string,
					Record<string, unknown>
				>
				edit(merges, scenario.out)
				writeFileSync(mergesPath, `${JSON.stringify(merges, null, '\t')}\n`)

				const refused = await runFolder({ out: scenario.out })
				const afterRefusal = untouched(scenario.root)
				const rehashed = runHandover({
					argv: [scenario.lotsPath, '--rehash'],
					cliPath: WRITER_CLI,
					probe: noRepositoryCli,
				})
				const accepted = await runFolder({ out: scenario.out })

				expect(refused.exitCode).toBe(1)
				expect(refused.text).toMatch(/merges\.json|changed since/)
				expect(afterRefusal).toEqual(cleanAt(scenario))
				expect(rehashed.exitCode).toBe(0)
				expect(accepted.exitCode).toBe(0)
			})

		it('a merge git refuses before it starts (an untracked file the branch would overwrite, made by the first lot hook) → refused as nothing changed, no failed abort', async () => {
			const scenario = await recordedScenario({ plainLot: true, hook: 'untracked' })
			expect(writeHandover(scenario.lotsPath).exitCode).toBe(0)

			const result = await runFolder({ out: scenario.out })

			expect(result.exitCode).toBe(1)
			expect(result.text).toContain('nothing changed')
			expect(result.text).not.toContain('merge --abort failed')
			expect(existsSync(join(scenario.root, '.git', 'MERGE_HEAD'))).toBe(false)
		})

		it('a file the merge changes that a later plain lot also edits in the working tree → refused at the write, naming the file', () => {
			const scenario = mergeScenario({ noTree: true, cleanChange: true, laterFile: 'clean.txt' })

			const result = writeHandover(scenario.lotsPath)

			expect(result.exitCode).toBe(1)
			expect(result.output).toMatch(/^handover refused/)
			expect(result.output).toContain('clean.txt')
		})

		it('a conflict in a non-ASCII path (é.txt) with a resolution → merged, no false missing resolution', async () => {
			const scenario = await recordedScenario({ unicode: true })
			const written = writeHandover(scenario.lotsPath)

			const result = await runFolder({ out: scenario.out })

			expect(written.exitCode).toBe(0)
			expect(result.exitCode).toBe(0)
			expect(result.text).not.toContain('has no resolution')
			expect(readFileSync(join(scenario.root, 'é.txt'), 'utf8')).toBe('resolved é\n')
		})

		it('a git older than 2.38 → a merge lot is refused at the write: git 2.38 or later', () => {
			const scenario = mergeScenario({ noTree: true })

			const result = runHandover({
				probe: noRepositoryCli,
				argv: [scenario.lotsPath],
				cliPath: WRITER_CLI,
				gitVersion: () => 'git version 2.37.1',
			})

			expect(result.exitCode).toBe(1)
			expect(result.output).toContain('git 2.38 or later')
		})

		it('a null resolution for a modify/delete conflict → the file is removed and committed as removed', async () => {
			const scenario = await recordedScenario({ modifyDelete: true })
			const written = writeHandover(scenario.lotsPath)

			const result = await runFolder({ out: scenario.out })

			expect(written.exitCode).toBe(0)
			expect(result.exitCode).toBe(0)
			expect(
				git({ root: scenario.root, args: ['ls-tree', '--name-only', 'HEAD'] }).split('\n'),
			).not.toContain('gone.txt')
			expect(existsSync(join(scenario.root, 'gone.txt'))).toBe(false)
		})

		it('a conflicted symlink → refused at the write, naming it', () => {
			const scenario = mergeScenario({ noTree: true, symlink: true })

			const result = writeHandover(scenario.lotsPath)

			expect(result.exitCode).toBe(1)
			expect(result.output).toMatch(/^handover refused/)
			expect(result.output).toMatch(/link[^\n]*symlink|symlink[^\n]*link/)
		})
	},
)

describe('a merge left in progress', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	/** Someone else's merge of the lot's tip: started by hand, conflicts and all. */
	function startMergeByHand(scenario: MergeScenario): void {
		spawnSync('git', ['merge', '--no-ff', '--no-commit', scenario.tip], { cwd: scenario.root })
	}

	it('the same tip, left by someone else (no marker of this cli) → refused, left in progress, saying how: abort it or rerun with --resume-merge', async () => {
		const scenario = await recordedScenario()
		expect(writeHandover(scenario.lotsPath).exitCode).toBe(0)
		startMergeByHand(scenario)

		const result = await runFolder({ out: scenario.out })

		expect(result.exitCode).toBe(1)
		expect(result.text).toContain('git merge --abort')
		expect(result.text).toContain('--resume-merge')
		expect(existsSync(join(scenario.root, '.git', 'MERGE_HEAD'))).toBe(true)
	})

	it('the same tip, left by an earlier run of this cli (its marker) → aborted and redone', async () => {
		const scenario = await recordedScenario()
		expect(writeHandover(scenario.lotsPath).exitCode).toBe(0)
		startMergeByHand(scenario)
		writeFileSync(
			join(scenario.root, '.git', MERGE_MARKER_FILE),
			JSON.stringify({
				tip: scenario.tip,
				pid: 2_147_483_646,
				startedAt: '2026-10-30T12:00:00.000Z',
			}),
		)

		const result = await runFolder({ out: scenario.out })

		expect(result.exitCode).toBe(0)
		expect(git({ root: scenario.root, args: ['rev-parse', 'HEAD^2'] }).trim()).toBe(scenario.tip)
	})

	it('--resume-merge → someone else merge of the same tip is aborted and redone', async () => {
		const scenario = await recordedScenario()
		expect(writeHandover(scenario.lotsPath).exitCode).toBe(0)
		startMergeByHand(scenario)

		const result = await runFolder({ out: scenario.out, argv: ['--resume-merge'] })

		expect(result.exitCode).toBe(0)
		expect(git({ root: scenario.root, args: ['rev-parse', 'HEAD^2'] }).trim()).toBe(scenario.tip)
	})
})

/** The cli's entry in the sources: Node runs it with its type stripping. */
const CLI_SOURCE = join(import.meta.dirname, '..', 'cli.ts')

async function waitForFile(path: string): Promise<void> {
	const deadline = Date.now() + 30_000
	while (!existsSync(path)) {
		if (Date.now() > deadline) throw new Error(`${path} never appeared`)
		await new Promise((resolveWait) => setTimeout(resolveWait, 100))
	}
}

/** A repository whose one lot commits package.json and the lock (dep 2.0.0, installed), written as a hand-over. */
function manifestScenario(): { root: string; out: string; backup: string; base: string } {
	const root = createScratchRepository({
		'package.json': PACKAGE_V0,
		'package-lock.json': LOCK_V1,
		'.gitignore': 'node_modules\n',
	})
	writeFiles({
		root,
		files: {
			'node_modules/dep/package.json': '{ "name": "dep", "version": "2.0.0" }\n',
			'package.json': PACKAGE_V2,
			'package-lock.json': LOCK_V2,
		},
	})
	const out = temporaryFolder('dialecte-manifest-handover-')
	const lotsPath = join(out, 'lots.json')
	writeFileSync(
		lotsPath,
		JSON.stringify({
			repository: root,
			branch: 'main',
			head: head(root),
			lots: [{ paths: ['package.json', 'package-lock.json'], message: 'chore(deps): dep 2' }],
		}),
	)
	expect(writeHandover(lotsPath).exitCode).toBe(0)
	return { root, out, backup: join(root, '.git', INSTALL_BACKUP_FOLDER), base: head(root) }
}

describe('the install backup', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('an installer that never settles, then SIGTERM during the lock sync → the working package.json and lock are back byte for byte, a later lot dependency change survives', async () => {
		const root = createScratchRepository({
			'package.json': PACKAGE_V0,
			'package-lock.json': LOCK_V1,
			'.gitignore': 'node_modules\n',
		})
		writeFiles({
			root,
			files: {
				'node_modules/dep/package.json': '{ "name": "dep", "version": "1.0.0" }\n',
				'package-lock.json': LOCK_V2,
				'package.json': PACKAGE_V2,
			},
		})
		const started = join(temporaryFolder('dialecte-npm-started-'), 'started')
		installFakeNpm([`echo started > '${started}'`, 'sleep 60'])
		const out = temporaryFolder('dialecte-signal-handover-')
		const lotsPath = join(out, 'lots.json')
		writeFileSync(
			lotsPath,
			JSON.stringify({
				repository: root,
				branch: 'main',
				head: head(root),
				lots: [
					{ paths: ['package-lock.json'], message: 'chore(deps): dep 2' },
					{ paths: ['package.json'], message: 'chore(deps): the manifest' },
				],
			}),
		)
		expect(writeHandover(lotsPath).exitCode).toBe(0)
		const base = head(root)

		const run = spawn(process.execPath, [CLI_SOURCE, 'handover', 'run', out], {
			env: process.env,
			stdio: 'ignore',
		})
		const exited = new Promise<number | null>((resolveExit) => run.on('exit', resolveExit))
		await waitForFile(started)
		run.kill('SIGTERM')
		const exitCode = await exited

		expect(exitCode).not.toBe(0)
		expect(readFileSync(join(root, 'package.json'), 'utf8')).toBe(PACKAGE_V2)
		expect(readFileSync(join(root, 'package-lock.json'), 'utf8')).toBe(LOCK_V2)
		expect(head(root)).toBe(base)
	})

	/** The state a killed install leaves: the backup holds the working bytes, the working files the staged ones. */
	function leftBehind(scenario: { root: string; backup: string }): void {
		mkdirSync(scenario.backup, { recursive: true })
		writeFileSync(join(scenario.backup, 'package.json'), PACKAGE_V2)
		writeFileSync(join(scenario.backup, 'package.json.staged'), PACKAGE_V0)
		writeFileSync(join(scenario.backup, 'package-lock.json'), LOCK_V2)
		writeFileSync(join(scenario.backup, 'package-lock.json.staged'), LOCK_V1)
	}

	it('a leftover backup, the working files still holding the staged bytes → the next run restores them and says so; the commit holds the working bytes', async () => {
		const scenario = manifestScenario()
		leftBehind(scenario)
		writeFileSync(join(scenario.root, 'package.json'), PACKAGE_V0)
		writeFileSync(join(scenario.root, 'package-lock.json'), LOCK_V1)

		const result = await runFolder({ out: scenario.out })

		expect(result.exitCode).toBe(0)
		expect(result.text).toMatch(/restored/)
		expect(result.text).toContain(INSTALL_BACKUP_FOLDER)
		expect(git({ root: scenario.root, args: ['show', 'HEAD:package.json'] })).toBe(PACKAGE_V2)
		expect(git({ root: scenario.root, args: ['show', 'HEAD:package-lock.json'] })).toBe(LOCK_V2)
	})

	it('a leftover backup, the working files holding something else → refused naming the backup, nothing touched', async () => {
		const scenario = manifestScenario()
		leftBehind(scenario)
		writeFileSync(join(scenario.root, 'package.json'), 'something else\n')

		const result = await runFolder({ out: scenario.out })

		expect(result.exitCode).toBe(1)
		expect(result.text).toContain(INSTALL_BACKUP_FOLDER)
		expect(readFileSync(join(scenario.root, 'package.json'), 'utf8')).toBe('something else\n')
		expect(existsSync(join(scenario.backup, 'package.json'))).toBe(true)
		expect(head(scenario.root)).toBe(scenario.base)
	})

	it('a failed npm ci → the refusal says node_modules is incomplete now and that the same command installs it again', async () => {
		const root = createScratchRepository({
			'package.json': PACKAGE_V0,
			'package-lock.json': LOCK_V1,
			'.gitignore': 'node_modules\n',
		})
		writeFiles({
			root,
			files: {
				'node_modules/dep/package.json': '{ "name": "dep", "version": "1.0.0" }\n',
				'package-lock.json': LOCK_V2,
			},
		})
		installFakeNpm(['echo boom >&2', 'exit 1'])
		const out = temporaryFolder('dialecte-failed-install-')
		const lotsPath = join(out, 'lots.json')
		writeFileSync(
			lotsPath,
			JSON.stringify({
				repository: root,
				branch: 'main',
				head: head(root),
				lots: [{ paths: ['package-lock.json'], message: 'chore(deps): dep 2' }],
			}),
		)
		expect(writeHandover(lotsPath).exitCode).toBe(0)

		const result = await runFolder({ out })

		expect(result.exitCode).toBe(1)
		expect(result.text).toMatch(/node_modules[^\n]*incomplete|incomplete[^\n]*node_modules/)
		expect(result.text).toMatch(/same command/)
	})
})

describe(
	'a merge hand-over missing its review hash',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		it('merges.sha256 deleted → the lots guard refuses: write it again with --rehash after a review', async () => {
			const scenario = await recordedScenario()
			expect(writeHandover(scenario.lotsPath).exitCode).toBe(0)
			rmSync(join(scenario.out, HANDOVER_FILES.mergesHash))

			const result = await runFolder({ out: scenario.out })

			expect(result.exitCode).toBe(1)
			expect(result.text).toContain('write it again with --rehash after a review')
			expect(untouched(scenario.root)).toEqual(cleanAt(scenario))
		})

		it('merges.json without the tree each merge was trial-merged on (an earlier cli wrote it) → refused at the read, saying so and the next step; nothing changed', async () => {
			const scenario = await recordedScenario()
			expect(writeHandover(scenario.lotsPath).exitCode).toBe(0)
			const mergesPath = join(scenario.out, HANDOVER_FILES.merges)
			const merges = readMerges(scenario.out) as Record<string, Partial<MergeLot>>
			for (const merge of Object.values(merges)) delete merge.onTree
			writeFileSync(mergesPath, `${JSON.stringify(merges, null, '\t')}\n`)

			const result = await runFolder({ out: scenario.out })

			// a folder the run cannot read is a usage error, as a missing file of it
			expect({ exitCode: result.exitCode, after: untouched(scenario.root) }).toEqual({
				exitCode: 2,
				after: cleanAt(scenario),
			})
			expect(result.text).toContain(
				'written by an earlier cli: write the hand-over again, then --rehash after a review',
			)
		})
	},
)

describe('a stale merge marker', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('a marker left with no merge in progress (a crash before git merge) → a run that refuses at a guard still removes it, so a later merge of the same tip by hand is refused, not aborted', async () => {
		const scenario = await recordedScenario()
		expect(writeHandover(scenario.lotsPath).exitCode).toBe(0)
		writeFileSync(
			join(scenario.root, '.git', MERGE_MARKER_FILE),
			JSON.stringify({
				tip: scenario.tip,
				pid: 2_147_483_646,
				startedAt: '2026-10-30T12:00:00.000Z',
			}),
		)
		writeFileSync(join(scenario.root, 'stray.txt'), 'a file outside the lots\n')
		const first = await runFolder({ out: scenario.out })
		rmSync(join(scenario.root, 'stray.txt'))
		spawnSync('git', ['merge', '--no-ff', '--no-commit', scenario.tip], { cwd: scenario.root })

		const second = await runFolder({ out: scenario.out })

		expect(first.exitCode).toBe(1)
		expect(second.exitCode).toBe(1)
		expect(existsSync(join(scenario.root, '.git', 'MERGE_HEAD'))).toBe(true)
	})
})

const CHANGELOG_BASE = '# Changelog\n\n## Unreleased\n\n- the base entry\n'
const CHANGELOG_A = CHANGELOG_BASE.replace('- the base entry', '- entry a\n- the base entry')
const CHANGELOG_B = CHANGELOG_BASE.replace('- the base entry', '- entry b\n- the base entry')
const CHANGELOG_RESOLVED = CHANGELOG_BASE.replace(
	'- the base entry',
	'- entry a\n- entry b\n- the base entry',
)
const SIX_LINES = 'one\ntwo\nthree\nfour\nfive\nsix\n'

/** A lot of a sequence: a merge of a branch (each resolution as its content, `null` removes the file), or a plain lot. */
type SequenceLot = { merge: string; resolved?: Record<string, string | null> } | LotPlan

type SequenceOptions = {
	/** The files of the first commit on main. */
	base: Record<string, string>
	/** Each branch, made from the first commit, with the files it changes. */
	branches: Record<string, Record<string, string>>
	/** A branch made from another branch's tip (listed before it) instead of the first commit. */
	stackedOn?: Record<string, string>
	/** Working-tree edits on main once the branches are made. */
	working?: Record<string, string>
	/** Files of the first commit deleted in the working tree. */
	deleted?: string[]
	lots: SequenceLot[]
}

type SequenceScenario = {
	root: string
	out: string
	lotsPath: string
	head: string
	/** The tip of each branch. */
	tips: Record<string, string>
}

function mergeSubjectOf(branch: string): string {
	return `merge: bring ${branch} in`
}

/** Branches made from main's first commit, then a lots file merging them (and plain lots) in the given order. */
function sequenceScenario(options: SequenceOptions): SequenceScenario {
	const root = createScratchRepository({ '.gitignore': 'node_modules\n', ...options.base })
	const tips: Record<string, string> = {}
	for (const [branch, files] of Object.entries(options.branches)) {
		git({ root, args: ['checkout', '-q', '-b', branch, options.stackedOn?.[branch] ?? 'main'] })
		writeFiles({ root, files })
		git({ root, args: ['add', '-A'] })
		git({ root, args: ['commit', '-q', '-m', `feat: the work of ${branch}`] })
		tips[branch] = head(root)
	}
	git({ root, args: ['checkout', '-q', 'main'] })
	writeFiles({ root, files: options.working ?? {} })
	for (const file of options.deleted ?? []) rmSync(join(root, file))
	const out = temporaryFolder('dialecte-sequence-handover-')
	const lots = options.lots.map(function lotOf(lot, index): MergeLotPlan | LotPlan {
		if (!('merge' in lot)) return lot
		const resolved: Record<string, string | null> = {}
		for (const [path, content] of Object.entries(lot.resolved ?? {})) {
			if (content === null) {
				resolved[path] = null
				continue
			}
			const relative = `resolved/${index + 1}/${path}`
			writeFiles({ root: out, files: { [relative]: content } })
			resolved[path] = relative
		}
		return {
			kind: 'merge',
			branch: lot.merge,
			tip: tips[lot.merge],
			resolved,
			message: `${mergeSubjectOf(lot.merge)}\n\nThe body.`,
		}
	})
	const lotsPath = join(out, 'lots.json')
	writeFileSync(
		lotsPath,
		JSON.stringify({ repository: root, branch: 'main', head: head(root), lots }),
	)
	return { root, out, lotsPath, head: head(root), tips }
}

/** Two branches each adding their own line at the same place of the CHANGELOG list, merged as lots 1 and 2. */
function changelogScenario(params: {
	/** Lot 2 resolves CHANGELOG.md. */
	resolveSecond: boolean
	/** Branch a also adds `a.txt`, which the first lot resolves to other content (a resolution on a clean merge). */
	resolveFirst?: boolean
}): SequenceScenario {
	return sequenceScenario({
		base: { 'CHANGELOG.md': CHANGELOG_BASE },
		branches: {
			'feat/a': { 'CHANGELOG.md': CHANGELOG_A, ...(params.resolveFirst && { 'a.txt': 'a\n' }) },
			'feat/b': { 'CHANGELOG.md': CHANGELOG_B },
		},
		lots: [
			{ merge: 'feat/a', ...(params.resolveFirst && { resolved: { 'a.txt': 'a, resolved\n' } }) },
			{
				merge: 'feat/b',
				...(params.resolveSecond && { resolved: { 'CHANGELOG.md': CHANGELOG_RESOLVED } }),
			},
		],
	})
}

/** `merges.json` as written: each merge lot's record under its 0-based lot index. */
function readMerges(out: string): Record<string, MergeLot> {
	return JSON.parse(readFileSync(join(out, HANDOVER_FILES.merges), 'utf8')) as Record<
		string,
		MergeLot
	>
}

/** The tree a git merge of `tip` into HEAD leaves, before any resolution. */
function trialTreeOf(params: { root: string; tip: string }): string {
	return git({ root: params.root, args: ['merge-tree', '--write-tree', 'HEAD', params.tip] })
		.split('\n')[0]
		.trim()
}

/** `tree` with each file set to its content, or removed (`null`), built in an index of its own. */
function treeWithFiles(params: {
	root: string
	tree: string
	files: Record<string, string | null>
}): string {
	const env = {
		...process.env,
		GIT_INDEX_FILE: join(temporaryFolder('dialecte-tree-index-'), 'index'),
	}
	function plumbing(call: { args: string[]; input?: string }): string {
		const result = spawnSync('git', call.args, {
			cwd: params.root,
			encoding: 'utf8',
			env,
			...(call.input !== undefined && { input: call.input }),
		})
		if (result.status !== 0) throw new Error(`git ${call.args.join(' ')} failed: ${result.stderr}`)
		return result.stdout.trim()
	}
	plumbing({ args: ['read-tree', params.tree] })
	for (const [path, content] of Object.entries(params.files)) {
		if (content === null) {
			plumbing({ args: ['update-index', '--force-remove', '--', path] })
			continue
		}
		const blob = plumbing({ args: ['hash-object', '-w', '--stdin'], input: content })
		plumbing({ args: ['update-index', '--add', '--cacheinfo', `100644,${blob},${path}`] })
	}
	return plumbing({ args: ['write-tree'] })
}

/** Every tree a rehearsal printed, in order (one per merge lot committed). */
function treesPrinted(text: string): string[] {
	return [...text.matchAll(/tree ([0-9a-f]{40})/g)].map((match) => match[1])
}

describe(
	'merge lots trial-merged in sequence, each on the tree the lots before it leave',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		it('two branches adding their own line at the same place of the CHANGELOG list, merged as the first and the second lot, the second without a resolution → refused: the conflict of the second merge lot in CHANGELOG.md has no resolution; the first has none', () => {
			const scenario = changelogScenario({ resolveSecond: false })

			const result = writeHandover(scenario.lotsPath)

			expect(result.exitCode).toBe(1)
			expect(result.output).toMatch(/^handover refused/)
			expect(result.output).toContain(
				`merge lot ${2}: the conflict in CHANGELOG.md has no resolution`,
			)
			expect(result.output).not.toContain(`merge lot ${1}`)
		})

		it('the same two branches, the second lot resolving CHANGELOG.md → written; merges.json records no conflict for the first lot and CHANGELOG.md for the second', () => {
			const scenario = changelogScenario({ resolveSecond: true })

			const result = writeHandover(scenario.lotsPath)

			expect(result.exitCode).toBe(0)
			const merges = readMerges(scenario.out)
			expect(merges['0']?.conflicts).toEqual([])
			expect(merges['1']?.conflicts).toEqual(['CHANGELOG.md'])
		})

		it('the same two branches, the second lot resolving CHANGELOG.md → the rehearsal prints a tree for each merge lot; both recorded, the run commits both merges in order, the second holding the resolution on top of the first', async () => {
			const scenario = changelogScenario({ resolveSecond: true })
			expect(writeHandover(scenario.lotsPath).exitCode).toBe(0)
			const rehearsal = await runFolder({ out: scenario.out, argv: ['--rehearse'] })
			const trees = treesPrinted(rehearsal.text)
			const lotsFile = JSON.parse(readFileSync(scenario.lotsPath, 'utf8')) as {
				lots: MergeLotPlan[]
			}
			for (const [index, lot] of lotsFile.lots.entries()) lot.tree = trees[index] ?? NOT_A_TREE
			writeFileSync(scenario.lotsPath, JSON.stringify(lotsFile))
			const rehashed = runHandover({
				argv: [scenario.lotsPath, '--rehash'],
				cliPath: WRITER_CLI,
				probe: noRepositoryCli,
			})

			const ran = await runFolder({ out: scenario.out })

			const { root } = scenario
			expect(trees).toHaveLength(2)
			expect(rehearsal.exitCode).toBe(0)
			expect(rehashed.exitCode).toBe(0)
			expect(ran.exitCode).toBe(0)
			expect(
				git({ root, args: ['log', '--format=%s', '-3', '--first-parent'] })
					.trim()
					.split('\n'),
			).toEqual([mergeSubjectOf('feat/b'), mergeSubjectOf('feat/a'), 'chore: start'])
			expect(git({ root, args: ['rev-parse', 'HEAD^2'] }).trim()).toBe(scenario.tips['feat/b'])
			expect(git({ root, args: ['rev-parse', 'HEAD^1^2'] }).trim()).toBe(scenario.tips['feat/a'])
			expect(git({ root, args: ['rev-parse', 'HEAD^1^1'] }).trim()).toBe(scenario.head)
			expect(git({ root, args: ['show', 'HEAD:CHANGELOG.md'] })).toBe(CHANGELOG_RESOLVED)
			expect(git({ root, args: ['rev-parse', 'HEAD^1^{tree}'] }).trim()).toBe(trees[0])
			expect(git({ root, args: ['rev-parse', 'HEAD^{tree}'] }).trim()).toBe(trees[1])
			expect(untouched(root).mergeInProgress).toBe(false)
		})

		it('a merge lot first in the hand-over → merges.json records the tree it was trial-merged on: HEAD tree', () => {
			const scenario = mergeScenario({ noTree: true })

			const result = writeHandover(scenario.lotsPath)

			expect(result.exitCode).toBe(0)
			expect(readMerges(scenario.out)['0']?.onTree).toBe(
				git({ root: scenario.root, args: ['rev-parse', 'HEAD^{tree}'] }).trim(),
			)
		})

		it('a merge lot after a merge lot → the tree it was trial-merged on is the tree the first merge leaves, its resolutions applied', () => {
			const scenario = changelogScenario({ resolveSecond: true, resolveFirst: true })
			const firstLeaves = treeWithFiles({
				root: scenario.root,
				tree: trialTreeOf({ root: scenario.root, tip: scenario.tips['feat/a'] }),
				files: { 'a.txt': 'a, resolved\n' },
			})

			const result = writeHandover(scenario.lotsPath)

			expect(result.exitCode).toBe(0)
			const merges = readMerges(scenario.out)
			expect(merges['0']?.onTree).toBe(
				git({ root: scenario.root, args: ['rev-parse', 'HEAD^{tree}'] }).trim(),
			)
			expect(merges['1']?.onTree).toBe(firstLeaves)
		})

		it('a merge lot after a plain lot → the tree it was trial-merged on is HEAD tree with the plain lot files as in the working tree on top, its deletion included; a later plain lot left out', () => {
			const scenario = sequenceScenario({
				base: {
					'CHANGELOG.md': CHANGELOG_BASE,
					'notes.txt': 'notes\n',
					'old.txt': 'old\n',
					'later.txt': 'later\n',
				},
				branches: { 'feat/a': { 'CHANGELOG.md': CHANGELOG_A } },
				working: { 'notes.txt': 'notes, edited\n', 'later.txt': 'later, edited\n' },
				deleted: ['old.txt'],
				lots: [
					{ paths: ['notes.txt', 'old.txt'], message: 'docs(notes): edited, old removed' },
					{ merge: 'feat/a' },
					{ paths: ['later.txt'], message: 'docs(later): edited after the merge' },
				],
			})
			const plainLeaves = treeWithFiles({
				root: scenario.root,
				tree: 'HEAD^{tree}',
				files: { 'notes.txt': 'notes, edited\n', 'old.txt': null },
			})

			const result = writeHandover(scenario.lotsPath)

			expect(result.exitCode).toBe(0)
			expect(readMerges(scenario.out)['1']?.onTree).toBe(plainLeaves)
		})

		it('a plain lot before a merge lot, editing another line of a file the merge changes → written, no longer refused: the merge is trial-merged on the plain lot file and merges cleanly', () => {
			const scenario = sequenceScenario({
				base: { 'clean.txt': SIX_LINES },
				branches: { 'feat/a': { 'clean.txt': SIX_LINES.replace('one', 'ONE') } },
				working: { 'clean.txt': SIX_LINES.replace('six', 'six, edited') },
				lots: [{ paths: ['clean.txt'], message: 'docs(clean): edited' }, { merge: 'feat/a' }],
			})

			const result = writeHandover(scenario.lotsPath)

			expect(result.output).not.toContain('has working-tree changes')
			expect(result.exitCode).toBe(0)
			expect(readMerges(scenario.out)['1']?.conflicts).toEqual([])
		})

		it('a plain lot before a merge lot, editing the line the merge changes, the merge resolving it → written, the conflict git finds on the plain lot file recorded', () => {
			const resolution = SIX_LINES.replace('one', 'ONE, edited')
			const scenario = sequenceScenario({
				base: { 'clean.txt': SIX_LINES },
				branches: { 'feat/a': { 'clean.txt': SIX_LINES.replace('one', 'ONE') } },
				working: { 'clean.txt': SIX_LINES.replace('one', 'one, edited') },
				lots: [
					{ paths: ['clean.txt'], message: 'docs(clean): edited' },
					{ merge: 'feat/a', resolved: { 'clean.txt': resolution } },
				],
			})

			const result = writeHandover(scenario.lotsPath)

			expect(result.exitCode).toBe(0)
			expect(readMerges(scenario.out)['1']?.conflicts).toEqual(['clean.txt'])
		})

		it('a hook of the plain lot restaging a file, so HEAD tree is not the tree the merge lot was trial-merged on → the run refuses the merge lot before merging, naming both trees; the plain lot stays committed, nothing merged', async () => {
			const scenario = await recordedScenario({ plainLot: true, hook: 'restage' })
			expect(writeHandover(scenario.lotsPath).exitCode).toBe(0)
			const onTree = readMerges(scenario.out)['1']?.onTree

			const result = await runFolder({ out: scenario.out })

			const { root } = scenario
			const headTree = git({ root, args: ['rev-parse', 'HEAD^{tree}'] }).trim()
			expect(onTree).toEqual(expect.stringMatching(/^[0-9a-f]{40}$/))
			expect(result.exitCode).toBe(1)
			expect(git({ root, args: ['log', '-1', '--format=%s'] }).trim()).toBe('docs(notes): edited')
			expect(git({ root, args: ['rev-parse', 'HEAD~1'] }).trim()).toBe(scenario.head)
			expect(untouched(root)).toEqual({ mergeInProgress: false, status: '', head: head(root) })
			expect(result.text).toContain(`lot ${2} not committed`)
			expect(result.text).toContain(String(onTree).slice(0, 12))
			expect(result.text).toContain(headTree.slice(0, 12))
			expect(result.text).toContain(
				'see what the lots before it committed (`git show --stat HEAD`), then write the hand-over again from this HEAD for the lots left',
			)
			expect(result.text).not.toContain('holds another tree than recorded')
			expect(result.text).toContain('nothing changed')
			expect(result.text).not.toContain('the merge is aborted')
		})

		it('a merge lot, then a plain lot, then a merge lot → the last one is trial-merged on the tree they leave together: the first merge with its resolutions, the plain lot files on top', () => {
			const scenario = sequenceScenario({
				base: { 'CHANGELOG.md': CHANGELOG_BASE, 'notes.txt': 'notes\n' },
				branches: {
					'feat/a': { 'CHANGELOG.md': CHANGELOG_A, 'a.txt': 'a\n' },
					'feat/b': { 'CHANGELOG.md': CHANGELOG_B },
				},
				working: { 'notes.txt': 'notes, edited\n' },
				lots: [
					{ merge: 'feat/a', resolved: { 'a.txt': 'a, resolved\n' } },
					{ paths: ['notes.txt'], message: 'docs(notes): edited' },
					{ merge: 'feat/b', resolved: { 'CHANGELOG.md': CHANGELOG_RESOLVED } },
				],
			})
			const bothLeave = treeWithFiles({
				root: scenario.root,
				tree: trialTreeOf({ root: scenario.root, tip: scenario.tips['feat/a'] }),
				files: { 'a.txt': 'a, resolved\n', 'notes.txt': 'notes, edited\n' },
			})

			const result = writeHandover(scenario.lotsPath)

			expect(result.exitCode).toBe(0)
			const merges = readMerges(scenario.out)
			expect(merges['2']?.onTree).toBe(bothLeave)
			expect(merges['2']?.conflicts).toEqual(['CHANGELOG.md'])
		})

		it('a second branch built on the first branch, merged after it → the trial base carries the first tip as a parent: the merge base is that tip, the line the second branch rewrites merges clean', () => {
			const revisedA = CHANGELOG_A.replace('- entry a', '- entry a, revised')
			const scenario = sequenceScenario({
				base: { 'CHANGELOG.md': CHANGELOG_BASE },
				branches: {
					'feat/a': { 'CHANGELOG.md': CHANGELOG_A },
					'feat/b': { 'CHANGELOG.md': revisedA },
				},
				stackedOn: { 'feat/b': 'feat/a' },
				lots: [{ merge: 'feat/a' }, { merge: 'feat/b' }],
			})

			const result = writeHandover(scenario.lotsPath)

			expect({
				exitCode: result.exitCode,
				unresolved: result.output.split('\n').filter((line) => line.includes('has no resolution')),
			}).toEqual({ exitCode: 0, unresolved: [] })
			expect(readMerges(scenario.out)['1']?.conflicts).toEqual([])
		})

		it('a merge lot whose resolution removes a file, then a merge lot → the second is trial-merged on a tree without that file', () => {
			const scenario = sequenceScenario({
				base: { 'CHANGELOG.md': CHANGELOG_BASE, 'old.txt': 'old\n' },
				branches: {
					'feat/a': { 'CHANGELOG.md': CHANGELOG_A },
					'feat/b': { 'CHANGELOG.md': CHANGELOG_B },
				},
				lots: [
					{ merge: 'feat/a', resolved: { 'old.txt': null } },
					{ merge: 'feat/b', resolved: { 'CHANGELOG.md': CHANGELOG_RESOLVED } },
				],
			})
			const firstLeaves = treeWithFiles({
				root: scenario.root,
				tree: trialTreeOf({ root: scenario.root, tip: scenario.tips['feat/a'] }),
				files: { 'old.txt': null },
			})

			const result = writeHandover(scenario.lotsPath)

			expect(result.exitCode).toBe(0)
			const onTree = readMerges(scenario.out)['1']?.onTree ?? NOT_A_TREE
			expect(onTree).toBe(firstLeaves)
			expect(git({ root: scenario.root, args: ['ls-tree', '--name-only', onTree] })).not.toContain(
				'old.txt',
			)
		})

		it('a plain lot before and a plain lot after a merge lot, each editing a file the merge changes → refused at the write for the later one only: it has working-tree changes', () => {
			const scenario = sequenceScenario({
				base: { 'early.txt': SIX_LINES, 'late.txt': SIX_LINES },
				branches: {
					'feat/a': {
						'early.txt': SIX_LINES.replace('one', 'ONE'),
						'late.txt': SIX_LINES.replace('one', 'ONE'),
					},
				},
				working: {
					'early.txt': SIX_LINES.replace('six', 'six, edited'),
					'late.txt': SIX_LINES.replace('six', 'six, edited'),
				},
				lots: [
					{ paths: ['early.txt'], message: 'docs(early): edited' },
					{ merge: 'feat/a' },
					{ paths: ['late.txt'], message: 'docs(late): edited after the merge' },
				],
			})

			const result = writeHandover(scenario.lotsPath)

			expect(result.exitCode).toBe(1)
			expect(result.output).toMatch(/^handover refused/)
			expect(result.output).toContain('late.txt has working-tree changes')
			expect(result.output).not.toContain('early.txt has working-tree changes')
		})
	},
)
