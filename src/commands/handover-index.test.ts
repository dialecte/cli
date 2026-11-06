import { basename, join } from 'node:path'

import {
	STORE_DATE,
	STORE_FIRST_NAME,
	STORE_NEXT_DAY,
} from '../../test/handover-store-scenario.constants.ts'
import {
	abandon,
	boxLines,
	createBranchRepository,
	readEntry,
	rehashHandover,
	runIn,
	show,
	subjectsOf,
	writeStoreHandover,
} from '../../test/handover-store-scenario.ts'
import { git, temporaryFolder } from '../../test/scratch-repository.ts'
import { HANDOVER_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'

import { describe, expect, it } from 'vitest'

const CHANGES = { 'src/read.ts': 'export function read() {\n\treturn 1\n}\n' }
const OTHER_CHANGES = { 'src/write.ts': 'export function write() {}\n' }
const INDEXED_BRANCH = 'feat/indexed'
const INDEXED_NAME = `${STORE_DATE}-feat-indexed`

/** A linked worktree of `root` on a new branch `feat/indexed`, in a numbered folder `.worktrees/<index>-repo-indexed`. */
function createNumberedWorktree(params: { root: string; index: string }): string {
	const worktree = join(
		temporaryFolder('dialecte-workspace-'),
		'.worktrees',
		`${params.index}-repo-indexed`,
	)
	git({ root: params.root, args: ['worktree', 'add', '-q', '-b', INDEXED_BRANCH, worktree] })
	return worktree
}

/** The output parsed as JSON; the text itself (under `text`) when it is no JSON. */
function jsonOrText(output: string): unknown {
	try {
		return JSON.parse(output)
	} catch {
		return { text: output }
	}
}

/** The title row of the card a result prints. */
function titleOf(output: string): string | undefined {
	return boxLines(output)[0]
}

describe('a hand-over written from a numbered worktree', { timeout: HANDOVER_CASE_TIMEOUT }, () => {
	it('its registry entry stores the index 0171', () => {
		const root = createBranchRepository()
		const worktree = createNumberedWorktree({ root, index: '0171' })

		writeStoreHandover({ root: worktree, name: INDEXED_NAME, changes: CHANGES })

		expect(readEntry({ root, name: INDEXED_NAME })).toMatchObject({
			worktree,
			branch: INDEXED_BRANCH,
			index: '0171',
		})
	})

	it('show 0171 and show 171, from the main checkout → its card, titled hand-over: 0171 <repository folder> feat/indexed', () => {
		const root = createBranchRepository()
		const worktree = createNumberedWorktree({ root, index: '0171' })
		writeStoreHandover({ root: worktree, name: INDEXED_NAME, changes: CHANGES })
		const title = new RegExp(`^┌─ hand-over: 0171 ${basename(root)} feat/indexed ─+┐$`)

		const padded = show({ cwd: root, argv: ['0171'] })
		const unpadded = show({ cwd: root, argv: ['171'] })

		expect({ exitCode: padded.exitCode, title: titleOf(padded.output) }).toEqual({
			exitCode: 0,
			title: expect.stringMatching(title),
		})
		expect({ exitCode: unpadded.exitCode, title: titleOf(unpadded.output) }).toEqual({
			exitCode: 0,
			title: expect.stringMatching(title),
		})
	})

	it('show 0171 --json → the index, the worktree and the registered name', () => {
		const root = createBranchRepository()
		const worktree = createNumberedWorktree({ root, index: '0171' })
		writeStoreHandover({ root: worktree, name: INDEXED_NAME, changes: CHANGES })

		expect(jsonOrText(show({ cwd: worktree, argv: ['0171', '--json'] }).output)).toMatchObject({
			index: '0171',
			worktree,
			name: INDEXED_NAME,
		})
	})

	it('the card holds a worktree line naming the numbered folder', () => {
		const root = createBranchRepository()
		const worktree = createNumberedWorktree({ root, index: '0171' })
		writeStoreHandover({ root: worktree, name: INDEXED_NAME, changes: CHANGES })

		expect(boxLines(show({ cwd: worktree, argv: ['0171'] }).output)).toContainEqual(
			expect.stringMatching(new RegExp(`^│ worktree ${worktree.replaceAll('.', '\\.')} +│$`)),
		)
	})

	it('two hand-overs of the worktree 0171 the same day → show 0171 names the newest (-2)', () => {
		const root = createBranchRepository()
		const worktree = createNumberedWorktree({ root, index: '0171' })
		writeStoreHandover({ root: worktree, name: INDEXED_NAME, changes: CHANGES })
		writeStoreHandover({ root: worktree, name: `${INDEXED_NAME}-2`, changes: OTHER_CHANGES })

		expect(jsonOrText(show({ cwd: root, argv: ['0171', '--json'] }).output)).toMatchObject({
			name: `${INDEXED_NAME}-2`,
		})
	})

	it('the plain name rewritten (--rehash, the next day) after -2 was written → show 0171 still names -2: the newest is the name, never the written time', () => {
		const root = createBranchRepository()
		const worktree = createNumberedWorktree({ root, index: '0171' })
		const { folder } = writeStoreHandover({ root: worktree, name: INDEXED_NAME, changes: CHANGES })
		writeStoreHandover({ root: worktree, name: `${INDEXED_NAME}-2` })
		rehashHandover({ folder, now: STORE_NEXT_DAY })

		expect(jsonOrText(show({ cwd: root, argv: ['0171', '--json'] }).output)).toMatchObject({
			name: `${INDEXED_NAME}-2`,
		})
	})

	it('abandon 0171 → its entry abandoned, exit 0', () => {
		const root = createBranchRepository()
		const worktree = createNumberedWorktree({ root, index: '0171' })
		writeStoreHandover({ root: worktree, name: INDEXED_NAME, changes: CHANGES })

		expect(abandon({ cwd: root, argv: ['0171'] })).toMatchObject({ exitCode: 0 })
		expect(readEntry({ root, name: INDEXED_NAME })).toMatchObject({ state: 'abandoned' })
	})

	it('a hand-over folder named 0171 given as ./0171 → that folder, not the entry of the index', () => {
		const root = createBranchRepository()
		const worktree = createNumberedWorktree({ root, index: '0171' })
		writeStoreHandover({ root: worktree, name: INDEXED_NAME, changes: CHANGES })
		const parent = temporaryFolder('dialecte-handover-out-')
		const { folder } = writeStoreHandover({
			root,
			name: STORE_FIRST_NAME,
			changes: OTHER_CHANGES,
			folder: join(parent, '0171'),
		})

		expect(jsonOrText(show({ cwd: parent, argv: ['./0171', '--json'] }).output)).toMatchObject({
			folder,
			name: STORE_FIRST_NAME,
		})
	})

	it('run 0171 → its lot committed in the numbered worktree, exit 0', async () => {
		const root = createBranchRepository()
		const worktree = createNumberedWorktree({ root, index: '0171' })
		writeStoreHandover({ root: worktree, name: INDEXED_NAME, changes: CHANGES })

		await expect(runIn({ cwd: root, argv: ['0171'] })).resolves.toMatchObject({ exitCode: 0 })

		expect(subjectsOf(worktree)[0]).toBe(`feat(read): change ${INDEXED_NAME}`)
	})

	it('show 0999, an index no entry holds → exit 2 naming it', () => {
		const root = createBranchRepository()
		const worktree = createNumberedWorktree({ root, index: '0171' })
		writeStoreHandover({ root: worktree, name: INDEXED_NAME, changes: CHANGES })

		expect(show({ cwd: root, argv: ['0999'] })).toMatchObject({
			exitCode: 2,
			output: expect.stringContaining('0999'),
		})
	})
})

describe('a hand-over written from the main checkout', { timeout: HANDOVER_CASE_TIMEOUT }, () => {
	it('no index in its entry; its title is hand-over: <repository folder> <branch>, no number', () => {
		const root = createBranchRepository()
		writeStoreHandover({ root, name: STORE_FIRST_NAME, changes: CHANGES })

		const entry = readEntry({ root, name: STORE_FIRST_NAME })
		const card = show({ cwd: root, argv: [STORE_FIRST_NAME] })

		expect({
			hasIndex: entry !== undefined && 'index' in entry,
			title: titleOf(card.output),
		}).toEqual({
			hasIndex: false,
			title: expect.stringMatching(
				new RegExp(`^┌─ hand-over: ${basename(root)} feat/handover-show ─+┐$`),
			),
		})
	})
})
