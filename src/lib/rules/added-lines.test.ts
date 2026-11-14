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

	it('the empty tree as the base → every file, tracked or untracked, maps to nothing added', () => {
		const root = createScratchRepository({ 'src/a.ts': FIVE_LINES })
		writeFiles({ root, files: { 'src/a.ts': EDITED_LINES, 'src/new.ts': EDITED_LINES } })
		const base = git({ root, args: ['hash-object', '-t', 'tree', '/dev/null'] }).trim()

		expect(readAddedLines({ root, base, files: ['src/a.ts', 'src/new.ts'] })).toEqual(
			new Map([
				['src/a.ts', new Set()],
				['src/new.ts', new Set()],
			]),
		)
	})

	it('a base that is not a commit → every file whole, never softer than without a base', () => {
		const root = createScratchRepository({ 'src/a.ts': FIVE_LINES })
		writeFiles({ root, files: { 'src/a.ts': EDITED_LINES } })

		expect(readAddedLines({ root, base: 'no-such-commit', files: ['src/a.ts'] })).toEqual(
			new Map([['src/a.ts', 'whole']]),
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
