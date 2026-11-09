/**
 * What the lot verbs print around the records (R6-1, R6-2, R6-3, R6-7): the id argument quoted in a refusal, record
 * text quoted in an error message of `lot stop` and `lot result`, the inbox's usage reasons, and a scenario file that
 * does not hold. A text holding a line feed, a carriage return, an escape sequence and a `next: FORGED` tail prints
 * no raw control character and no line that begins with the forged tail; an unusable scenario file reads damaged.
 */
import { rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { createBriefWorkspace } from '../../test/brief-workspace.ts'
import { forgedFaultsOf, forgedFaultsOfCall } from '../../test/forged-text.ts'
import { inboxIn } from '../../test/inbox-workspace.ts'
import { FORGED_VALUE, PRINTED_KINDS } from '../../test/lot-printed-fields.constants.ts'
import { buildPrintedLot } from '../../test/lot-printed-fields.ts'
import { QUESTION_NOW } from '../../test/lot-questions.constants.ts'
import { readyLot, resultOfLot, stopLot, stopOf } from '../../test/lot-stop-workspace.ts'
import { createWaitTime } from '../../test/simulated-lot.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { waitLot } from './lot-wait.ts'
import { runLot } from './lot.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

describe('the id argument in a refusal (R6-2)', { timeout: STORE_CASE_TIMEOUT }, () => {
	const ID_VERBS = {
		status: (cwd: string) => runLot({ cwd, argv: ['status', FORGED_VALUE] }),
		result: (cwd: string) => runLot({ cwd, argv: ['result', FORGED_VALUE] }),
		answer: (cwd: string) =>
			runLot({ cwd, argv: ['answer', FORGED_VALUE, 'q1', 'keep'], now: QUESTION_NOW }),
		stop: (cwd: string) => stopOf({ cwd, id: FORGED_VALUE }),
	}

	for (const [verb, run] of Object.entries(ID_VERBS))
		it(`lot ${verb} <an id holding line feeds, a carriage return, an escape and a next line> -> the refusal prints no raw character and no forged line`, () => {
			const workspace = createBriefWorkspace()

			expect(forgedFaultsOfCall(() => run(workspace.repository))).toEqual([])
		})

	it('lot wait <an id holding them> -> the refusal prints no raw character and no forged line', async () => {
		const workspace = createBriefWorkspace()
		const time = createWaitTime()
		const outcome = await waitLot({
			cwd: workspace.repository,
			argv: [FORGED_VALUE, '--timeout', '0'],
			clock: time.clock,
			sleep: time.sleep,
		}).then(
			(result) => result.output,
			(error: Error) => error.message,
		)

		expect(forgedFaultsOf(outcome)).toEqual([])
	})
})

/** Replaces the file `name` of the folder with `text`: the published file is read-only, a hand replaces it. */
function replaceFile(params: { folder: string; name: string; text: string }): void {
	const path = join(params.folder, params.name)
	rmSync(path, { force: true })
	writeFileSync(path, params.text)
}

describe(
	'record text in the messages of stop and result (R6-1)',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		const BAD_RECORDS = [
			{ name: 'lots.json', text: FORGED_VALUE },
			{ name: 'merges.json', text: `${FORGED_VALUE} {` },
		]

		for (const record of BAD_RECORDS) {
			it(`lot stop, a pending hand-over whose ${record.name} holds forged text -> no raw character, no forged line`, () => {
				const { lot } = readyLot()
				replaceFile({ folder: lot.lotFolder, ...record })

				expect(forgedFaultsOfCall(() => stopLot({ lot }))).toEqual([])
			})

			it(`lot result, a ready lot whose ${record.name} holds forged text -> no raw character, no forged line`, () => {
				const { lot } = readyLot()
				replaceFile({ folder: lot.lotFolder, ...record })

				expect(forgedFaultsOfCall(() => resultOfLot({ lot, json: false }))).toEqual([])
			})
		}
	},
)

describe('the inbox usage reasons (R6-3)', { timeout: STORE_CASE_TIMEOUT }, () => {
	for (const [title, words] of [
		['an argument', [FORGED_VALUE]],
		['an unknown option', [`--${FORGED_VALUE}`]],
	] as const)
		it(`inbox with ${title} holding forged text -> the usage reason prints no raw character and no forged line`, () => {
			const workspace = createBriefWorkspace()

			expect(
				forgedFaultsOfCall(() => inboxIn({ cwd: workspace.repository, words: [...words] })),
			).toEqual([])
		})
})

describe('an unusable scenario file (R6-7)', { timeout: STORE_CASE_TIMEOUT }, () => {
	const SIMULATED = PRINTED_KINDS.find((kind) => kind.simulated)
	const BAD_SCENARIOS = [
		{ title: 'that does not parse', text: '{ "schema": 1, "name": ' },
		{ title: 'with no steps array', text: JSON.stringify({ schema: 1, name: 'question' }) },
		{
			title: 'with an empty steps array',
			text: JSON.stringify({ schema: 1, name: 'question', steps: [] }),
		},
	]

	for (const scenario of BAD_SCENARIOS)
		it(`a scenario.json ${scenario.title} -> status exits 2, wait exits 2 without timing out, the inbox lists the lot damaged`, async () => {
			if (SIMULATED === undefined) throw new Error('no simulated kind')
			const lot = buildPrintedLot(SIMULATED)
			replaceFile({ folder: lot.lotFolder, name: 'scenario.json', text: scenario.text })
			const time = createWaitTime()
			const status = runLot({ cwd: lot.cwd, argv: ['status', lot.name] })
			const waited = await waitLot({
				cwd: lot.cwd,
				argv: [lot.name, '--timeout', '5'],
				clock: time.clock,
				sleep: time.sleep,
			}).then(
				(result) => result.exitCode,
				(error: Error) => error.message,
			)
			const inbox = inboxIn({ cwd: lot.cwd })

			expect({
				status: status.exitCode,
				wait: waited,
				damaged: inbox.output.split('\n').some((line) => line.startsWith('damaged ')),
			}).toEqual({ status: 2, wait: 2, damaged: true })
		})
})
