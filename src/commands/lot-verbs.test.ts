/** `dialecte lot finding | decide | snapshot | choice | standard | delta | recap`: the review rounds' verbs, under `lot`. */
import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	realpathSync,
	writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'

import { recapFolderPath, writeRecapFolder } from '../../test/mutation-hooks.ts'
import {
	createScratchRepository,
	temporaryFolder,
	writeFiles,
} from '../../test/scratch-repository.ts'
import { COMMAND_MAP } from '../lib/command-map/command-map.constants.ts'
import { runLot } from './lot.ts'

import { describe, expect, it } from 'vitest'

const TABLE_HEAD =
	'| id | round | severity | file:line | finding | state |\n|---|---|---|---|---|---|\n'

/** A hand-over folder path named `lot`, outside every repository; not created. */
function handoverFolder(): string {
	return join(realpathSync(temporaryFolder('dialecte-lot-verbs-')), 'lot')
}

/** The ledger as it is first written for a folder named `lot`, then `rows`. */
function ledgerText(rows: string[]): string {
	return `# Findings ledger - lot\n\n${TABLE_HEAD}${rows.map((row) => `${row}\n`).join('')}`
}

/** The folder, made, holding a ledger of `rows`. */
function folderWithLedger(rows: string[]): string {
	const folder = handoverFolder()
	mkdirSync(folder, { recursive: true })
	writeFileSync(join(folder, 'findings-ledger.md'), ledgerText(rows))
	return folder
}

describe('dialecte lot - the review rounds verbs', { timeout: 60_000 }, () => {
	it('finding <folder> --round 1 --severity blocking --at a.ts:3 text → the row R1-1 appended, as record review did', () => {
		const folder = handoverFolder()

		const result = runLot({
			cwd: dirname(folder),
			argv: ['finding', folder, '--round', '1', '--severity', 'blocking', '--at', 'a.ts:3', 'text'],
		})

		expect(result.exitCode).toBe(0)
		expect(readFileSync(join(folder, 'findings-ledger.md'), 'utf8')).toBe(
			ledgerText(['| R1-1 | 1 | blocking | a.ts:3 | text | open |']),
		)
	})

	it('decide <folder> R1-1 accepted reason → the state cell rewritten, every other byte kept', () => {
		const folder = folderWithLedger(['| R1-1 | 1 | nit | a.ts:1 | first | open |'])

		const result = runLot({ cwd: folder, argv: ['decide', folder, 'R1-1', 'accepted', 'reason'] })

		expect(result.exitCode).toBe(0)
		expect(readFileSync(join(folder, 'findings-ledger.md'), 'utf8')).toBe(
			ledgerText(['| R1-1 | 1 | nit | a.ts:1 | first | accepted (reason) |']),
		)
	})

	it('snapshot <folder> --round 1 in a worktree with one change → round-1/ holds it', () => {
		const root = createScratchRepository({ 'a.ts': 'a\n' })
		writeFiles({ root, files: { 'a.ts': 'b\n' } })
		const folder = handoverFolder()

		const result = runLot({ cwd: root, argv: ['snapshot', folder, '--round', '1'] })

		expect(result.exitCode).toBe(0)
		expect(readdirSync(folder).sort()).toEqual([
			'round-1',
			'round-1.base',
			'round-1.deleted',
			'round-1.state',
		])
		expect(readFileSync(join(folder, 'round-1', 'a.ts'), 'utf8')).toBe('b\n')
	})

	it('choice <folder> --by user "keep it" → the row in decisions.md', () => {
		const folder = handoverFolder()
		mkdirSync(folder, { recursive: true })

		const result = runLot({
			cwd: dirname(folder),
			argv: ['choice', folder, '--by', 'user', 'keep it'],
		})

		expect(result.exitCode).toBe(0)
		expect(result.output).toMatch(/^lot choice: by user - /)
		expect(readFileSync(join(folder, 'decisions.md'), 'utf8')).toMatch(
			/\| decision \| by \| when \|\n\|---\|---\|---\|\n\| keep it \| user \| \d{4}-\d{2}-\d{2} \|\n$/,
		)
	})

	it('standard <folder> consulted note → standard.json written with the state and the note', () => {
		const folder = handoverFolder()

		const result = runLot({
			cwd: dirname(folder),
			argv: ['standard', folder, 'consulted', 'note'],
		})

		expect(result.exitCode).toBe(0)
		expect(result.output).toMatch(/^lot standard: consulted - /)
		expect(existsSync(join(folder, 'standard.json'))).toBe(true)
		expect(JSON.parse(readFileSync(join(folder, 'standard.json'), 'utf8'))).toMatchObject({
			state: 'consulted',
			note: 'note',
		})
	})

	it('delta <folder> --round 2 with the round-1 snapshot and a later change → the diff lines of the fix', () => {
		const root = createScratchRepository({ 'a.ts': 'a\n' })
		writeFiles({ root, files: { 'a.ts': 'b\n' } })
		const folder = handoverFolder()
		expect(runLot({ cwd: root, argv: ['snapshot', folder, '--round', '1'] }).exitCode).toBe(0)
		writeFiles({ root, files: { 'a.ts': 'c\n' } })

		const result = runLot({ cwd: root, argv: ['delta', folder, '--round', '2'] })

		expect(result.exitCode).toBe(0)
		expect(result.output).toContain('a.ts')
		expect(result.output).toContain('-b\n+c')
	})

	it('delta <folder> --round 2 over a tab-indented source → the diff lines show the tab as four spaces, no \\u{9}', () => {
		const root = createScratchRepository({ 'a.ts': '\tb\n' })
		const folder = handoverFolder()
		expect(runLot({ cwd: root, argv: ['snapshot', folder, '--round', '1'] }).exitCode).toBe(0)
		writeFiles({ root, files: { 'a.ts': '\tc\n' } })

		const result = runLot({ cwd: root, argv: ['delta', folder, '--round', '2'] })

		expect(result.exitCode).toBe(0)
		expect(result.output).toContain('-    b\n+    c')
		expect(result.output).not.toContain('\\u{9}')
	})

	it('recap <folder> → the <details> block', () => {
		const root = createScratchRepository({
			'package.json': `${JSON.stringify({ name: 'scratch' })}\n`,
		})
		const folder = recapFolderPath()
		writeRecapFolder({ root, folder })

		const result = runLot({ cwd: dirname(folder), argv: ['recap', folder] })

		expect(result.exitCode).toBe(0)
		expect(result.output.startsWith('<details>')).toBe(true)
		expect(result.output).toContain('</details>')
	})

	it('decide on a folder without a ledger → the hint names lot finding, with the lot decide prefix', () => {
		const folder = handoverFolder()
		mkdirSync(folder, { recursive: true })

		const result = runLot({ cwd: folder, argv: ['decide', folder, 'R1-1', 'open'] })

		expect(result.exitCode).toBe(1)
		expect(result.output).toMatch(
			/^lot decide: no findings ledger .*lot finding writes the first finding/,
		)
	})

	it('snapshot outside a git work tree → the hint names lot snapshot, with the lot snapshot prefix', () => {
		const result = runLot({
			cwd: temporaryFolder('dialecte-lot-nogit-'),
			argv: ['snapshot', handoverFolder(), '--round', '1'],
		})

		expect(result.exitCode).toBe(1)
		expect(result.output).toMatch(/^lot snapshot: .*run lot snapshot inside/)
	})

	it('delta without the previous snapshot → the hints name lot snapshot --round 1, with the lot delta prefix', () => {
		const root = createScratchRepository({ 'a.ts': 'a\n' })
		const folder = handoverFolder()
		mkdirSync(folder, { recursive: true })
		const missingSnapshot = runLot({ cwd: root, argv: ['delta', folder, '--round', '2'] })
		mkdirSync(join(folder, 'round-1'))
		const missingDeleted = runLot({ cwd: root, argv: ['delta', folder, '--round', '2'] })

		expect(missingSnapshot.output).toMatch(
			/^lot delta: no snapshot .*lot snapshot --round 1 takes it/,
		)
		expect(missingDeleted.output).toMatch(/^lot delta: no .*lot snapshot --round 1 writes it/)
	})

	const usageCases: Record<string, { argv: string[] }> = {
		'lot alone': { argv: [] },
		'an unknown verb': { argv: ['nope'] },
	}
	for (const [title, usageCase] of Object.entries(usageCases))
		it(`${title} → usage, exit 2, listing every verb of the map's lot usage`, () => {
			const result = runLot({ cwd: temporaryFolder('dialecte-lot-usage-'), argv: usageCase.argv })

			const verbs = COMMAND_MAP.lot.usage.map(
				(line) => line.replace('dialecte lot ', '').split(' ')[0],
			)
			expect(result.exitCode).toBe(2)
			expect(verbs.length).toBeGreaterThan(0)
			expect(verbs.filter((verb) => !new RegExp(`\\b${verb}\\b`).test(result.output))).toEqual([])
		})

	for (const [title, usageCase] of Object.entries(usageCases))
		it(`${title} → the usage names every verb of the map's lot section with its argument shape`, () => {
			const result = runLot({ cwd: temporaryFolder('dialecte-lot-usage-'), argv: usageCase.argv })

			const declared = COMMAND_MAP.lot.usage.map((line) => line.replace('dialecte lot ', ''))
			expect(declared.length).toBeGreaterThan(0)
			expect(declared.filter((shape) => !result.output.includes(shape))).toEqual([])
		})
})
