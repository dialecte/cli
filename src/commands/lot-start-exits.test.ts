/**
 * What `lot start` prints in two corners: an unexpected error after the lot folder exists names the lot (a lot
 * exists, so the exit says which), and a dry run labels the lot's name `lot:` as the JSON and the other verbs do.
 */
import { INJECTED_PAUSE_MESSAGE } from '../../test/lot-start-exits.constants.ts'
import { markerOnlyLot } from '../../test/lot-start-pause-lots.ts'
import { createStartWorkspace, withJson, withLines } from '../../test/lot-start-workspace.ts'
import { LOT_NAME, START_NOW } from '../../test/lot-start.constants.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { startLot } from './lot-start.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { StartWorkspace } from '../../test/lot-start-workspace.types.ts'
import type { StartSeams } from './lot-start.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/**
 * The seams of a start that fails unexpectedly once the lot folder is published: a lot appears just before the
 * publish (its `abandoned.json` the only evidence of `canceled`), so the race re-check pauses, and the pause throws.
 */
function failingAtTheRecheck(start: StartWorkspace): StartSeams {
	return {
		beforePublish: function lotAppears() {
			markerOnlyLot(start)
		},
		pause: function failToPause(): never {
			throw new Error(INJECTED_PAUSE_MESSAGE)
		},
	}
}

describe('lot start, an unexpected error after the lot folder exists', () => {
	it(
		'--json -> exit 1, the error and the lot it happened to named',
		{ timeout: STORE_CASE_TIMEOUT },
		() => {
			const start = createStartWorkspace()

			expect(
				withJson(
					startLot({
						cwd: start.cwd,
						argv: [start.workspace.briefPath, '--json'],
						now: START_NOW,
						seams: failingAtTheRecheck(start),
					}),
				),
			).toMatchObject({
				exitCode: 1,
				json: { error: expect.stringContaining(INJECTED_PAUSE_MESSAGE), lot: LOT_NAME },
			})
		},
	)

	it('text form -> exit 1, the output names the lot', { timeout: STORE_CASE_TIMEOUT }, () => {
		const start = createStartWorkspace()

		expect(
			startLot({
				cwd: start.cwd,
				argv: [start.workspace.briefPath],
				now: START_NOW,
				seams: failingAtTheRecheck(start),
			}),
		).toMatchObject({ exitCode: 1, output: expect.stringContaining(LOT_NAME) })
	})
})

describe('lot start --dry-run, the text form', () => {
	it(
		'the lot the next index would name -> a lot: line, no name: line',
		{ timeout: STORE_CASE_TIMEOUT },
		() => {
			const start = createStartWorkspace()
			const { exitCode, lines } = withLines(
				startLot({
					cwd: start.cwd,
					argv: [start.workspace.briefPath, '--dry-run'],
					now: START_NOW,
				}),
			)

			expect({
				exitCode,
				lot: lines.filter((line) => line.startsWith(`lot: ${LOT_NAME}`)).length,
				name: lines.filter((line) => line.startsWith('name:')).length,
			}).toEqual({ exitCode: 0, lot: 1, name: 0 })
		},
	)
})
