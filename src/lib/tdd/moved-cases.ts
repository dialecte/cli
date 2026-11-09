/**
 * Which cases of a change are moved from the base, never guessed: by their test call and describe path
 * (`findMovedCases`: the call, by tokens, is in the base text of a file the change deleted or shrank), or by
 * their name when a helper registers them (`findMovedByName`: the same name and project was registered by a
 * runner at the base). One-to-one: a case written in several files is moved from none of them.
 */
import { formatDuration } from '../progress/format-duration.ts'
import { caseLabel } from './select-cases.ts'
import {
	AMBIGUOUS_MOVE_LINE,
	BASE_COLLECT_FAILED_LINE,
	BASE_COLLECT_LINE,
	MOVED_BY_NAME_LABEL,
	MOVED_LABEL,
	MOVED_RUNNER_CHANGED,
	MOVED_SURROUNDINGS_CHANGED,
} from './tdd.constants.ts'
import { testCodeTokens } from './test-code-tokens.ts'
import { indexTestCalls, listSurroundings, listTestCalls, testCallAt } from './test-source.ts'

import type {
	AmbiguousMove,
	ChangedTestFile,
	DeletedTestFile,
	LocatedTestCall,
	MovedByNameCases,
	MovedByNameGroup,
	MovedCaseInput,
	MovedCases,
	MovedGroup,
	MoveCandidate,
	NamedRegistration,
	TddMoves,
	TestCaseId,
	TestCallIndex,
} from './tdd.types.ts'

/**
 * The cases moved exactly: a case's test call (by the tokens its case hash reads) under its describe path
 * is in the base text of one source (a deleted test file, or a changed one that no longer holds that call
 * under that path), and its own file's base did not hold it. Two cases of the same name and project in
 * different files both matching are ambiguous: neither moves. Linear in the cases and the sources' text.
 */
export function findMovedCases(params: {
	/** The new and changed test files: the text now and at the base (undefined when new). */
	files: readonly ChangedTestFile[]
	/** The test files the change deletes, as the base held them. */
	deleted: readonly DeletedTestFile[]
	/** The cases of the run, with where their test call is. */
	cases: readonly MovedCaseInput[]
}): MovedCases {
	const sourcesByKey = new Map<string, Set<string>>()
	const baseKeysByFile = new Map<string, ReadonlySet<string>>()
	const baseTextByFile = new Map<string, string>()
	const sources = [
		...params.deleted.map((file) => ({ file: file.file, baseText: file.baseText, now: undefined })),
		...params.files.flatMap((file) =>
			file.baseText === undefined
				? []
				: [{ file: file.file, baseText: file.baseText, now: file.text }],
		),
	]
	for (const source of sources) {
		const baseKeys = new Set(callKeysOf({ text: source.baseText, file: source.file }))
		baseKeysByFile.set(source.file, baseKeys)
		baseTextByFile.set(source.file, source.baseText)
		const held =
			source.now === undefined
				? new Set<string>()
				: new Set(callKeysOf({ text: source.now, file: source.file }))
		for (const key of baseKeys) {
			if (held.has(key)) continue
			const holders = sourcesByKey.get(key) ?? new Set<string>()
			holders.add(source.file)
			sourcesByKey.set(key, holders)
		}
	}
	const filesByName = new Map(params.files.map((file) => [file.file, file]))
	const indexes = new Map<string, TestCallIndex>()
	const keys = new Map<LocatedTestCall, string>()
	const candidates: MoveCandidate[] = []
	for (const testCase of params.cases) {
		const file = filesByName.get(testCase.file)
		if (!file || !testCase.location) continue
		const index = indexes.get(file.file) ?? indexTestCalls({ text: file.text, file: file.file })
		indexes.set(file.file, index)
		const call = testCallAt({ index, location: testCase.location })
		if (!call) continue
		const key = keys.get(call) ?? callKeyOf({ call, file: file.file })
		keys.set(call, key)
		const holders = sourcesByKey.get(key)
		// held by several sources, or by its own file at the base: not moved
		if (!holders || holders.size !== 1 || baseKeysByFile.get(file.file)?.has(key)) continue
		const [source] = holders
		candidates.push({ testCase: idOf(testCase), source, key })
	}
	const { unique, ambiguous } = oneToOne(candidates)
	const groups = groupBySource(unique).map((group): MovedGroup => ({
		...group,
		surroundingsChanged: group.targets.some((target) =>
			surroundingsDiffer({
				source: { file: group.source, text: baseTextByFile.get(group.source) ?? '' },
				target: { file: target, text: filesByName.get(target)?.text ?? '' },
			}),
		),
	}))
	return { groups, ambiguous }
}

/**
 * The cases moved by name: a case a runner registers now (`runner` set) whose name and project one base
 * case registered by a runner too, in another file (deleted or shrunk: the caller gives only those). A name
 * held twice now, or twice at the base, is ambiguous: neither moves. A direct test call on either side never
 * moves by name.
 */
export function findMovedByName(params: {
	/** The cases of the change registered by a runner call (a helper's), each with that call. */
	cases: readonly NamedRegistration[]
	/** The cases the base held in the files the change deleted or shrank, each in its source file. */
	baseCases: readonly NamedRegistration[]
}): MovedByNameCases {
	const baseByName = groupByName(params.baseCases)
	const groups = new Map<string, MovedByNameGroup>()
	const ambiguous: AmbiguousMove[] = []
	for (const [key, now] of groupByName(params.cases)) {
		const base = baseByName.get(key)
		if (!base) continue
		const { name, project } = now[0]
		if (base.length > 1) {
			ambiguous.push({ name, project, files: base.map((each) => each.file) })
			continue
		}
		if (now.length > 1) {
			ambiguous.push({ name, project, files: now.map((each) => each.file) })
			continue
		}
		const [from] = base
		const [to] = now
		if (from.runner === undefined || to.runner === undefined || from.file === to.file) continue
		const group = groups.get(from.file) ?? {
			source: from.file,
			cases: [],
			targets: [],
			surroundingsChanged: false,
			runnerFrom: [],
			runnerTo: [],
		}
		group.cases.push(idOf(to))
		addOnce({ list: group.targets, item: to.file })
		addOnce({ list: group.runnerFrom, item: from.runner })
		addOnce({ list: group.runnerTo, item: to.runner })
		groups.set(from.file, group)
	}
	return { groups: [...groups.values()], ambiguous }
}

/**
 * The lines `tdd status`, the gate and the card print for the moves: one grouped line per source
 * (`moved  <n> case(s)  <source> → <k> file(s)`, `moved by name ...  · runner changed: <base> → <now>`),
 * then one line per ambiguous case.
 */
export function movedLines(moves: TddMoves): { grouped: string[]; ambiguous: string[] } {
	const exact = moves.exact.groups.map(
		(group) =>
			`${groupLine({ label: MOVED_LABEL, group })}${group.surroundingsChanged ? MOVED_SURROUNDINGS_CHANGED : ''}`,
	)
	const byName = moves.byName.groups.map(
		(group) =>
			`${groupLine({ label: MOVED_BY_NAME_LABEL, group })}${fillTemplate({
				template: MOVED_RUNNER_CHANGED,
				values: { from: group.runnerFrom.join(', '), to: group.runnerTo.join(', ') },
			})}`,
	)
	const ambiguous = [...moves.exact.ambiguous, ...moves.byName.ambiguous].map((each) =>
		fillTemplate({
			template: AMBIGUOUS_MOVE_LINE,
			values: {
				case: `${each.name}${each.project ? ` [${each.project}]` : ''}`,
				files: [...each.files].sort().join(', '),
			},
		}),
	)
	return { grouped: [...exact, ...byName], ambiguous }
}

/** The line of the collect-only run of the base: how many files, how long; or why it failed. */
export function baseCollectLine(moves: TddMoves): string | undefined {
	const collect = moves.baseCollect
	if (!collect) return undefined
	const line = fillTemplate({
		template: BASE_COLLECT_LINE,
		values: { files: String(collect.files), duration: formatDuration(collect.milliseconds) },
	})
	return collect.failure
		? `${line}  ${fillTemplate({ template: BASE_COLLECT_FAILED_LINE, values: { failure: collect.failure } })}`
		: line
}

/**
 * The template with each `{name}` replaced by its value, in one pass and by a replacer: a value (a case name,
 * a runner call) is never read as a replacement pattern (`$&`) nor filled again.
 */
function fillTemplate(params: { template: string; values: Record<string, string> }): string {
	return params.template.replace(
		/\{(\w+)\}/g,
		(placeholder, name: string) => params.values[name] ?? placeholder,
	)
}

/** The labels of every case moved, exactly or by name. */
export function movedCaseLabels(moves: TddMoves): Set<string> {
	return new Set(
		[...moves.exact.groups, ...moves.byName.groups].flatMap((group) => group.cases.map(caseLabel)),
	)
}

/** The source files cases moved from, exactly or by name. */
export function movedSources(moves: TddMoves): Set<string> {
	return new Set([...moves.exact.groups, ...moves.byName.groups].map((group) => group.source))
}

/** `moved  <n> case(s)  <source> → <k> file(s)`. */
function groupLine(params: { label: string; group: MovedGroup }): string {
	const { group } = params
	return `${params.label}  ${group.cases.length} case(s)  ${group.source} → ${group.targets.length} file(s)`
}

/**
 * Every test call of the source's base text moved out by an exact move (by call key): only then does its
 * moved line stand for the deleted file; a partial move keeps the file's deleted finding.
 */
export function allCallsMoved(params: {
	file: string
	baseText: string
	moves: TddMoves
}): boolean {
	const moved = new Set(
		params.moves.exact.groups
			.filter((group) => group.source === params.file)
			.flatMap((group) => group.callKeys ?? []),
	)
	return callKeysOf({ text: params.baseText, file: params.file }).every((key) => moved.has(key))
}

/** The key of each test call of the text: its tokens and its describe path. */
function callKeysOf(params: { text: string; file: string }): string[] {
	return listTestCalls(params).map((call) => callKeyOf({ call, file: params.file }))
}

/** A test call's key: its describe path, then the tokens of its text (those its case hash reads). */
function callKeyOf(params: {
	call: { text: string; describePath: (string | undefined)[] }
	file: string
}): string {
	return `${JSON.stringify(params.call.describePath)}\0${testCodeTokens({ text: params.call.text, file: params.file })}`
}

/** Candidates whose name and project are matched in one file only; the others ambiguous, naming every file. */
function oneToOne(candidates: readonly MoveCandidate[]): {
	unique: MoveCandidate[]
	ambiguous: AmbiguousMove[]
} {
	const byName = new Map<string, MoveCandidate[]>()
	for (const candidate of candidates) {
		const key = nameKeyOf(candidate.testCase)
		const matched = byName.get(key) ?? []
		matched.push(candidate)
		byName.set(key, matched)
	}
	const unique: MoveCandidate[] = []
	const ambiguous: AmbiguousMove[] = []
	for (const matched of byName.values()) {
		const files = [...new Set(matched.map((each) => each.testCase.file))]
		if (files.length === 1) unique.push(...matched)
		else
			ambiguous.push({
				name: matched[0].testCase.name,
				project: matched[0].testCase.project,
				files,
			})
	}
	return { unique, ambiguous }
}

/** The moved cases grouped per source, in the order the cases came; each target and call key once. */
function groupBySource(
	moved: readonly MoveCandidate[],
): Array<Omit<MovedGroup, 'surroundingsChanged'>> {
	const groups = new Map<string, Omit<MovedGroup, 'surroundingsChanged'>>()
	for (const { testCase, source, key } of moved) {
		const group = groups.get(source) ?? { source, cases: [], targets: [], callKeys: [] }
		group.cases.push(testCase)
		addOnce({ list: group.targets, item: testCase.file })
		if (group.callKeys) addOnce({ list: group.callKeys, item: key })
		groups.set(source, group)
	}
	return [...groups.values()]
}

/**
 * A target's code outside its test calls differs from its source's at the base, read by the same tokens:
 * the target's statements against the source's under the describe paths the target has (a split keeps
 * only some suites of the source).
 */
function surroundingsDiffer(params: {
	source: { file: string; text: string }
	target: { file: string; text: string }
}): boolean {
	const source = listSurroundings(params.source)
	const target = listSurroundings(params.target)
	const paths = new Set(target.paths)
	function keysOf(params: {
		surroundings: typeof source
		file: string
		within?: Set<string>
	}): string {
		return params.surroundings.statements
			.filter((statement) => !params.within || params.within.has(statement.path))
			.map(
				(statement) =>
					`${statement.path}\0${testCodeTokens({ text: statement.text, file: params.file })}`,
			)
			.sort()
			.join('\n')
	}
	return (
		keysOf({ surroundings: source, file: params.source.file, within: paths }) !==
		keysOf({ surroundings: target, file: params.target.file })
	)
}

/** The registrations grouped by name and project. */
function groupByName(
	registrations: readonly NamedRegistration[],
): Map<string, NamedRegistration[]> {
	const byName = new Map<string, NamedRegistration[]>()
	for (const registration of registrations) {
		const key = nameKeyOf(registration)
		const named = byName.get(key) ?? []
		named.push(registration)
		byName.set(key, named)
	}
	return byName
}

function nameKeyOf(testCase: TestCaseId): string {
	return `${testCase.name}\0${testCase.project}`
}

function addOnce(params: { list: string[]; item: string }): void {
	if (!params.list.includes(params.item)) params.list.push(params.item)
}

function idOf(testCase: TestCaseId): TestCaseId {
	return { file: testCase.file, name: testCase.name, project: testCase.project }
}
