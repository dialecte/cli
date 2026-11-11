/**
 * `buildCardGateLines` and the hand-over card on a merge hand-over: a hook record of the merged tree,
 * newer than the gate record of the worktree's own tree, supersedes that gate record whole; the tdd line is the
 * worktree's, never stale for the merge's tree.
 */
import { writeFileSync } from 'node:fs'

import { gitPathOf } from '../../../test/gate-records.ts'
import {
	FAST_RECORD_FILE,
	FULL_RECORD_FILE,
	HOOK_RECORD_FILE,
	SCRATCH_REPOSITORY_TIMEOUT,
} from '../../../test/scratch-checks.constants.ts'
import {
	createBranchScenario,
	createCounter,
	gateStepLinesOf,
	headOf,
	writeMergeHandover,
} from '../../../test/scratch-checks.ts'
import { git, writeFiles } from '../../../test/scratch-repository.ts'
import { runRecap } from '../../commands/recap.ts'
import { buildCardGateLines } from './card-gates.ts'
import { hashHookCommand, readInstalledKey } from './check-key.ts'
import { storeCheckRecord } from './check-store.ts'
import { computeStateTree, hashStateTree } from './state-hash.ts'

import { describe, expect, it } from 'vitest'

import type { CardGateLine, GateRecord, RecordedStep } from './gate-records.types.ts'

/** The gate record's time, and a time before and after it. */
const GATE_TIME = '2026-11-06T10:00:00.000Z'
const OLDER_TIME = '2026-11-06T09:00:00.000Z'
const NEWER_TIME = '2026-11-06T11:00:00.000Z'
const LATEST_TIME = '2026-11-06T12:00:00.000Z'

/** git's empty tree: a tree that is neither the worktree's nor the merge's. */
const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904'
const STALE_SUFFIX = ' (the tree changed since)'
const TDD_DETAIL = '368 case(s) of the change'
const FAST_TDD_DETAIL = '12 case(s) of the change'
const TESTS_COUNTS = { tests: { passed: 3146, failed: 0, skipped: 4, total: 3150 } }
const HOOK_TESTS_COUNTS = { tests: { passed: 3186, failed: 0, skipped: 4, total: 3190 } }
const SKILLS_NOT_RUN_DETAIL = 'not run on the merged tree'

/** The steps of a `gate --full` of the worktree's own tree: tdd, check, skills (no script), build, tests. */
const GATE_STEPS: RecordedStep[] = [
	{ name: 'tdd', status: 'passed', counts: {}, note: TDD_DETAIL, cases: [] },
	{ name: 'check', status: 'passed', counts: {} },
	{ name: 'skills', status: 'skipped', counts: {}, reason: 'no npm script "skills:check"' },
	{ name: 'build', status: 'passed', counts: {} },
	{ name: 'tests', status: 'passed', counts: TESTS_COUNTS },
]

/** The steps of a core-like `gate --full`: tdd, check, skills (passed), build, tests (counting tests). */
const CORE_GATE_STEPS: RecordedStep[] = GATE_STEPS.map((step) =>
	step.name === 'skills' ? { name: 'skills', status: 'passed', counts: {} } : step,
)

/** The same with the `skills` step failed. */
const CORE_GATE_STEPS_SKILLS_FAILED: RecordedStep[] = CORE_GATE_STEPS.map((step) =>
	step.name === 'skills'
		? { name: 'skills', status: 'failed', counts: {}, reason: 'a page is out of date' }
		: step,
)

/** The steps of a core-like commit hook: check, test:run (counting tests), build. */
const CORE_HOOK_STEPS: RecordedStep[] = [
	{ name: 'check', status: 'passed', counts: {} },
	{ name: 'test:run', status: 'passed', counts: HOOK_TESTS_COUNTS },
	{ name: 'build', status: 'passed', counts: {} },
]

/** The steps of the commit hook's summary: check, test:hook, build. */
const HOOK_STEPS: RecordedStep[] = [
	{ name: 'check', status: 'passed', counts: {} },
	{ name: 'test:hook', status: 'passed', counts: HOOK_TESTS_COUNTS },
	{ name: 'build', status: 'passed', counts: {} },
]

type MergeFixture = {
	root: string
	tip: string
	/** The tree the merge hand-over commits: the trial merge of `feat/x` on main. */
	mergedTree: string
	/** The worktree's tree (HEAD's tree, the working files clean). */
	ownTree: string
}

/** A package on main and a branch `feat/x` with one commit, not merged: the merged tree is git's trial merge. */
async function mergeFixture(): Promise<MergeFixture> {
	const { root, tip } = await createBranchScenario({
		recorded: false,
		mainMoved: false,
		hookCounter: createCounter(),
		gateCounter: createCounter(),
	})
	const mergedTree = git({ root, args: ['merge-tree', '--write-tree', 'HEAD', tip] })
		.split('\n')[0]
		.trim()
	return { root, tip, mergedTree, ownTree: computeStateTree(root) }
}

/** The key a hook record of `tree` holds here, as a commit's hook (or a rehearsal's) leaves it. */
function hookKeyOf(params: { root: string; tree: string }): NonNullable<GateRecord['key']> {
	return {
		tree: params.tree,
		...readInstalledKey(params.root),
		commandHash: hashHookCommand(params.root),
	}
}

/** The worktree's own `gate --full` record, of `tree`, as the gate leaves it in the git folder. */
function writeGateRecord(params: {
	root: string
	tree: string
	at: string
	/** The recorded steps; the plain `gate --full` ones by default. */
	steps?: RecordedStep[]
}): void {
	const record: GateRecord = {
		mode: 'full',
		at: params.at,
		head: headOf(params.root),
		stateHash: hashStateTree(params.tree),
		steps: params.steps ?? GATE_STEPS,
	}
	writeFileSync(
		gitPathOf({ root: params.root, name: FULL_RECORD_FILE }),
		`${JSON.stringify(record, null, 2)}\n`,
	)
}

/**
 * A hook record of `tree`: stored by tree with the key it ran with, and, unless `rehearsal` (a rehearsal's record
 * lives in the scratch clone and the store only), in the worktree's own git folder.
 */
function writeHookRecord(params: {
	root: string
	tree: string
	at: string
	rehearsal?: boolean
	/** Only the worktree's own git folder: no stored copy (the record of a tree the card does not check). */
	ownOnly?: boolean
	/** The recorded steps; the commit hook's check, test:hook, build by default. */
	steps?: RecordedStep[]
}): void {
	const record: GateRecord = {
		mode: 'hook',
		at: params.at,
		head: headOf(params.root),
		stateHash: hashStateTree(params.tree),
		steps: params.steps ?? HOOK_STEPS,
		key: hookKeyOf(params),
		...(params.rehearsal && { origin: 'rehearsal' as const }),
	}
	if (!params.rehearsal)
		writeFileSync(
			gitPathOf({ root: params.root, name: HOOK_RECORD_FILE }),
			`${JSON.stringify(record, null, 2)}\n`,
		)
	if (!params.ownOnly) storeCheckRecord({ root: params.root, record })
}

function stale(line: CardGateLine): CardGateLine {
	return {
		...line,
		status: line.status === 'failed' ? 'failed' : 'warning',
		detail: `${line.detail}${STALE_SUFFIX}`,
		stale: true,
	}
}

/** The lines the gate steps of the worktree's own record read as, of a tree that is current. */
const OWN_GATE_LINES: CardGateLine[] = [
	{ name: 'tdd', status: 'passed', detail: TDD_DETAIL },
	{ name: 'check', status: 'passed', detail: '' },
	{ name: 'skills', status: 'warning', detail: 'not run here (no skills:check script)' },
	{ name: 'build', status: 'passed', detail: '' },
	{ name: 'tests', status: 'passed', detail: '3146 passed · 4 skipped' },
]

/** The line of the `skills` step the superseding hook did not run. */
const SKILLS_NOT_RUN_LINE: CardGateLine = {
	name: 'skills',
	status: 'warning',
	detail: SKILLS_NOT_RUN_DETAIL,
}

/** The lines of the commit hook's steps, `source` the suffix a rehearsal's record adds. */
function hookLines(source: string): CardGateLine[] {
	const suffix = source ? ` · ${source}` : ''
	return [
		{ name: 'check', status: 'passed', detail: `commit hook${suffix}` },
		{ name: 'build', status: 'passed', detail: `commit hook${suffix}` },
		{
			name: 'test:hook',
			status: 'passed',
			detail: `3186 passed · 4 skipped · commit hook${suffix}`,
		},
	]
}

/** The lines by step name, so the order the card keeps them in is no part of what a case pins. */
function byName(lines: readonly CardGateLine[]): CardGateLine[] {
	return [...lines].sort((first, second) => first.name.localeCompare(second.name))
}

function withoutTdd(lines: readonly CardGateLine[]): CardGateLine[] {
	return lines.filter((line) => line.name !== 'tdd')
}

/** The card's gate step lines of the steps these cases read, from the written merge hand-over's card. */
function cardStepLines(output: string): string[] {
	return gateStepLinesOf(output)
		.filter((line) => /^[✓!✗] (tdd|check|skills|build|tests|test:hook)\b/.test(line))
		.sort()
}

describe('buildCardGateLines: a merge hand-over, hook record of the merged tree', () => {
	it(
		'a gate --full of the worktree tree and a newer green rehearsal hook record of the merged tree → no line stale: tdd from the gate, check/build/test:hook from the hook (commit hook · rehearsal), skills not run on the merged tree, no tests line; the card header does not say gates ran on another tree',
		{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
		async () => {
			const { root, tip, mergedTree, ownTree } = await mergeFixture()
			writeGateRecord({ root, tree: ownTree, at: GATE_TIME })
			writeHookRecord({ root, tree: mergedTree, at: NEWER_TIME, rehearsal: true })

			expect(byName(buildCardGateLines({ root, tree: mergedTree }))).toEqual(
				byName([OWN_GATE_LINES[0], SKILLS_NOT_RUN_LINE, ...hookLines('rehearsal')]),
			)
			const card = writeMergeHandover({ root, tip }).output
			expect(card).not.toContain('gates ran on another tree')
			expect(cardStepLines(card)).toEqual(
				[
					`✓ tdd ${TDD_DETAIL}`,
					`! skills ${SKILLS_NOT_RUN_DETAIL}`,
					'✓ check commit hook · rehearsal',
					'✓ build commit hook · rehearsal',
					'✓ test:hook 3186 passed · 4 skipped · commit hook · rehearsal',
				].sort(),
			)
		},
	)

	it(
		'a gate --full of the worktree tree and a newer green hook record of the merged tree made by the real commit (no rehearsal origin) → the same, the lines ending commit hook, skills not run on the merged tree',
		{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
		async () => {
			const { root, tip, mergedTree, ownTree } = await mergeFixture()
			writeGateRecord({ root, tree: ownTree, at: GATE_TIME })
			writeHookRecord({ root, tree: mergedTree, at: NEWER_TIME })

			expect(byName(buildCardGateLines({ root, tree: mergedTree }))).toEqual(
				byName([OWN_GATE_LINES[0], SKILLS_NOT_RUN_LINE, ...hookLines('')]),
			)
			const card = writeMergeHandover({ root, tip }).output
			expect(card).not.toContain('gates ran on another tree')
		},
	)

	it(
		"a hook record of the merged tree OLDER than the gate record of the other tree → superseded: the hook's lines, skills not run on the merged tree, none stale",
		{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
		async () => {
			const { root, mergedTree, ownTree } = await mergeFixture()
			writeGateRecord({ root, tree: ownTree, at: GATE_TIME })
			writeHookRecord({ root, tree: mergedTree, at: OLDER_TIME })

			expect(byName(buildCardGateLines({ root, tree: mergedTree }))).toEqual(
				byName([OWN_GATE_LINES[0], SKILLS_NOT_RUN_LINE, ...hookLines('')]),
			)
		},
	)

	it(
		"a hook record of ANOTHER tree than the checked one, newer than the gate record → nothing superseded: its lines read from the hook and stale, the gate record's other steps stale",
		{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
		async () => {
			const { root, mergedTree, ownTree } = await mergeFixture()
			const thirdTree = EMPTY_TREE
			writeGateRecord({ root, tree: ownTree, at: GATE_TIME })
			writeHookRecord({ root, tree: thirdTree, at: NEWER_TIME, ownOnly: true })

			expect(withoutTdd(byName(buildCardGateLines({ root, tree: mergedTree })))).toEqual(
				byName(
					[
						...withoutTdd(OWN_GATE_LINES).filter((line) => ['skills', 'tests'].includes(line.name)),
						...hookLines(''),
					].map(stale),
				),
			)
		},
	)

	it(
		"the worktree edited after its gate run (its tree is not the gate record's) → the tdd line stale, as today",
		{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
		async () => {
			const { root, mergedTree, ownTree } = await mergeFixture()
			writeGateRecord({ root, tree: ownTree, at: GATE_TIME })
			writeFiles({ root, files: { 'src/read.ts': 'export function read() {\n\treturn 2\n}\n' } })
			writeHookRecord({ root, tree: mergedTree, at: NEWER_TIME })

			expect(
				buildCardGateLines({ root, tree: mergedTree }).filter((line) => line.name === 'tdd'),
			).toEqual([stale(OWN_GATE_LINES[0])])
		},
	)

	it(
		"a non-merge hand-over with a gate --full and a newer hook record of the same tree → lines exactly as today: the hook's steps override by name, skills and tests stay from the gate, none stale",
		{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
		async () => {
			const { root, ownTree } = await mergeFixture()
			writeGateRecord({ root, tree: ownTree, at: GATE_TIME })
			writeHookRecord({ root, tree: ownTree, at: NEWER_TIME })

			expect(byName(buildCardGateLines({ root, tree: ownTree }))).toEqual(
				byName([OWN_GATE_LINES[0], OWN_GATE_LINES[2], OWN_GATE_LINES[4], ...hookLines('')]),
			)
		},
	)
})

/** A `gate --fast` record of `tree` in the worktree's git folder: its check and tests steps. */
function writeFastRecord(params: {
	root: string
	tree: string
	at: string
	/** A tdd step of its own, with this detail, ahead of check and tests. */
	tddNote?: string
}): void {
	const tddStep: RecordedStep | undefined = params.tddNote
		? { name: 'tdd', status: 'passed', counts: {}, note: params.tddNote, cases: [] }
		: undefined
	const record: GateRecord = {
		mode: 'fast',
		at: params.at,
		head: headOf(params.root),
		stateHash: hashStateTree(params.tree),
		steps: [
			...(tddStep ? [tddStep] : []),
			...GATE_STEPS.filter((step) => ['check', 'tests'].includes(step.name)),
		],
	}
	writeFileSync(
		gitPathOf({ root: params.root, name: FAST_RECORD_FILE }),
		`${JSON.stringify(record, null, 2)}\n`,
	)
}

describe('buildCardGateLines: a hook record of the merged tree a newer gate record dropped', () => {
	it(
		'gate --full of the worktree tree, then a hook record of the merged tree, then gate --fast of the merged tree → the hook supersedes nothing: skills and build stay from the full record, stale; check and tests from the fast record; no hook line',
		{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
		async () => {
			const { root, mergedTree, ownTree } = await mergeFixture()
			writeGateRecord({ root, tree: ownTree, at: GATE_TIME })
			writeHookRecord({ root, tree: mergedTree, at: NEWER_TIME })
			writeFastRecord({ root, tree: mergedTree, at: LATEST_TIME })

			expect(byName(buildCardGateLines({ root, tree: mergedTree }))).toEqual(
				byName([
					OWN_GATE_LINES[0],
					OWN_GATE_LINES[1],
					stale(OWN_GATE_LINES[2]),
					stale(OWN_GATE_LINES[3]),
					OWN_GATE_LINES[4],
				]),
			)
		},
	)
})

describe('buildCardGateLines: a hook record of the merged tree, a newer gate record of the worktree tree', () => {
	it(
		'gate --full of the worktree tree, then a hook record of the merged tree, then a newer gate --fast of the worktree tree with its own tdd step → the hook stands: its check/build/test:hook lines, tdd from the fast record, skills not run on the merged tree, none stale',
		{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
		async () => {
			const { root, mergedTree, ownTree } = await mergeFixture()
			writeGateRecord({ root, tree: ownTree, at: GATE_TIME })
			writeHookRecord({ root, tree: mergedTree, at: NEWER_TIME })
			writeFastRecord({ root, tree: ownTree, at: LATEST_TIME, tddNote: FAST_TDD_DETAIL })

			expect(byName(buildCardGateLines({ root, tree: mergedTree }))).toEqual(
				byName([
					{ name: 'tdd', status: 'passed', detail: FAST_TDD_DETAIL },
					SKILLS_NOT_RUN_LINE,
					...hookLines(''),
				]),
			)
		},
	)
})

describe('buildCardGateLines: a core-like gate record the hook of the merged tree supersedes', () => {
	it(
		'a core-like gate --full of the worktree tree (skills and tests green) and a newer hook record of the merged tree (check, test:run counting tests, build) → tdd from the gate, the hook lines, skills not run on the merged tree and not stale, no tests line, none stale, the card READY',
		{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
		async () => {
			const { root, tip, mergedTree, ownTree } = await mergeFixture()
			writeGateRecord({ root, tree: ownTree, at: GATE_TIME, steps: CORE_GATE_STEPS })
			writeHookRecord({ root, tree: mergedTree, at: NEWER_TIME, steps: CORE_HOOK_STEPS })

			const lines = buildCardGateLines({ root, tree: mergedTree })
			expect(byName(lines)).toEqual(
				byName([
					OWN_GATE_LINES[0],
					SKILLS_NOT_RUN_LINE,
					{ name: 'check', status: 'passed', detail: 'commit hook' },
					{ name: 'build', status: 'passed', detail: 'commit hook' },
					{
						name: 'test:run',
						status: 'passed',
						detail: '3186 passed · 4 skipped · commit hook',
					},
				]),
			)
			const card = writeMergeHandover({ root, tip }).output
			expect(card).not.toContain('gates ran on another tree')
			expect(card).toMatch(/^│ READY /m)
		},
	)

	it(
		'the same with skills FAILED in the gate record → a skills line failed, its detail ending (the tree changed since), the card BLOCKED',
		{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
		async () => {
			const { root, tip, mergedTree, ownTree } = await mergeFixture()
			writeGateRecord({
				root,
				tree: ownTree,
				at: GATE_TIME,
				steps: CORE_GATE_STEPS_SKILLS_FAILED,
			})
			writeHookRecord({ root, tree: mergedTree, at: NEWER_TIME, steps: CORE_HOOK_STEPS })

			const skills = buildCardGateLines({ root, tree: mergedTree }).filter(
				(line) => line.name === 'skills',
			)
			expect(skills).toEqual([
				{
					name: 'skills',
					status: 'failed',
					detail: `a page is out of date${STALE_SUFFIX}`,
					stale: true,
				},
			])
			const card = writeMergeHandover({ root, tip }).output
			expect(card).toMatch(/^│ BLOCKED /m)
		},
	)
})

describe('lot recap: a merge hand-over, hook record of the merged tree', () => {
	it(
		'a gate --full of the worktree tree and a newer green rehearsal hook record of the merged tree → the recap checks read as the card: tdd from the gate, check/build/test:hook from the hook, skills not run on the merged tree, no tests line, none stale',
		{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
		async () => {
			const { root, tip, mergedTree, ownTree } = await mergeFixture()
			writeGateRecord({ root, tree: ownTree, at: GATE_TIME })
			writeHookRecord({ root, tree: mergedTree, at: NEWER_TIME, rehearsal: true })
			const { out } = writeMergeHandover({ root, tip })

			const { output } = runRecap({ cwd: root, argv: [out] })

			const checks = output.split('### Checks\n')[1]?.split('\n\n')[0]?.split('\n') ?? []
			expect(
				checks
					.filter((line) => /^- [✓!✗] (tdd|check|skills|build|tests|test:hook)\b/.test(line))
					.sort(),
			).toEqual(
				[
					`- ✓ tdd ${TDD_DETAIL}`,
					`- ! skills ${SKILLS_NOT_RUN_DETAIL}`,
					'- ✓ check commit hook · rehearsal',
					'- ✓ build commit hook · rehearsal',
					'- ✓ test:hook 3186 passed · 4 skipped · commit hook · rehearsal',
				].sort(),
			)
		},
	)
})
