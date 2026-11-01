import { mkdirSync, realpathSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { gitPathOf } from '../../test/gate-records.ts'
import {
	git,
	initializeRepository,
	temporaryFolder,
	writeFiles,
} from '../../test/scratch-repository.ts'
import { computeStateHash } from '../lib/gate-records/state-hash.ts'
import { readHandoverFolder } from '../lib/handover/read-handover-folder.ts'
import { BRANCH_REWRITTEN } from '../lib/recap/recap.constants.ts'
import { runRecap } from './recap.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type {
	GateRecord,
	RecordedStep,
	RulesRecord,
} from '../lib/gate-records/gate-records.types.ts'
import type { CaseStatus, LotCaseEntry } from '../lib/tdd/tdd.types.ts'

const USER_NAME = 'Ada Lovelace'
const USER_EMAIL = 'ada@example.com'

const RECAP_USAGE = 'recap: expected <hand-over folder>'

const LEDGER_HEAD =
	'# Findings ledger - lot\n\n| id | round | severity | file:line | finding | state |\n|---|---|---|---|---|---|\n'

const DECISIONS_HEAD = '# Decisions - lot\n\n| decision | by | when |\n|---|---|---|\n'

/** The three lots of every scenario: their paths, their message, the files they hold. */
const LOTS: Array<{ paths: string[]; message: string; files: Record<string, string> }> = [
	{
		paths: ['src/read.ts', 'src/read.test.ts'],
		message: 'feat: read the thing\n\nWhy it matters.',
		files: { 'src/read.ts': 'export const read = 1\n', 'src/read.test.ts': '// read\n' },
	},
	{
		paths: ['src/write.ts', 'src/write.test.ts'],
		message: 'fix: write the thing',
		files: { 'src/write.ts': 'export const write = 1\n', 'src/write.test.ts': '// write\n' },
	},
	{
		paths: ['docs/'],
		message: 'docs: describe it',
		files: { 'docs/guide.md': '# Guide\n' },
	},
]

const LOT_FILES = LOTS.flatMap((lot) => Object.keys(lot.files)).sort()

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/**
 * Git reads no global nor system config for the rest of the test: the user name comes from the repository
 * (or the folder) the test sets it in, never from the machine's own config.
 */
function isolateGitConfig(): void {
	const file = join(temporaryFolder('dialecte-recap-config-'), 'gitconfig')
	writeFileSync(file, '')
	vi.stubEnv('GIT_CONFIG_GLOBAL', file)
	vi.stubEnv('GIT_CONFIG_NOSYSTEM', '1')
}

function headOf(root: string): string {
	return git({ root, args: ['rev-parse', 'HEAD'] }).trim()
}

/** A hand-over folder path named `lot`, outside every repository; not created. */
function handoverFolderPath(): string {
	return join(realpathSync(temporaryFolder('dialecte-recap-')), 'lot')
}

/** A hand-over folder as `dialecte handover` writes it: the lots file and the snapshot files. */
function writeHandoverFolder(params: {
	folder: string
	repository: string
	head: string
	gates?: string
}): void {
	const { folder } = params
	mkdirSync(folder, { recursive: true })
	writeFileSync(
		join(folder, 'lots.json'),
		JSON.stringify(
			{
				repository: params.repository,
				branch: 'main',
				head: params.head,
				...(params.gates && { gates: params.gates }),
				lots: LOTS.map((lot) => ({ paths: lot.paths, message: lot.message })),
			},
			null,
			2,
		),
	)
	writeFileSync(join(folder, 'files.txt'), LOT_FILES.map((file) => `${file}\n`).join(''))
	writeFileSync(
		join(folder, 'files.sha256'),
		LOT_FILES.map((file) => `${'0'.repeat(64)}  ${file}\n`).join(''),
	)
	writeFileSync(join(folder, 'files.deleted'), '')
	writeFileSync(join(folder, 'lots.sha256'), `${'0'.repeat(64)}\n`)
}

/**
 * The repository (user Ada Lovelace) with the first `committed` lots committed on `main`, each carrying its
 * lot's message and exactly its paths, the other lots' files in the working tree; and its hand-over folder,
 * recorded at the commit before the lots. Run from the folder's parent, outside the repository.
 */
function prepareScenario(params: { committed: number; gates?: string }) {
	isolateGitConfig()
	const root = initializeRepository({
		root: join(realpathSync(temporaryFolder('dialecte-recap-repo-')), 'repo'),
	})
	git({ root, args: ['config', 'user.name', USER_NAME] })
	git({ root, args: ['config', 'user.email', USER_EMAIL] })
	const head = headOf(root)
	const commits = LOTS.slice(0, params.committed).map(function commitLot(lot) {
		writeFiles({ root, files: lot.files })
		git({ root, args: ['add', '--', ...lot.paths] })
		git({ root, args: ['commit', '-q', '-m', lot.message] })
		return headOf(root)
	})
	for (const lot of LOTS.slice(params.committed)) writeFiles({ root, files: lot.files })
	const folder = handoverFolderPath()
	writeHandoverFolder({ folder, repository: root, head, gates: params.gates })
	return { root, folder, head, commits, cwd: dirname(folder) }
}

function writeGateRecord(params: {
	root: string
	mode: 'fast' | 'full'
	at: string
	stateHash: string
	steps: RecordedStep[]
}): void {
	const record: GateRecord = {
		mode: params.mode,
		at: params.at,
		head: headOf(params.root),
		stateHash: params.stateHash,
		steps: params.steps,
	}
	writeFileSync(
		gitPathOf({ root: params.root, name: `dialecte-gate-${params.mode}.json` }),
		JSON.stringify(record, null, 2),
	)
}

function writeRulesRecord(params: {
	root: string
	stateHash: string
	errors: number
	warnings: number
}): void {
	const record: RulesRecord = {
		at: '2026-11-01T10:00:00.000Z',
		head: headOf(params.root),
		stateHash: params.stateHash,
		files: LOT_FILES,
		errors: params.errors,
		warnings: params.warnings,
	}
	writeFileSync(
		gitPathOf({ root: params.root, name: 'dialecte-rules.json' }),
		JSON.stringify(record, null, 2),
	)
}

/** A tdd step judging `cases` (label → status). */
function tddStep(cases: Record<string, CaseStatus>): RecordedStep {
	return {
		name: 'tdd',
		status: 'passed',
		counts: {},
		note: 'every case proven',
		cases: Object.entries(cases).map(([label, status]) => ({ label, status })),
	}
}

function writeLotDeclaration(params: {
	path: string
	accept?: LotCaseEntry[]
	revised?: LotCaseEntry[]
}): void {
	mkdirSync(dirname(params.path), { recursive: true })
	writeFileSync(
		params.path,
		JSON.stringify({
			...(params.accept && { accept: params.accept }),
			...(params.revised && { revised: params.revised }),
		}),
	)
}

function writeLedger(params: { folder: string; rows: string[] }): void {
	writeFileSync(
		join(params.folder, 'findings-ledger.md'),
		`${LEDGER_HEAD}${params.rows.map((row) => `${row}\n`).join('')}`,
	)
}

/** The recap as the brief shapes it, from each section's lines and the user. */
function recapText(params: {
	commits: string[]
	tests: string[]
	checks: string[]
	review: string[]
	decisions: string[]
	followUps: string[]
	user: string
}): string {
	return [
		'<details>',
		'<summary>How this change was made</summary>',
		'',
		'### Commits',
		...params.commits,
		'',
		'### Tests added',
		...params.tests,
		'',
		'### Checks',
		...params.checks,
		'',
		'### Review',
		...params.review,
		'',
		'### Decisions',
		...params.decisions,
		'',
		'### Follow-ups',
		...params.followUps,
		'',
		`Prepared with an AI assistant, reviewed and posted by ${params.user}.`,
		'',
		'</details>',
	].join('\n')
}

/** A line of `recapText` matched by any text: a part of the brief's shape these tests leave open. */
const ANY_LINE = '\u0000any line\u0000'

/** `text` as an anchored pattern, each ANY_LINE matching one line of any text. */
function recapPattern(text: string): RegExp {
	return new RegExp(`^${escapeRegExp(text).split(escapeRegExp(ANY_LINE)).join('[^\\n]*')}$`)
}

/** The commit lines of the scenario: `<sha 7>` and the subject for each committed lot, the rest not committed. */
function commitLines(commits: string[]): string[] {
	return LOTS.map(function commitLine(lot, index) {
		const subject = lot.message.split('\n')[0]
		const commit = commits[index]
		return commit ? `- \`${commit.slice(0, 7)}\` ${subject}` : `- not committed yet: ${subject}`
	})
}

/** Every record of the full scenario: two lots committed, gate and rules records, ledger, lot file, decisions. */
function prepareFullScenario() {
	const scenario = prepareScenario({
		committed: 2,
		gates: 'fast and full green, see /Users/someone/plans/LOT-PLAN.md',
	})
	const { root, folder } = scenario
	writeLedger({
		folder,
		rows: [
			'| R1-1 | 1 | blocking | src/read.ts:3 | reads past the end | fixed 2 |',
			'| R1-2 | 1 | should fix | src/write.ts:9 | a \\| b mixed up | accepted (the caller (always) checks first) |',
			'| R1-3 | 1 | nit | src/read.ts:1 | name too short | logged (plans/FOLLOW-UPS.md) |',
			'| R1-4 | 1 | nit | src/write.ts:2 | comment stale | open |',
			'| R2-1 | 2 | blocking | src/write.ts:12 | error swallowed | fix to verify |',
			'| R2-2 | 2 | should fix | src/read.ts:20 | slow loop | fixed 3 (with R2-1) |',
			'| R2-3 | 2 | nit | src/read.ts:30 | log noise | logged (/Users/someone/notes.md) |',
			'| R2-4 | 2 | nit | src/write.ts:40 | odd spacing | reopened in round 3 |',
			'| R2-5 | 2 | nit | src/write.ts:41 | double blank line | fix-to-verify |',
		],
	})
	writeLotDeclaration({
		path: join(folder, 'lot.json'),
		accept: [{ case: 'src/write.test.ts::write > pinned', reason: 'pins behaviour that exists' }],
		revised: [
			{ case: 'src/read.test.ts::read > edited', reason: 'the review asked for a tighter check' },
		],
	})
	writeLotDeclaration({
		path: join(root, '.dialecte', 'lot.json'),
		accept: [{ case: 'src/other.test.ts::other > ignored', reason: 'the folder’s file wins' }],
	})
	writeFileSync(
		join(folder, 'decisions.md'),
		`${DECISIONS_HEAD}| Keep the old flag one more release | ${USER_NAME} | 2026-10-30 |\n| Split \\| merge later | Grace | 2026-10-31 |\n`,
	)
	const stateHash = computeStateHash(root)
	writeGateRecord({
		root,
		mode: 'full',
		at: '2026-11-01T10:00:00.000Z',
		stateHash,
		steps: [
			tddStep({
				'src/read.test.ts::read > one': 'green',
				'src/read.test.ts::read > two': 'green',
				'src/write.test.ts::write > one': 'green',
				'src/write.test.ts::write > kept': 'unchanged',
				'src/write.test.ts::write > pinned': 'accepted',
				'src/read.test.ts::read > edited': 'revised',
			}),
			{
				name: 'check',
				status: 'passed',
				counts: { tests: { passed: 12, failed: 0, skipped: 0, total: 12 } },
			},
			{ name: 'lint', status: 'failed', counts: { errors: 2, warnings: 1 }, reason: 'oxlint' },
		],
	})
	writeRulesRecord({ root, stateHash, errors: 0, warnings: 0 })
	return scenario
}

describe('dialecte recap', { timeout: 60_000 }, () => {
	it('every record → the exact recap: commits, tests added per file, checks without the review line, review per round, decisions from every source, follow-ups, the user', () => {
		const { folder, cwd, commits } = prepareFullScenario()

		expect(runRecap({ cwd, argv: [folder] })).toEqual({
			exitCode: 0,
			output: recapText({
				commits: commitLines(commits),
				tests: [
					'3 cases failed before the code changed, then passed:',
					'- `src/read.test.ts` 2',
					'- `src/write.test.ts` 1',
					'Also judged: 1 unchanged, 1 accepted, 1 revised.',
				],
				checks: [
					'- ✓ tdd every case proven',
					'- ✓ check 12/12',
					'- ✗ lint 2 errors · 1 warning · oxlint',
					'- ✓ rules 0 errors · 0 warnings',
				],
				review: [
					'2 rounds, 9 findings: 2 fixed, 1 accepted, 2 logged, 4 open.',
					'- Round 1: 4 findings (1 blocking, 1 should fix, 2 nits)',
					'  - fixed R1-1: blocking `src/read.ts:3` reads past the end',
					'  - accepted R1-2: should fix `src/write.ts:9` a | b mixed up',
					'  - logged R1-3: nit `src/read.ts:1` name too short',
					'  - open R1-4: nit `src/write.ts:2` comment stale',
					'- Round 2: 5 findings (1 blocking, 1 should fix, 3 nits)',
					'  - open R2-1: blocking `src/write.ts:12` error swallowed',
					'  - fixed R2-2: should fix `src/read.ts:20` slow loop',
					'  - logged R2-3: nit `src/read.ts:30` log noise',
					'  - open R2-4: nit `src/write.ts:40` odd spacing',
					'  - open R2-5: nit `src/write.ts:41` double blank line',
				],
				decisions: [
					'- Kept as is: R1-2 a | b mixed up - the caller (always) checks first (by the assistant)',
					'- Accepted without a failing run: src/write.test.ts::write > pinned - pins behaviour that exists (by the assistant)',
					'- Test changed after its failing run: src/read.test.ts::read > edited - the review asked for a tighter check (by the assistant)',
					`- Keep the old flag one more release (by ${USER_NAME})`,
					'- Split | merge later (by Grace)',
				],
				followUps: [
					'- R1-3: name too short (`src/read.ts:1`)',
					'- R2-3: log noise (`src/read.ts:30`)',
				],
				user: USER_NAME,
			}),
		})
	})

	it('nothing names a path outside the repository: no folder, no repository path, no logged <where>, no gates note, no absolute path, no email', () => {
		const { folder, root, cwd } = prepareFullScenario()

		expect(runRecap({ cwd, argv: [folder] }).output).not.toMatch(
			new RegExp(
				[
					escapeRegExp(folder),
					escapeRegExp(root),
					'FOLLOW-UPS',
					'notes\\.md',
					'LOT-PLAN',
					'(^|[\\s`(])/[A-Za-z]',
					escapeRegExp(USER_EMAIL),
				].join('|'),
			),
		)
	})

	it('no record at all, no lot committed → every lot not committed yet, each empty section in its one line', () => {
		const { folder, cwd } = prepareScenario({ committed: 0 })

		expect(runRecap({ cwd, argv: [folder] })).toEqual({
			exitCode: 0,
			output: recapText({
				commits: commitLines([]),
				tests: ['No test case added.'],
				checks: ['No check recorded.'],
				review: ['No review recorded.'],
				decisions: ['No decision recorded.'],
				followUps: ['No follow-up.'],
				user: USER_NAME,
			}),
		})
	})

	it('a commit after the recorded HEAD that is not the first lot (another message) → every lot not committed yet', () => {
		const { root, folder, cwd } = prepareScenario({ committed: 0 })
		writeFiles({ root, files: { 'other.txt': 'other\n' } })
		git({ root, args: ['add', '--', 'other.txt'] })
		git({ root, args: ['commit', '-q', '-m', 'chore: something else'] })

		expect(runRecap({ cwd, argv: [folder] })).toEqual({
			exitCode: 0,
			output: expect.stringContaining(
				`### Commits\n${commitLines([]).join('\n')}\n${BRANCH_REWRITTEN}\n\n`,
			),
		})
	})

	it('the repository folder no longer exists → every lot not committed yet, no test, no check, the folder’s records kept, the user from the cwd', () => {
		isolateGitConfig()
		const folder = handoverFolderPath()
		writeHandoverFolder({
			folder,
			repository: join(realpathSync(temporaryFolder('dialecte-recap-gone-')), 'removed-repo'),
			head: 'a'.repeat(40),
		})
		writeLedger({
			folder,
			rows: [
				'| R1-1 | 1 | should fix | src/read.ts:3 | reads past the end | fixed 2 |',
				'| R2-1 | 2 | nit | src/read.ts:9 | name too short | logged (plans/LATER.md) |',
			],
		})
		const cwd = initializeRepository({ root: realpathSync(temporaryFolder('dialecte-recap-cwd-')) })
		git({ root: cwd, args: ['config', 'user.name', 'Folder Person'] })

		expect(runRecap({ cwd, argv: [folder] })).toEqual({
			exitCode: 0,
			output: expect.stringMatching(
				recapPattern(
					recapText({
						commits: commitLines([]),
						tests: ['No test case added.'],
						checks: ['No check recorded.'],
						review: [
							'2 rounds, 2 findings: 1 fixed, 1 logged.',
							ANY_LINE,
							'  - fixed R1-1: should fix `src/read.ts:3` reads past the end',
							ANY_LINE,
							'  - logged R2-1: nit `src/read.ts:9` name too short',
						],
						decisions: ['No decision recorded.'],
						followUps: ['- R2-1: name too short (`src/read.ts:9`)'],
						user: 'Folder Person',
					}),
				),
			),
		})
	})

	it('tests added: only the newest gate record of the current tree counts, a fast one older than the full one left out', () => {
		const { root, folder, cwd } = prepareScenario({ committed: 1 })
		const stateHash = computeStateHash(root)
		writeGateRecord({
			root,
			mode: 'fast',
			at: '2026-11-01T09:00:00.000Z',
			stateHash,
			steps: [tddStep({ 'src/read.test.ts::read > older': 'green' })],
		})
		writeGateRecord({
			root,
			mode: 'full',
			at: '2026-11-01T10:00:00.000Z',
			stateHash,
			steps: [
				tddStep({
					'src/write.test.ts::write > one': 'green',
					'src/write.test.ts::write > two': 'green',
					'src/write.test.ts::write > kept': 'unchanged',
					'src/write.test.ts::write > also kept': 'unchanged',
				}),
			],
		})

		expect(runRecap({ cwd, argv: [folder] })).toEqual({
			exitCode: 0,
			output: expect.stringContaining(
				[
					'### Tests added',
					'2 cases failed before the code changed, then passed:',
					'- `src/write.test.ts` 2',
					'Also judged: 2 unchanged.',
					'',
					'### Checks',
				].join('\n'),
			),
		})
	})

	it('a gate record of another tree → no test case added; its lines keep " (the tree changed since)": a passed one turns !, a failed one stays ✗', () => {
		const { root, folder, cwd } = prepareScenario({ committed: 1 })
		writeGateRecord({
			root,
			mode: 'full',
			at: '2026-11-01T10:00:00.000Z',
			stateHash: 'f'.repeat(64),
			steps: [
				tddStep({ 'src/read.test.ts::read > one': 'green' }),
				{
					name: 'check',
					status: 'passed',
					counts: { tests: { passed: 5, failed: 0, skipped: 0, total: 5 } },
				},
				{ name: 'lint', status: 'failed', counts: { errors: 1, warnings: 0 }, reason: 'oxlint' },
			],
		})
		writeRulesRecord({ root, stateHash: computeStateHash(root), errors: 0, warnings: 3 })

		expect(runRecap({ cwd, argv: [folder] })).toEqual({
			exitCode: 0,
			output: expect.stringContaining(
				[
					'### Tests added',
					'No test case added.',
					'',
					'### Checks',
					'- ! tdd every case proven (the tree changed since)',
					'- ! check 5/5 (the tree changed since)',
					'- ✗ lint 1 error · 0 warnings · oxlint (the tree changed since)',
					'- ✓ rules 0 errors · 3 warnings',
					'',
					'### Review',
				].join('\n'),
			),
		})
	})

	it('lots committed on the branch, the repository checked out elsewhere (HEAD detached at the recorded HEAD) → the lots are looked for up to the branch tip: both shas listed', () => {
		const { root, folder, cwd, commits, head } = prepareScenario({ committed: 2 })
		git({ root, args: ['checkout', '-q', '--detach', head] })

		expect(runRecap({ cwd, argv: [folder] })).toEqual({
			exitCode: 0,
			output: expect.stringContaining(`### Commits\n${commitLines(commits).join('\n')}\n\n`),
		})
	})

	it('tests added: a fast record newer than the full one of the same tree → the fast record’s cases count', () => {
		const { root, folder, cwd } = prepareScenario({ committed: 1 })
		const stateHash = computeStateHash(root)
		writeGateRecord({
			root,
			mode: 'fast',
			at: '2026-11-01T11:00:00.000Z',
			stateHash,
			steps: [
				tddStep({
					'src/read.test.ts::read > newer one': 'green',
					'src/read.test.ts::read > newer two': 'green',
					'src/read.test.ts::read > newer three': 'green',
				}),
			],
		})
		writeGateRecord({
			root,
			mode: 'full',
			at: '2026-11-01T10:00:00.000Z',
			stateHash,
			steps: [tddStep({ 'src/write.test.ts::write > older': 'green' })],
		})

		expect(runRecap({ cwd, argv: [folder] })).toEqual({
			exitCode: 0,
			output: expect.stringContaining(
				[
					'### Tests added',
					'3 cases failed before the code changed, then passed:',
					'- `src/read.test.ts` 3',
					'',
					'### Checks',
				].join('\n'),
			),
		})
	})

	it('checks: a rules record and no gate record → the gate line buildCardGateLines gives, then rules', () => {
		const { root, folder, cwd } = prepareScenario({ committed: 0 })
		writeRulesRecord({ root, stateHash: computeStateHash(root), errors: 0, warnings: 0 })

		expect(runRecap({ cwd, argv: [folder] })).toEqual({
			exitCode: 0,
			output: expect.stringContaining(
				[
					'### Checks',
					'- ✗ gate never run on this tree',
					'- ✓ rules 0 errors · 0 warnings',
					'',
					'### Review',
				].join('\n'),
			),
		})
	})

	it('checks: a gate record and no rules record → the gate steps, then the rules line buildCardGateLines gives', () => {
		const { root, folder, cwd } = prepareScenario({ committed: 0 })
		writeGateRecord({
			root,
			mode: 'fast',
			at: '2026-11-01T10:00:00.000Z',
			stateHash: computeStateHash(root),
			steps: [
				{
					name: 'check',
					status: 'passed',
					counts: { tests: { passed: 7, failed: 0, skipped: 0, total: 7 } },
				},
			],
		})

		expect(runRecap({ cwd, argv: [folder] })).toEqual({
			exitCode: 0,
			output: expect.stringContaining(
				['### Checks', '- ✓ check 7/7', '- ! rules never run on this tree', '', '### Review'].join(
					'\n',
				),
			),
		})
	})

	it('no lot.json in the folder → the repository’s .dialecte/lot.json gives the decisions', () => {
		const { root, folder, cwd } = prepareScenario({ committed: 0 })
		writeLotDeclaration({
			path: join(root, '.dialecte', 'lot.json'),
			accept: [{ case: 'src/read.test.ts::read > pinned', reason: 'covers existing code' }],
			revised: [{ case: 'src/write.test.ts', reason: 'renamed at review' }],
		})

		expect(runRecap({ cwd, argv: [folder] })).toEqual({
			exitCode: 0,
			output: expect.stringContaining(
				[
					'### Decisions',
					'- Accepted without a failing run: src/read.test.ts::read > pinned - covers existing code (by the assistant)',
					'- Test changed after its failing run: src/write.test.ts - renamed at review (by the assistant)',
					'',
					'### Follow-ups',
				].join('\n'),
			),
		})
	})

	it('decisions.md alone → one line per row with its by; the when column not printed', () => {
		const { folder, cwd } = prepareScenario({ committed: 0 })
		writeFileSync(
			join(folder, 'decisions.md'),
			`${DECISIONS_HEAD}| Ship without the flag | Grace Hopper | 2026-10-31 |\n`,
		)

		expect(runRecap({ cwd, argv: [folder] })).toEqual({
			exitCode: 0,
			output: expect.stringContaining(
				['### Decisions', '- Ship without the flag (by Grace Hopper)', '', '### Follow-ups'].join(
					'\n',
				),
			),
		})
	})

	it('review: the zero parts of the totals line left out; no logged row → No follow-up.; no accepted row → No decision recorded.', () => {
		const { folder, cwd } = prepareScenario({ committed: 0 })
		writeLedger({
			folder,
			rows: [
				'| R1-1 | 1 | blocking | src/read.ts:3 | reads past the end | fixed 2 |',
				'| R1-2 | 1 | nit | src/read.ts:4 | name too short | fixed 2 |',
				'| R2-1 | 2 | should fix | src/write.ts:5 | slow loop | open |',
			],
		})

		expect(runRecap({ cwd, argv: [folder] })).toEqual({
			exitCode: 0,
			output: expect.stringMatching(
				recapPattern(
					recapText({
						commits: commitLines([]),
						tests: ['No test case added.'],
						checks: ['No check recorded.'],
						review: [
							'2 rounds, 3 findings: 2 fixed, 1 open.',
							ANY_LINE,
							'  - fixed R1-1: blocking `src/read.ts:3` reads past the end',
							'  - fixed R1-2: nit `src/read.ts:4` name too short',
							ANY_LINE,
							'  - open R2-1: should fix `src/write.ts:5` slow loop',
						],
						decisions: ['No decision recorded.'],
						followUps: ['No follow-up.'],
						user: USER_NAME,
					}),
				),
			),
		})
	})

	it('the user name comes from the repository’s git config, never its email', () => {
		const { folder, cwd } = prepareScenario({ committed: 0 })

		expect(runRecap({ cwd, argv: [folder] })).toEqual({
			exitCode: 0,
			output: expect.stringMatching(
				/\nPrepared with an AI assistant, reviewed and posted by Ada Lovelace\.\n\n<\/details>$/,
			),
		})
	})

	it('no user name in the repository nor in the cwd (the email set) → refused, exit 1, saying to set git config user.name', () => {
		const { root, folder, cwd } = prepareScenario({ committed: 1 })
		git({ root, args: ['config', '--unset', 'user.name'] })

		expect(runRecap({ cwd, argv: [folder] })).toEqual({
			exitCode: 1,
			output: expect.stringMatching(/^recap: .*git config user\.name/s),
		})
	})

	it('a folder without lots.json → refused, exit 1, with the hand-over reader’s message', () => {
		isolateGitConfig()
		const folder = handoverFolderPath()
		mkdirSync(folder, { recursive: true })

		expect(runRecap({ cwd: dirname(folder), argv: [folder] })).toEqual({
			exitCode: 1,
			output: `recap: ${String(readHandoverFolder(folder))}`,
		})
	})

	it('a folder with lots.json but without its snapshot files → refused, exit 1, with the hand-over reader’s message', () => {
		isolateGitConfig()
		const withoutSnapshot = handoverFolderPath()
		mkdirSync(withoutSnapshot, { recursive: true })
		writeFileSync(
			join(withoutSnapshot, 'lots.json'),
			JSON.stringify({
				repository: join(dirname(withoutSnapshot), 'repo'),
				branch: 'main',
				head: 'a'.repeat(40),
				lots: [{ paths: ['a.ts'], message: 'feat: a' }],
			}),
		)

		expect(runRecap({ cwd: dirname(withoutSnapshot), argv: [withoutSnapshot] })).toEqual({
			exitCode: 1,
			output: `recap: ${String(readHandoverFolder(withoutSnapshot))}`,
		})
	})

	it.each([
		{ label: 'no folder', argv: [] },
		{ label: 'two words', argv: ['first', 'second'] },
	])('$label → the usage, exit 2', ({ argv }) => {
		expect(runRecap({ cwd: temporaryFolder('dialecte-recap-usage-'), argv })).toEqual({
			exitCode: 2,
			output: RECAP_USAGE,
		})
	})

	it('-- ends the options → a folder whose name starts with -- is read', () => {
		const { root, head, folder, cwd } = prepareScenario({ committed: 0 })
		writeHandoverFolder({ folder: join(dirname(folder), '--lot'), repository: root, head })

		expect(runRecap({ cwd, argv: ['--', '--lot'] })).toMatchObject({ exitCode: 0 })
	})

	it.each([
		{ state: 'fix wrong 2 (a - b) - fixed 3 (reasoned)', outcome: 'fixed', reason: undefined },
		{
			state: 'reopened 2 by R1-5 (no verdict - at the last round) - fixed 3 (reasoned)',
			outcome: 'fixed',
			reason: undefined,
		},
		{ state: 'fixed 2 - reopened 3 by R2-1', outcome: 'open', reason: undefined },
		{ state: 'reopened 3 by R2-1', outcome: 'open', reason: undefined },
		{ state: 'fix wrong 2 (too wide) - fix to verify', outcome: 'open', reason: undefined },
		{ state: 'accepted (the caller checks)', outcome: 'accepted', reason: 'the caller checks' },
		{ state: 'accepted - the caller checks', outcome: 'accepted', reason: 'the caller checks' },
		{ state: 'accepted: the caller checks', outcome: 'accepted', reason: 'the caller checks' },
		{ state: 'accepted the caller checks', outcome: 'accepted', reason: 'the caller checks' },
		{
			state: 'fix wrong 2 (too wide) - accepted - narrowing costs more - for now',
			outcome: 'accepted',
			reason: 'narrowing costs more - for now',
		},
		{ state: 'logged - with the user’s answer', outcome: 'logged', reason: undefined },
	])(
		'ledger state "$state" → $outcome (the last segment of the history starting with a state word decides)',
		({ state, outcome, reason }) => {
			const { folder, cwd } = prepareScenario({ committed: 0 })
			writeLedger({
				folder,
				rows: [`| R1-1 | 1 | nit | src/read.ts:3 | name too short | ${state} |`],
			})

			const output = runRecap({ cwd, argv: [folder] }).output
			expect({
				review: output.includes(`\n  - ${outcome} R1-1: nit \`src/read.ts:3\` name too short\n`),
				decision: reason
					? output.includes(`\n- Kept as is: R1-1 name too short - ${reason} (by the assistant)\n`)
					: output.includes('\nNo decision recorded.\n'),
			}).toEqual({ review: true, decision: true })
		},
	)

	it('ledger state "fix wrong 2 (too wide)" alone → open, no refusal', () => {
		const { folder, cwd } = prepareScenario({ committed: 0 })
		writeLedger({
			folder,
			rows: [
				'| R1-1 | 1 | nit | src/read.ts:3 | name too short | fixed 2 |',
				'| R2-3 | 2 | nit | src/read.ts:4 | name too long | fix wrong 2 (too wide) |',
			],
		})

		expect(runRecap({ cwd, argv: [folder] })).toEqual({
			exitCode: 0,
			output: expect.stringContaining('\n  - open R2-3: nit `src/read.ts:4` name too long\n'),
		})
	})

	it.each([{ state: 'wontfix' }, { state: '' }])(
		'ledger state "$state" (no segment starts with a state word) → refused, exit 1, naming the row and its state',
		({ state }) => {
			const { folder, cwd } = prepareScenario({ committed: 0 })
			writeLedger({
				folder,
				rows: [
					'| R1-1 | 1 | nit | src/read.ts:3 | name too short | fixed 2 |',
					`| R2-3 | 2 | nit | src/read.ts:4 | name too long | ${state} |`,
				],
			})

			expect(runRecap({ cwd, argv: [folder] })).toEqual({
				exitCode: 1,
				output: `recap: R2-3 has a state recap cannot read: "${state}"; set it with dialecte record decision`,
			})
		},
	)

	it('rows after a non-table line (a verdict note between rounds) → still read; lines that are no finding row left out', () => {
		const { folder, cwd } = prepareScenario({ committed: 0 })
		writeFileSync(
			join(folder, 'findings-ledger.md'),
			[
				`${LEDGER_HEAD}| R1-1 | 1 | blocking | src/read.ts:3 | reads past the end | fixed 2 |`,
				'| R2-L1 | 2 | nit | src/read.ts:4 | name too short | logged - later |',
				'',
				'Round 2 of 2 verdict: to the user.',
				'| R3-L1 | 3 | nit | src/write.ts:5 | odd spacing | logged - reported |',
				'| R3-2 | 3 | nit | src/write.ts:6 | too few cells |',
				'| note | 3 | nit | src/write.ts:7 | not a finding id | open |',
				'',
				'| R3-3 | 3 | should fix | src/write.ts:8 | slow loop | open |',
				'',
				'Round 3: approve.',
				'',
			].join('\n'),
		)

		expect(runRecap({ cwd, argv: [folder] })).toEqual({
			exitCode: 0,
			output: expect.stringContaining(
				[
					'### Review',
					'3 rounds, 5 findings: 1 fixed, 2 logged, 2 open.',
					'- Round 1: 1 finding (1 blocking)',
					'  - fixed R1-1: blocking `src/read.ts:3` reads past the end',
					'- Round 2: 1 finding (1 nit)',
					'  - logged R2-L1: nit `src/read.ts:4` name too short',
					'- Round 3: 3 findings (1 should fix, 2 nits)',
					'  - logged R3-L1: nit `src/write.ts:5` odd spacing',
					'  - open note: nit `src/write.ts:7` not a finding id',
					'  - open R3-3: should fix `src/write.ts:8` slow loop',
					'',
					'### Decisions',
				].join('\n'),
			),
		})
	})

	it('each finding’s id in the review rows, the follow-ups and the kept-as-is decisions', () => {
		const { folder, cwd } = prepareScenario({ committed: 0 })
		writeLedger({
			folder,
			rows: [
				'| R1-1 | 1 | blocking | src/read.ts:3 | reads past the end | fixed 2 |',
				'| R1-4 | 1 | should fix | src/write.ts:9 | flag unused | accepted (kept for R1-1) |',
				'| R1-6 | 1 | nit | src/read.ts:1 | name too short | logged (later) |',
			],
		})

		expect(runRecap({ cwd, argv: [folder] })).toEqual({
			exitCode: 0,
			output: expect.stringContaining(
				[
					'### Review',
					'1 round, 3 findings: 1 fixed, 1 accepted, 1 logged.',
					'- Round 1: 3 findings (1 blocking, 1 should fix, 1 nit)',
					'  - fixed R1-1: blocking `src/read.ts:3` reads past the end',
					'  - accepted R1-4: should fix `src/write.ts:9` flag unused',
					'  - logged R1-6: nit `src/read.ts:1` name too short',
					'',
					'### Decisions',
					'- Kept as is: R1-4 flag unused - kept for R1-1 (by the assistant)',
					'',
					'### Follow-ups',
					'- R1-6: name too short (`src/read.ts:1`)',
					'',
				].join('\n'),
			),
		})
	})

	it('one leading reviewer tag [M1, hook] dropped from a finding’s text; [a] (a letter alone) is no tag: the text printed whole', () => {
		const { folder, cwd } = prepareScenario({ committed: 0 })
		writeLedger({
			folder,
			rows: [
				'| R1-1 | 1 | nit | src/read.ts:3 | [M1, hook] reads past the end | open |',
				'| R1-2 | 1 | nit | src/read.ts:4 | [a] [b] keeps [c] inside | open |',
			],
		})

		expect(runRecap({ cwd, argv: [folder] })).toEqual({
			exitCode: 0,
			output: expect.stringContaining(
				[
					'  - open R1-1: nit `src/read.ts:3` reads past the end',
					'  - open R1-2: nit `src/read.ts:4` [a] [b] keeps [c] inside',
					'',
				].join('\n'),
			),
		})
	})

	it('file:line cells: relative as written, absolute in the repository relative to it, absolute in the workspace folder relative to that folder', () => {
		const { root, folder, cwd } = prepareScenario({ committed: 0 })
		const workspace = dirname(root)
		writeLedger({
			folder,
			rows: [
				'| R1-1 | 1 | nit | src/read.ts:3 | one | open |',
				`| R1-2 | 1 | nit | ${root}/src/write.ts:9 | two | open |`,
				`| R1-3 | 1 | nit | ${workspace}/core/skills/SKILL.md:4; ${root}/docs/guide.md:1 | three | open |`,
			],
		})

		const output = runRecap({ cwd, argv: [folder] }).output
		expect({ output, absolute: output.includes(workspace) }).toEqual({
			output: expect.stringContaining(
				[
					'  - open R1-1: nit `src/read.ts:3` one',
					'  - open R1-2: nit `src/write.ts:9` two',
					'  - open R1-3: nit `core/skills/SKILL.md:4; docs/guide.md:1` three',
					'',
				].join('\n'),
			),
			absolute: false,
		})
	})

	it('a file:line cell with an absolute path outside the workspace folder → refused, exit 1, naming the row', () => {
		const { folder, cwd } = prepareScenario({ committed: 0 })
		const elsewhere = realpathSync(temporaryFolder('dialecte-recap-elsewhere-'))
		writeLedger({
			folder,
			rows: [
				'| R1-1 | 1 | nit | src/read.ts:3 | one | open |',
				`| R1-9 | 1 | nit | ${elsewhere}/notes.md:2 | two | open |`,
			],
		})

		expect(runRecap({ cwd, argv: [folder] })).toEqual({
			exitCode: 1,
			output: 'recap: R1-9 points outside the workspace: write --at relative to its repository',
		})
	})

	it('the branch rewritten under the lots (the recorded HEAD no longer below its tip) → every lot not committed yet, then one line saying why none is listed', () => {
		const { root, folder, cwd, head } = prepareScenario({ committed: 2 })
		git({ root, args: ['reset', '-q', '--hard', head] })
		git({ root, args: ['commit', '-q', '--amend', '-m', 'chore: rewritten base'] })

		expect(runRecap({ cwd, argv: [folder] })).toEqual({
			exitCode: 0,
			output: expect.stringContaining(
				['### Commits', ...commitLines([]), BRANCH_REWRITTEN, '', '### Tests added'].join('\n'),
			),
		})
	})

	it.each([
		{ state: 'fix to verify - fixed by narrowing the regex', outcome: 'open', reason: undefined },
		{ state: 'accepted - fixed in the plan', outcome: 'accepted', reason: 'fixed in the plan' },
		{
			state: 'accepted - the caller checks - fixed upstream later',
			outcome: 'accepted',
			reason: 'the caller checks - fixed upstream later',
		},
		{
			state: 'accepted (x) - open question to the expert',
			outcome: 'accepted',
			reason: '(x) - open question to the expert',
		},
		{
			state: 'logged (plans/x.md) - open until the user answers',
			outcome: 'logged',
			reason: undefined,
		},
		{ state: 'fixed 2 (reasoned) - logged follow-up', outcome: 'fixed', reason: undefined },
		{ state: 'fixed 2 - fix wrong 3', outcome: 'open', reason: undefined },
		{ state: 'fix wrong 2 (too wide) - fixed 3', outcome: 'fixed', reason: undefined },
		{ state: 'reopened 2 by R1-5 (x) - fixed 3', outcome: 'fixed', reason: undefined },
	])(
		'ledger state "$state" → $outcome (" - " starts a new part only before a transition: fixed <n>, reopened <n> by <id>, fix wrong <n>, fix to verify, open at the end)',
		({ state, outcome, reason }) => {
			const { folder, cwd } = prepareScenario({ committed: 0 })
			writeLedger({
				folder,
				rows: [`| R1-1 | 1 | nit | src/read.ts:3 | name too short | ${state} |`],
			})

			const output = runRecap({ cwd, argv: [folder] }).output
			expect({
				review: output.includes(`\n  - ${outcome} R1-1: nit \`src/read.ts:3\` name too short\n`),
				decision: reason
					? output.includes(`\n- Kept as is: R1-1 name too short - ${reason} (by the assistant)\n`)
					: output.includes('\nNo decision recorded.\n'),
			}).toEqual({ review: true, decision: true })
		},
	)

	it('rows with any id (TR3-1, F-a, L-1) → each read as a finding, printed as written, its round from its round cell', () => {
		const { folder, cwd } = prepareScenario({ committed: 0 })
		writeLedger({
			folder,
			rows: [
				'| R1-1 | 1 | blocking | src/read.ts:3 | reads past the end | fixed 2 |',
				'| TR3-1 | 3 | blocking | src/read.test.ts:5 | expects the base case | fixed 4 |',
				'| F-a | 3 | nit | src/write.test.ts:6 | no row for the basename | open |',
				'| L-1 | 2 | nit | src/write.ts:7 | red under load | logged - later |',
			],
		})

		expect(runRecap({ cwd, argv: [folder] })).toEqual({
			exitCode: 0,
			output: expect.stringContaining(
				[
					'### Review',
					'3 rounds, 4 findings: 2 fixed, 1 logged, 1 open.',
					'- Round 1: 1 finding (1 blocking)',
					'  - fixed R1-1: blocking `src/read.ts:3` reads past the end',
					'- Round 2: 1 finding (1 nit)',
					'  - logged L-1: nit `src/write.ts:7` red under load',
					'- Round 3: 2 findings (1 blocking, 1 nit)',
					'  - fixed TR3-1: blocking `src/read.test.ts:5` expects the base case',
					'  - open F-a: nit `src/write.test.ts:6` no row for the basename',
					'',
				].join('\n'),
			),
		})
	})

	it('a row with no round in its round cell and an id that names none → refused, exit 1, naming the row', () => {
		const { folder, cwd } = prepareScenario({ committed: 0 })
		writeLedger({
			folder,
			rows: [
				'| R1-1 | 1 | blocking | src/read.ts:3 | reads past the end | fixed 2 |',
				'| TR3-1 | test review 3 | blocking | src/read.test.ts:5 | expects the base case | fixed |',
			],
		})

		expect(runRecap({ cwd, argv: [folder] })).toEqual({
			exitCode: 1,
			output: 'recap: TR3-1 has no round: write its round cell',
		})
	})

	it.each([
		{ at: '`{root}/src/read.ts:3`' },
		{ at: '"{root}/src/read.ts:3"' },
		{ at: 'at={root}/src/read.ts:3' },
		{ at: '[{root}/src/read.ts:3]' },
		{ at: 'src/read.ts:3-{root}/src/write.ts:4' },
		{ at: '~/notes.md:1' },
	])(
		'a file:line cell "$at" still holding an absolute path after the rewrite → refused, exit 1, naming the row',
		({ at }) => {
			const { root, folder, cwd } = prepareScenario({ committed: 0 })
			writeLedger({
				folder,
				rows: [
					'| R1-1 | 1 | nit | src/read.ts:3 | one | open |',
					`| R1-9 | 1 | nit | ${at.replace('{root}', root)} | two | open |`,
				],
			})

			expect(runRecap({ cwd, argv: [folder] })).toEqual({
				exitCode: 1,
				output: 'recap: R1-9 points outside the workspace: write --at relative to its repository',
			})
		},
	)

	it.each([
		{ at: 'create.test.ts / update.test.ts' },
		{ at: 'src/a.ts:3 +/- 2' },
		{ at: 'README.md:12-/' },
	])(
		'a file:line cell "$at" with a `/` starting no path segment → printed as written, exit 0',
		({ at }) => {
			const { folder, cwd } = prepareScenario({ committed: 0 })
			writeLedger({ folder, rows: [`| R1-1 | 1 | nit | ${at} | one | open |`] })

			expect(runRecap({ cwd, argv: [folder] })).toEqual({
				exitCode: 0,
				output: expect.stringContaining(`\n  - open R1-1: nit \`${at}\` one\n`),
			})
		},
	)

	it('the repository gone from a .worktrees folder → a path in a sibling repository of the workspace printed relative to the workspace', () => {
		isolateGitConfig()
		const workspace = realpathSync(temporaryFolder('dialecte-recap-gone-worktree-'))
		const folder = handoverFolderPath()
		writeHandoverFolder({
			folder,
			repository: join(workspace, '.worktrees', 'removed-repo'),
			head: 'a'.repeat(40),
		})
		writeLedger({
			folder,
			rows: [`| R1-1 | 1 | nit | ${workspace}/core/skills/SKILL.md:4 | one | open |`],
		})
		const cwd = initializeRepository({ root: realpathSync(temporaryFolder('dialecte-recap-cwd-')) })
		git({ root: cwd, args: ['config', 'user.name', 'Folder Person'] })

		expect(runRecap({ cwd, argv: [folder] })).toEqual({
			exitCode: 0,
			output: expect.stringContaining('\n  - open R1-1: nit `core/skills/SKILL.md:4` one\n'),
		})
	})

	it.each([{ text: '[] returned instead of undefined' }, { text: '[object Object] printed' }])(
		'a finding text "$text" (a leading bracket that is no reviewer tag) → printed whole',
		({ text }) => {
			const { folder, cwd } = prepareScenario({ committed: 0 })
			writeLedger({ folder, rows: [`| R1-1 | 1 | nit | src/read.ts:3 | ${text} | open |`] })

			expect(runRecap({ cwd, argv: [folder] })).toEqual({
				exitCode: 0,
				output: expect.stringContaining(`\n  - open R1-1: nit \`src/read.ts:3\` ${text}\n`),
			})
		},
	)
})

function escapeRegExp(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
