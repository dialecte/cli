import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import {
	ORPHAN_EDITED_AGAIN_HELPER_TEXT,
	ORPHAN_HELPER,
	ORPHAN_REVISION_REASON,
	ORPHAN_SECOND_DEPENDENT_TEST,
	ORPHAN_SECOND_DEPENDENT_TEST_TEXT,
} from '../../test/rule-gaps-orphan-helper.constants.ts'
import { createOrphanHelperPackage } from '../../test/rule-gaps-orphan-helper.ts'
import { HELPER_SCENARIO_TIMEOUT } from '../../test/test-timing.constants.ts'
import { readPackageJson } from '../lib/package-json.ts'
import { checkTddReceipts } from '../lib/tdd/check-tdd-receipts.ts'
import { hashTestCode } from '../lib/tdd/tdd-files.ts'
import { runTdd } from './tdd.ts'

import { describe, expect, it } from 'vitest'

import type { TddFreeze, TddLedger } from '../lib/tdd/tdd.types.ts'

const NOW = new Date('2026-11-11T12:00:00.000Z')

const REVISED_ENTRIES = [{ case: ORPHAN_HELPER, reason: ORPHAN_REVISION_REASON }]

const GREEN_REFUSAL = `tdd green: test code changed since the last red run: ${ORPHAN_HELPER} - tests are frozen after red; go back to the test station`

/** `tdd` in the package, its receipts dated NOW. */
function tdd(params: { cwd: string; argv: string[] }) {
	return runTdd({ cwd: params.cwd, argv: params.argv, now: () => NOW })
}

/** The freeze entries of the package's ledger, oldest first. */
function freezes(root: string): TddFreeze[] {
	const path = join(root, '.git', 'dialecte-tdd.json')
	if (!existsSync(path)) return []
	const ledger = JSON.parse(readFileSync(path, 'utf8')) as TddLedger
	return ledger.entries.filter((entry): entry is TddFreeze => entry.kind === 'freeze')
}

/** The hashes the ledger froze `file` at, oldest first. */
function frozenHashes(params: { root: string; file: string }): string[] {
	return freezes(params.root).flatMap((freeze) => {
		const hash = freeze.files[params.file]
		return hash === undefined ? [] : [hash]
	})
}

describe(
	'a `revised` entry naming a changed helper no changed test file depends on',
	{ timeout: HELPER_SCENARIO_TIMEOUT },
	() => {
		it('a committed helper imported only by a committed unchanged test file, an entry naming it → red freezes it, prints `revised  <helper>  <reason>`, lists it in `frozen:`', async () => {
			const root = createOrphanHelperPackage({ lot: REVISED_ENTRIES })

			const red = await tdd({ cwd: root, argv: ['red'] })

			expect(red.output.split('\n')).toContain(
				`revised  ${ORPHAN_HELPER}  ${ORPHAN_REVISION_REASON}`,
			)
			expect(red.output).toMatch(new RegExp(`^tdd red: .*frozen: .*${ORPHAN_HELPER}`, 'm'))
			expect(frozenHashes({ root, file: ORPHAN_HELPER })).toEqual([
				hashTestCode({ root, file: ORPHAN_HELPER }),
			])
		})

		it('the same, then tdd green and the gate step → green is not refused for the helper, the gate step does not fail on it', async () => {
			const root = createOrphanHelperPackage({ lot: REVISED_ENTRIES })
			await tdd({ cwd: root, argv: ['red'] })

			const green = await tdd({ cwd: root, argv: ['green'] })
			const check = await checkTddReceipts({ root, packageJson: readPackageJson(root) })

			expect(green.output).not.toContain(
				`test code changed since the last red run: ${ORPHAN_HELPER}`,
			)
			expect(check.reason ?? '').not.toContain(ORPHAN_HELPER)
			expect(check.details).toContain(`revised  ${ORPHAN_HELPER}  ${ORPHAN_REVISION_REASON}`)
		})

		it('the same without an entry for the helper (guard) → red does not freeze it, green refuses naming it', async () => {
			const root = createOrphanHelperPackage()

			const red = await tdd({ cwd: root, argv: ['red'] })
			const green = await tdd({ cwd: root, argv: ['green'] })

			expect(red.output).not.toContain(`revised  ${ORPHAN_HELPER}`)
			expect(frozenHashes({ root, file: ORPHAN_HELPER })).toEqual([])
			expect(green.exitCode).toBe(1)
			expect(green.output).toContain(GREEN_REFUSAL)
		})

		it('a changed test file outside the run depends on the helper, an entry naming it → today’s rule: not frozen, the `unfrozen` line names that file', async () => {
			const root = createOrphanHelperPackage({
				lot: REVISED_ENTRIES,
				files: { [ORPHAN_SECOND_DEPENDENT_TEST]: ORPHAN_SECOND_DEPENDENT_TEST_TEXT },
			})

			const red = await tdd({ cwd: root, argv: ['red', 'src/add.test.ts'] })

			expect(red.output).not.toContain(`revised  ${ORPHAN_HELPER}`)
			expect(frozenHashes({ root, file: ORPHAN_HELPER })).toEqual([])
			expect(red.output.split('\n')).toContain(
				`unfrozen  ${ORPHAN_HELPER}  a changed test file outside this run depends on it: ${ORPHAN_SECOND_DEPENDENT_TEST}`,
			)
		})

		it('the helper frozen this way, then changed again → green refuses naming it until a new red freezes the new text', async () => {
			const root = createOrphanHelperPackage({ lot: REVISED_ENTRIES })
			await tdd({ cwd: root, argv: ['red'] })
			writeFileSync(join(root, ORPHAN_HELPER), ORPHAN_EDITED_AGAIN_HELPER_TEXT)

			const refused = await tdd({ cwd: root, argv: ['green'] })
			await tdd({ cwd: root, argv: ['red'] })
			const accepted = await tdd({ cwd: root, argv: ['green'] })

			expect(refused.exitCode).toBe(1)
			expect(refused.output).toContain(GREEN_REFUSAL)
			expect(accepted.output).not.toContain(
				`test code changed since the last red run: ${ORPHAN_HELPER}`,
			)
		})
	},
)
