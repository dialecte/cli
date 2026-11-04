/** `handover run`: the `references` guard per profile - which tags and citations a lot may not hold, and what it says. */

import {
	CITATION_TEXT,
	CONSUMER_REFERENCES_DETAIL,
	CONTRIBUTOR_REFERENCES_DETAIL,
	TICKET_MESSAGE,
} from '../../test/handover-profile.constants.ts'
import {
	editedPackage,
	replaceLotFile,
	replaceLotMessage,
	writeProfileHandover,
} from '../../test/handover-profile.ts'
import { SCRATCH_REPOSITORY_TIMEOUT } from '../../test/scratch-checks.constants.ts'
import { runFolder } from '../../test/scratch-checks.ts'
import { SOURCE_FILE } from '../../test/scratch-contrib.constants.ts'

import { describe, expect, it } from 'vitest'

/** The guard line `references` as the run printed it, or undefined. */
function referencesLine(text: string): string | undefined {
	return text.split('\n').find((line) => /^[✓✗] references\b/.test(line))
}

describe(
	'handover run: the references guard per profile',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		it('consumer, a lot message with a ticket number → the references guard passes', async () => {
			const root = editedPackage({ profile: null })
			const out = writeProfileHandover({ root })
			replaceLotMessage({ out, message: TICKET_MESSAGE })

			const run = await runFolder({ out })

			expect(referencesLine(run.text)).toMatch(/^✓ references\b/)
			expect(run.exitCode).toBe(0)
		})

		it('consumer, a lot file citing a standard → refused at references with "a standard citation"', async () => {
			const root = editedPackage({ profile: null })
			const out = writeProfileHandover({ root })
			replaceLotFile({ root, out, file: SOURCE_FILE, text: CITATION_TEXT })

			const run = await runFolder({ out })

			expect(referencesLine(run.text)).toMatch(
				new RegExp(`^✗ references +${CONSUMER_REFERENCES_DETAIL}\\s{2}`),
			)
			expect(run.exitCode).toBe(1)
		})

		it('contributor, a lot message with a ticket number → refused at references with "a plan tag or a standard citation"', async () => {
			const root = editedPackage()
			const out = writeProfileHandover({ root })
			replaceLotMessage({ out, message: TICKET_MESSAGE })

			const run = await runFolder({ out })

			expect(referencesLine(run.text)).toMatch(
				new RegExp(`^✗ references +${CONTRIBUTOR_REFERENCES_DETAIL}\\s{2}`),
			)
			expect(run.exitCode).toBe(1)
		})

		it('contributor allowing ticket numbers, a lot message with a ticket number → the references guard passes', async () => {
			const root = editedPackage({ allowReferences: ['ticket number'] })
			const out = writeProfileHandover({ root })
			replaceLotMessage({ out, message: TICKET_MESSAGE })

			const run = await runFolder({ out })

			// the run stops later, at the contrib guard (no record): only the references line is pinned here

			expect(referencesLine(run.text)).toMatch(/^✓ references\b/)
		})
	},
)
