/** A step answered by any green record of the same tree and install that ran it as it is now. */

import { SCRATCH_REPOSITORY_TIMEOUT } from '../../../test/scratch-checks.constants.ts'
import {
	createScratchRepository,
	createSharedScratchRepository,
	git,
} from '../../../test/scratch-repository.ts'
import {
	BASE_A,
	BASE_B,
	CHANGED_ONLY_STEP,
	FIRST_AT,
	HEAD,
	INSTALLED,
	KEY,
	MACHINE_NAME,
	OTHER_STEP_HASH,
	OTHER_TREE,
	RULES_STEP,
	SCOPED_TESTS_STEP,
	SECOND_AT,
	SHA256_HEX,
	STEP_HASH,
	TESTS_STEP,
	TREE,
} from '../../../test/step-reuse.constants.ts'
import { CONSUMER_NAMES_KEY } from '../rules/committed-text.constants.ts'
import { storeCheckRecord } from './check-store.ts'
import { findStepAnswer, hashGateStep } from './step-reuse.ts'

import { describe, expect, it } from 'vitest'

import type { GateStep } from '../gate/gate-config.types.ts'
import type { StepStatus } from '../gate/gate.types.ts'
import type { CheckKey, GateRecord, GateRecordMode, RecordedStep } from './gate-records.types.ts'

const sharedRepository = createSharedScratchRepository({ 'src/a.ts': 'export {}\n' })

/** A repository of the contributor profile. */
function contributorRepository(): string {
	return createScratchRepository({
		'package.json': `${JSON.stringify({ name: 'demo', dialecte: { profile: 'contributor' } })}\n`,
	})
}

/** A recorded step of `name` with a status and the hash it ran as (none: a record of an older cli). */
function stepOf(params: { name: string; status?: StepStatus; stepHash?: string }): RecordedStep {
	return {
		name: params.name,
		status: params.status ?? 'passed',
		counts: {},
		...(params.stepHash && { stepHash: params.stepHash }),
	}
}

/** A record on `KEY`, stored in the repository `root` as the gate stores one. */
function storeRecord(params: {
	root: string
	mode?: GateRecordMode
	at?: string
	key?: Partial<CheckKey>
	steps: RecordedStep[]
}): GateRecord {
	const record: GateRecord = {
		mode: params.mode ?? 'full',
		at: params.at ?? FIRST_AT,
		head: HEAD,
		stateHash: 'f'.repeat(64),
		steps: params.steps,
		key: { ...KEY, ...params.key },
	}
	storeCheckRecord({ root: params.root, record })
	return record
}

/** What an asker of `stepHash` at `tree` and the `treeKey` of that tree passes to `findStepAnswer`. */
function askOf(params: {
	root: string
	stepHash: string
	tree?: string
	treeKey?: Partial<typeof INSTALLED>
}): Parameters<typeof findStepAnswer>[0] {
	return {
		root: params.root,
		tree: params.tree ?? TREE,
		treeKey: { ...INSTALLED, ...params.treeKey },
		stepHash: params.stepHash,
	}
}

describe('hashGateStep', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('a step → a sha256 (hex)', () => {
		expect(hashGateStep({ root: sharedRepository(), step: TESTS_STEP })).toMatch(SHA256_HEX)
	})

	it('an unscoped step at two gate bases → the same hash', () => {
		const root = sharedRepository()

		expect(hashGateStep({ root, step: TESTS_STEP, gateBase: BASE_A })).toBe(
			hashGateStep({ root, step: TESTS_STEP, gateBase: BASE_B }),
		)
	})

	it('a scoped step at two gate bases → two hashes', () => {
		const root = sharedRepository()

		expect(hashGateStep({ root, step: SCOPED_TESTS_STEP, gateBase: BASE_A })).not.toBe(
			hashGateStep({ root, step: SCOPED_TESTS_STEP, gateBase: BASE_B }),
		)
	})

	it('a scoped step with no base and at a base → two hashes', () => {
		const root = sharedRepository()

		expect(hashGateStep({ root, step: SCOPED_TESTS_STEP })).not.toBe(
			hashGateStep({ root, step: SCOPED_TESTS_STEP, gateBase: BASE_A }),
		)
	})

	it('an unscoped step with no base and at a base → the same hash', () => {
		const root = sharedRepository()

		expect(hashGateStep({ root, step: TESTS_STEP })).toBe(
			hashGateStep({ root, step: TESTS_STEP, gateBase: BASE_A }),
		)
	})

	it.each<{ label: string; other: GateStep }>([
		{ label: 'another name', other: { ...TESTS_STEP, name: 'check' } },
		{ label: 'another run', other: { ...TESTS_STEP, run: 'npm run test:other' } },
		{ label: 'the scoped mark', other: SCOPED_TESTS_STEP },
		{ label: 'the unwired mark', other: { ...TESTS_STEP, unwired: true } },
		{ label: 'an opt-out', other: { ...TESTS_STEP, optedOut: 'person-a does not run it' } },
	])('$label → another hash than the plain step', ({ other }) => {
		const root = sharedRepository()

		expect(hashGateStep({ root, step: other, gateBase: BASE_A })).not.toBe(
			hashGateStep({ root, step: TESTS_STEP, gateBase: BASE_A }),
		)
	})

	it.each<{ label: string; other: GateStep }>([
		{ label: 'heavy', other: { ...TESTS_STEP, heavy: true } },
		{ label: 'a default step', other: { ...TESTS_STEP, isDefault: true } },
	])('$label → the hash of the plain step (it never enters)', ({ other }) => {
		const root = sharedRepository()

		expect(hashGateStep({ root, step: other })).toBe(hashGateStep({ root, step: TESTS_STEP }))
	})

	it.each([{ label: 'a rules step', step: RULES_STEP }])(
		'a contributor adds a consumer name on the machine; $label → another hash',
		({ step }) => {
			const root = contributorRepository()
			const hashes: string[] = []
			expect(hashes.push(hashGateStep({ root, step }))).toBe(1)
			git({ root, args: ['config', CONSUMER_NAMES_KEY, MACHINE_NAME] })

			expect(hashGateStep({ root, step })).not.toBe(hashes[0])
		},
	)

	it('a contributor adds a consumer name on the machine; a step that is no rules run → the same hash', () => {
		const root = contributorRepository()
		const hashes: string[] = []
		expect(hashes.push(hashGateStep({ root, step: TESTS_STEP }))).toBe(1)
		git({ root, args: ['config', CONSUMER_NAMES_KEY, MACHINE_NAME] })

		expect(hashGateStep({ root, step: TESTS_STEP })).toBe(hashes[0])
	})

	it('a changedOnly step at two HEADs → two hashes; an unscoped step at two HEADs → the same hash', () => {
		const root = createScratchRepository({ 'src/a.ts': 'export {}\n' })
		const first: string[] = []
		expect(first.push(hashGateStep({ root, step: CHANGED_ONLY_STEP }))).toBe(1)
		expect(first.push(hashGateStep({ root, step: TESTS_STEP }))).toBe(2)
		git({ root, args: ['commit', '-q', '--allow-empty', '-m', 'chore: move HEAD'] })

		expect([
			hashGateStep({ root, step: CHANGED_ONLY_STEP }) === first[0],
			hashGateStep({ root, step: TESTS_STEP }) === first[1],
		]).toEqual([false, true])
	})

	it('records of a step hashed at a base → an unscoped step answers an asker at another base, a scoped step only at the same base', () => {
		const root = createScratchRepository({ 'src/a.ts': 'export {}\n' })
		const scopedStep: GateStep = { ...SCOPED_TESTS_STEP, name: 'scoped' }
		const recorded: string[] = []
		expect(recorded.push(hashGateStep({ root, step: TESTS_STEP, gateBase: BASE_A }))).toBe(1)
		expect(recorded.push(hashGateStep({ root, step: scopedStep, gateBase: BASE_A }))).toBe(2)
		storeRecord({
			root,
			steps: [
				stepOf({ name: 'tests', stepHash: recorded[0] }),
				stepOf({ name: 'scoped', stepHash: recorded[1] }),
			],
		})

		expect([
			findStepAnswer(
				askOf({ root, stepHash: hashGateStep({ root, step: TESTS_STEP, gateBase: BASE_B }) }),
			)?.recorded.name,
			findStepAnswer(
				askOf({ root, stepHash: hashGateStep({ root, step: scopedStep, gateBase: BASE_B }) }),
			)?.recorded.name,
			findStepAnswer(
				askOf({ root, stepHash: hashGateStep({ root, step: scopedStep, gateBase: BASE_A }) }),
			)?.recorded.name,
		]).toEqual(['tests', undefined, 'scoped'])
	})
})

describe('findStepAnswer', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('a green record holding a passed step of that hash → the record and the step', () => {
		const root = sharedRepository()
		const recorded = stepOf({ name: 'tests', stepHash: STEP_HASH })
		const record = storeRecord({ root, steps: [stepOf({ name: 'check' }), recorded] })

		expect(findStepAnswer(askOf({ root, stepHash: STEP_HASH }))).toEqual({ record, recorded })
	})

	it.each<GateRecordMode>(['fast', 'full', 'release', 'hook-gate'])(
		'a green %s record → answers',
		(mode) => {
			const root = createScratchRepository({ 'src/a.ts': 'export {}\n' })
			const recorded = stepOf({ name: 'tests', stepHash: STEP_HASH })
			const record = storeRecord({ root, mode, steps: [recorded] })

			expect(findStepAnswer(askOf({ root, stepHash: STEP_HASH }))).toEqual({ record, recorded })
		},
	)

	it('a green record whose other step was skipped → answers', () => {
		const root = createScratchRepository({ 'src/a.ts': 'export {}\n' })
		const recorded = stepOf({ name: 'tests', stepHash: STEP_HASH })
		const record = storeRecord({
			root,
			steps: [stepOf({ name: 'build', status: 'skipped', stepHash: OTHER_STEP_HASH }), recorded],
		})

		expect(findStepAnswer(askOf({ root, stepHash: STEP_HASH }))).toEqual({ record, recorded })
	})

	type NoAnswerCase = {
		label: string
		steps: RecordedStep[]
		key?: Partial<CheckKey>
		asked?: { tree?: string; treeKey?: Partial<typeof INSTALLED> }
	}
	const NO_ANSWER: NoAnswerCase[] = [
		{
			label: 'another step failed',
			steps: [
				stepOf({ name: 'check', status: 'failed', stepHash: OTHER_STEP_HASH }),
				stepOf({ name: 'tests', stepHash: STEP_HASH }),
			],
		},
		{
			label: 'the step itself failed',
			steps: [stepOf({ name: 'tests', status: 'failed', stepHash: STEP_HASH })],
		},
		{
			label: 'the step was skipped',
			steps: [stepOf({ name: 'tests', status: 'skipped', stepHash: STEP_HASH })],
		},
		{
			label: 'the step was not run',
			steps: [
				stepOf({ name: 'check', status: 'failed', stepHash: OTHER_STEP_HASH }),
				stepOf({ name: 'tests', status: 'not-run', stepHash: STEP_HASH }),
			],
		},
		{
			label: 'the step has another hash',
			steps: [stepOf({ name: 'tests', stepHash: OTHER_STEP_HASH })],
		},
		{
			label: 'steps without stepHash (old shape)',
			steps: [stepOf({ name: 'check' }), stepOf({ name: 'tests' })],
		},
		{
			label: 'another tree asked',
			steps: [stepOf({ name: 'tests', stepHash: STEP_HASH })],
			asked: { tree: OTHER_TREE },
		},
		{
			label: 'a record of another lockHash',
			steps: [stepOf({ name: 'tests', stepHash: STEP_HASH })],
			key: { lockHash: '9'.repeat(64) },
		},
		{
			label: 'a record of another linked',
			steps: [stepOf({ name: 'tests', stepHash: STEP_HASH })],
			key: { linked: '9'.repeat(64) },
		},
		{
			label: 'an asker of another lockHash',
			steps: [stepOf({ name: 'tests', stepHash: STEP_HASH })],
			asked: { treeKey: { lockHash: '9'.repeat(64) } },
		},
		{
			label: 'an asker of another linked',
			steps: [stepOf({ name: 'tests', stepHash: STEP_HASH })],
			asked: { treeKey: { linked: '9'.repeat(64) } },
		},
	]

	it.each(NO_ANSWER)('$label → not answered', ({ steps, key, asked }) => {
		const root = createScratchRepository({ 'src/a.ts': 'export {}\n' })
		storeRecord({ root, steps, key })

		expect(
			findStepAnswer(
				askOf({ root, stepHash: STEP_HASH, tree: asked?.tree, treeKey: asked?.treeKey }),
			),
		).toBeUndefined()
	})

	it('no record in the store → not answered', () => {
		const root = createScratchRepository({ 'src/a.ts': 'export {}\n' })

		expect(findStepAnswer(askOf({ root, stepHash: STEP_HASH }))).toBeUndefined()
	})

	it('several matching records, the newest stored last → the newest answers', () => {
		const root = createScratchRepository({ 'src/a.ts': 'export {}\n' })
		const recorded = stepOf({ name: 'tests', stepHash: STEP_HASH })
		storeRecord({ root, mode: 'full', at: FIRST_AT, steps: [recorded] })
		storeRecord({
			root,
			mode: 'hook-gate',
			at: FIRST_AT,
			key: { commandHash: '7'.repeat(64) },
			steps: [recorded],
		})
		const newest = storeRecord({ root, mode: 'fast', at: SECOND_AT, steps: [recorded] })

		expect(findStepAnswer(askOf({ root, stepHash: STEP_HASH }))?.record).toEqual(newest)
	})

	it('a newer record failed as a whole and an older green one → the older answers', () => {
		const root = createScratchRepository({ 'src/a.ts': 'export {}\n' })
		const recorded = stepOf({ name: 'tests', stepHash: STEP_HASH })
		const older = storeRecord({ root, mode: 'full', at: FIRST_AT, steps: [recorded] })
		storeRecord({
			root,
			mode: 'fast',
			at: SECOND_AT,
			steps: [stepOf({ name: 'check', status: 'failed' }), recorded],
		})

		expect(findStepAnswer(askOf({ root, stepHash: STEP_HASH }))?.record).toEqual(older)
	})
})
