/**
 * The record times of a worktree top and the mutation run files, read without git (33L0 section 7, "Frozen record
 * times"): on a real linked worktree and on the main checkout of a scratch repository, and on hand-made `.git`
 * files; record files written by hand.
 */
import { mkdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { createScratchRepository, git, temporaryFolder } from '../../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { gitFolderAbove } from '../store/store-folder.ts'
import { readMutationRunFiles, readRecordTimes } from './record-times.ts'

import { describe, expect, it } from 'vitest'

import type { TddEntryTime } from './unrecorded-steps.types.ts'

const AT = '2026-11-09T10:00:00.000Z'

/** A scratch repository and a linked worktree of it under `<main>/.worktrees/`: the main checkout, the worktree, its git folder. */
function linkedWorktree() {
	const main = createScratchRepository()
	const worktree = join(main, '.worktrees', 'wt')
	git({ root: main, args: ['worktree', 'add', '-q', worktree, '-b', 'lot-a'] })
	const gitFolder = git({ root: worktree, args: ['rev-parse', '--absolute-git-dir'] }).trim()
	return { main, worktree, gitFolder }
}

/** The ISO time `index` seconds after midnight on the test day. */
function secondOf(index: number): string {
	return new Date(Date.UTC(2026, 10, 9, 0, 0, index)).toISOString()
}

/** Writes a gate record file by hand into a git folder. */
function writeGateRecord(params: { gitFolder: string; mode: string; at: string }): void {
	writeFileSync(
		join(params.gitFolder, `dialecte-gate-${params.mode}.json`),
		JSON.stringify({
			mode: params.mode,
			at: params.at,
			head: 'a'.repeat(40),
			stateHash: 'h',
			steps: [],
		}),
	)
}

/** Writes a tdd ledger by hand into a git folder; each entry `{ kind, at }`. */
function writeLedger(params: { gitFolder: string; entries: { kind: string; at: string }[] }): void {
	writeFileSync(
		join(params.gitFolder, 'dialecte-tdd.json'),
		JSON.stringify({ version: 3, entries: params.entries }),
	)
}

/** A work tree top with a hand-made `.git` file naming `target`, and a folder of that name beside or under it. */
function handMadeWorktree(params: {
	gitdirLine: (folders: { top: string; gitFolder: string }) => string
}) {
	const root = temporaryFolder('record-times-handmade-')
	const top = join(root, 'top')
	const gitFolder = join(root, 'git-folder')
	mkdirSync(top)
	mkdirSync(gitFolder)
	writeFileSync(join(top, '.git'), `${params.gitdirLine({ top, gitFolder })}\n`)
	return { top, gitFolder }
}

describe(
	'gitFolderAbove: the git folder found without git (a guard, it works today)',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		it('a folder inside a linked worktree → the worktree’s own git folder, not the main one', () => {
			const { worktree, gitFolder } = linkedWorktree()
			mkdirSync(join(worktree, 'sub'))

			expect(gitFolderAbove(join(worktree, 'sub'))).toBe(gitFolder)
		})

		it('the main checkout → its .git folder', () => {
			const main = createScratchRepository()

			expect(gitFolderAbove(main)).toBe(join(main, '.git'))
		})

		it('a folder in no work tree → undefined', () => {
			expect(gitFolderAbove(temporaryFolder('no-git-'))).toBeUndefined()
		})
	},
)

describe('readRecordTimes: a real linked worktree', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('every gate record present → its at per family, the worktree as its real path', () => {
		const { worktree, gitFolder } = linkedWorktree()
		for (const [mode, at] of [
			['fast', '2026-11-09T10:01:00.000Z'],
			['full', '2026-11-09T10:02:00.000Z'],
			['release', '2026-11-09T10:03:00.000Z'],
			['contrib', '2026-11-09T10:04:00.000Z'],
			['hook', '2026-11-09T10:05:00.000Z'],
		])
			writeGateRecord({ gitFolder, mode, at })

		expect(readRecordTimes({ worktree })).toEqual({
			gone: false,
			cut: false,
			times: {
				worktree: realpathSync(worktree),
				gateFast: '2026-11-09T10:01:00.000Z',
				gateFull: '2026-11-09T10:02:00.000Z',
				gateRelease: '2026-11-09T10:03:00.000Z',
				contrib: '2026-11-09T10:04:00.000Z',
				gateHook: '2026-11-09T10:05:00.000Z',
				tdd: [],
			},
		})
	})

	it('a worktree reached through a link → its worktree answered as the real path of the top', () => {
		const { worktree } = linkedWorktree()
		const link = join(temporaryFolder('record-times-link-'), 'link')
		symlinkSync(worktree, link)

		expect(readRecordTimes({ worktree: link })).toMatchObject({
			gone: false,
			times: { worktree: realpathSync(worktree) },
		})
	})

	it('only a fast record → the other families null, never a time borrowed from the main checkout', () => {
		const { main, worktree, gitFolder } = linkedWorktree()
		writeGateRecord({ gitFolder, mode: 'fast', at: AT })
		writeGateRecord({ gitFolder: join(main, '.git'), mode: 'full', at: '2026-11-09T12:00:00.000Z' })

		expect(readRecordTimes({ worktree })).toMatchObject({
			gone: false,
			times: { gateFast: AT, gateFull: null, gateRelease: null, contrib: null, gateHook: null },
		})
	})

	it('a record file that is not JSON → that family null, the others read', () => {
		const { worktree, gitFolder } = linkedWorktree()
		writeFileSync(join(gitFolder, 'dialecte-gate-fast.json'), 'not json')
		writeGateRecord({ gitFolder, mode: 'full', at: AT })

		expect(readRecordTimes({ worktree })).toMatchObject({
			times: { gateFast: null, gateFull: AT },
		})
	})

	it('a ledger of a red receipt, a freeze, a green receipt and a kept receipt → steps tdd-red, tdd-red, tdd-green, null, in order', () => {
		const { worktree, gitFolder } = linkedWorktree()
		writeLedger({
			gitFolder,
			entries: [
				{ kind: 'red', at: '2026-11-09T09:00:00.000Z' },
				{ kind: 'freeze', at: '2026-11-09T09:01:00.000Z' },
				{ kind: 'green', at: '2026-11-09T09:02:00.000Z' },
				{ kind: 'kept', at: '2026-11-09T09:03:00.000Z' },
			],
		})

		expect(readRecordTimes({ worktree })).toMatchObject({
			cut: false,
			times: {
				tdd: [
					{ at: '2026-11-09T09:00:00.000Z', step: 'tdd-red' },
					{ at: '2026-11-09T09:01:00.000Z', step: 'tdd-red' },
					{ at: '2026-11-09T09:02:00.000Z', step: 'tdd-green' },
					{ at: '2026-11-09T09:03:00.000Z', step: null },
				] satisfies TddEntryTime[],
			},
		})
	})

	it('unchanged, accepted, revised and refused receipts → step null each', () => {
		const { worktree, gitFolder } = linkedWorktree()
		writeLedger({
			gitFolder,
			entries: ['unchanged', 'accepted', 'revised', 'refused'].map((kind, index) => ({
				kind,
				at: `2026-11-09T09:0${index}:00.000Z`,
			})),
		})

		expect(readRecordTimes({ worktree })).toMatchObject({
			times: {
				tdd: [
					{ at: '2026-11-09T09:00:00.000Z', step: null },
					{ at: '2026-11-09T09:01:00.000Z', step: null },
					{ at: '2026-11-09T09:02:00.000Z', step: null },
					{ at: '2026-11-09T09:03:00.000Z', step: null },
				],
			},
		})
	})

	it('a ledger of 250 entries → the newest 200 in order (the oldest 50 dropped), cut true', () => {
		const { worktree, gitFolder } = linkedWorktree()
		writeLedger({
			gitFolder,
			entries: Array.from({ length: 250 }, (_, index) => ({ kind: 'red', at: secondOf(index) })),
		})

		expect(readRecordTimes({ worktree })).toMatchObject({
			cut: true,
			times: {
				tdd: Array.from({ length: 200 }, (_, index) => ({
					at: secondOf(index + 50),
					step: 'tdd-red',
				})),
			},
		})
	})

	it('a ledger of exactly 200 entries → all kept, not cut', () => {
		const { worktree, gitFolder } = linkedWorktree()
		writeLedger({
			gitFolder,
			entries: Array.from({ length: 200 }, (_, index) => ({
				kind: 'red',
				at: new Date(Date.UTC(2026, 10, 9, 0, 0, index)).toISOString(),
			})),
		})

		expect(readRecordTimes({ worktree })).toMatchObject({ cut: false })
	})

	it('a ledger that is not JSON → tdd null (unreadable, not empty), not cut, the worktree not gone', () => {
		const { worktree, gitFolder } = linkedWorktree()
		writeFileSync(join(gitFolder, 'dialecte-tdd.json'), 'not json')

		expect(readRecordTimes({ worktree })).toMatchObject({
			gone: false,
			cut: false,
			times: { tdd: null },
		})
	})

	it('a ledger of another version → tdd null (unreadable)', () => {
		const { worktree, gitFolder } = linkedWorktree()
		writeFileSync(join(gitFolder, 'dialecte-tdd.json'), JSON.stringify({ version: 1, entries: [] }))

		expect(readRecordTimes({ worktree })).toMatchObject({ times: { tdd: null } })
	})

	it('no record of any kind → every family null, no tdd entry', () => {
		const { worktree } = linkedWorktree()

		expect(readRecordTimes({ worktree })).toEqual({
			gone: false,
			cut: false,
			times: {
				worktree: realpathSync(worktree),
				gateFast: null,
				gateFull: null,
				gateRelease: null,
				contrib: null,
				gateHook: null,
				tdd: [],
			},
		})
	})
})

describe('readRecordTimes: the top only, never walking up', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('the main checkout → read from its .git folder, the worktree as its real path', () => {
		const main = createScratchRepository()
		writeGateRecord({ gitFolder: join(main, '.git'), mode: 'fast', at: AT })

		expect(readRecordTimes({ worktree: main })).toMatchObject({
			gone: false,
			times: { worktree: realpathSync(main), gateFast: AT },
		})
	})

	it('a sub-folder of a worktree (not a top) → gone, never the worktree’s records', () => {
		const { worktree, gitFolder } = linkedWorktree()
		mkdirSync(join(worktree, 'pkg'))
		writeGateRecord({ gitFolder, mode: 'fast', at: AT })

		expect(readRecordTimes({ worktree: join(worktree, 'pkg') })).toEqual({ gone: true })
	})

	it('a linked worktree under <main>/.worktrees/ removed with git worktree remove → gone, never the main checkout’s records', () => {
		const { main, worktree } = linkedWorktree()
		writeGateRecord({ gitFolder: join(main, '.git'), mode: 'fast', at: AT })
		git({ root: main, args: ['worktree', 'remove', '--force', worktree] })

		expect(readRecordTimes({ worktree })).toEqual({ gone: true })
	})

	it('a linked worktree under <main>/.worktrees/ whose folder was deleted by hand → gone, never the main checkout’s records', () => {
		const { main, worktree } = linkedWorktree()
		writeGateRecord({ gitFolder: join(main, '.git'), mode: 'fast', at: AT })
		rmSync(worktree, { recursive: true, force: true })

		expect(readRecordTimes({ worktree })).toEqual({ gone: true })
	})

	it('a folder with no .git entry → gone', () => {
		expect(readRecordTimes({ worktree: temporaryFolder('record-times-plain-') })).toEqual({
			gone: true,
		})
	})

	it('a path that does not exist → gone', () => {
		expect(
			readRecordTimes({ worktree: join(temporaryFolder('record-times-missing-'), 'nothing') }),
		).toEqual({ gone: true })
	})

	it('a .git file pointing at a git folder that no longer exists → gone', () => {
		const folder = temporaryFolder('record-times-dangling-')
		writeFileSync(join(folder, '.git'), `gitdir: ${join(folder, 'missing-git-folder')}\n`)

		expect(readRecordTimes({ worktree: folder })).toEqual({ gone: true })
	})
})

describe(
	'readRecordTimes: hand-made .git files, no repository',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		it('a .git file with an absolute gitdir to a folder holding a record → the record read', () => {
			const { top, gitFolder } = handMadeWorktree({
				gitdirLine: ({ gitFolder: target }) => `gitdir: ${target}`,
			})
			writeGateRecord({ gitFolder, mode: 'fast', at: AT })

			expect(readRecordTimes({ worktree: top })).toMatchObject({
				gone: false,
				times: { worktree: realpathSync(top), gateFast: AT },
			})
		})

		it('a .git file with a relative gitdir → resolved against the work tree, the record read', () => {
			const { top, gitFolder } = handMadeWorktree({ gitdirLine: () => 'gitdir: ../git-folder' })
			writeGateRecord({ gitFolder, mode: 'full', at: AT })

			expect(readRecordTimes({ worktree: top })).toMatchObject({
				gone: false,
				times: { gateFull: AT },
			})
		})
	},
)

describe(
	'readMutationRunFiles: the repository’s run files',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		/** A common git folder holding these run files, each `{ name, content }`. */
		function commonFolderWith(runs: { name: string; content: string }[]): string {
			const commonFolder = temporaryFolder('record-times-common-')
			const runsFolder = join(commonFolder, 'dialecte-mutation', 'runs')
			mkdirSync(runsFolder, { recursive: true })
			for (const run of runs) writeFileSync(join(runsFolder, run.name), run.content)
			return commonFolder
		}

		function entry(params: { worktree: string; startedAt: string; state: string }): string {
			return JSON.stringify({
				runId: 'r',
				pid: 1,
				startedAt: params.startedAt,
				worktree: params.worktree,
				state: params.state,
				lot: 'l',
				tree: 't',
				mode: 'audit',
			})
		}

		it('run files of two worktrees → every one read with its worktree, start and state, nothing filtered', () => {
			const commonFolder = commonFolderWith([
				{
					name: 'a.json',
					content: entry({
						worktree: '/work/lot-a',
						startedAt: '2026-11-09T10:00:00.000Z',
						state: 'reported',
					}),
				},
				{
					name: 'b.json',
					content: entry({
						worktree: '/work/lot-b',
						startedAt: '2026-11-09T11:00:00.000Z',
						state: 'running',
					}),
				},
			])

			expect(
				readMutationRunFiles({ commonFolder }).sort((left, right) =>
					left.startedAt.localeCompare(right.startedAt),
				),
			).toEqual([
				{ worktree: '/work/lot-a', startedAt: '2026-11-09T10:00:00.000Z', state: 'reported' },
				{ worktree: '/work/lot-b', startedAt: '2026-11-09T11:00:00.000Z', state: 'running' },
			])
		})

		it('a file that is not JSON and a file that is not a run → skipped, the others read', () => {
			const commonFolder = commonFolderWith([
				{
					name: 'a.json',
					content: entry({
						worktree: '/work/lot-a',
						startedAt: '2026-11-09T10:00:00.000Z',
						state: 'abandoned',
					}),
				},
				{ name: 'bad.json', content: 'not json' },
				{ name: 'other.json', content: JSON.stringify({ hello: 1 }) },
				{ name: 'note.txt', content: 'x' },
			])

			expect(readMutationRunFiles({ commonFolder })).toEqual([
				{ worktree: '/work/lot-a', startedAt: '2026-11-09T10:00:00.000Z', state: 'abandoned' },
			])
		})

		it('a common folder with no mutation store → no run files', () => {
			expect(
				readMutationRunFiles({ commonFolder: temporaryFolder('record-times-empty-') }),
			).toEqual([])
		})
	},
)
