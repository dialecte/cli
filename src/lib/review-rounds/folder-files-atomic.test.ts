import { mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { WRITABLE_MODE } from '../../../test/replacement-observer.constants.ts'
import {
	observeReplacement,
	publishedFromTemporary,
	temporariesLeftBeside,
} from '../../../test/replacement-observer.ts'
import { temporaryFolder } from '../../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { runRecordVerb } from '../../commands/record.ts'
import { STANDARD_FILE } from '../standard/standard.constants.ts'
import { appendDecision } from './decisions-file.ts'
import { appendFinding, appendTableRow, findTable } from './findings-ledger.ts'
import { FIXED_NOW, LEDGER_ROW, PLAIN_TABLE_HEAD } from './folder-files-atomic.constants.ts'
import {
	DECISIONS_FILE,
	DECISIONS_TABLE_HEAD,
	LEDGER_FILE,
	LEDGER_TABLE_HEAD,
} from './review-rounds.constants.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { InterruptedWriteParams, SeedParams } from './folder-files-atomic.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** A hand-over folder named `lot`, made, outside every repository; XDG_STATE_HOME is the test's own. */
function handoverFolder(): string {
	vi.stubEnv('XDG_STATE_HOME', temporaryFolder('dialecte-state-'))
	const folder = join(realpathSync(temporaryFolder('dialecte-atomic-')), 'lot')
	mkdirSync(folder, { recursive: true })
	return folder
}

/**
 * What a reader of the final name sees when the writer is stopped between its temporary file and the rename:
 * `before` (undefined: no file yet), and the whole expected text waiting in a temporary of the file's own name.
 */
function interruptedWrite(params: InterruptedWriteParams) {
	return [
		{
			temporaryIsOwn: true,
			temporaryBytes: Buffer.from(params.expected),
			temporaryMode: WRITABLE_MODE,
			finalBytes: params.before === undefined ? undefined : Buffer.from(params.before),
		},
	]
}

/** Writes `before` at `path` when it is a text; an absent file otherwise. */
function seed(params: SeedParams): void {
	if (params.before !== undefined) writeFileSync(params.path, params.before)
}

const TABLE_CASES = [
	{
		name: 'a file holding the table → the row right after the last row, the rest kept',
		before: '# T\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\nnotes\n',
		expected: '# T\n\n| a | b |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |\n\nnotes\n',
	},
	{
		name: 'a file without the table → the header and the row at its end',
		before: 'intro',
		expected: 'intro\n\n| a | b |\n|---|---|\n| 3 | 4 |\n',
	},
	{
		name: 'an empty file → the title, the header and the row',
		before: '',
		expected: '# New\n\n| a | b |\n|---|---|\n| 3 | 4 |\n',
	},
	{
		name: 'an absent file → the title, the header and the row, nothing at the name until the rename',
		before: undefined,
		expected: '# New\n\n| a | b |\n|---|---|\n| 3 | 4 |\n',
	},
]

describe('appendTableRow replaces the file whole', { timeout: STORE_CASE_TIMEOUT }, () => {
	it.each(TABLE_CASES)('$name', ({ before, expected }) => {
		const path = join(handoverFolder(), 'table.md')
		seed({ path, before })
		const lines = (before ?? '').split('\n')
		const observer = observeReplacement({ path })

		expect(
			appendTableRow({
				path,
				lines,
				table: findTable({ lines, firstCell: 'a' }),
				title: '# New',
				head: PLAIN_TABLE_HEAD,
				row: '| 3 | 4 |',
				afterTemporaryWritten: observer.seam,
			}),
		).toBeUndefined()

		expect(observer.observations).toEqual(interruptedWrite({ before, expected }))
		expect(readFileSync(path)).toEqual(Buffer.from(expected))
		expect(publishedFromTemporary({ observer, path })).toBe(true)
		expect(temporariesLeftBeside(path)).toEqual([])
	})
})

describe(
	'appendFinding and appendDecision replace the file whole',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		it.each([
			{
				name: 'no ledger yet',
				before: undefined,
				expected: `# Findings ledger - lot\n\n${LEDGER_TABLE_HEAD}| R1-1 | 1 | blocking | a.ts:1 | the finding | open |\n`,
				id: 'R1-1',
			},
			{
				name: 'a ledger holding R1-1',
				before: `# Findings ledger - lot\n\n${LEDGER_TABLE_HEAD}${LEDGER_ROW}\n`,
				expected: `# Findings ledger - lot\n\n${LEDGER_TABLE_HEAD}${LEDGER_ROW}\n| R1-2 | 1 | blocking | a.ts:1 | the finding | open |\n`,
				id: 'R1-2',
			},
		])(
			'appendFinding, $name → the whole ledger waits in a temporary, the id answered',
			({ before, expected, id }) => {
				const path = join(handoverFolder(), LEDGER_FILE)
				seed({ path, before })
				const observer = observeReplacement({ path })

				expect(
					appendFinding({
						path,
						title: 'lot',
						round: 1,
						severity: 'blocking',
						at: 'a.ts:1',
						finding: 'the finding',
						afterTemporaryWritten: observer.seam,
					}),
				).toBe(id)

				expect(observer.observations).toEqual(interruptedWrite({ before, expected }))
				expect(readFileSync(path)).toEqual(Buffer.from(expected))
				expect(publishedFromTemporary({ observer, path })).toBe(true)
				expect(temporariesLeftBeside(path)).toEqual([])
			},
		)

		it.each([
			{
				name: 'no decisions file yet',
				before: undefined,
				expected: `# Decisions - lot\n\n${DECISIONS_TABLE_HEAD}| keep it | Ada | 2026-11-08 |\n`,
			},
			{
				name: 'a decisions file holding a row',
				before: `# Decisions - lot\n\n${DECISIONS_TABLE_HEAD}| split | Grace | 2026-11-01 |\n`,
				expected: `# Decisions - lot\n\n${DECISIONS_TABLE_HEAD}| split | Grace | 2026-11-01 |\n| keep it | Ada | 2026-11-08 |\n`,
			},
		])('appendDecision, $name → the whole file waits in a temporary', ({ before, expected }) => {
			const path = join(handoverFolder(), DECISIONS_FILE)
			seed({ path, before })
			const observer = observeReplacement({ path })

			expect(
				appendDecision({
					path,
					title: 'lot',
					decision: 'keep it',
					by: 'Ada',
					when: '2026-11-08',
					afterTemporaryWritten: observer.seam,
				}),
			).toBeUndefined()

			expect(observer.observations).toEqual(interruptedWrite({ before, expected }))
			expect(readFileSync(path)).toEqual(Buffer.from(expected))
			expect(publishedFromTemporary({ observer, path })).toBe(true)
			expect(temporariesLeftBeside(path)).toEqual([])
		})
	},
)

describe('the lot verbs replace their folder file whole', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('lot decide → the ledger with one state cell rewritten waits whole in a temporary, the old ledger readable until the rename', () => {
		const folder = handoverFolder()
		const path = join(folder, LEDGER_FILE)
		const before = `# Findings ledger - lot\n\n${LEDGER_TABLE_HEAD}${LEDGER_ROW}\n`
		const expected = `# Findings ledger - lot\n\n${LEDGER_TABLE_HEAD}| R1-1 | 1 | blocking | a.ts:1 | the first | fixed 2 |\n`
		writeFileSync(path, before)
		const observer = observeReplacement({ path })

		expect(
			runRecordVerb({
				verb: 'decide',
				cwd: folder,
				argv: [folder, 'R1-1', 'fixed', '2'],
				afterTemporaryWritten: observer.seam,
			}),
		).toMatchObject({ exitCode: 0 })

		expect(observer.observations).toEqual(interruptedWrite({ before, expected }))
		expect(readFileSync(path)).toEqual(Buffer.from(expected))
		expect(publishedFromTemporary({ observer, path })).toBe(true)
		expect(temporariesLeftBeside(path)).toEqual([])
	})

	it.each([
		{
			name: 'no decisions file yet',
			before: undefined,
			expected: `# Decisions - lot\n\n${DECISIONS_TABLE_HEAD}| keep it | Ada | 2026-11-08 |\n`,
		},
		{
			name: 'a decisions file holding a row',
			before: `# Decisions - lot\n\n${DECISIONS_TABLE_HEAD}| split | Grace | 2026-11-01 |\n`,
			expected: `# Decisions - lot\n\n${DECISIONS_TABLE_HEAD}| split | Grace | 2026-11-01 |\n| keep it | Ada | 2026-11-08 |\n`,
		},
	])('lot choice, $name → decisions.md waits whole in a temporary', ({ before, expected }) => {
		const folder = handoverFolder()
		const path = join(folder, DECISIONS_FILE)
		seed({ path, before })
		const observer = observeReplacement({ path })

		expect(
			runRecordVerb({
				verb: 'choice',
				cwd: folder,
				argv: [folder, '--by', 'Ada', 'keep it'],
				now: FIXED_NOW,
				afterTemporaryWritten: observer.seam,
			}),
		).toMatchObject({ exitCode: 0 })

		expect(observer.observations).toEqual(interruptedWrite({ before, expected }))
		expect(readFileSync(path)).toEqual(Buffer.from(expected))
		expect(publishedFromTemporary({ observer, path })).toBe(true)
		expect(temporariesLeftBeside(path)).toEqual([])
	})

	it.each([
		{ name: 'no standard.json yet', before: undefined },
		{ name: 'a standard.json of an earlier word', before: '{\n  "state": "not-consulted"\n}\n' },
	])('lot standard, $name → standard.json waits whole in a temporary', ({ before }) => {
		const folder = handoverFolder()
		const path = join(folder, STANDARD_FILE)
		seed({ path, before })
		const expected = `${JSON.stringify(
			{ state: 'consulted', note: 'read the section', at: FIXED_NOW.toISOString() },
			null,
			2,
		)}\n`
		const observer = observeReplacement({ path })

		expect(
			runRecordVerb({
				verb: 'standard',
				cwd: folder,
				argv: [folder, 'consulted', 'read the section'],
				now: FIXED_NOW,
				afterTemporaryWritten: observer.seam,
			}),
		).toMatchObject({ exitCode: 0 })

		expect(observer.observations).toEqual(interruptedWrite({ before, expected }))
		expect(readFileSync(path)).toEqual(Buffer.from(expected))
		expect(publishedFromTemporary({ observer, path })).toBe(true)
		expect(temporariesLeftBeside(path)).toEqual([])
	})
})
