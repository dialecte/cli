/**
 * The verdict of the mutation gate on a StrykerJS report: every mutant a test notices (killed, or timed out again
 * when run alone), or recorded with the reason it cannot change any output. A record's key hashes what the mutant
 * changed - file, mutator, original code, replacement, the text of its line - and counts the identical lines written
 * earlier in the file, so a line moving does not unlist it.
 */
import { createHash } from 'node:crypto'

import {
	KILLED_STATUS,
	MUTATE_TARGET,
	MUTATION_FAMILIES,
	SURVIVING_STATUSES,
	TIMEOUT_STATUS,
} from './mutation.constants.ts'

import type {
	MutateTarget,
	MutationRecord,
	MutationRecords,
	MutationReport,
	Position,
	ReportedFile,
	ReportedMutant,
	Survivor,
	Verdict,
} from './mutation.types.ts'

/**
 * The survivors, those the records do not list with a reason, and the recorded mutants that no longer survive: one
 * the run tested and killed, or, in a file mutated whole, one the run no longer finds.
 */
export function judgeReport(params: {
	report: MutationReport
	records: MutationRecords
	wholeFiles?: readonly string[]
}): Verdict {
	const { report, records, wholeFiles = [] } = params
	const testNames = testNamesOf({ report })
	const tested = Object.entries(report.files).flatMap(([file, reported]) =>
		reported.mutants.map((mutant) => ({
			mutant,
			survivor: describeMutant({ file, reported, mutant, testNames }),
		})),
	)
	const survivors = tested
		.filter(({ mutant }) => SURVIVING_STATUSES.has(mutant.status))
		.map(({ survivor }) => survivor)
	const unlisted = survivors.filter(
		(survivor) => !isListed({ record: records[survivor.file]?.[survivor.key] }),
	)
	const killed = tested
		.filter(
			({ mutant, survivor }) =>
				!SURVIVING_STATUSES.has(mutant.status) &&
				records[survivor.file]?.[survivor.key] !== undefined,
		)
		.map(({ survivor: { file, key } }) => ({ file, key }))
	const found = new Set(tested.map(({ survivor: { file, key } }) => `${file}\0${key}`))
	const gone = wholeFiles.flatMap((file) =>
		Object.keys(records[file] ?? {})
			.filter((key) => !found.has(`${file}\0${key}`))
			.map((key) => ({ file, key })),
	)
	return { survivors, unlisted, stale: [...killed, ...gone] }
}

/**
 * The survivor keys of a report's mutants: those a test detected (killed, or timed out) and every mutant the report
 * holds. What a ledger update needs to tell a survivor a run killed from one whose code is gone.
 */
export function mutantKeysOf(params: { report: MutationReport }): {
	detected: string[]
	tested: string[]
} {
	const { report } = params
	const testNames = testNamesOf({ report })
	const described = Object.entries(report.files).flatMap(([file, reported]) =>
		reported.mutants.map((mutant) => ({
			status: mutant.status,
			key: describeMutant({ file, reported, mutant, testNames }).key,
		})),
	)
	return {
		detected: [
			...new Set(
				described
					.filter(({ status }) => status === KILLED_STATUS || status === TIMEOUT_STATUS)
					.map(({ key }) => key),
			),
		],
		tested: [...new Set(described.map(({ key }) => key))],
	}
}

/** The records with the run's survivors (a reason, family and hashes already written are kept) and without the stale ones. */
export function recordSurvivors(params: {
	records: MutationRecords
	verdict: Verdict
}): MutationRecords {
	const { records, verdict } = params
	const next: Record<string, Record<string, MutationRecord>> = Object.fromEntries(
		Object.entries(records).map(([file, mutants]) => [file, { ...mutants }]),
	)
	for (const { file, key } of verdict.stale) delete next[file]?.[key]
	for (const { file, key, line, mutation, lineHash, testsHash } of verdict.survivors) {
		const written = records[file]?.[key]
		next[file] = {
			...next[file],
			[key]: written
				? { ...written, line, mutation }
				: {
						line,
						mutation,
						family: 'unclassified',
						reason: '',
						lineHash,
						...(testsHash === undefined ? {} : { testsHash }),
					},
		}
	}
	return Object.fromEntries(
		Object.entries(next)
			.filter(([, mutants]) => Object.keys(mutants).length > 0)
			.sort(([first], [second]) => first.localeCompare(second))
			.map(([file, mutants]) => [
				file,
				Object.fromEntries(
					Object.entries(mutants).sort(([, first], [, second]) => first.line - second.line),
				),
			]),
	)
}

/**
 * The key a record stores a survivor under: a hash of the file, mutator, original code, replacement, the text of the
 * mutated line and its column. Equal to scl's key for the same input, so migrated records keep matching. Reach for it
 * to look a survivor up in the records.
 */
export function survivorKey(params: {
	file: string
	mutatorName: string
	original: string
	replacement: string
	line: string
	column: number
}): string {
	const { file, mutatorName, original, replacement, line, column } = params
	return createHash('sha256')
		.update([file, mutatorName, original, replacement, line, column].join('\0'))
		.digest('hex')
		.slice(0, 16)
}

/** A `--mutate` target read as StrykerJS reads it. */
export function parseTarget(params: { target: string }): MutateTarget {
	const [, file = '', startLine, startColumn, endLine, endColumn] =
		MUTATE_TARGET.exec(params.target) ?? []
	if (startLine === undefined || endLine === undefined) return { file }
	return {
		file,
		range: {
			start: { line: Number(startLine), column: Number(startColumn ?? 0) },
			end: { line: Number(endLine), column: Number(endColumn ?? Number.MAX_SAFE_INTEGER) },
		},
	}
}

/**
 * The report cut to the mutants of the targets: an incremental report also carries the results of earlier runs on
 * other files and ranges, which this run did not ask for.
 */
export function withinTargets(params: {
	report: MutationReport
	targets: readonly MutateTarget[]
}): MutationReport {
	const { report, targets } = params
	const files = Object.entries(report.files).flatMap(
		([file, reported]): [string, ReportedFile][] => {
			const ofFile = targets.filter((target) => target.file === file)
			const mutants = reported.mutants.filter((mutant) =>
				ofFile.some(({ range }) => range === undefined || contains({ range, mutant })),
			)
			return mutants.length > 0 ? [[file, { ...reported, mutants }]] : []
		},
	)
	return { ...report, files: Object.fromEntries(files) }
}

/**
 * The report with the verdicts of the timed-out mutants run again alone: each takes the status of its lone run, so a
 * timeout stays one only when it repeats. The lone run re-mutates them at their ranges.
 */
export function withLoneTimeouts(params: {
	report: MutationReport
	alone: MutationReport
}): MutationReport {
	const { report, alone } = params
	const statusAlone = new Map(
		Object.entries(alone.files).flatMap(([file, { mutants }]) =>
			mutants.map((mutant): [string, string] => [sameMutant({ file, mutant }), mutant.status]),
		),
	)
	return mapMutants({
		report,
		map: ({ file, mutant }) =>
			mutant.status === TIMEOUT_STATUS
				? { ...mutant, status: statusAlone.get(sameMutant({ file, mutant })) ?? mutant.status }
				: mutant,
	})
}

/**
 * The fast run's report with the full run's verdicts on its survivors: a mutant either run kills is killed. The full
 * run re-mutates only the survivors, at their ranges.
 */
export function withFullRun(params: {
	fast: MutationReport
	full: MutationReport
}): MutationReport {
	const { fast, full } = params
	const killedInFull = new Set(
		Object.entries(full.files).flatMap(([file, { mutants }]) =>
			mutants
				.filter((mutant) => !SURVIVING_STATUSES.has(mutant.status))
				.map((mutant) => sameMutant({ file, mutant })),
		),
	)
	return mapMutants({
		report: fast,
		map: ({ file, mutant }) =>
			SURVIVING_STATUSES.has(mutant.status) && killedInFull.has(sameMutant({ file, mutant }))
				? { ...mutant, status: KILLED_STATUS }
				: mutant,
	})
}

/** The mutants of a status, each at its range, once each. */
export function rangesOf(params: {
	report: MutationReport
	select: (status: string) => boolean
}): string[] {
	const { report, select } = params
	const ranges = Object.entries(report.files).flatMap(([file, { mutants }]) =>
		mutants.filter(({ status }) => select(status)).map((mutant) => exactRange({ file, mutant })),
	)
	return [...new Set(ranges)]
}

/**
 * A mutant's location in StrykerJS's `--mutate file:line:column-line:column` form - both columns counted from 0,
 * where the report counts them from 1 - so a run re-mutates that mutant (and the mutants nested in it).
 */
export function exactRange(params: { file: string; mutant: ReportedMutant }): string {
	const { file, mutant } = params
	const { start, end } = mutant.location
	return `${file}:${start.line}:${start.column - 1}-${end.line}:${end.column - 1}`
}

function describeMutant(params: {
	file: string
	reported: ReportedFile
	mutant: ReportedMutant
	testNames: ReadonlyMap<string, string>
}): Survivor {
	const { file, reported, mutant, testNames } = params
	const lines = reported.source.split('\n')
	const { start } = mutant.location
	const startLine = lines[start.line - 1] ?? ''
	const text = startLine.trim()
	const original = slice({ source: reported.source, mutant })
	const replacement = mutant.replacement ?? ''
	const base = survivorKey({
		file,
		mutatorName: mutant.mutatorName,
		original,
		replacement,
		line: text,
		column: start.column - 1 - (startLine.length - startLine.trimStart().length),
	})
	// the same line written earlier in the file: numbered in reading order
	const repeat = lines.slice(0, start.line - 1).filter((line) => line.trim() === text).length
	return {
		file,
		key: repeat === 0 ? base : `${base}-${repeat}`,
		line: start.line,
		mutation: `${mutant.mutatorName}: ${original} -> ${replacement}`.slice(0, 160),
		range: exactRange({ file, mutant }),
		lineHash: hashLine({ text: startLine }),
		...testsHashOf({ coveredBy: mutant.coveredBy, testNames }),
	}
}

/** Each test id of the run with the test it names, `<test file>#<name>`: ids change from run to run, this does not. */
function testNamesOf(params: { report: MutationReport }): ReadonlyMap<string, string> {
	return new Map(
		Object.entries(params.report.testFiles ?? {}).flatMap(([file, { tests }]) =>
			tests.map(({ id, name }): [string, string] => [id, `${file}#${name}`]),
		),
	)
}

/** The tests hash of a mutant's covering tests; none when the report names none or an id it cannot resolve. */
function testsHashOf(params: {
	coveredBy: readonly string[] | undefined
	testNames: ReadonlyMap<string, string>
}): { testsHash?: string } {
	const { coveredBy, testNames } = params
	if (coveredBy === undefined) return {}
	const tests = coveredBy.map((id) => testNames.get(id))
	return tests.every((test) => test !== undefined) ? { testsHash: hashTests({ tests }) } : {}
}

/** The source text a mutant replaces. */
function slice(params: { source: string; mutant: ReportedMutant }): string {
	const { source, mutant } = params
	const { start, end } = mutant.location
	return source.slice(offsetOf({ source, position: start }), offsetOf({ source, position: end }))
}

function offsetOf(params: { source: string; position: Position }): number {
	const { source, position } = params
	let offset = 0
	for (let line = 1; line < position.line; line++) offset = source.indexOf('\n', offset) + 1
	return offset + position.column - 1
}

/** Whether a target's range holds the mutant (the report's columns from 1, the range's from 0). */
function contains(params: {
	range: NonNullable<MutateTarget['range']>
	mutant: ReportedMutant
}): boolean {
	const { range, mutant } = params
	const { start, end } = mutant.location
	return (
		compare({ first: range.start, second: { line: start.line, column: start.column - 1 } }) <= 0 &&
		compare({ first: { line: end.line, column: end.column - 1 }, second: range.end }) <= 0
	)
}

function compare(params: { first: Position; second: Position }): number {
	const { first, second } = params
	return first.line === second.line ? first.column - second.column : first.line - second.line
}

function mapMutants(params: {
	report: MutationReport
	map: (params: { file: string; mutant: ReportedMutant }) => ReportedMutant
}): MutationReport {
	const { report, map } = params
	return {
		...report,
		files: Object.fromEntries(
			Object.entries(report.files).map(([file, reported]) => [
				file,
				{ ...reported, mutants: reported.mutants.map((mutant) => map({ file, mutant })) },
			]),
		),
	}
}

/** A mutant across two runs: its file, location, mutator and replacement (ids differ from run to run). */
function sameMutant(params: { file: string; mutant: ReportedMutant }): string {
	const { file, mutant } = params
	const { start, end } = mutant.location
	return [
		file,
		start.line,
		start.column,
		end.line,
		end.column,
		mutant.mutatorName,
		mutant.replacement ?? '',
	].join('\0')
}

/** A record that lists its survivor: a reason written and a known family (a gap is no family: it gets a test). */
export function isListed(params: { record: MutationRecord | undefined }): boolean {
	const { record } = params
	return (
		record !== undefined &&
		record.reason.trim() !== '' &&
		(MUTATION_FAMILIES as readonly string[]).includes(record.family)
	)
}

/**
 * Whether a record must be judged again: the text of its line changed, or the tests that kill around it did. A
 * migrated record (no `testsHash`) keeps its reason until its line changes. Reach for it before trusting a written
 * reason on a re-run.
 */
export function needsJudging(params: {
	record: MutationRecord
	lineHash: string
	testsHash: string
}): boolean {
	const { record, lineHash, testsHash } = params
	if (record.lineHash !== lineHash) return true
	return record.testsHash !== undefined && record.testsHash !== testsHash
}

/** The hash of a line's text, surrounding whitespace ignored: what a record's `lineHash` holds. */
export function hashLine(params: { text: string }): string {
	return shortHash({ text: params.text.trim() })
}

/** The hash of a set of test ids, independent of their order and of repeats: what a record's `testsHash` holds. */
export function hashTests(params: { tests: readonly string[] }): string {
	return shortHash({ text: JSON.stringify([...new Set(params.tests)].sort()) })
}

function shortHash(params: { text: string }): string {
	return createHash('sha256').update(params.text).digest('hex').slice(0, 16)
}
