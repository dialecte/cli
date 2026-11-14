/**
 * The map and the help lines S1b changes (33S section 10, E16 and nit 7): `handover write --out <id|folder>`, the notes
 * of the lot-folder refusals of `handover abandon` and `handover run`, the lot keep rule in the notes of `worktree
 * prune` and `lot close`, and the usage errors of the review rounds' verbs naming `<id|folder>`.
 */
import { isolateStateFolder } from '../../../test/lot-handover-workspace.ts'
import { temporaryFolder } from '../../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { runLot } from '../../commands/lot.ts'
import { COMMAND_MAP } from './command-map.constants.ts'
import { renderCommandSection } from './render-help.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

const WRITE_LINE =
	'dialecte handover write <lots.json> [--release] [--target <branch>] [--out <id|folder>] [--rehash] [--json]'

/** The note of `entry` that starts with `<verb> - `, or an empty text. */
function noteOf(params: { notes: readonly string[] | undefined; verb: string }): string {
	return (params.notes ?? []).find((note) => note.startsWith(`${params.verb} - `)) ?? ''
}

describe('the map lines of the lot store, S1b', () => {
	it(`the handover section lists ${WRITE_LINE}, in the map and in handover --help, and no longer --out <dir>`, () => {
		expect({
			listed: COMMAND_MAP.handover.usage.includes(WRITE_LINE),
			help: renderCommandSection({ name: 'handover', entry: COMMAND_MAP.handover }).includes(
				WRITE_LINE,
			),
			old: COMMAND_MAP.handover.usage.some((line) => line.includes('--out <dir>')),
		}).toEqual({ listed: true, help: true, old: false })
	})

	it('the handover notes say that abandon refuses a lot folder and that run refuses a canceled lot', () => {
		const { notes } = COMMAND_MAP.handover

		expect({
			abandon: noteOf({ notes, verb: 'abandon' }),
			run: noteOf({ notes, verb: 'run' }),
		}).toEqual({
			abandon: expect.stringMatching(/refus\w* a lot folder/),
			run: expect.stringMatching(/refus\w* a canceled lot/),
		})
	})

	it('the notes of worktree prune and lot close name the lot keep rule: an open lot keeps its worktree, reason lot <name> <state>', () => {
		const prune = noteOf({ notes: COMMAND_MAP.worktree.notes, verb: 'prune' })
		const close = noteOf({ notes: COMMAND_MAP.lot.notes, verb: 'close' })

		expect([prune, close]).toEqual([
			expect.stringMatching(/open lot[\s\S]*lot <name> <state>/),
			expect.stringMatching(/open lot[\s\S]*lot <name> <state>/),
		])
	})
})

describe('the usage errors of the review rounds verbs', { timeout: STORE_CASE_TIMEOUT }, () => {
	const VERBS = ['finding', 'snapshot', 'choice', 'standard', 'delta', 'recap', 'verify']
	for (const verb of VERBS)
		it(`lot ${verb} with no word → the usage line names <id|folder>, not <folder>, exit 2`, () => {
			isolateStateFolder()
			const result = runLot({ cwd: temporaryFolder('dialecte-usage-'), argv: [verb] })

			expect({
				exitCode: result.exitCode,
				startsWith: result.output.startsWith(`lot ${verb}: expected <id|folder>`),
				namesFolderOnly:
					result.output.includes('<folder>') || result.output.includes('<hand-over folder>'),
			}).toEqual({ exitCode: 2, startsWith: true, namesFolderOnly: false })
		})
})
