import { dirname } from 'node:path'

import { GATE_BASE_VARIABLE, LOT_NAME, TEST_FILE } from '../../test/rules-lot-worktree.constants.ts'
import { createLotWorktree } from '../../test/rules-lot-worktree.ts'
import { temporaryFolder, writeFiles } from '../../test/scratch-repository.ts'
import { SCRATCH_GIT_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { NOT_ADDED_SUFFIX } from '../lib/rules/added-lines.constants.ts'
import { LOT_BASE_LINE } from '../lib/rules/lot-base.constants.ts'
import { runRules } from './rules.ts'

import { describe, expect, it, onTestFinished, vi } from 'vitest'

import type { LotWorktreeKind, LotWorktreeSource } from '../../test/rules-lot-worktree.types.ts'
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
				gateBase?: boolean
				expectedVerdicts: SpliceVerdict[]
				expectedLine: 'lot' | 'worktree' | 'none'
			}
		> = {
			'a lot link, both branches moved on → the old splice a warning, the new one an error, one line naming the merge-base and the lot':
				{
					source: 'lot-link',
					expectedVerdicts: [OLD_WARNING, NEW_ERROR],
					expectedLine: 'lot',
				},
			'no link, a hygiene baseline naming the branch it was cut from, both branches moved on → the same split, the line names the merge-base and that ref':
				{
					source: 'hygiene-baseline',
					expectedVerdicts: [OLD_WARNING, NEW_ERROR],
					expectedLine: 'worktree',
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
			'a link and a hygiene baseline together → the link wins, the line names the lot': {
				source: 'link-and-baseline',
				expectedVerdicts: [OLD_WARNING, NEW_ERROR],
				expectedLine: 'lot',
			},
			'a hygiene baseline whose from git cannot read → no base: both splices are errors, no line': {
				source: 'hygiene-baseline-unreadable-from',
				expectedVerdicts: [OLD_ERROR, NEW_ERROR],
				expectedLine: 'none',
			},
			'an app, a lot link → the same split and the same line': {
				source: 'lot-link',
				kind: 'app',
				expectedVerdicts: [OLD_WARNING, NEW_ERROR],
				expectedLine: 'lot',
			},
			'an app, a hygiene baseline → the same split and the same line': {
				source: 'hygiene-baseline',
				kind: 'app',
				expectedVerdicts: [OLD_WARNING, NEW_ERROR],
				expectedLine: 'worktree',
			},
			'a plain checkout, no link and no baseline → no base: both splices are errors, no line': {
				source: 'none',
				expectedVerdicts: [OLD_ERROR, NEW_ERROR],
				expectedLine: 'none',
			},
			'a link whose base ref git cannot read → no base: both splices are errors, no line': {
				source: 'unreadable-ref-link',
				expectedVerdicts: [OLD_ERROR, NEW_ERROR],
				expectedLine: 'none',
			},
		}

		for (const [title, testCase] of Object.entries(testCases))
			it(title, () => {
				const worktree = createLotWorktree({ source: testCase.source, kind: testCase.kind })
				const environment = {
					...machineOf(),
					...(testCase.gateBase && {
						[GATE_BASE_VARIABLE]: worktree.baseCommit,
					}),
				}
				const expectedLines = {
					lot: [LOT_BASE_LINE.lot.replace('{sha}', worktree.shortSha).replace('{name}', LOT_NAME)],
					worktree: [
						LOT_BASE_LINE.worktree.replace('{sha}', worktree.shortSha).replace('{ref}', 'main'),
					],
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
