import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

import {
	DEFAULT_COLUMNS,
	ESCAPE,
	STORE_BRANCH,
	STORE_FIRST_NAME,
	STORE_NEXT_DAY,
} from '../../test/handover-store-scenario.constants.ts'
import {
	boxLines,
	checkout,
	commitLotByHand,
	commitStoreHandover,
	createBranchRepository,
	markAbandoned,
	readEntry,
	rehashHandover,
	removeFolder,
	indexPathOf,
	runCli,
	show,
	linesAfterBox,
	snapshotOf,
	storeOf,
	writeStoreHandover,
	footerOf,
} from '../../test/handover-store-scenario.ts'
import { temporaryFolder, writeFiles } from '../../test/scratch-repository.ts'
import { HANDOVER_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { handoverLockPath } from '../lib/handover/handover-lock.ts'
import { HANDOVER_FILES, HANDOVER_RUN_MARKER_FILE } from '../lib/handover/handover.constants.ts'

import { describe, expect, it } from 'vitest'

import type { CommandResult } from '../lib/command-result.types.ts'

const CHANGES = { 'src/read.ts': 'export function read() {\n\treturn 1\n}\n' }
const SECOND_NAME = `${STORE_FIRST_NAME}-2`
const NEXT_DAY_NAME = '2026-11-05-feat-handover-show'
const ESCAPE_SEQUENCES = new RegExp(`${ESCAPE}\\[[0-9;]*m`, 'g')

/** A result as the cases read it: the exit code, the box, what follows it. */
function cardOf(result: CommandResult): {
	exitCode: number
	title: string | undefined
	sectionRules: string[]
	boxText: string
	afterBox: string[]
	lines: string[]
} {
	const box = boxLines(result.output)
	return {
		exitCode: result.exitCode,
		title: box[0],
		sectionRules: box.filter((line) => line.startsWith('├─ ')),
		boxText: box.join('\n'),
		afterBox: linesAfterBox(result.output),
		lines: result.output.split('\n'),
	}
}

/** The output parsed as JSON; the text itself (under `text`) when it is no JSON. */
function jsonOrText(output: string): unknown {
	try {
		return JSON.parse(output)
	} catch {
		return { text: output }
	}
}

/** The width of each box line once colour escapes are left out. */
function boxWidths(output: string): number[] {
	return boxLines(output.replace(ESCAPE_SEQUENCES, '')).map((line) => line.length)
}

describe('handover show <name>', { timeout: HANDOVER_CASE_TIMEOUT }, () => {
	it('a pending hand-over → the card (title, commit and gates sections), the run command on its own line after the box, exit 0', () => {
		const root = createBranchRepository()
		const { folder } = writeStoreHandover({
			root,
			name: STORE_FIRST_NAME,
			changes: CHANGES,
			keepLock: true,
		})

		expect(cardOf(show({ cwd: root, argv: [STORE_FIRST_NAME] }))).toMatchObject({
			exitCode: 0,
			title: expect.stringContaining('hand-over:'),
			sectionRules: expect.arrayContaining([
				expect.stringContaining(' commit '),
				expect.stringContaining(' gates '),
				expect.stringContaining(' notes '),
			]),
			boxText: expect.stringContaining('npm run check'),
			afterBox: [expect.stringMatching(new RegExp(`handover run .*${folder}`))],
		})
	})

	it('show → no byte and no mtime changed in the hand-over folder, the store, the lock, the worktree files and its index; files.sha256 unchanged after a lot file was edited', () => {
		const root = createBranchRepository()
		const { folder } = writeStoreHandover({
			root,
			name: STORE_FIRST_NAME,
			changes: CHANGES,
			keepLock: true,
		})
		writeFiles({ root, files: { 'src/read.ts': 'export function read() {\n\treturn 2\n}\n' } })
		const watched = [folder, storeOf(root), handoverLockPath(root), indexPathOf(root), root]
		const before = snapshotOf({ paths: watched, skip: ['.git'] })

		expect(show({ cwd: root, argv: [STORE_FIRST_NAME] })).toMatchObject({ exitCode: 0 })

		expect(snapshotOf({ paths: watched, skip: ['.git'] })).toEqual(before)
	})
})

describe('handover show: nothing held', { timeout: HANDOVER_CASE_TIMEOUT }, () => {
	it('no lock held → show leaves it absent and writes no run marker, and nothing else moves', () => {
		const root = createBranchRepository()
		const { folder } = writeStoreHandover({ root, name: STORE_FIRST_NAME, changes: CHANGES })
		const watched = [folder, storeOf(root), handoverLockPath(root), indexPathOf(root), root]
		const before = snapshotOf({ paths: watched, skip: ['.git'] })

		expect(show({ cwd: root, argv: [STORE_FIRST_NAME] })).toMatchObject({ exitCode: 0 })

		expect(snapshotOf({ paths: watched, skip: ['.git'] })).toEqual(before)
		expect(existsSync(handoverLockPath(root))).toBe(false)
		expect(existsSync(join(folder, HANDOVER_RUN_MARKER_FILE))).toBe(false)
	})
})

describe('handover show without an argument', { timeout: HANDOVER_CASE_TIMEOUT }, () => {
	it("two hand-overs of the current branch on the later day, an older one written last, and one of another branch under the same slug → the card of the later day's -2", () => {
		const root = createBranchRepository()
		writeStoreHandover({ root, name: NEXT_DAY_NAME, changes: CHANGES, now: STORE_NEXT_DAY })
		writeStoreHandover({ root, name: `${NEXT_DAY_NAME}-2`, now: STORE_NEXT_DAY })
		writeStoreHandover({ root, name: STORE_FIRST_NAME })
		writeStoreHandover({
			root,
			name: `${NEXT_DAY_NAME}-3`,
			branch: 'feat-handover-show',
			now: STORE_NEXT_DAY,
		})
		checkout({ root, branch: STORE_BRANCH })

		expect(show({ cwd: root })).toMatchObject({
			exitCode: 0,
			output: expect.stringContaining(footerOf(`${NEXT_DAY_NAME}-2`)),
		})
	})

	it('ten hand-overs of the branch on one day and one of another branch with the same slug after them → the card of -10 (not -9, as a string sort would say)', () => {
		const root = createBranchRepository()
		writeStoreHandover({ root, name: STORE_FIRST_NAME, changes: CHANGES })
		for (let counter = 2; counter <= 10; counter++)
			writeStoreHandover({ root, name: `${STORE_FIRST_NAME}-${counter}` })
		writeStoreHandover({
			root,
			name: `${STORE_FIRST_NAME}-11`,
			branch: 'feat-handover-show',
		})
		checkout({ root, branch: STORE_BRANCH })

		expect(show({ cwd: root })).toMatchObject({
			exitCode: 0,
			output: expect.stringContaining(footerOf(`${STORE_FIRST_NAME}-10`)),
		})
	})

	it('an older-named hand-over rewritten with --rehash on the next day (newer written) beside a newer-named one → the newer name: the order is the name, never the written time', () => {
		const root = createBranchRepository()
		const older = writeStoreHandover({ root, name: STORE_FIRST_NAME, changes: CHANGES })
		writeStoreHandover({ root, name: NEXT_DAY_NAME, now: STORE_NEXT_DAY })
		rehashHandover({ folder: older.folder, now: new Date(2026, 10, 5, 18, 0, 0) })

		expect(show({ cwd: root })).toMatchObject({
			exitCode: 0,
			output: expect.stringContaining(footerOf(NEXT_DAY_NAME)),
		})
	})

	it('the newest entry of the branch abandoned → its ABANDONED card, no run command', () => {
		const root = createBranchRepository()
		writeStoreHandover({ root, name: STORE_FIRST_NAME, changes: CHANGES })
		const newest = writeStoreHandover({ root, name: SECOND_NAME })
		markAbandoned({ folder: newest.folder, file: HANDOVER_FILES.abandoned })

		expect(cardOf(show({ cwd: root }))).toMatchObject({
			exitCode: 0,
			boxText: expect.stringContaining('ABANDONED'),
			afterBox: [],
		})
		expect(show({ cwd: root })).toMatchObject({
			output: expect.stringContaining(footerOf(SECOND_NAME)),
		})
	})

	it('the newest entry of the branch gone → exit 1 naming the missing folder', () => {
		const root = createBranchRepository()
		writeStoreHandover({ root, name: STORE_FIRST_NAME, changes: CHANGES })
		const newest = writeStoreHandover({ root, name: SECOND_NAME })
		removeFolder(newest.folder)

		expect(show({ cwd: root })).toMatchObject({
			exitCode: 1,
			output: expect.stringContaining(newest.folder),
		})
	})

	it('the newest of the branch is committed → its card, DONE, no run command', async () => {
		const root = createBranchRepository()
		const first = writeStoreHandover({ root, name: STORE_FIRST_NAME, changes: CHANGES })
		await commitStoreHandover({ root, folder: first.folder })
		const second = writeStoreHandover({
			root,
			name: SECOND_NAME,
			changes: { 'src/write.ts': 'export function write() {}\n' },
		})
		await commitStoreHandover({ root, folder: second.folder })

		expect(cardOf(show({ cwd: root }))).toMatchObject({
			exitCode: 0,
			boxText: expect.stringContaining('DONE'),
			sectionRules: expect.not.arrayContaining([expect.stringContaining(' notes ')]),
			afterBox: [],
		})
		expect(show({ cwd: root })).toMatchObject({
			output: expect.stringContaining(footerOf(SECOND_NAME)),
		})
	})

	it('an older pending hand-over and a newer committed one of the branch → the committed card, DONE', async () => {
		const root = createBranchRepository()
		const newer = writeStoreHandover({
			root,
			name: NEXT_DAY_NAME,
			changes: CHANGES,
			now: STORE_NEXT_DAY,
		})
		await commitStoreHandover({ root, folder: newer.folder })
		writeStoreHandover({
			root,
			name: STORE_FIRST_NAME,
			changes: { 'src/write.ts': 'export function write() {}\n' },
		})

		expect(cardOf(show({ cwd: root }))).toMatchObject({
			exitCode: 0,
			boxText: expect.stringContaining('DONE'),
			sectionRules: expect.not.arrayContaining([expect.stringContaining(' notes ')]),
			afterBox: [],
		})
		expect(show({ cwd: root })).toMatchObject({
			output: expect.stringContaining(footerOf(NEXT_DAY_NAME)),
		})
	})

	it('none for the current branch, one other hand-over abandoned → the listing prints abandoned as its state', () => {
		const root = createBranchRepository()
		const other = writeStoreHandover({
			root,
			name: '2026-11-05-other',
			changes: CHANGES,
			branch: 'other',
			now: STORE_NEXT_DAY,
		})
		markAbandoned({ folder: other.folder, file: HANDOVER_FILES.abandoned })
		checkout({ root, branch: STORE_BRANCH })
		const watched = [other.folder, storeOf(root), handoverLockPath(root), indexPathOf(root)]
		const before = snapshotOf({ paths: watched })

		expect(show({ cwd: root })).toMatchObject({
			exitCode: 1,
			output: expect.stringMatching(/2026-11-05-other\s+other\s+abandoned/),
		})

		expect(snapshotOf({ paths: watched })).toEqual(before)
	})

	it('none for the current branch, one other hand-over whose folder was removed → the listing prints gone as its state', () => {
		const root = createBranchRepository()
		const other = writeStoreHandover({
			root,
			name: '2026-11-05-other',
			changes: CHANGES,
			branch: 'other',
			now: STORE_NEXT_DAY,
		})
		removeFolder(other.folder)
		checkout({ root, branch: STORE_BRANCH })

		expect(show({ cwd: root })).toMatchObject({
			exitCode: 1,
			output: expect.stringMatching(/2026-11-05-other\s+other\s+gone/),
		})
	})

	it('show <name> of a hand-over whose folder was removed → exit 1 naming the missing folder, the entry untouched', () => {
		const root = createBranchRepository()
		const { folder } = writeStoreHandover({ root, name: STORE_FIRST_NAME, changes: CHANGES })
		removeFolder(folder)
		const entryBefore = readEntry({ root, name: STORE_FIRST_NAME })

		expect(show({ cwd: root, argv: [STORE_FIRST_NAME] })).toMatchObject({
			exitCode: 1,
			output: expect.stringContaining(folder),
		})

		expect(readEntry({ root, name: STORE_FIRST_NAME })).toEqual(entryBefore)
	})

	it('an existing but empty store folder → says none, exit 1', () => {
		const root = createBranchRepository()
		mkdirSync(storeOf(root), { recursive: true })

		expect(show({ cwd: root })).toMatchObject({
			exitCode: 1,
			output: expect.stringMatching(/no hand-over/i),
		})
	})

	it('none for the current branch → the store names listed (name, branch, state), exit 1', () => {
		const root = createBranchRepository()
		writeStoreHandover({
			root,
			name: '2026-11-05-other',
			changes: CHANGES,
			branch: 'other',
			now: STORE_NEXT_DAY,
		})
		checkout({ root, branch: STORE_BRANCH })
		const before = snapshotOf({ paths: [storeOf(root), handoverLockPath(root), indexPathOf(root)] })

		expect(show({ cwd: root })).toMatchObject({
			exitCode: 1,
			output: expect.stringMatching(/2026-11-05-other\s+other\s+pending/),
		})

		expect(
			snapshotOf({ paths: [storeOf(root), handoverLockPath(root), indexPathOf(root)] }),
		).toEqual(before)
	})

	it('a missing store → says none, exit 1', () => {
		const root = createBranchRepository()

		expect(show({ cwd: root })).toMatchObject({
			exitCode: 1,
			output: expect.stringMatching(/no hand-over/i),
		})
	})
})

describe('handover show: changes since the review', { timeout: HANDOVER_CASE_TIMEOUT }, () => {
	it('a lot file unchanged → no differ line; edited after the hand-over → one line naming the count, the re-gate and the --rehash command on the lots file of the folder', () => {
		const root = createBranchRepository()
		const { folder } = writeStoreHandover({
			root,
			name: STORE_FIRST_NAME,
			changes: CHANGES,
			keepLock: true,
		})

		expect(show({ cwd: root, argv: [STORE_FIRST_NAME] })).toMatchObject({
			exitCode: 0,
			output: expect.not.stringContaining('differ from the reviewed snapshot'),
		})

		writeFiles({ root, files: { 'src/read.ts': 'export function read() {\n\treturn 9\n}\n' } })
		expect(cardOf(show({ cwd: root, argv: [STORE_FIRST_NAME] })).afterBox).toEqual([
			`1 file(s) differ from the reviewed snapshot: re-gate, then dialecte handover ${folder}/lots.json --rehash`,
			expect.stringMatching(new RegExp(`handover run .*${folder}`)),
		])
	})

	it('a lot file deleted and lots.json edited (still valid) → both counted, exit 0', () => {
		const root = createBranchRepository()
		const { folder } = writeStoreHandover({
			root,
			name: STORE_FIRST_NAME,
			changes: CHANGES,
			keepLock: true,
		})
		const lotsPath = join(folder, HANDOVER_FILES.lots)
		rmSync(join(root, 'src/read.ts'))
		writeFileSync(
			lotsPath,
			JSON.stringify({
				...JSON.parse(readFileSync(lotsPath, 'utf8')),
				gates: 'edited after review',
			}),
		)

		expect(show({ cwd: root, argv: [STORE_FIRST_NAME] })).toMatchObject({
			exitCode: 0,
			output: expect.stringContaining(
				`2 file(s) differ from the reviewed snapshot: re-gate, then dialecte handover ${folder}/${HANDOVER_FILES.lots} --rehash`,
			),
		})
	})

	it('a partly committed hand-over, a committed lot file edited after its commit → not counted', () => {
		const root = createBranchRepository()
		writeStoreHandover({
			root,
			name: STORE_FIRST_NAME,
			changes: { 'src/a.ts': 'export const a = 1\n', 'src/b.ts': 'export const b = 1\n' },
			lots: [
				{ paths: ['src/a.ts'], message: 'feat(a): add a' },
				{ paths: ['src/b.ts'], message: 'feat(b): add b' },
			],
		})
		commitLotByHand({ root, paths: ['src/a.ts'], message: 'feat(a): add a' })
		writeFiles({ root, files: { 'src/a.ts': 'export const a = 2\n' } })

		expect(show({ cwd: root, argv: [STORE_FIRST_NAME] })).toMatchObject({
			exitCode: 0,
			output: expect.not.stringContaining('differ from the reviewed snapshot'),
		})
		writeFiles({ root, files: { 'src/b.ts': 'export const b = 2\n' } })
		expect(show({ cwd: root, argv: [STORE_FIRST_NAME] }).output).toContain(
			'1 file(s) differ from the reviewed snapshot',
		)
	})
})

describe('handover show --json', { timeout: HANDOVER_CASE_TIMEOUT }, () => {
	it('the card as data: the registered name and the count of files changed since the review (0, then 1 after an edit)', () => {
		const root = createBranchRepository()
		writeStoreHandover({ root, name: STORE_FIRST_NAME, changes: CHANGES, keepLock: true })

		expect(
			jsonOrText(show({ cwd: root, argv: [STORE_FIRST_NAME, '--json'] }).output),
		).toMatchObject({ name: STORE_FIRST_NAME, changedSinceReview: 0 })

		writeFiles({ root, files: { 'src/read.ts': 'export function read() {\n\treturn 9\n}\n' } })
		expect(
			jsonOrText(show({ cwd: root, argv: [STORE_FIRST_NAME, '--json'] }).output),
		).toMatchObject({ name: STORE_FIRST_NAME, changedSinceReview: 1 })
	})
})

describe('handover show <folder> and unknown arguments', { timeout: HANDOVER_CASE_TIMEOUT }, () => {
	it('a --out folder, absolute and relative to the cwd → its card', () => {
		const root = createBranchRepository()
		const out = join(temporaryFolder('dialecte-show-out-'), 'handover')
		writeStoreHandover({ root, name: STORE_FIRST_NAME, changes: CHANGES, folder: out })

		expect(show({ cwd: root, argv: [out] })).toMatchObject({
			exitCode: 0,
			output: expect.stringContaining('hand-over:'),
		})
		expect(show({ cwd: root, argv: [relative(root, out)] })).toMatchObject({
			exitCode: 0,
			output: expect.stringContaining('hand-over:'),
		})
	})

	it('an unknown name → exit 2 naming it; a folder that is no hand-over → exit 2 naming it', () => {
		const root = createBranchRepository()
		const noHandover = temporaryFolder('dialecte-no-handover-')

		expect(show({ cwd: root, argv: ['2026-11-04-nowhere'] })).toMatchObject({
			exitCode: 2,
			output: expect.stringContaining('2026-11-04-nowhere'),
		})
		expect(show({ cwd: root, argv: [noHandover] })).toMatchObject({
			exitCode: 2,
			output: expect.stringContaining(noHandover),
		})
	})
})

describe('handover show: output', { timeout: HANDOVER_CASE_TIMEOUT }, () => {
	it('to a pipe → no escape, every box line exactly $COLUMNS wide (80 when unset)', () => {
		const root = createBranchRepository()
		writeStoreHandover({ root, name: STORE_FIRST_NAME, changes: CHANGES, keepLock: true })

		const narrow = runCli({ cwd: root, argv: ['handover', 'show', STORE_FIRST_NAME], columns: 60 })
		const standard = runCli({ cwd: root, argv: ['handover', 'show', STORE_FIRST_NAME] })

		expect(narrow.exitCode).toBe(0)
		expect(boxLines(narrow.output).length).toBeGreaterThan(0)
		expect(boxLines(standard.output).length).toBeGreaterThan(0)
		expect(standard.exitCode).toBe(0)
		expect(narrow.output).not.toContain(ESCAPE)
		expect(boxLines(narrow.output).map((line) => line.length)).toEqual(
			boxLines(narrow.output).map(() => 60),
		)
		expect(boxLines(standard.output).map((line) => line.length)).toEqual(
			boxLines(standard.output).map(() => DEFAULT_COLUMNS),
		)
	})

	it('colour on → escapes present, the box still exactly as wide once they are left out', () => {
		const root = createBranchRepository()
		writeStoreHandover({ root, name: STORE_FIRST_NAME, changes: CHANGES, keepLock: true })

		const argv = [STORE_FIRST_NAME]

		expect(show({ cwd: root, argv, colour: true, columns: 60 })).toMatchObject({
			output: expect.stringContaining(ESCAPE),
		})
		expect([
			...new Set(boxWidths(show({ cwd: root, argv, colour: true, columns: 60 }).output)),
		]).toEqual([60])
	})
})
