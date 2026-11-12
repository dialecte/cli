import {
	DUPLICATE_HINT_RENAME,
	DUPLICATE_HINT_TABLE,
	DUPLICATE_ID_REASON,
	UNKNOWN_LINE,
} from './tdd.constants.ts'

import type { DuplicateCaseId, RunCase, TestCaseId } from './tdd.types.ts'

/**
 * The case ids that more than one case of the run holds: cases grouped by file, project and name, whatever
 * their state; one group per shared id, in the order of its first member.
 */
export function findDuplicateCaseIds(cases: readonly RunCase[]): DuplicateCaseId[] {
	const groups = new Map<string, DuplicateCaseId>()
	for (const testCase of cases) {
		const key = idKeyOf(testCase)
		const group = groups.get(key)
		if (group) group.lines.push(testCase.location?.line)
		else
			groups.set(key, {
				file: testCase.file,
				project: testCase.project,
				name: testCase.name,
				lines: [testCase.location?.line],
			})
	}
	return [...groups.values()].filter((group) => group.lines.length > 1)
}

/** The case is one of the groups: its id is shared. */
export function isDuplicateMember(params: {
	testCase: TestCaseId
	duplicates: readonly DuplicateCaseId[]
}): boolean {
	return findDuplicateOf(params) !== undefined
}

/** The group whose id the case holds; undefined when its id is its own. */
export function findDuplicateOf(params: {
	testCase: TestCaseId
	duplicates: readonly DuplicateCaseId[]
}): DuplicateCaseId | undefined {
	const key = idKeyOf(params.testCase)
	return params.duplicates.find((duplicate) => idKeyOf(duplicate) === key)
}

/** The reason a member of a group is refused with: the count, the lines, the hint. */
export function duplicateReasonOf(params: {
	duplicate: DuplicateCaseId
	tableTitled: boolean
}): string {
	const { duplicate } = params
	const written = writtenLinesOf(duplicate)
	const hint = params.tableTitled ? DUPLICATE_HINT_TABLE : DUPLICATE_HINT_RENAME
	// replaced through functions: the table hint holds a `$`, a replacement pattern in a replacement string
	return DUPLICATE_ID_REASON.replace('{count}', () => String(duplicate.lines.length))
		.replace('{lines}', () => written)
		.replace('{hint}', () => hint)
}

/** The lines of a group's members as printed: `12, 12`, a member without a location `?`. */
export function writtenLinesOf(duplicate: DuplicateCaseId): string {
	return duplicate.lines
		.map((line) => (line === undefined ? UNKNOWN_LINE : String(line)))
		.join(', ')
}

/** One key per case id: file, project and name, NUL apart (no path or title holds a NUL). */
function idKeyOf(testCase: TestCaseId): string {
	return `${testCase.file}\0${testCase.project}\0${testCase.name}`
}
