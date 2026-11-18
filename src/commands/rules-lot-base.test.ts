import { dirname } from 'node:path'

import {
	GATE_BASE_VARIABLE,
	LOT_NAME,
	PARENT_LOT_NAME,
	TEST_FILE,
} from '../../test/rules-lot-worktree.constants.ts'
import {
	createLotWorktree,
	createMovedLotWorktree,
	createStackedLotWorktree,
} from '../../test/rules-lot-worktree.ts'
import { temporaryFolder, writeFiles } from '../../test/scratch-repository.ts'
import { SCRATCH_GIT_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { NOT_ADDED_SUFFIX } from '../lib/rules/added-lines.constants.ts'
import { runRules } from './rules.ts'

import { describe, expect, it, onTestFinished, vi } from 'vitest'

import type {
	LotWorktree,
	LotWorktreeKind,
	LotWorktreeSource,
} from '../../test/rules-lot-worktree.types.ts'
import type { RuleFinding } from '../lib/rules/check-code-rules.types.ts'

type SpliceVerdict = { line: number; severity: string; notAdded: boolean }

const BASE_LINE_PREFIX = 'rules: base '

const OLD_ERROR: SpliceVerdict = {
	line: 4,
	severity: 'error',
	notAdded: false,
}
const OLD_WARNING: SpliceVerdict = {
	line: 4,
	severity: 'warning',
	notAdded: true,
}
const NEW_ERROR: SpliceVerdict = {
	line: 5,
	severity: 'error',
	notAdded: false,
}

function machineOf(): Record<string, string> {
	return { XDG_CONFIG_HOME: temporaryFolder('dialecte-config-') }
}

function spliceVerdictsOf(findings: readonly RuleFinding[]): SpliceVerdict[] {
	return findings
		.filter((finding) => finding.rule === 'xml-splice')
		.map((finding) => ({
			line: finding.line,
			severity: finding.severity,
			notAdded: finding.message.endsWith(NOT_ADDED_SUFFIX),
		}))
		.sort((first, second) => first.line - second.line)
}

describe(
	'dialecte rules: the base of a lot without a gate',
	{ timeout: SCRATCH_GIT_CASE_TIMEOUT },
	() => {
		const testCases: Record<
			string,
			{
				source: LotWorktreeSource
				kind?: LotWorktreeKind
				baseBranch?: 'present' | 'absent'
				placement?: 'worktree' | 'on-main'
				releaseTag?: boolean
				gateBase?: boolean
				expectedVerdicts: SpliceVerdict[]
				expectedLine: 'lot' | 'mergeBase' | 'releaseTag' | 'none'
			}
		> = {
			'a lot link, both branches moved on → the old splice a warning, the new one an error, one line naming the base and the lot':
				{
					source: 'lot-link',
					expectedVerdicts: [OLD_WARNING, NEW_ERROR],
					expectedLine: 'lot',
				},
			'no lot, main is the base branch, both branches moved on → the same split, the line names the merge-base and main':
				{
					source: 'none',
					expectedVerdicts: [OLD_WARNING, NEW_ERROR],
					expectedLine: 'mergeBase',
				},
			'no lot, no base branch, a release tag on the commit before the change → the same split, the line names the tag':
				{
					source: 'none',
					baseBranch: 'absent',
					releaseTag: true,
					expectedVerdicts: [OLD_WARNING, NEW_ERROR],
					expectedLine: 'releaseTag',
				},
			'no lot, no base branch, no release tag → no base: both splices are errors, no line': {
				source: 'none',
				baseBranch: 'absent',
				expectedVerdicts: [OLD_ERROR, NEW_ERROR],
				expectedLine: 'none',
			},
			'no lot, the change uncommitted on main itself, no release tag → no base: both splices are errors, no line':
				{
					source: 'none',
					placement: 'on-main',
					expectedVerdicts: [OLD_ERROR, NEW_ERROR],
					expectedLine: 'none',
				},
			'no lot, the change uncommitted on main itself, a release tag on the commit before it → the same split, the line names the tag':
				{
					source: 'none',
					placement: 'on-main',
					releaseTag: true,
					expectedVerdicts: [OLD_WARNING, NEW_ERROR],
					expectedLine: 'releaseTag',
				},
			'a lot link and a gate base → the gate base judges, no line about the lot': {
				source: 'lot-link',
				gateBase: true,
				expectedVerdicts: [OLD_WARNING, NEW_ERROR],
				expectedLine: 'none',
			},
			'a link whose identity holds a base commit and no base ref → the base comes from the commit':
				{
					source: 'lot-link-commit-only',
					expectedVerdicts: [OLD_WARNING, NEW_ERROR],
					expectedLine: 'lot',
				},
			'a link whose base commit git cannot read, main is the base branch → the lot base read from git: the split, the line names the lot':
				{
					source: 'unreadable-link',
					expectedVerdicts: [OLD_WARNING, NEW_ERROR],
					expectedLine: 'lot',
				},
			'a link whose base commit git cannot read, no base branch, a release tag → no lot base: the split, the line names the tag':
				{
					source: 'unreadable-link',
					baseBranch: 'absent',
					releaseTag: true,
					expectedVerdicts: [OLD_WARNING, NEW_ERROR],
					expectedLine: 'releaseTag',
				},
			'a lot link, no base branch, a release tag on the commit the lot was cut at → no lot base: the split, the line names the tag, not the lot':
				{
					source: 'lot-link',
					baseBranch: 'absent',
					releaseTag: true,
					expectedVerdicts: [OLD_WARNING, NEW_ERROR],
					expectedLine: 'releaseTag',
				},
			'a lot link, no base branch, no release tag → no base: both splices are errors, no line': {
				source: 'lot-link',
				baseBranch: 'absent',
				expectedVerdicts: [OLD_ERROR, NEW_ERROR],
				expectedLine: 'none',
			},
			'a link whose base commit git cannot read, no base branch, no release tag → no base: both splices are errors, no line':
				{
					source: 'unreadable-link',
					baseBranch: 'absent',
					expectedVerdicts: [OLD_ERROR, NEW_ERROR],
					expectedLine: 'none',
				},
			'an app, a lot link → the same split and the same line': {
				source: 'lot-link',
				kind: 'app',
				expectedVerdicts: [OLD_WARNING, NEW_ERROR],
				expectedLine: 'lot',
			},
			'an app, no lot, main is the base branch → the same split, the line names the merge-base': {
				source: 'none',
				kind: 'app',
				expectedVerdicts: [OLD_WARNING, NEW_ERROR],
				expectedLine: 'mergeBase',
			},
			'an app, no lot, no base branch, a release tag → the same split, the line names the tag': {
				source: 'none',
				kind: 'app',
				baseBranch: 'absent',
				releaseTag: true,
				expectedVerdicts: [OLD_WARNING, NEW_ERROR],
				expectedLine: 'releaseTag',
			},
		}

		for (const [title, testCase] of Object.entries(testCases))
			it(title, () => {
				const worktree = createLotWorktree({
					source: testCase.source,
					kind: testCase.kind,
					baseBranch: testCase.baseBranch,
					placement: testCase.placement,
					releaseTag: testCase.releaseTag,
				})
				const environment = {
					...machineOf(),
					...(testCase.gateBase && {
						[GATE_BASE_VARIABLE]: worktree.baseCommit,
					}),
				}
				const expectedLines = {
					lot: [`rules: base ${worktree.shortSha} (the lot ${LOT_NAME})`],
					mergeBase: [`rules: base ${worktree.shortSha} (the merge-base with main)`],
					releaseTag: [`rules: base ${worktree.shortSha} (the release tag ${worktree.releaseTag})`],
					none: [],
				}

				const text = runRules({
					cwd: worktree.root,
					argv: [TEST_FILE],
					environment,
				})
				const json = runRules({
					cwd: worktree.root,
					argv: [TEST_FILE, '--json'],
					environment,
				})

				const parsed = JSON.parse(json.output) as {
					findings: RuleFinding[]
					baseLine?: string
				}
				expect({
					verdicts: spliceVerdictsOf(parsed.findings),
					textLines: text.output.split('\n').filter((line) => line.startsWith(BASE_LINE_PREFIX)),
					jsonBaseLine: parsed.baseLine,
				}).toEqual({
					verdicts: testCase.expectedVerdicts,
					textLines: expectedLines[testCase.expectedLine],
					jsonBaseLine: expectedLines[testCase.expectedLine][0],
				})
			})
	},
)

const NO_BASE_LINE_PREFIX = 'rules: no base '

/** A no-base line cut to the expected prefix (its failure reason runs on with git's words); a lot line kept whole. */
function cutToExpected(params: {
	line: string
	expectedLine: string
	kind: 'lot' | 'stackFailure'
}): string {
	return params.kind === 'stackFailure'
		? params.line.slice(0, params.expectedLine.length)
		: params.line
}

describe(
	'dialecte rules: the lot base read from git, never the base recorded at the start',
	{ timeout: SCRATCH_GIT_CASE_TIMEOUT },
	() => {
		const testCases: Record<
			string,
			{
				make: () => LotWorktree
				expectedVerdicts: SpliceVerdict[]
				expectedLine: 'lot' | 'stackFailure'
			}
		> = {
			'a lot cut before main added the package, then rebased onto main → its fork point judges: the splice main added is a warning, the line names the lot at the fork point':
				{
					make: () => createMovedLotWorktree({ move: 'rebase' }),
					expectedVerdicts: [OLD_WARNING, NEW_ERROR],
					expectedLine: 'lot',
				},
			'a lot cut before main added the package, then merging main → the lines that merge brought in are not added, the line names the lot at the fork point':
				{
					make: () => createMovedLotWorktree({ move: 'merge' }),
					expectedVerdicts: [OLD_WARNING, NEW_ERROR],
					expectedLine: 'lot',
				},
			"a lot started on an open lot → the parent's line judges: the parent's splice is a warning, the line names the lot at the parent's tip":
				{
					make: () => createStackedLotWorktree({ parent: 'open' }),
					expectedVerdicts: [OLD_WARNING, NEW_ERROR],
					expectedLine: 'lot',
				},
			"a lot started on a lot the store does not hold → no base, never the base branch's merge-base: both splices are errors, the line names the failure":
				{
					make: () => createStackedLotWorktree({ parent: 'unreadable' }),
					expectedVerdicts: [OLD_ERROR, NEW_ERROR],
					expectedLine: 'stackFailure',
				},
		}

		for (const [title, testCase] of Object.entries(testCases))
			it(title, () => {
				const worktree = testCase.make()
				const environment = machineOf()
				const expectedLines = {
					lot: `rules: base ${worktree.shortSha} (the lot ${LOT_NAME})`,
					stackFailure: `rules: no base (tdd base: the stack parent ${PARENT_LOT_NAME} cannot be read`,
				}

				const text = runRules({ cwd: worktree.root, argv: [TEST_FILE], environment })
				const json = runRules({ cwd: worktree.root, argv: [TEST_FILE, '--json'], environment })

				const parsed = JSON.parse(json.output) as { findings: RuleFinding[]; baseLine?: string }
				const expectedLine = expectedLines[testCase.expectedLine]
				expect({
					verdicts: spliceVerdictsOf(parsed.findings),
					textLines: text.output
						.split('\n')
						.filter(
							(line) => line.startsWith(BASE_LINE_PREFIX) || line.startsWith(NO_BASE_LINE_PREFIX),
						)
						.map((line) => cutToExpected({ line, expectedLine, kind: testCase.expectedLine })),
					jsonBaseLine:
						parsed.baseLine &&
						cutToExpected({ line: parsed.baseLine, expectedLine, kind: testCase.expectedLine }),
				}).toEqual({
					verdicts: testCase.expectedVerdicts,
					textLines: [expectedLine],
					jsonBaseLine: expectedLine,
				})
			})
	},
)

const OUTSIDE_FILE = 'src/widget/make-widget.ts'
const OUTSIDE_MODULE = ['export const makeWidget = () => 1', ''].join('\n')

function outputOrThrown(params: { root: string; argv: string[] }): string {
	try {
		return runRules({ cwd: params.root, argv: params.argv, environment: machineOf() }).output
	} catch {
		return 'the run threw'
	}
}

function packageOutsideAnyRepository(): string {
	const root = temporaryFolder('dialecte-no-repository-')
	vi.stubEnv('GIT_CEILING_DIRECTORIES', dirname(root))
	onTestFinished(function restoreEnvironment() {
		vi.unstubAllEnvs()
	})
	writeFiles({
		root,
		files: {
			'package.json': `${JSON.stringify({ name: '@dialecte/core' })}\n`,
			[OUTSIDE_FILE]: OUTSIDE_MODULE,
		},
	})
	return root
}

describe('dialecte rules: a package outside any git repository', () => {
	it('has no base and no base line: the run completes with its findings', () => {
		const root = packageOutsideAnyRepository()

		const output = outputOrThrown({ root, argv: [OUTSIDE_FILE] })

		expect({
			baseLines: output.split('\n').filter((line) => line.startsWith(BASE_LINE_PREFIX)),
			reportsFunctionAsConst: output.includes('function-as-const'),
		}).toEqual({ baseLines: [], reportsFunctionAsConst: true })
	})

	it('has no base line in the json output', () => {
		const root = packageOutsideAnyRepository()

		const output = outputOrThrown({ root, argv: [OUTSIDE_FILE, '--json'] })

		const parsed = (
			output.startsWith('{') ? JSON.parse(output) : { findings: [], baseLine: output }
		) as { findings: RuleFinding[]; baseLine?: string }
		expect({
			baseLine: parsed.baseLine,
			rules: parsed.findings.map((finding) => finding.rule),
		}).toEqual({ baseLine: undefined, rules: ['function-as-const'] })
	})
})
