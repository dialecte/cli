/** The review rounds' verbs take `<id|folder>`: an id resolves to the lot folder, a folder is a folder as before. */
import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	realpathSync,
	writeFileSync,
} from 'node:fs'
import { join } from 'node:path'

import { FINDING_TAIL, LEDGER_TABLE_HEAD } from '../../test/lot-stores.constants.ts'
import {
	addWorktreeFolder,
	createWorkspaceWithLots,
	linkLot,
	writeStoreListFile,
} from '../../test/lot-stores.ts'
import { writeRecapFolder } from '../../test/mutation-hooks.ts'
import { temporaryFolder, writeFiles } from '../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { resolveLot } from '../lib/store/resolve-lot.ts'
import { runLot } from './lot.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

const SUBSCRIBE = '0171-repo-subscribe'
const OWN_SIX = '0006-repo-a'
const OTHER_SIX = '0006-repo-b'
const FIVE_B = '0005-repo-b'
const FIVE_C = '0005-repo-c'

/** Workspace A (cwd of the verbs) with two lots, B and C with twins of indexes A lacks (0005) or holds (0006). */
function stores() {
	const first = createWorkspaceWithLots({ names: [SUBSCRIBE, OWN_SIX] })
	const second = createWorkspaceWithLots({ names: [FIVE_B, OTHER_SIX] })
	const third = createWorkspaceWithLots({ names: [FIVE_C] })
	writeStoreListFile({
		stores: [first, second, third].map((each) => realpathSync(each.workspace.store)),
	})
	writeFiles({ root: first.workspace.repository, files: { 'src/index.ts': 'b\n' } })
	return {
		first,
		second,
		third,
		cwd: first.workspace.repository,
		outside: realpathSync(temporaryFolder('outside-')),
	}
}

function ledgerText(params: { title: string; rows: string[] }): string {
	return `# Findings ledger - ${params.title}\n\n${LEDGER_TABLE_HEAD}${params.rows.map((row) => `${row}\n`).join('')}`
}

function textOf(path: string): string | undefined {
	return existsSync(path) ? readFileSync(path, 'utf8') : undefined
}

type WriteRow = {
	name: string
	argv: (word: string) => string[]
	/** The file the verb writes, relative to the folder. */
	file: string
	/** What the folder holds before the verb runs. */
	prepare?: (folder: string) => void
	/** The text of the file afterwards, for the lot of this name. */
	text: (title: string) => unknown
}

const FIRST_ROW = '| R1-1 | 1 | blocking | a.ts:3 | text | open |'

const WRITE_ROWS: WriteRow[] = [
	{
		name: 'lot finding',
		argv: (word) => ['finding', word, ...FINDING_TAIL],
		file: 'findings-ledger.md',
		text: (title) => ledgerText({ title, rows: [FIRST_ROW] }),
	},
	{
		name: 'lot decide',
		argv: (word) => ['decide', word, 'R1-1', 'accepted', 'reason'],
		file: 'findings-ledger.md',
		prepare(folder) {
			writeFileSync(
				join(folder, 'findings-ledger.md'),
				ledgerText({
					title: folder.split('/').pop()!,
					rows: ['| R1-1 | 1 | nit | a.ts:1 | first | open |'],
				}),
			)
		},
		text: (title) =>
			ledgerText({ title, rows: ['| R1-1 | 1 | nit | a.ts:1 | first | accepted (reason) |'] }),
	},
	{
		name: 'lot choice',
		argv: (word) => ['choice', word, '--by', 'user', 'keep it'],
		file: 'decisions.md',
		text: () => expect.stringMatching(/\| keep it \| user \| \d{4}-\d{2}-\d{2} \|\n$/),
	},
	{
		name: 'lot standard',
		argv: (word) => ['standard', word, 'consulted', 'note'],
		file: 'standard.json',
		text: () => expect.stringContaining('"state": "consulted"'),
	},
	{
		name: 'lot snapshot',
		argv: (word) => ['snapshot', word, '--round', '1'],
		file: 'round-1/src/index.ts',
		text: () => 'b\n',
	},
]

describe('the review rounds verbs by id', { timeout: STORE_CASE_TIMEOUT }, () => {
	for (const row of WRITE_ROWS)
		for (const word of ['171', '0171', SUBSCRIBE])
			it(`${row.name} ${word} -> the verb writes in the folder of ${SUBSCRIBE}`, () => {
				const fixture = stores()
				const lot = fixture.first.folders[SUBSCRIBE]
				row.prepare?.(lot)

				expect({
					exitCode: runLot({ cwd: fixture.cwd, argv: row.argv(word) }).exitCode,
					text: textOf(join(lot, row.file)),
					strayFolder: existsSync(join(fixture.cwd, word)),
				}).toEqual({ exitCode: 0, text: row.text(SUBSCRIBE), strayFolder: false })
			})

	it('lot finding through .dialecte/lot, from the lot worktree (case 33) -> the ledger of the real lot folder, titled by its name', () => {
		const fixture = stores()
		const lot = fixture.first.folders[SUBSCRIBE]
		const worktree = addWorktreeFolder({
			workspace: fixture.first.workspace,
			folderName: SUBSCRIBE,
		})
		linkLot({ worktree, lotFolder: lot })

		const result = runLot({ cwd: worktree, argv: ['finding', '.dialecte/lot', ...FINDING_TAIL] })

		expect({
			exitCode: result.exitCode,
			output: result.output,
			text: textOf(join(lot, 'findings-ledger.md')),
		}).toEqual({
			exitCode: 0,
			output: expect.stringContaining(join(lot, 'findings-ledger.md')),
			text: ledgerText({ title: SUBSCRIBE, rows: [FIRST_ROW] }),
		})
	})

	it('lot delta 171 --round 2 after lot snapshot 171 --round 1 and a later change -> the fix diff', () => {
		const fixture = stores()
		const lot = fixture.first.folders[SUBSCRIBE]
		expect(runLot({ cwd: fixture.cwd, argv: ['snapshot', '171', '--round', '1'] }).exitCode).toBe(0)
		expect(existsSync(join(lot, 'round-1', 'src', 'index.ts'))).toBe(true)
		writeFiles({ root: fixture.cwd, files: { 'src/index.ts': 'c\n' } })

		const result = runLot({ cwd: fixture.cwd, argv: ['delta', '171', '--round', '2'] })

		expect({ exitCode: result.exitCode, diff: result.output.includes('-b\n+c') }).toEqual({
			exitCode: 0,
			diff: true,
		})
	})

	it('lot recap 171 -> the recap of the records in the lot folder', () => {
		const fixture = stores()
		writeFiles({
			root: fixture.cwd,
			files: { 'package.json': `${JSON.stringify({ name: 'scratch' })}\n` },
		})
		writeRecapFolder({ root: fixture.cwd, folder: fixture.first.folders[SUBSCRIBE] })

		const result = runLot({ cwd: fixture.cwd, argv: ['recap', '171'] })

		expect({
			exitCode: result.exitCode,
			opens: result.output.startsWith('<details>'),
		}).toEqual({ exitCode: 0, opens: true })
	})

	it('lot recap 6, an index of A and of B (case 51, a read) -> the lot of the cwd store, A', () => {
		const fixture = stores()
		writeFiles({
			root: fixture.cwd,
			files: { 'package.json': `${JSON.stringify({ name: 'scratch' })}\n` },
		})
		writeRecapFolder({ root: fixture.cwd, folder: fixture.first.folders[OWN_SIX] })

		const result = runLot({ cwd: fixture.cwd, argv: ['recap', '6'] })

		expect({
			exitCode: result.exitCode,
			opens: result.output.startsWith('<details>'),
		}).toEqual({ exitCode: 0, opens: true })
	})
})

describe(
	'the writing verbs refuse an index several stores hold',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		for (const row of WRITE_ROWS)
			it(`${row.name} 5, held by B and C and not by the cwd store (case 60) -> exit 2 listing both full names, nothing written`, () => {
				const fixture = stores()
				const folders = [fixture.second.folders[FIVE_B], fixture.third.folders[FIVE_C]]
				const before = folders.map((folder) => readdirSync(folder).sort())

				const result = runLot({ cwd: fixture.cwd, argv: row.argv('5') })

				expect({
					exitCode: result.exitCode,
					missing: [FIVE_B, FIVE_C, ...folders].filter((part) => !result.output.includes(part)),
					after: folders.map((folder) => readdirSync(folder).sort()),
					strayFolder: existsSync(join(fixture.cwd, '5')),
				}).toEqual({ exitCode: 2, missing: [], after: before, strayFolder: false })
			})

		for (const row of WRITE_ROWS)
			it(`${row.name} 6, held by the cwd store and by B (case 51) -> exit 2 listing both, nothing written in either lot`, () => {
				const fixture = stores()
				const folders = [fixture.first.folders[OWN_SIX], fixture.second.folders[OTHER_SIX]]
				const before = folders.map((folder) => readdirSync(folder).sort())

				const result = runLot({ cwd: fixture.cwd, argv: row.argv('6') })

				expect({
					exitCode: result.exitCode,
					missing: [OWN_SIX, OTHER_SIX, ...folders].filter((part) => !result.output.includes(part)),
					after: folders.map((folder) => readdirSync(folder).sort()),
					strayFolder: existsSync(join(fixture.cwd, '6')),
				}).toEqual({ exitCode: 2, missing: [], after: before, strayFolder: false })
			})

		for (const argv of [
			['delta', '5', '--round', '2'],
			['recap', '5'],
		])
			it(`lot ${argv[0]} 5, held by B and C and not by the cwd store -> exit 2 listing both, as a read from outside every cwd store does`, () => {
				const fixture = stores()
				const folders = [fixture.second.folders[FIVE_B], fixture.third.folders[FIVE_C]]

				const result = runLot({ cwd: fixture.cwd, argv })

				expect({
					exitCode: result.exitCode,
					missing: [FIVE_B, FIVE_C, ...folders].filter((part) => !result.output.includes(part)),
				}).toEqual({ exitCode: 2, missing: [] })
			})
	},
)

describe('a folder, not an id', { timeout: STORE_CASE_TIMEOUT }, () => {
	type FolderRow = { name: string; word: string; argv: (word: string) => string[]; file: string }
	const ROWS: FolderRow[] = [
		{
			name: 'lot finding handover-x (case 49), neither folder nor lot exists',
			word: 'handover-x',
			argv: (word) => ['finding', word, ...FINDING_TAIL],
			file: 'findings-ledger.md',
		},
		{
			name: 'lot finding 0999, an id-shaped word no lot has: a folder to create, no id lookup',
			word: '0999',
			argv: (word) => ['finding', word, ...FINDING_TAIL],
			file: 'findings-ledger.md',
		},
		{
			name: 'lot choice step-2',
			word: 'step-2',
			argv: (word) => ['choice', word, '--by', 'user', 'keep it'],
			file: 'decisions.md',
		},
		{
			name: 'lot standard step-2',
			word: 'step-2',
			argv: (word) => ['standard', word, 'consulted', 'note'],
			file: 'standard.json',
		},
	]
	for (const row of ROWS)
		it(`${row.name} -> the folder is made beside cwd and holds the record`, () => {
			const fixture = stores()
			const folder = join(fixture.outside, row.word)

			expect({
				resolved: resolveLot({ argument: row.word, cwd: fixture.outside, mode: 'write' }),
				exitCode: runLot({ cwd: fixture.outside, argv: row.argv(row.word) }).exitCode,
				written: existsSync(join(folder, row.file)),
			}).toEqual({ resolved: { folder }, exitCode: 0, written: true })
		})

	it('lot finding 0171 with a folder 0171 in cwd and a lot of index 0171 -> the folder wins, the lot is left alone', () => {
		const fixture = stores()
		const folder = join(fixture.outside, '0171')
		mkdirSync(folder)
		const lot = fixture.first.folders[SUBSCRIBE]
		const before = readdirSync(lot).sort()

		const result = runLot({ cwd: fixture.outside, argv: ['finding', '0171', ...FINDING_TAIL] })
		const [firstLine, ...rest] = result.output.split('\n')

		expect({
			resolved: resolveLot({ argument: '0171', cwd: fixture.outside, mode: 'write' }),
			exitCode: result.exitCode,
			// the note is the first line, the verb's own output follows unchanged
			firstLine,
			rest: rest.join('\n'),
			inFolder: existsSync(join(folder, 'findings-ledger.md')),
			lotFiles: readdirSync(lot).sort(),
		}).toEqual({
			resolved: { folder, note: `0171 is the folder ./0171, not lot ${SUBSCRIBE}` },
			exitCode: 0,
			firstLine: `0171 is the folder ./0171, not lot ${SUBSCRIBE}`,
			rest: `lot finding: R1-1 open - ${join(folder, 'findings-ledger.md')}`,
			inFolder: true,
			lotFiles: before,
		})
	})
})
