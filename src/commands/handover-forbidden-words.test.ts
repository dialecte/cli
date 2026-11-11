/** `handover run`: the references guard holds the forbidden words, in the lot messages and the lot files, like consumer names. */
import { FIRST_WORD, FORBIDDEN_WORDS_KEY } from '../../test/forbidden-words-workspace.constants.ts'
import { configureMachine, textHolding } from '../../test/forbidden-words-workspace.ts'
import {
	editedPackage,
	replaceLotFile,
	replaceLotMessage,
	writeProfileHandover,
} from '../../test/handover-profile.ts'
import { SCRATCH_REPOSITORY_TIMEOUT } from '../../test/scratch-checks.constants.ts'
import { runFolder } from '../../test/scratch-checks.ts'
import { SOURCE_FILE } from '../../test/scratch-contrib.constants.ts'
import { git } from '../../test/scratch-repository.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

/** The guard line `references` as the run printed it, or undefined. */
function referencesLine(text: string): string | undefined {
	return text.split('\n').find((line) => /^[✓✗] references\b/.test(line))
}

/** A package of `profile` with one lot (a contributor by default); `list` is its git config's forbidden words when given. */
function packageWithLot(params: { list?: string; profile?: null }): { root: string; out: string } {
	const root = editedPackage(params.profile === null ? { profile: null } : {})
	if (params.list !== undefined) git({ root, args: ['config', FORBIDDEN_WORDS_KEY, params.list] })
	return { root, out: writeProfileHandover({ root }) }
}

afterEach(() => vi.unstubAllEnvs())

describe(
	'handover run: the references guard and the forbidden words',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		it('contributor, a lot message holding a word → refused at references, the line names the message and the word', async () => {
			configureMachine()
			const { out } = packageWithLot({ list: FIRST_WORD })
			replaceLotMessage({ out, message: `feat(a): ship the ${FIRST_WORD}` })

			const run = await runFolder({ out })

			expect(referencesLine(run.text)).toMatch(/^✗ references\b/)
			expect(run.text).toContain(`${'lot'} 1 message, line 1: forbidden word \`${FIRST_WORD}\``)
			expect(run.exitCode).toBe(1)
		})

		it('contributor, a lot file holding a word → refused at references, the line names the file, its line and the word', async () => {
			configureMachine()
			const { root, out } = packageWithLot({ list: FIRST_WORD })
			replaceLotFile({ root, out, file: SOURCE_FILE, text: textHolding(FIRST_WORD) })

			const run = await runFolder({ out })

			expect(referencesLine(run.text)).toMatch(/^✗ references\b/)
			expect(run.text).toContain(`${SOURCE_FILE}:2: forbidden word \`${FIRST_WORD}\``)
			expect(run.exitCode).toBe(1)
		})

		it('the same lot file: a contributor with the list is refused, a contributor without a list and a consumer with the list pass the guard', async () => {
			configureMachine()
			const text = textHolding(FIRST_WORD)
			const listed = packageWithLot({ list: FIRST_WORD })
			replaceLotFile({ root: listed.root, out: listed.out, file: SOURCE_FILE, text })
			const unlisted = packageWithLot({})
			replaceLotFile({ root: unlisted.root, out: unlisted.out, file: SOURCE_FILE, text })
			const consumer = packageWithLot({ list: FIRST_WORD, profile: null })
			replaceLotFile({ root: consumer.root, out: consumer.out, file: SOURCE_FILE, text })

			const refused = await runFolder({ out: listed.out })
			const withoutList = await runFolder({ out: unlisted.out })
			const asConsumer = await runFolder({ out: consumer.out })

			expect(referencesLine(refused.text)).toMatch(/^✗ references\b/)
			expect(referencesLine(withoutList.text)).toMatch(/^✓ references\b/)
			expect(referencesLine(asConsumer.text)).toMatch(/^✓ references\b/)
		})
	},
)
