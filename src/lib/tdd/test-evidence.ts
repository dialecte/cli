/**
 * What the lot's tests record says of its committed HEAD (D4), read once for `lot land`, `lot approve` and `lot
 * review`'s approve line: a failure on record refuses, whatever tree it was seen on, until a run that covers it
 * records a pass; a record that does not read refuses; a pass of another tree never counts as passing.
 */
import { failingDetail } from '../gate-records/card-gates.ts'
import { SHORT_SHA_LENGTH } from '../gate-records/gate-records.constants.ts'
import { headStateHashOf } from '../gate-records/state-hash.ts'
import { fileOfTestKey } from '../gate/vitest-output.ts'
import { tryReadGit } from '../git.ts'
import { fillMessage } from '../knowledge/standard/fill-message.ts'
import {
	EVIDENCE_ITEMS_SHOWN,
	HEAD_FILES_ARGUMENTS,
	TEST_EVIDENCE_TEXTS,
} from './test-evidence.constants.ts'
import { TESTS_FILE_FAULTS } from './tests-record.constants.ts'
import { readTestsFile, testsRecordFault } from './tests-record.ts'

import type { EvidenceFailure, TestEvidence } from './test-evidence.types.ts'
import type {
	TestFailure,
	TestsFileRead,
	TestsRecord,
	TestsRecordGate,
} from './tests-record.types.ts'

/**
 * The reason `lot land` and `lot approve` refuse the lot in `lotFolder` whose worktree is `worktree`: a failure on its
 * tests record, or a record (or committed HEAD) that cannot be read; undefined when the evidence passes, is stale or
 * absent.
 *
 * @intent tell, once for lot land, lot approve and lot review, whether a failing test stands on the lot's record
 * @internal
 */
export function testEvidenceRefusalOf(params: {
	lotFolder: string
	worktree: string
}): string | undefined {
	return evidenceRefusalOf({ evidence: testEvidenceOf(params), worktree: params.worktree })
}

/** The evidence of the lot's `tests.json` against its worktree's committed HEAD. */
export function testEvidenceOf(params: { lotFolder: string; worktree: string }): TestEvidence {
	const read = readTestsFile({ folder: params.lotFolder })
	if ('absent' in read) return { state: 'none' }
	try {
		const treeHash = headStateHashOf({ root: params.worktree })
		const listed = tryReadGit({ root: params.worktree, args: [...HEAD_FILES_ARGUMENTS] })
		if (listed === undefined) throw new Error(HEAD_FILES_ARGUMENTS.join(' '))
		const heldFiles = new Set(listed.split('\n').filter(Boolean))
		return testEvidenceFrom({ read, treeHash, heldFiles })
	} catch (error) {
		return {
			state: 'unreadable',
			why: fillMessage({
				template: TEST_EVIDENCE_TEXTS.noHeadTree,
				values: { worktree: params.worktree, why: (error as Error).message },
			}),
		}
	}
}

/** The evidence of a read `tests.json` against the committed HEAD's tree hash and the files that HEAD holds. */
export function testEvidenceFrom(params: {
	read: TestsFileRead
	treeHash: string
	heldFiles: ReadonlySet<string>
}): TestEvidence {
	const { read, treeHash } = params
	if ('absent' in read) return { state: 'none' }
	if ('unreadable' in read) return { state: 'unreadable', why: read.unreadable }
	const field = testsRecordFault({ record: read.record })
	if (field !== undefined)
		return {
			state: 'unreadable',
			why: fillMessage({ template: TESTS_FILE_FAULTS.field, values: { field } }),
		}
	const { gate, tdd } = read.record
	const failures = [
		...(gate === undefined ? [] : gateFailuresOf({ gate, treeHash, heldFiles: params.heldFiles })),
		...(tdd === undefined ? [] : tddFailuresOf({ tdd, treeHash })),
	]
	if (failures.length > 0) return { state: 'failing', failures }
	if (gate === undefined && tdd === undefined) return { state: 'none' }
	const current = gate?.stateHash === treeHash && (tdd === undefined || tdd.stateHash === treeHash)
	return current ? { state: 'passing' } : { state: 'stale' }
}

/** The reason `lot land` and `lot approve` refuse on `evidence`; undefined for passing, stale and none. */
export function evidenceRefusalOf(params: {
	evidence: TestEvidence
	worktree: string
}): string | undefined {
	const { evidence, worktree } = params
	if (evidence.state === 'unreadable')
		return fillMessage({
			template: TEST_EVIDENCE_TEXTS.unreadable,
			values: { why: evidence.why, worktree },
		})
	if (evidence.state !== 'failing') return undefined
	const items = evidence.failures.map(itemOf)
	const shown = items.slice(0, EVIDENCE_ITEMS_SHOWN)
	const more = items.length - shown.length
	return fillMessage({
		template: TEST_EVIDENCE_TEXTS.failing,
		values: {
			items: [
				...shown,
				...(more > 0
					? [fillMessage({ template: TEST_EVIDENCE_TEXTS.more, values: { more: String(more) } })]
					: []),
			].join(TEST_EVIDENCE_TEXTS.itemSeparator),
			fix: fixesOf({ failures: evidence.failures, worktree }).join(
				TEST_EVIDENCE_TEXTS.fixSeparator,
			),
		},
	})
}

/** The unknown failures of a gate part, as the refusal names them (a part seeded over a damaged `tests.json`). */
export function unknownFailuresText(gate: TestsRecordGate): string {
	return (gate.failures ?? [])
		.flatMap((failure) => (failure.key === null && 'unknown' in failure ? [failure.unknown] : []))
		.map((why) => fillMessage({ template: TEST_EVIDENCE_TEXTS.unknown, values: { why } }))
		.join(TEST_EVIDENCE_TEXTS.itemSeparator)
}

/** Whether a gate part fails: an open entry, or, on a part an older cli wrote, a failed test or file counted. */
export function gateVerdictOf(gate: TestsRecordGate): 'failing' | 'passing' {
	if (gate.failures !== undefined) return gate.failures.length > 0 ? 'failing' : 'passing'
	return (gate.tests?.failed ?? 0) > 0 || (gate.testFiles?.failed ?? 0) > 0 ? 'failing' : 'passing'
}

/**
 * The gate part's failures: each open entry (a named one whose file HEAD no longer holds left out; a nameless one that
 * lost a ran key reads as one with none: only a whole-suite pass clears it), or, on a part an older cli wrote, its failed count.
 */
function gateFailuresOf(params: {
	gate: TestsRecordGate
	treeHash: string
	heldFiles: ReadonlySet<string>
}): EvidenceFailure[] {
	const { gate, treeHash, heldFiles } = params
	if (gate.failures === undefined) {
		if (gateVerdictOf(gate) === 'passing') return []
		return [
			{
				part: 'gate-counts',
				mode: gate.mode,
				head: gate.head,
				current: gate.stateHash === treeHash,
				failed: (gate.tests?.failed ?? 0) || (gate.testFiles?.failed ?? 0),
			},
		]
	}
	function held(key: string): boolean {
		return heldFiles.has(fileOfTestKey(key))
	}
	return gate.failures.flatMap(function stillOpen(failure: TestFailure): EvidenceFailure[] {
		if (failure.key !== null) {
			if (!held(failure.key)) return []
			return [{ part: 'gate', failure, current: failure.stateHash === treeHash }]
		}
		if ('unknown' in failure) return [{ part: 'gate', failure, current: false }]
		// a ran key HEAD no longer holds never runs again: only a whole-suite pass clears the entry then
		const kept = failure.ranFiles.filter(held)
		return [
			{
				part: 'gate',
				failure: { ...failure, ranFiles: kept.length === failure.ranFiles.length ? kept : [] },
				current: failure.stateHash === treeHash,
			},
		]
	})
}

/** The tdd part's red cases, each `<file> > <name>` with ` [project]`, as one failure. */
function tddFailuresOf(params: {
	tdd: NonNullable<TestsRecord['tdd']>
	treeHash: string
}): EvidenceFailure[] {
	const { tdd } = params
	const cases = tdd.cases
		.filter((testCase) => testCase.status === 'red')
		.map(
			(testCase) =>
				`${testCase.file} > ${testCase.name}${testCase.project ? ` [${testCase.project}]` : ''}`,
		)
	if (cases.length === 0) return []
	return [{ part: 'tdd', head: tdd.head, current: tdd.stateHash === params.treeHash, cases }]
}

/** One failure as the reason names it. */
function itemOf(failure: EvidenceFailure): string {
	const tree =
		failure.part === 'gate' && failure.failure.key === null && 'unknown' in failure.failure
			? ''
			: treeWord(failure.current)
	if (failure.part === 'tdd')
		return fillMessage({
			template: TEST_EVIDENCE_TEXTS.tdd,
			values: { head: shortOf(failure.head), tree, cases: failingDetail(failure.cases) },
		})
	if (failure.part === 'gate-counts')
		return fillMessage({
			template: TEST_EVIDENCE_TEXTS.counts,
			values: {
				mode: failure.mode ?? TEST_EVIDENCE_TEXTS.noMode,
				head: shortOf(failure.head),
				tree,
				failed: String(failure.failed),
			},
		})
	const entry = failure.failure
	if (entry.key === null && 'unknown' in entry)
		return fillMessage({ template: TEST_EVIDENCE_TEXTS.unknown, values: { why: entry.unknown } })
	if (entry.key === null)
		return fillMessage({
			template: TEST_EVIDENCE_TEXTS.nameless,
			values: {
				mode: entry.mode,
				head: shortOf(entry.head),
				tree,
				failed:
					entry.failed === null
						? TEST_EVIDENCE_TEXTS.namelessNoCounts
						: fillMessage({
								template: TEST_EVIDENCE_TEXTS.namelessFailed,
								values: { failed: String(entry.failed) },
							}),
			},
		})
	return fillMessage({
		template: TEST_EVIDENCE_TEXTS.named,
		values: {
			key: entry.key,
			cases:
				entry.cases.length === 0
					? ''
					: fillMessage({
							template: TEST_EVIDENCE_TEXTS.namedCases,
							values: { cases: failingDetail(entry.cases) },
						}),
			mode: entry.mode,
			head: shortOf(entry.head),
			tree,
		},
	})
}

/**
 * The fixes the failures need, each once: a whole-suite run for an unknown entry, an older cli's count or a nameless
 * entry with no ran key left; else the newest gate entry's mode (or `--release`); `tdd green` for red cases.
 */
function fixesOf(params: { failures: readonly EvidenceFailure[]; worktree: string }): string[] {
	const { failures, worktree } = params
	const gates = failures.flatMap((failure) => (failure.part === 'gate' ? [failure.failure] : []))
	const wholeSuite =
		failures.some((failure) => failure.part === 'gate-counts') ||
		gates.some((entry) => entry.key === null && ('unknown' in entry || entry.ranFiles.length === 0))
	const newest = gates
		.flatMap((entry) => ('mode' in entry ? [entry] : []))
		.sort((one, other) => other.at.localeCompare(one.at))[0]
	const gateFix = wholeSuite
		? fillMessage({ template: TEST_EVIDENCE_TEXTS.fixWholeSuite, values: { worktree } })
		: newest === undefined
			? undefined
			: fillMessage({
					template: TEST_EVIDENCE_TEXTS.fixGate,
					values: { mode: newest.mode, worktree },
				})
	const tddFix = failures.some((failure) => failure.part === 'tdd')
		? fillMessage({ template: TEST_EVIDENCE_TEXTS.fixTdd, values: { worktree } })
		: undefined
	return [gateFix, tddFix].filter((fix): fix is string => fix !== undefined)
}

function treeWord(current: boolean): string {
	return current ? TEST_EVIDENCE_TEXTS.thisTree : TEST_EVIDENCE_TEXTS.anotherTree
}

function shortOf(head: string): string {
	return head.slice(0, SHORT_SHA_LENGTH)
}
