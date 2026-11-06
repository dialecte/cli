import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	realpathSync,
	writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'

import {
	createScratchRepository,
	git,
	initializeRepository,
	temporaryFolder,
} from '../../test/scratch-repository.ts'
import { runRecord } from './record.ts'

import { describe, expect, it } from 'vitest'

const TABLE_HEAD =
	'| id | round | severity | file:line | finding | state |\n|---|---|---|---|---|---|\n'

/** A hand-over folder path named `lot`, outside every repository; not created. */
function handoverFolder(): string {
	return join(realpathSync(temporaryFolder('dialecte-record-')), 'lot')
}

function ledgerOf(folder: string): string {
	return join(folder, 'findings-ledger.md')
}

/** The ledger as `record review` first writes it for a folder named `lot`, then `rows`. */
function freshLedger(rows: string[]): string {
	return `# Findings ledger - lot\n\n${TABLE_HEAD}${rows.map((row) => `${row}\n`).join('')}`
}

/** A folder holding a ledger with `text`. */
function folderWithLedger(text: string): string {
	const folder = handoverFolder()
	mkdirSync(folder, { recursive: true })
	writeFileSync(ledgerOf(folder), text)
	return folder
}

/** The call of `record review`, run from the folder's parent. */
function reviewCall(params: {
	folder: string
	round: string
	severity: string
	at: string
	finding: string
}) {
	return {
		cwd: dirname(params.folder),
		argv: [
			'review',
			params.folder,
			'--round',
			params.round,
			'--severity',
			params.severity,
			'--at',
			params.at,
			params.finding,
		],
	}
}

/** Two findings of round 1 and a note after the table. */
const TWO_ROWS = freshLedger([
	'| R1-1 | 1 | blocking | src/a.ts:3 | the first | open |',
	'| R1-2 | 1 | nit | src/b.ts:9 | the second | open |',
]).concat('\nA note after the table.\n')

/** A hand-written ledger: an escaped pipe in a cell, a free state, extra text around. */
const HAND_WRITTEN = [
	'# Findings ledger - by hand',
	'',
	'Intro text.',
	'',
	'| id | round | severity | file:line | finding | state |',
	'|---|---|---|---|---|---|',
	'| R1-1 | 1 | blocking | src/a.ts:1 | first | open |',
	'| R1-2 | 1 | should fix | src/a.ts:12 thing | text with \\| pipe | fixed 3 (with R3-1) |',
	'',
	'## Notes',
	'',
	'kept as is',
	'',
].join('\n')

describe('dialecte record review', { timeout: 60_000 }, () => {
	it('no folder yet → the folder and its ledger are made: title, table, the row R<n>-1 open', () => {
		const folder = handoverFolder()

		expect(
			runRecord(
				reviewCall({
					folder,
					round: '1',
					severity: 'blocking',
					at: 'src/a.ts:3',
					finding: 'the first',
				}),
			),
		).toEqual({
			exitCode: 0,
			output: `lot finding: R1-1 open - ${ledgerOf(folder)}`,
		})
		expect(readFileSync(ledgerOf(folder), 'utf8')).toBe(
			freshLedger(['| R1-1 | 1 | blocking | src/a.ts:3 | the first | open |']),
		)
	})

	it('a second finding of the same round → R<n>-2, appended after the first row', () => {
		const folder = folderWithLedger(
			freshLedger(['| R1-1 | 1 | blocking | src/a.ts:3 | the first | open |']),
		)

		expect(
			runRecord(
				reviewCall({
					folder,
					round: '1',
					severity: 'nit',
					at: 'src/b.ts:9',
					finding: 'the second',
				}),
			),
		).toEqual({
			exitCode: 0,
			output: `lot finding: R1-2 open - ${ledgerOf(folder)}`,
		})
		expect(readFileSync(ledgerOf(folder), 'utf8')).toBe(
			freshLedger([
				'| R1-1 | 1 | blocking | src/a.ts:3 | the first | open |',
				'| R1-2 | 1 | nit | src/b.ts:9 | the second | open |',
			]),
		)
	})

	it('a finding of another round → numbered from 1 in that round', () => {
		const folder = folderWithLedger(
			freshLedger(['| R1-1 | 1 | blocking | src/a.ts:3 | the first | open |']),
		)

		expect(
			runRecord(
				reviewCall({ folder, round: '2', severity: 'nit', at: 'src/c.ts:1', finding: 'later' }),
			),
		).toEqual({
			exitCode: 0,
			output: `lot finding: R2-1 open - ${ledgerOf(folder)}`,
		})
		expect(readFileSync(ledgerOf(folder), 'utf8')).toBe(
			freshLedger([
				'| R1-1 | 1 | blocking | src/a.ts:3 | the first | open |',
				'| R2-1 | 2 | nit | src/c.ts:1 | later | open |',
			]),
		)
	})

	it('ids of the round with a gap (R1-3, R1-7) → the next is one past the highest (R1-8), not a count', () => {
		const folder = folderWithLedger(
			freshLedger([
				'| R1-7 | 1 | nit | src/a.ts:1 | seven | open |',
				'| R1-3 | 1 | nit | src/a.ts:2 | three | open |',
				'| R12-1 | 12 | nit | src/a.ts:4 | other round | open |',
			]),
		)

		expect(
			runRecord(
				reviewCall({ folder, round: '1', severity: 'nit', at: 'src/a.ts:5', finding: 'next' }),
			),
		).toEqual({
			exitCode: 0,
			output: `lot finding: R1-8 open - ${ledgerOf(folder)}`,
		})
	})

	it('a round of two digits (12) → R12-1, round cell 12', () => {
		const folder = handoverFolder()

		expect(
			runRecord(
				reviewCall({ folder, round: '12', severity: 'nit', at: 'src/a.ts:1', finding: 'late' }),
			),
		).toEqual({
			exitCode: 0,
			output: `lot finding: R12-1 open - ${ledgerOf(folder)}`,
		})
		expect(readFileSync(ledgerOf(folder), 'utf8')).toBe(
			freshLedger(['| R12-1 | 12 | nit | src/a.ts:1 | late | open |']),
		)
	})

	for (const [given, written] of [
		['blocking', 'blocking'],
		['should-fix', 'should fix'],
		['should fix', 'should fix'],
		['nit', 'nit'],
	])
		it(`--severity ${JSON.stringify(given)} → written ${JSON.stringify(written)}`, () => {
			const folder = handoverFolder()

			expect(
				runRecord(
					reviewCall({
						folder,
						round: '1',
						severity: given,
						at: 'src/a.ts:1',
						finding: 'a finding',
					}),
				),
			).toEqual({
				exitCode: 0,
				output: `lot finding: R1-1 open - ${ledgerOf(folder)}`,
			})
			expect(readFileSync(ledgerOf(folder), 'utf8')).toBe(
				freshLedger([`| R1-1 | 1 | ${written} | src/a.ts:1 | a finding | open |`]),
			)
		})

	it('notes after the table → the row goes right after the last row, the notes stay after it, every other byte kept', () => {
		const folder = folderWithLedger(TWO_ROWS)

		expect(
			runRecord(
				reviewCall({
					folder,
					round: '2',
					severity: 'should-fix',
					at: 'src/c.ts:4',
					finding: 'third',
				}),
			),
		).toEqual({
			exitCode: 0,
			output: `lot finding: R2-1 open - ${ledgerOf(folder)}`,
		})
		expect(readFileSync(ledgerOf(folder), 'utf8')).toBe(
			freshLedger([
				'| R1-1 | 1 | blocking | src/a.ts:3 | the first | open |',
				'| R1-2 | 1 | nit | src/b.ts:9 | the second | open |',
				'| R2-1 | 2 | should fix | src/c.ts:4 | third | open |',
			]).concat('\nA note after the table.\n'),
		)
	})

	it('a hand-written ledger (escaped pipe, free state, text around) → parsed: the next id of round 1 is R1-3, the row lands after R1-2', () => {
		const folder = folderWithLedger(HAND_WRITTEN)

		expect(
			runRecord(
				reviewCall({ folder, round: '1', severity: 'nit', at: 'src/z.ts:2', finding: 'more' }),
			),
		).toEqual({
			exitCode: 0,
			output: `lot finding: R1-3 open - ${ledgerOf(folder)}`,
		})
		expect(readFileSync(ledgerOf(folder), 'utf8')).toBe(
			HAND_WRITTEN.replace(
				'| fixed 3 (with R3-1) |\n',
				'| fixed 3 (with R3-1) |\n| R1-3 | 1 | nit | src/z.ts:2 | more | open |\n',
			),
		)
	})

	it('a hand-written ledger naming R3-1 only inside a state cell → record review --round 3 gives R3-1 (ids come from the id cells only)', () => {
		const folder = folderWithLedger(HAND_WRITTEN)

		expect(
			runRecord(
				reviewCall({
					folder,
					round: '3',
					severity: 'nit',
					at: 'src/z.ts:2',
					finding: 'third round',
				}),
			),
		).toEqual({ exitCode: 0, output: `lot finding: R3-1 open - ${ledgerOf(folder)}` })
		expect(readFileSync(ledgerOf(folder), 'utf8')).toBe(
			HAND_WRITTEN.replace(
				'| fixed 3 (with R3-1) |\n',
				'| fixed 3 (with R3-1) |\n| R3-1 | 3 | nit | src/z.ts:2 | third round | open |\n',
			),
		)
	})

	it('an empty ledger file → the title, the table and the row are written', () => {
		const folder = folderWithLedger('')

		expect(
			runRecord(
				reviewCall({ folder, round: '1', severity: 'nit', at: 'src/a.ts:1', finding: 'first' }),
			),
		).toEqual({
			exitCode: 0,
			output: `lot finding: R1-1 open - ${ledgerOf(folder)}`,
		})
		expect(readFileSync(ledgerOf(folder), 'utf8')).toBe(
			freshLedger(['| R1-1 | 1 | nit | src/a.ts:1 | first | open |']),
		)
	})

	it('a ledger file with text but no table → its text kept first, the table and the row appended, no title', () => {
		const folder = folderWithLedger('Some notes.\n')

		expect(
			runRecord(
				reviewCall({ folder, round: '1', severity: 'nit', at: 'src/a.ts:1', finding: 'first' }),
			),
		).toEqual({
			exitCode: 0,
			output: `lot finding: R1-1 open - ${ledgerOf(folder)}`,
		})
		const text = readFileSync(ledgerOf(folder), 'utf8')
		expect(text.startsWith('Some notes.\n')).toBe(true)
		expect(text.endsWith(`${TABLE_HEAD}| R1-1 | 1 | nit | src/a.ts:1 | first | open |\n`)).toBe(
			true,
		)
		expect(text.includes('# Findings ledger')).toBe(false)
	})

	it('a | in the finding and in --at → written \\|', () => {
		const folder = handoverFolder()

		expect(
			runRecord(
				reviewCall({ folder, round: '1', severity: 'nit', at: 'src/a|b.ts:1', finding: 'a | b' }),
			),
		).toEqual({
			exitCode: 0,
			output: `lot finding: R1-1 open - ${ledgerOf(folder)}`,
		})
		expect(readFileSync(ledgerOf(folder), 'utf8')).toBe(
			freshLedger(['| R1-1 | 1 | nit | src/a\\|b.ts:1 | a \\| b | open |']),
		)
	})

	it('a folder given relative → resolved against cwd', () => {
		const cwd = realpathSync(temporaryFolder('dialecte-record-'))
		const folder = join(cwd, 'hand', 'lot')

		expect(
			runRecord({
				cwd,
				argv: [
					'review',
					'hand/lot',
					'--round',
					'1',
					'--severity',
					'nit',
					'--at',
					'src/a.ts:1',
					'first',
				],
			}),
		).toEqual({ exitCode: 0, output: `lot finding: R1-1 open - ${ledgerOf(folder)}` })
		expect(readFileSync(ledgerOf(folder), 'utf8')).toBe(
			freshLedger(['| R1-1 | 1 | nit | src/a.ts:1 | first | open |']),
		)
	})

	for (const [label, change] of [
		['a finding with a line feed', { finding: 'one\ntwo' }],
		['a finding with a carriage return', { finding: 'one\rtwo' }],
		['--at with a line feed', { at: 'src/a.ts:1\nsrc/b.ts:2' }],
		['an empty finding', { finding: '' }],
		['an empty --at', { at: '' }],
		['an unknown severity', { severity: 'major' }],
	] as const)
		it(`${label} → usage error, exit 2, nothing written`, () => {
			const folder = handoverFolder()

			expect(
				runRecord(
					reviewCall({
						folder,
						round: '1',
						severity: 'nit',
						at: 'src/a.ts:1',
						finding: 'a finding',
						...change,
					}),
				),
			).toEqual({ exitCode: 2, output: expect.stringMatching(/^lot finding[^\n]*$/) })
			expect(existsSync(folder)).toBe(false)
		})

	for (const [label, argv] of [
		['no --severity', ['--round', '1', '--at', 'src/a.ts:1', 'a finding']],
		['no --at', ['--round', '1', '--severity', 'nit', 'a finding']],
		['no finding', ['--round', '1', '--severity', 'nit', '--at', 'src/a.ts:1']],
		[
			'two finding words',
			['--round', '1', '--severity', 'nit', '--at', 'src/a.ts:1', 'one', 'two'],
		],
		[
			'an unknown option',
			['--round', '1', '--severity', 'nit', '--at', 'src/a.ts:1', '--colour', 'red', 'a finding'],
		],
		['no --round', ['--severity', 'nit', '--at', 'src/a.ts:1', 'a finding']],
		['--round 0', ['--round', '0', '--severity', 'nit', '--at', 'src/a.ts:1', 'a finding']],
		['--round -1', ['--round', '-1', '--severity', 'nit', '--at', 'src/a.ts:1', 'a finding']],
		['--round 1.5', ['--round', '1.5', '--severity', 'nit', '--at', 'src/a.ts:1', 'a finding']],
		['--round x', ['--round', 'x', '--severity', 'nit', '--at', 'src/a.ts:1', 'a finding']],
	] as const)
		it(`${label} → a one-line usage, exit 2, nothing written`, () => {
			const folder = handoverFolder()

			expect(
				runRecord({ cwd: folder.replace(/\/lot$/, ''), argv: ['review', folder, ...argv] }),
			).toEqual({
				exitCode: 2,
				output: expect.stringMatching(/^lot finding[^\n]*$/),
			})
			expect(existsSync(folder)).toBe(false)
		})

	it('a folder inside a git work tree (not made yet) → refused, exit 1, nothing written', () => {
		const repository = createScratchRepository()
		const top = git({ root: repository, args: ['rev-parse', '--show-toplevel'] }).trim()
		const folder = join(repository, 'handover', 'lot')

		expect(
			runRecord({
				...reviewCall({
					folder,
					round: '1',
					severity: 'nit',
					at: 'src/a.ts:1',
					finding: 'a finding',
				}),
				cwd: repository,
			}),
		).toEqual({
			exitCode: 1,
			output: `lot finding: ${folder} is inside the repository ${top}: a hand-over folder stays outside every repository`,
		})
		expect(existsSync(join(repository, 'handover'))).toBe(false)
	})
})

describe('dialecte record decision', { timeout: 60_000 }, () => {
	/** The call of `record decision`. */
	function decisionCall(params: { folder: string; words: string[] }) {
		return { cwd: params.folder, argv: ['decision', params.folder, ...params.words] }
	}

	for (const [words, written] of [
		[['fix-to-verify'], 'fix to verify'],
		[['fixed', '2'], 'fixed 2'],
		[['fixed', '3', 'with R3-1'], 'fixed 3 (with R3-1)'],
		[['accepted', 'out of scope'], 'accepted (out of scope)'],
		[['logged', 'CORE_BACKLOG'], 'logged (CORE_BACKLOG)'],
	] as const)
		it(`${words.join(' ')} → state cell "${written}", every other byte kept`, () => {
			const folder = folderWithLedger(TWO_ROWS)

			expect(runRecord(decisionCall({ folder, words: ['R1-2', ...words] }))).toEqual({
				exitCode: 0,
				output: `lot decide: R1-2 ${written} - ${ledgerOf(folder)}`,
			})
			expect(readFileSync(ledgerOf(folder), 'utf8')).toBe(
				TWO_ROWS.replace(
					'| R1-2 | 1 | nit | src/b.ts:9 | the second | open |',
					`| R1-2 | 1 | nit | src/b.ts:9 | the second | ${written} |`,
				),
			)
		})

	it('open on a hand-written row (escaped pipe in its finding, a free state) → only its state cell changes', () => {
		const folder = folderWithLedger(HAND_WRITTEN)

		expect(runRecord(decisionCall({ folder, words: ['R1-2', 'open'] }))).toEqual({
			exitCode: 0,
			output: `lot decide: R1-2 open - ${ledgerOf(folder)}`,
		})
		expect(readFileSync(ledgerOf(folder), 'utf8')).toBe(
			HAND_WRITTEN.replace(
				'| text with \\| pipe | fixed 3 (with R3-1) |',
				'| text with \\| pipe | open |',
			),
		)
	})

	it('a | in a note → written \\|', () => {
		const folder = folderWithLedger(TWO_ROWS)

		expect(runRecord(decisionCall({ folder, words: ['R1-1', 'accepted', 'a | b'] }))).toEqual({
			exitCode: 0,
			output: expect.stringMatching(/^lot decide: R1-1 accepted \(a \\?\| b\) - /),
		})
		expect(readFileSync(ledgerOf(folder), 'utf8')).toBe(
			TWO_ROWS.replace('| the first | open |', '| the first | accepted (a \\| b) |'),
		)
	})

	for (const [label, words] of [
		['fixed in the round that raised it', ['fixed', '1']],
		['fixed 0', ['fixed', '0']],
		['fixed x', ['fixed', 'x']],
		['fixed without a round', ['fixed']],
		['accepted without a reason', ['accepted']],
		['accepted with an empty reason', ['accepted', '']],
		['logged without where', ['logged']],
		['logged with an empty where', ['logged', '']],
	] as const)
		it(`${label} → usage error, exit 2, the ledger unchanged`, () => {
			const folder = folderWithLedger(TWO_ROWS)

			expect(runRecord(decisionCall({ folder, words: ['R1-1', ...words] }))).toEqual({
				exitCode: 2,
				output: expect.stringMatching(/^lot decide[^\n]*$/),
			})
			expect(readFileSync(ledgerOf(folder), 'utf8')).toBe(TWO_ROWS)
		})

	it('an unknown state word → exit 2 listing the states, the ledger unchanged', () => {
		const folder = folderWithLedger(TWO_ROWS)

		expect(runRecord(decisionCall({ folder, words: ['R1-1', 'done'] }))).toEqual({
			exitCode: 2,
			output: expect.stringMatching(
				/^lot decide(?=[\s\S]*\bopen\b)(?=[\s\S]*fix-to-verify)(?=[\s\S]*\bfixed\b)(?=[\s\S]*\baccepted\b)(?=[\s\S]*\blogged\b)/,
			),
		})
		expect(readFileSync(ledgerOf(folder), 'utf8')).toBe(TWO_ROWS)
	})

	it('no state at all → usage error, exit 2', () => {
		const folder = folderWithLedger(TWO_ROWS)

		expect(runRecord(decisionCall({ folder, words: ['R1-1'] }))).toEqual({
			exitCode: 2,
			output: expect.stringMatching(/^lot decide/),
		})
		expect(readFileSync(ledgerOf(folder), 'utf8')).toBe(TWO_ROWS)
	})

	it('an id named only inside a state cell (R3-1 in a hand-written ledger) → unknown id, exit 1, the ledger unchanged', () => {
		const folder = folderWithLedger(HAND_WRITTEN)

		expect(runRecord(decisionCall({ folder, words: ['R3-1', 'open'] }))).toEqual({
			exitCode: 1,
			output: 'lot decide: unknown finding id R3-1; the ledger holds R1-1, R1-2',
		})
		expect(readFileSync(ledgerOf(folder), 'utf8')).toBe(HAND_WRITTEN)
	})

	it('R1-10 above R1-1 → a decision on R1-1 changes only the R1-1 row (ids match whole, not as a prefix)', () => {
		const text = freshLedger([
			'| R1-10 | 1 | nit | src/a.ts:10 | tenth | open |',
			'| R1-1 | 1 | nit | src/a.ts:1 | first | open |',
		])
		const folder = folderWithLedger(text)

		expect(runRecord(decisionCall({ folder, words: ['R1-1', 'fixed', '2'] }))).toEqual({
			exitCode: 0,
			output: `lot decide: R1-1 fixed 2 - ${ledgerOf(folder)}`,
		})
		expect(readFileSync(ledgerOf(folder), 'utf8')).toBe(
			text.replace('| src/a.ts:1 | first | open |', '| src/a.ts:1 | first | fixed 2 |'),
		)
	})

	it('fixed 3 on a row of round 12 → exit 2 (the round is compared as a number), the ledger unchanged', () => {
		const text = freshLedger(['| R12-1 | 12 | nit | src/a.ts:1 | late | open |'])
		const folder = folderWithLedger(text)

		expect(runRecord(decisionCall({ folder, words: ['R12-1', 'fixed', '3'] }))).toEqual({
			exitCode: 2,
			output: expect.stringMatching(/^lot decide[^\n]*$/),
		})
		expect(readFileSync(ledgerOf(folder), 'utf8')).toBe(text)
	})

	it('fixed 13 on a row of round 12 → written fixed 13', () => {
		const text = freshLedger(['| R12-1 | 12 | nit | src/a.ts:1 | late | open |'])
		const folder = folderWithLedger(text)

		expect(runRecord(decisionCall({ folder, words: ['R12-1', 'fixed', '13'] }))).toEqual({
			exitCode: 0,
			output: `lot decide: R12-1 fixed 13 - ${ledgerOf(folder)}`,
		})
		expect(readFileSync(ledgerOf(folder), 'utf8')).toBe(
			text.replace('| late | open |', '| late | fixed 13 |'),
		)
	})

	it('an id not in the ledger → refused naming the ids it holds, exit 1, the ledger unchanged', () => {
		const folder = folderWithLedger(TWO_ROWS)

		expect(runRecord(decisionCall({ folder, words: ['R9-9', 'open'] }))).toEqual({
			exitCode: 1,
			output: 'lot decide: unknown finding id R9-9; the ledger holds R1-1, R1-2',
		})
		expect(readFileSync(ledgerOf(folder), 'utf8')).toBe(TWO_ROWS)
	})

	it('no ledger in the folder → refused, exit 1, nothing written', () => {
		const folder = handoverFolder()
		mkdirSync(folder)

		expect(runRecord(decisionCall({ folder, words: ['R1-1', 'open'] }))).toEqual({
			exitCode: 1,
			output: expect.stringMatching(/^lot decide: /),
		})
		expect(readdirSync(folder)).toEqual([])
	})

	it('a folder inside a git work tree → refused, exit 1, the ledger there unchanged', () => {
		const repository = createScratchRepository()
		const top = git({ root: repository, args: ['rev-parse', '--show-toplevel'] }).trim()
		const folder = join(repository, 'handover')
		mkdirSync(folder)
		writeFileSync(ledgerOf(folder), TWO_ROWS)

		expect(runRecord(decisionCall({ folder, words: ['R1-1', 'open'] }))).toEqual({
			exitCode: 1,
			output: `lot decide: ${folder} is inside the repository ${top}: a hand-over folder stays outside every repository`,
		})
		expect(readFileSync(ledgerOf(folder), 'utf8')).toBe(TWO_ROWS)
	})
})

describe('dialecte record - a hand-over folder inside a git folder', { timeout: 60_000 }, () => {
	/** A repository at a real path (git and the test spell it alike) and its git folder as git prints it. */
	function repositoryWithGitFolder(): { repository: string; gitFolder: string } {
		const repository = initializeRepository({
			root: join(realpathSync(temporaryFolder('dialecte-record-')), 'repo'),
		})
		return {
			repository,
			gitFolder: git({ root: repository, args: ['rev-parse', '--absolute-git-dir'] }).trim(),
		}
	}

	it('record review into <repo>/.git/handover → refused naming the git folder, exit 1, nothing written', () => {
		const { repository, gitFolder } = repositoryWithGitFolder()
		const folder = join(repository, '.git', 'handover')

		expect(
			runRecord({
				...reviewCall({ folder, round: '1', severity: 'nit', at: 'a.ts:1', finding: 'a finding' }),
				cwd: repository,
			}),
		).toEqual({
			exitCode: 1,
			output: `lot finding: ${folder} is inside the git folder ${gitFolder}: a hand-over folder stays outside every repository`,
		})
		expect(existsSync(folder)).toBe(false)
	})

	it('record decision on a ledger in <repo>/.git/handover → refused naming the git folder, exit 1, the ledger unchanged', () => {
		const { repository, gitFolder } = repositoryWithGitFolder()
		const folder = join(repository, '.git', 'handover')
		mkdirSync(folder)
		writeFileSync(ledgerOf(folder), TWO_ROWS)

		expect(
			runRecord({ cwd: repository, argv: ['decision', folder, 'R1-1', 'fixed', '2'] }),
		).toEqual({
			exitCode: 1,
			output: `lot decide: ${folder} is inside the git folder ${gitFolder}: a hand-over folder stays outside every repository`,
		})
		expect(readFileSync(ledgerOf(folder), 'utf8')).toBe(TWO_ROWS)
	})
})

describe('dialecte record - a CRLF ledger', { timeout: 60_000 }, () => {
	const CRLF_LEDGER = freshLedger(['| R1-1 | 1 | blocking | a.ts:1 | first | open |'])
		.concat('\nA note.\n')
		.replace(/\n/g, '\r\n')

	it('record review on a CRLF ledger → every \\r of the file kept, the row after the last row, the note after it', () => {
		const folder = folderWithLedger(CRLF_LEDGER)
		const throughLastRow = CRLF_LEDGER.slice(0, CRLF_LEDGER.indexOf('\r\nA note.'))

		expect(
			runRecord(
				reviewCall({ folder, round: '1', severity: 'nit', at: 'a.ts:2', finding: 'second' }),
			),
		).toEqual({ exitCode: 0, output: `lot finding: R1-2 open - ${ledgerOf(folder)}` })
		const text = readFileSync(ledgerOf(folder), 'utf8')
		expect(text.startsWith(throughLastRow)).toBe(true)
		expect(text.endsWith('\r\nA note.\r\n')).toBe(true)
		expect(text.slice(throughLastRow.length)).toMatch(
			/^\| R1-2 \| 1 \| nit \| a\.ts:2 \| second \| open \|\r?\n\r\nA note\.\r\n$/,
		)
	})

	it('record decision on a CRLF ledger → only the state cell changes, every \\r kept', () => {
		const folder = folderWithLedger(CRLF_LEDGER)

		expect(runRecord({ cwd: folder, argv: ['decision', folder, 'R1-1', 'fixed', '2'] })).toEqual({
			exitCode: 0,
			output: `lot decide: R1-1 fixed 2 - ${ledgerOf(folder)}`,
		})
		expect(readFileSync(ledgerOf(folder), 'utf8')).toBe(
			CRLF_LEDGER.replace('| first | open |\r\n', '| first | fixed 2 |\r\n'),
		)
	})
})

describe('dialecte record - -- ends the options', { timeout: 60_000 }, () => {
	it('record review ... -- "--x is wrong" → the finding --x is wrong is written', () => {
		const folder = handoverFolder()

		expect(
			runRecord({
				cwd: dirname(folder),
				argv: [
					'review',
					folder,
					'--round',
					'1',
					'--severity',
					'nit',
					'--at',
					'a.ts:1',
					'--',
					'--x is wrong',
				],
			}),
		).toEqual({ exitCode: 0, output: `lot finding: R1-1 open - ${ledgerOf(folder)}` })
		expect(readFileSync(ledgerOf(folder), 'utf8')).toBe(
			freshLedger(['| R1-1 | 1 | nit | a.ts:1 | --x is wrong | open |']),
		)
	})

	it('record review with the folder after -- → read as the folder', () => {
		const folder = handoverFolder()

		expect(
			runRecord({
				cwd: dirname(folder),
				argv: [
					'review',
					'--round',
					'1',
					'--severity',
					'nit',
					'--at',
					'a.ts:1',
					'--',
					folder,
					'a finding',
				],
			}),
		).toEqual({ exitCode: 0, output: `lot finding: R1-1 open - ${ledgerOf(folder)}` })
	})

	it('record decision <id> accepted -- "--y" → written accepted (--y)', () => {
		const folder = folderWithLedger(TWO_ROWS)

		expect(
			runRecord({ cwd: folder, argv: ['decision', folder, 'R1-1', 'accepted', '--', '--y'] }),
		).toEqual({ exitCode: 0, output: `lot decide: R1-1 accepted (--y) - ${ledgerOf(folder)}` })
		expect(readFileSync(ledgerOf(folder), 'utf8')).toBe(
			TWO_ROWS.replace('| the first | open |', '| the first | accepted (--y) |'),
		)
	})

	it('record review with a finding starting with -- and no -- before it → an unknown option, exit 2, nothing written', () => {
		const folder = handoverFolder()

		expect(
			runRecord({
				cwd: dirname(folder),
				argv: ['review', folder, '--round', '1', '--severity', 'nit', '--at', 'a.ts:1', '--x'],
			}),
		).toEqual({ exitCode: 2, output: expect.stringMatching(/^lot finding[^\n]*$/) })
		expect(existsSync(folder)).toBe(false)
	})

	it('record decision <id> accepted --y without -- → an unknown option, exit 2, the ledger unchanged', () => {
		const folder = folderWithLedger(TWO_ROWS)

		expect(
			runRecord({ cwd: folder, argv: ['decision', folder, 'R1-1', 'accepted', '--y'] }),
		).toEqual({ exitCode: 2, output: expect.stringMatching(/^lot decide[^\n]*$/) })
		expect(readFileSync(ledgerOf(folder), 'utf8')).toBe(TWO_ROWS)
	})
})
