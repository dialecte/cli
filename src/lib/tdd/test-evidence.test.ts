/**
 * What the lot's tests record says of its committed HEAD (D4): the evidence table, the refusal's text, and the gate
 * verdict the change request's tests box reads.
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { createScratchRepository, git, temporaryFolder } from '../../../test/scratch-repository.ts'
import { hashStateTree } from '../gate-records/state-hash.ts'
import {
	evidenceRefusalOf,
	gateVerdictOf,
	testEvidenceFrom,
	testEvidenceOf,
} from './test-evidence.ts'

import { describe, expect, it } from 'vitest'

import type { TestEvidence } from './test-evidence.types.ts'
import type { TestFailure, TestsRecord, TestsRecordGate } from './tests-record.types.ts'

const HEAD = 'a'.repeat(40)
const OLD_HEAD = 'b'.repeat(40)
const TREE = '1'.repeat(64)
const OLD_TREE = '2'.repeat(64)
const KEY = '|node| src/a.test.ts'
const HELD = new Set(['src/a.test.ts', 'src/b.test.ts'])
const WORKTREE = '/work/lot'

/** A named entry of `KEY` (two cases) seen on `stateHash`. */
function named(stateHash: string, key = KEY): TestFailure {
	return {
		key,
		cases: [`${key} > group > one`, `${key} > group > two`],
		mode: 'fast',
		head: stateHash === TREE ? HEAD : OLD_HEAD,
		stateHash,
		at: 'T10',
	}
}

/** A gate part of `stateHash` holding `failures` (absent: a part an older cli wrote, with `failed` counted). */
function gate(params: {
	stateHash: string
	failures?: TestFailure[]
	failed?: number
}): TestsRecordGate {
	return {
		mode: 'fast',
		at: 'T10',
		head: params.stateHash === TREE ? HEAD : OLD_HEAD,
		stateHash: params.stateHash,
		tests: { passed: 3, failed: params.failed ?? 0, skipped: 0, total: 3 + (params.failed ?? 0) },
		...(params.failures !== undefined && { failures: params.failures }),
	}
}

/** The evidence of a record holding `parts`, on the committed tree `TREE`. */
function evidenceOf(parts: Omit<TestsRecord, 'schema'>): TestEvidence {
	return testEvidenceFrom({
		read: { record: { schema: 1, ...parts } },
		treeHash: TREE,
		heldFiles: HELD,
	})
}

/** A tdd part of `stateHash` with one green case and, when given, one red case. */
function tdd(params: { stateHash: string; red?: boolean }): TestsRecord['tdd'] {
	return {
		at: 'T09',
		head: HEAD,
		stateHash: params.stateHash,
		cases: [
			{ file: 'src/a.test.ts', name: 'a -> b', status: 'green' },
			...(params.red
				? [{ file: 'src/b.test.ts', name: 'c -> d', project: 'node', status: 'red' as const }]
				: []),
		],
		counts: params.red ? { green: 1, red: 1 } : { green: 1 },
	}
}

describe('testEvidenceFrom - the evidence table', () => {
	it.each([
		{
			what: 'an open entry of this tree',
			parts: { gate: gate({ stateHash: TREE, failures: [named(TREE)] }) },
			state: 'failing',
		},
		{
			what: 'an open entry of another tree',
			parts: { gate: gate({ stateHash: TREE, failures: [named(OLD_TREE)] }) },
			state: 'failing',
		},
		{
			what: 'a nameless entry',
			parts: {
				gate: gate({
					stateHash: TREE,
					failures: [
						{
							key: null,
							mode: 'fast',
							head: HEAD,
							stateHash: TREE,
							at: 'T10',
							ranFiles: [KEY],
							failed: 1,
						},
					],
				}),
			},
			state: 'failing',
		},
		{
			what: 'an unknown entry',
			parts: {
				gate: gate({
					stateHash: TREE,
					failures: [{ key: null, unknown: 'tests.json did not read', at: 'T10' }],
				}),
			},
			state: 'failing',
		},
		{
			what: 'a red case in the tdd part',
			parts: {
				tdd: tdd({ stateHash: TREE, red: true }),
				gate: gate({ stateHash: TREE, failures: [] }),
			},
			state: 'failing',
		},
		{
			what: 'an older cli’s part counting a failed test',
			parts: { gate: gate({ stateHash: OLD_TREE, failed: 1 }) },
			state: 'failing',
		},
		{
			what: 'an entry whose file HEAD no longer holds (left out)',
			parts: {
				gate: gate({ stateHash: TREE, failures: [named(TREE, '|node| src/gone.test.ts')] }),
			},
			state: 'passing',
		},
		{
			what: 'a passing gate part of this tree (a flaky run opened nothing)',
			parts: { gate: gate({ stateHash: TREE, failures: [], failed: 1 }) },
			state: 'passing',
		},
		{
			what: 'a passing gate part and a tdd part of this tree',
			parts: { tdd: tdd({ stateHash: TREE }), gate: gate({ stateHash: TREE, failures: [] }) },
			state: 'passing',
		},
		{
			what: 'a passing gate part of another tree',
			parts: { gate: gate({ stateHash: OLD_TREE, failures: [] }) },
			state: 'stale',
		},
		{
			what: 'a tdd part and no gate part',
			parts: { tdd: tdd({ stateHash: TREE }) },
			state: 'stale',
		},
		{ what: 'neither part', parts: {}, state: 'none' },
	])('$what -> $state', ({ parts, state }) => {
		expect(evidenceOf(parts as Omit<TestsRecord, 'schema'>).state).toBe(state)
	})

	it('no tests.json -> none', () => {
		expect(testEvidenceFrom({ read: { absent: true }, treeHash: TREE, heldFiles: HELD })).toEqual({
			state: 'none',
		})
	})

	it('a tests.json that does not read -> unreadable, with why', () => {
		expect(
			testEvidenceFrom({
				read: { unreadable: 'Unexpected end of JSON input' },
				treeHash: TREE,
				heldFiles: HELD,
			}),
		).toEqual({
			state: 'unreadable',
			why: 'Unexpected end of JSON input',
		})
	})

	it('a record with a faulty field -> unreadable, naming the field', () => {
		const faulty = {
			schema: 1,
			gate: { ...gate({ stateHash: TREE, failures: [] }), stateHash: 7 },
		} as unknown as TestsRecord

		expect(testEvidenceFrom({ read: { record: faulty }, treeHash: TREE, heldFiles: HELD })).toEqual(
			{
				state: 'unreadable',
				why: expect.stringContaining('stateHash'),
			},
		)
	})
})

describe('evidenceRefusalOf - the reason', () => {
	it('a named entry of this tree -> its key, its cases, mode, head and tree, and the fix naming the mode and --release', () => {
		const evidence = evidenceOf({ gate: gate({ stateHash: TREE, failures: [named(TREE)] }) })

		expect(evidenceRefusalOf({ evidence, worktree: WORKTREE })).toBe(
			'tests.json holds failing tests: |node| src/a.test.ts (failing 2: |node| src/a.test.ts > group > one, |node| src/a.test.ts > group > two) - gate --fast at aaaaaaaaaaaa, this tree: fix them, then run dialecte gate --fast in /work/lot (or dialecte gate --release) to record a pass (add --no-reuse when a green record answers it); a flake: run it again, a pass recorded flaky in parallel clears it',
		)
	})

	it('an entry of another tree -> named as another tree', () => {
		const evidence = evidenceOf({ gate: gate({ stateHash: TREE, failures: [named(OLD_TREE)] }) })

		expect(evidenceRefusalOf({ evidence, worktree: WORKTREE })).toContain(
			'- gate --fast at bbbbbbbbbbbb, another tree:',
		)
	})

	it('five entries -> the first three named, then +2 more', () => {
		const keys = ['a', 'b', 'c', 'd', 'e'].map((name) => `src/${name}.test.ts`)
		const held = new Set(keys)
		const evidence = testEvidenceFrom({
			read: {
				record: {
					schema: 1,
					gate: gate({
						stateHash: TREE,
						failures: keys.map((key) => ({ ...named(TREE, key), cases: [] })),
					}),
				},
			},
			treeHash: TREE,
			heldFiles: held,
		})

		expect(evidenceRefusalOf({ evidence, worktree: WORKTREE })).toContain(
			'src/a.test.ts - gate --fast at aaaaaaaaaaaa, this tree; src/b.test.ts - gate --fast at aaaaaaaaaaaa, this tree; src/c.test.ts - gate --fast at aaaaaaaaaaaa, this tree; +2 more:',
		)
	})

	it.each([
		{ failed: 2, text: '(2 failed)' },
		{ failed: null, text: '(no counts)' },
	])(
		'a nameless entry with $failed failed -> the step failed with no file named $text',
		({ failed, text }) => {
			const evidence = evidenceOf({
				gate: gate({
					stateHash: TREE,
					failures: [
						{
							key: null,
							mode: 'full',
							head: HEAD,
							stateHash: TREE,
							at: 'T10',
							ranFiles: [KEY],
							failed,
						},
					],
				}),
			})

			expect(evidenceRefusalOf({ evidence, worktree: WORKTREE })).toContain(
				`gate --full at aaaaaaaaaaaa, this tree: the test step failed with no file named ${text}`,
			)
		},
	)

	it.each([
		{
			what: 'an unknown entry',
			failure: {
				key: null,
				unknown: 'tests.json did not read (it holds no object): its failures cannot be told',
				at: 'T10',
			},
			text: 'tests.json did not read (it holds no object): its failures cannot be told: only a whole-suite pass clears it',
		},
		{
			what: 'a nameless entry whose ran keys HEAD no longer holds',
			failure: {
				key: null,
				mode: 'fast',
				head: HEAD,
				stateHash: TREE,
				at: 'T10',
				ranFiles: ['src/gone.test.ts'],
				failed: 1,
			},
			text: 'the test step failed with no file named (1 failed)',
		},
	])('$what -> its text, and the fix names gate --release only', ({ failure, text }) => {
		const evidence = evidenceOf({
			gate: gate({ stateHash: TREE, failures: [failure as TestFailure] }),
		})
		const reason = evidenceRefusalOf({ evidence, worktree: WORKTREE })

		expect({
			text: reason?.includes(text),
			fix: reason?.endsWith(
				': run dialecte gate --release in /work/lot to record a whole-suite pass',
			),
		}).toEqual({
			text: true,
			fix: true,
		})
	})

	it('an older cli’s part counting failures -> its count, no names recorded', () => {
		const evidence = evidenceOf({ gate: gate({ stateHash: OLD_TREE, failed: 3 }) })

		expect(evidenceRefusalOf({ evidence, worktree: WORKTREE })).toContain(
			'gate --fast at bbbbbbbbbbbb, another tree: 3 failed (no names recorded)',
		)
	})

	it('a red tdd case -> the case and the tdd green fix', () => {
		const evidence = evidenceOf({
			tdd: tdd({ stateHash: TREE, red: true }),
			gate: gate({ stateHash: TREE, failures: [] }),
		})

		expect(evidenceRefusalOf({ evidence, worktree: WORKTREE })).toBe(
			'tests.json holds failing tests: tdd green at aaaaaaaaaaaa, this tree: red failing 1: src/b.test.ts > c -> d [node]: make them pass and run dialecte tdd green in /work/lot',
		)
	})

	it('an unreadable record -> the why and the release fix', () => {
		expect(
			evidenceRefusalOf({
				evidence: { state: 'unreadable', why: 'Unexpected token' },
				worktree: WORKTREE,
			}),
		).toBe(
			'tests.json cannot be read: Unexpected token: run dialecte gate --release, then dialecte tdd green, in /work/lot to write it again',
		)
	})

	it.each([{ state: 'passing' as const }, { state: 'stale' as const }, { state: 'none' as const }])(
		'$state -> no reason',
		(evidence) => {
			expect(evidenceRefusalOf({ evidence, worktree: WORKTREE })).toBeUndefined()
		},
	)
})

describe('gateVerdictOf', () => {
	it.each([
		{
			what: 'an open entry',
			part: gate({ stateHash: TREE, failures: [named(TREE)] }),
			verdict: 'failing',
		},
		{
			what: 'no entry, a flaky run’s counts',
			part: gate({ stateHash: TREE, failures: [], failed: 1 }),
			verdict: 'passing',
		},
		{
			what: 'an older cli’s part counting a failure',
			part: gate({ stateHash: TREE, failed: 1 }),
			verdict: 'failing',
		},
		{
			what: 'an older cli’s part counting none',
			part: gate({ stateHash: TREE }),
			verdict: 'passing',
		},
	])('$what -> $verdict', ({ part, verdict }) => {
		expect(gateVerdictOf(part)).toBe(verdict)
	})
})

describe('evidenceRefusalOf - a nameless entry that lost a deleted key', () => {
	it('ran keys of a held file and a deleted one -> only a whole-suite pass clears it: the fix names gate --release only', () => {
		const evidence = evidenceOf({
			gate: gate({
				stateHash: TREE,
				failures: [
					{
						key: null,
						mode: 'fast',
						head: HEAD,
						stateHash: TREE,
						at: 'T10',
						ranFiles: [KEY, '|node| src/gone.test.ts'],
						failed: 1,
					},
				],
			}),
		})

		expect(evidenceRefusalOf({ evidence, worktree: WORKTREE })).toMatch(
			/: run dialecte gate --release in \/work\/lot to record a whole-suite pass$/,
		)
	})
})

describe('testEvidenceOf - a package below the repository root', () => {
	it('keys relative to the package -> an entry of a file the package holds stays open, one it no longer holds is left out', () => {
		const root = createScratchRepository({ 'pkg/src/a.test.ts': 'a\n', 'pkg/package.json': '{}\n' })
		const lotFolder = temporaryFolder('dialecte-evidence-lot-')
		const treeHash = hashStateTree(git({ root, args: ['rev-parse', 'HEAD^{tree}'] }).trim())
		const entry = { cases: [], mode: 'fast', head: HEAD, stateHash: treeHash, at: 'T10' }
		writeFileSync(
			join(lotFolder, 'tests.json'),
			JSON.stringify({
				schema: 1,
				gate: {
					mode: 'fast',
					at: 'T10',
					head: HEAD,
					stateHash: treeHash,
					failures: [
						{ key: '|node| src/a.test.ts', ...entry },
						{ key: 'src/gone.test.ts', ...entry },
					],
				},
			}),
		)

		const evidence = testEvidenceOf({ lotFolder, worktree: join(root, 'pkg') })

		expect(
			evidence.state === 'failing'
				? evidence.failures.map((failure) =>
						failure.part === 'gate' ? failure.failure.key : failure.part,
					)
				: evidence.state,
		).toEqual(['|node| src/a.test.ts'])
	})
})
