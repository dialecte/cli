/** The standard line of a DONE card: the state recorded on the lot, never one recomputed from the runner's shell. */

// the suite setup clears the person's DIALECTE_STANDARD; the cases below set their own
import '../../../test/git-environment.setup.ts'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { STANDARD_RECORDED_AT } from '../../../test/handover-profile.constants.ts'
import { editedPackage } from '../../../test/handover-profile.ts'
import { STORE_BRANCH } from '../../../test/handover-store-scenario.constants.ts'
import { boxLines, runIn, writeStoreHandover } from '../../../test/handover-store-scenario.ts'
import { runGateIn } from '../../../test/scratch-checks.ts'
import { git, isolateGitConfig, temporaryFolder } from '../../../test/scratch-repository.ts'
import { HANDOVER_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { STANDARD_ENVIRONMENT_VARIABLE, STANDARD_FILE } from '../standard/standard.constants.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

/** The note the station recorded when it consulted the standard. */
const RECORDED_NOTE = 'read the section on units'

/** What the DONE card the run prints says of a standard consulted and recorded on the lot. */
const CONSULTED_ROW = `✓ standard consulted · ${RECORDED_NOTE}`

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** A hand-over of one lot, ready to run, whose standard record says consulted; its repository and folder. */
async function pendingHandover(): Promise<{ root: string; folder: string }> {
	isolateGitConfig()
	vi.stubEnv(STANDARD_ENVIRONMENT_VARIABLE, temporaryFolder('dialecte-standard-'))
	const root = editedPackage({ profile: null })
	git({ root, args: ['checkout', '-q', '-b', STORE_BRANCH] })
	await runGateIn({ cwd: root, argv: [] })
	const { folder } = writeStoreHandover({ root, name: 'done-standard' })
	writeFileSync(
		join(folder, STANDARD_FILE),
		JSON.stringify({ state: 'consulted', note: RECORDED_NOTE, at: STANDARD_RECORDED_AT }),
	)
	return { root, folder }
}

/** The verdict and the `standard` row of the DONE card that `handover run` prints. */
function doneCardOf(params: { text: string }): { done: boolean; standard: string[] } {
	const box = boxLines(params.text).map((line) => line.replace(/ {2,}/g, ' '))
	return {
		done: box.some((line) => line.startsWith('│ DONE ')),
		standard: box.flatMap((line) => {
			const match = /^│ (?:gates )?([✓!✗] standard .*?) │$/.exec(line)
			return match ? [match[1]] : []
		}),
	}
}

describe(
	'the standard row of the DONE card a run prints',
	{ timeout: HANDOVER_CASE_TIMEOUT },
	() => {
		it('DIALECTE_STANDARD unset in the runner shell, consulted recorded on the lot → the run prints DONE with ✓ standard consulted and the note', async () => {
			const { root, folder } = await pendingHandover()
			vi.stubEnv(STANDARD_ENVIRONMENT_VARIABLE, undefined)

			const ran = await runIn({ cwd: root, argv: [folder] })

			expect({ exitCode: ran.exitCode, ...doneCardOf({ text: ran.text }) }).toEqual({
				exitCode: 0,
				done: true,
				standard: [CONSULTED_ROW],
			})
		})

		it('DIALECTE_STANDARD naming a path that is not there, consulted recorded on the lot → the run prints DONE with ✓ standard consulted and the note', async () => {
			const { root, folder } = await pendingHandover()
			vi.stubEnv(STANDARD_ENVIRONMENT_VARIABLE, '/nowhere/dialecte-standard-that-is-not-there')

			const ran = await runIn({ cwd: root, argv: [folder] })

			expect({ exitCode: ran.exitCode, ...doneCardOf({ text: ran.text }) }).toEqual({
				exitCode: 0,
				done: true,
				standard: [CONSULTED_ROW],
			})
		})
	},
)
