import { createBriefWorkspace, writeStoreLot } from '../../../test/brief-workspace.ts'
import { addWorktreeFolder, linkLot } from '../../../test/lot-stores.ts'
import { createScratchRepository, git, writeFiles } from '../../../test/scratch-repository.ts'
import { SCRATCH_GIT_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { readAddedLines, softenNotAdded } from './added-lines.ts'

import { describe, expect, it } from 'vitest'

import type { AddedLines } from './added-lines.types.ts'
import type { RuleFinding, RuleName, RuleSeverity } from './check-code-rules.types.ts'

const FIVE_LINES = ['one', 'two', 'three', 'four', 'five', ''].join('\n')
const EDITED_LINES = ['one', 'changed', 'three', 'four', 'five', 'six', ''].join('\n')

describe('readAddedLines', { timeout: SCRATCH_GIT_CASE_TIMEOUT }, () => {
	it('a tracked file edited and appended to → the lines the change touches', () => {
		const root = createScratchRepository({ 'src/a.ts': FIVE_LINES })
		writeFiles({ root, files: { 'src/a.ts': EDITED_LINES } })

		expect(readAddedLines({ root, base: 'HEAD', files: ['src/a.ts'] })).toEqual(
			new Map([['src/a.ts', new Set([2, 6])]]),
		)
	})

	it('a tracked file that only loses a line → touched, nothing added', () => {
		const root = createScratchRepository({ 'src/a.ts': FIVE_LINES })
		writeFiles({ root, files: { 'src/a.ts': ['one', 'two', 'four', 'five', ''].join('\n') } })

		expect(readAddedLines({ root, base: 'HEAD', files: ['src/a.ts'] })).toEqual(
			new Map([['src/a.ts', new Set()]]),
		)
	})

	it('an untracked new file → whole', () => {
		const root = createScratchRepository({ 'src/a.ts': FIVE_LINES })
		writeFiles({ root, files: { 'src/new.ts': EDITED_LINES } })

		expect(readAddedLines({ root, base: 'HEAD', files: ['src/new.ts'] })).toEqual(
			new Map([['src/new.ts', 'whole']]),
		)
	})

	it('the empty tree as the base, a release tag of the package on history → the lines added since that tag, an untracked file whole', () => {
		const root = createScratchRepository({
			'package.json': `${JSON.stringify({ name: 'demo-package' })}\n`,
			'src/a.ts': FIVE_LINES,
		})
		git({ root, args: ['tag', 'demo-package@v1.0.0'] })
		writeFiles({ root, files: { 'src/a.ts': EDITED_LINES, 'src/new.ts': EDITED_LINES } })
		const base = git({ root, args: ['hash-object', '-t', 'tree', '/dev/null'] }).trim()

		const expected: AddedLines = new Map()
		expected.set('src/a.ts', new Set([2, 6]))
		expected.set('src/new.ts', 'whole')

		expect(readAddedLines({ root, base, files: ['src/a.ts', 'src/new.ts'] })).toEqual(expected)
	})

	it('the empty tree as the base, no release tag → every file whole, full severity', () => {
		const root = createScratchRepository({
			'package.json': `${JSON.stringify({ name: 'demo-package' })}\n`,
			'src/a.ts': FIVE_LINES,
		})
		writeFiles({ root, files: { 'src/a.ts': EDITED_LINES, 'src/new.ts': EDITED_LINES } })
		const base = git({ root, args: ['hash-object', '-t', 'tree', '/dev/null'] }).trim()

		expect(readAddedLines({ root, base, files: ['src/a.ts', 'src/new.ts'] })).toEqual(
			new Map([
				['src/a.ts', 'whole'],
				['src/new.ts', 'whole'],
			]),
		)
	})

	it('a base that is not a commit, a release tag of the package on history → every file whole, never softer than without a base (a garbage base is no empty-tree request)', () => {
		const root = createScratchRepository({
			'package.json': `${JSON.stringify({ name: 'demo-package' })}\n`,
			'src/a.ts': FIVE_LINES,
		})
		git({ root, args: ['tag', 'demo-package@v1.0.0'] })
		writeFiles({ root, files: { 'src/a.ts': EDITED_LINES } })

		expect(readAddedLines({ root, base: 'no-such-commit', files: ['src/a.ts'] })).toEqual(
			new Map([['src/a.ts', 'whole']]),
		)
	})

	it('the empty tree as the base, HEAD on main with a release tag (no lot base, merge-base is HEAD) → the lines added since the tag', () => {
		const root = createScratchRepository({
			'package.json': `${JSON.stringify({ name: 'demo-package' })}\n`,
			'src/a.ts': FIVE_LINES,
		})
		git({ root, args: ['tag', 'demo-package@v1.0.0'] })
		writeFiles({ root, files: { 'src/a.ts': EDITED_LINES } })
		git({ root, args: ['add', '-A'] })
		git({ root, args: ['commit', '-q', '-m', 'feat: edit'] })
		const base = git({ root, args: ['hash-object', '-t', 'tree', '/dev/null'] }).trim()

		expect(readAddedLines({ root, base, files: ['src/a.ts'] })).toEqual(
			new Map([['src/a.ts', new Set([2, 6])]]),
		)
	})

	it('the empty tree as the base, a feature branch from main, a release tag older than the merge-base → the merge-base answers: a line main brought after the tag is not added, only the edited line counts', () => {
		const root = createScratchRepository({
			'package.json': `${JSON.stringify({ name: 'demo-package' })}\n`,
			'src/a.ts': FIVE_LINES,
		})
		git({ root, args: ['tag', 'demo-package@v1.0.0'] })
		writeFiles({
			root,
			files: { 'src/a.ts': ['one', 'two', 'held', 'four', 'five', ''].join('\n') },
		})
		git({ root, args: ['add', '-A'] })
		git({ root, args: ['commit', '-q', '-m', 'feat: main brings a line'] })
		git({ root, args: ['checkout', '-q', '-b', 'feat/work'] })
		writeFiles({ root, files: { 'src/other.ts': 'other\n' } })
		git({ root, args: ['add', '-A'] })
		git({ root, args: ['commit', '-q', '-m', 'feat: the branch has a commit of its own'] })
		writeFiles({
			root,
			files: { 'src/a.ts': ['one', 'changed', 'held', 'four', 'five', ''].join('\n') },
		})
		const base = git({ root, args: ['hash-object', '-t', 'tree', '/dev/null'] }).trim()

		expect(readAddedLines({ root, base, files: ['src/a.ts'] })).toEqual(
			new Map([['src/a.ts', new Set([2])]]),
		)
	})

	it("the empty tree as the base, in a store lot's worktree → the lot's recorded base answers: every line since it counts, also the one the branch was cut with", () => {
		const workspace = createBriefWorkspace()
		const { repository } = workspace
		writeFiles({ root: repository, files: { 'src/a.ts': FIVE_LINES } })
		git({ root: repository, args: ['add', '-A'] })
		git({ root: repository, args: ['commit', '-q', '-m', 'feat: main holds a file'] })
		const recorded = git({ root: repository, args: ['rev-parse', 'HEAD'] }).trim()
		writeFiles({
			root: repository,
			files: { 'src/a.ts': ['one', 'two', 'held', 'four', 'five', ''].join('\n') },
		})
		git({ root: repository, args: ['add', '-A'] })
		git({ root: repository, args: ['commit', '-q', '-m', 'feat: main brings a line'] })
		const folderName = '0100-added-lines-lot'
		const worktree = addWorktreeFolder({ workspace, folderName })
		const lotFolder = writeStoreLot({
			workspace,
			name: folderName,
			scope: ['src/'],
			worktree,
			base: { ref: 'main', commit: recorded },
		})
		linkLot({ worktree, lotFolder })
		writeFiles({
			root: worktree,
			files: { 'src/a.ts': ['one', 'changed', 'held', 'four', 'five', 'six', ''].join('\n') },
		})
		const base = git({ root: worktree, args: ['hash-object', '-t', 'tree', '/dev/null'] }).trim()

		expect(readAddedLines({ root: worktree, base, files: ['src/a.ts'] })).toEqual(
			new Map([['src/a.ts', new Set([2, 3, 6])]]),
		)
	})
})

const ADDED_TWO_AND_SIX: AddedLines = new Map([['src/a.ts', new Set([2, 6])]])

type SoftenCase = {
	rule: RuleName
	severity: RuleSeverity
	line: number
	/** What the change adds, per file. */
	added: AddedLines
	expected: { severity: RuleSeverity; message: string }
	only?: boolean
}

function findingOf(testCase: SoftenCase): RuleFinding {
	return {
		file: 'src/a.ts',
		line: testCase.line,
		column: 1,
		rule: testCase.rule,
		severity: testCase.severity,
		message: 'the finding',
	}
}

describe('softenNotAdded', () => {
	const testCases: Record<string, SoftenCase> = {
		'an argument-mutation error on a line the change did not add → a warning that says so': {
			severity: 'error',
			rule: 'argument-mutation',
			line: 3,
			added: ADDED_TWO_AND_SIX,
			expected: { severity: 'warning', message: 'the finding (not added by this change)' },
		},
		'a plan-tag error on a line the change did not add → a warning that says so': {
			severity: 'error',
			rule: 'plan-tag',
			line: 3,
			added: ADDED_TWO_AND_SIX,
			expected: { severity: 'warning', message: 'the finding (not added by this change)' },
		},
		'an argument-mutation error on an added line → unchanged': {
			severity: 'error',
			rule: 'argument-mutation',
			line: 2,
			added: ADDED_TWO_AND_SIX,
			expected: { severity: 'error', message: 'the finding' },
		},
		'an argument-mutation error in a file added whole → unchanged': {
			severity: 'error',
			rule: 'argument-mutation',
			line: 3,
			added: new Map([['src/a.ts', 'whole']]),
			expected: { severity: 'error', message: 'the finding' },
		},
		'an abbreviation error on a line the change did not add → unchanged: it is no quality rule': {
			severity: 'error',
			rule: 'abbreviation',
			line: 3,
			added: ADDED_TWO_AND_SIX,
			expected: { severity: 'error', message: 'the finding' },
		},
		'a committed-text-reference error on a line the change did not add → unchanged: it is no quality rule':
			{
				severity: 'error',
				rule: 'committed-text-reference',
				line: 3,
				added: ADDED_TWO_AND_SIX,
				expected: { severity: 'error', message: 'the finding' },
			},
		'a long-function warning on a line the change did not add → unchanged: no suffix': {
			severity: 'warning',
			rule: 'long-function',
			line: 3,
			added: ADDED_TWO_AND_SIX,
			expected: { severity: 'warning', message: 'the finding' },
		},
		'an argument-mutation error in a file the map does not hold → unchanged': {
			severity: 'error',
			rule: 'argument-mutation',
			line: 3,
			added: new Map(),
			expected: { severity: 'error', message: 'the finding' },
		},
	}

	for (const [title, testCase] of Object.entries(testCases))
		(testCase.only ? it.only : it)(title, () => {
			expect(
				softenNotAdded({ findings: [findingOf(testCase)], added: testCase.added }).map(
					(finding) => ({ severity: finding.severity, message: finding.message }),
				),
			).toEqual([testCase.expected])
		})
})
