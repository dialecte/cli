/**
 * `lot start <brief> --simulate <scenario> --dry-run` (R4-1, G6): the dry run of a simulated start. It exits 0
 * and reports the findings a real start would refuse for as `wouldRefuse` (text and JSON), never "every check
 * passed" over them; it names no worktree (a simulated start makes none); its `next` is the same start with
 * `--simulate <scenario>`; nothing is claimed or written.
 */
import { writeStoreLot } from '../../test/brief-workspace.ts'
import {
	createdBy,
	createStartWorkspace,
	withJson,
	withLines,
} from '../../test/lot-start-workspace.ts'
import { BRIEF_BRANCH, START_NOW } from '../../test/lot-start.constants.ts'
import { git } from '../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { shellQuote } from '../lib/shell-quote.ts'
import { runLot } from './lot.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { StartWorkspace } from '../../test/lot-start-workspace.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

const TAKEN_LOT = '0003-repo-taken'

/** Makes the branch of the brief exist in the repository. */
function takeTheBranch(start: StartWorkspace): void {
	git({ root: start.repository, args: ['branch', BRIEF_BRANCH] })
}

/** Makes a real open lot hold the brief's scope. */
function takeTheScope(start: StartWorkspace): void {
	writeStoreLot({ workspace: start.workspace, name: TAKEN_LOT, scope: ['src/dataflow/'] })
}

const SETUPS = [
	{ title: 'the branch exists', prepare: takeTheBranch, rules: ['branch-exists'] },
	{ title: 'an open lot overlaps the scope', prepare: takeTheScope, rules: ['overlap'] },
	{
		title: 'the branch exists and an open lot overlaps',
		prepare(start: StartWorkspace): void {
			takeTheBranch(start)
			takeTheScope(start)
		},
		rules: ['branch-exists', 'overlap'],
	},
]

/** The dry run of the simulated start of `scenario` `ready`, text or `--json`. */
function dryRunOf(params: { start: StartWorkspace; json: boolean }) {
	return runLot({
		cwd: params.start.cwd,
		argv: [
			'start',
			params.start.workspace.briefPath,
			'--simulate',
			'ready',
			'--dry-run',
			...(params.json ? ['--json'] : []),
		],
		now: START_NOW,
	})
}

/** The start `next` must name: the same brief, the same scenario. */
function expectedNext(start: StartWorkspace): string {
	return `dialecte lot start ${shellQuote(start.workspace.briefPath)} --simulate ready`
}

describe('lot start --simulate --dry-run', { timeout: STORE_CASE_TIMEOUT }, () => {
	for (const setup of SETUPS) {
		it(`${setup.title} -> --json: exit 0, wouldRefuse holds the findings, no worktree, next is the simulated start, nothing created`, () => {
			const start = createStartWorkspace()
			setup.prepare(start)
			const before = createdBy(start)
			const result = withJson(dryRunOf({ start, json: true }))
			const json = result.json as {
				dryRun?: boolean
				wouldRefuse?: { rule: string }[]
				worktree?: unknown
				next?: string
			}

			expect({
				exitCode: result.exitCode,
				dryRun: json.dryRun,
				rules: json.wouldRefuse?.map((finding) => finding.rule).sort(),
				worktree: typeof json.worktree === 'string' ? json.worktree : null,
				next: json.next,
				created: createdBy(start),
			}).toEqual({
				exitCode: 0,
				dryRun: true,
				rules: setup.rules,
				worktree: null,
				next: expectedNext(start),
				created: before,
			})
		})

		it(`${setup.title} -> text: exit 0, the findings listed, never "every check passed", no worktree, the simulated next line`, () => {
			const start = createStartWorkspace()
			setup.prepare(start)
			const before = createdBy(start)
			const result = withLines(dryRunOf({ start, json: false }))

			expect({
				exitCode: result.exitCode,
				saysAllPassed: result.lines.some((line) => line.includes('every check passed')),
				findings: setup.rules.map((rule) => result.lines.some((line) => line.includes(rule))),
				namesAWorktree: result.lines.some((line) => /^worktree: (?!none)/.test(line)),
				next: result.lines.filter((line) => line.startsWith('next:')),
				created: createdBy(start),
			}).toEqual({
				exitCode: 0,
				saysAllPassed: false,
				findings: setup.rules.map(() => true),
				namesAWorktree: false,
				next: [`next: ${expectedNext(start)}`],
				created: before,
			})
		})
	}

	it('no finding -> --json: wouldRefuse is empty, no worktree, next is still the simulated start', () => {
		const start = createStartWorkspace()
		const result = withJson(dryRunOf({ start, json: true }))
		const json = result.json as { wouldRefuse?: unknown[]; worktree?: unknown; next?: string }

		expect({
			exitCode: result.exitCode,
			wouldRefuse: json.wouldRefuse,
			worktree: typeof json.worktree === 'string' ? json.worktree : null,
			next: json.next,
		}).toEqual({ exitCode: 0, wouldRefuse: [], worktree: null, next: expectedNext(start) })
	})
})
