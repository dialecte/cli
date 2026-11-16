import { readFileSync, writeFileSync } from 'node:fs'
/**
 * A changed test helper no changed test file depends on is frozen through the run of the unchanged test files that
 * import it: they pass with it, so the red run freezes it and green takes it; one failing with it, or none importing
 * it, leaves it unfrozen with the reason.
 */
import { join } from 'node:path'

import {
	ORPHAN_DEPENDENT_TEST,
	ORPHAN_HELPER,
} from '../../test/rule-gaps-orphan-helper.constants.ts'
import { createOrphanHelperPackage } from '../../test/rule-gaps-orphan-helper.ts'
import { git, writeFiles } from '../../test/scratch-repository.ts'
import { HELPER_SCENARIO_TIMEOUT } from '../../test/test-timing.constants.ts'
import { HELPER_DEPENDENTS_LIMIT } from '../lib/tdd/tdd.constants.ts'
import { runTdd } from './tdd.ts'

import { describe, expect, it } from 'vitest'

const NOW = new Date('2026-11-17T12:00:00.000Z')

/** `tdd` in the package, its receipts dated NOW. */
function tdd(params: { cwd: string; argv: string[] }) {
	return runTdd({ cwd: params.cwd, argv: params.argv, now: () => NOW })
}

describe(
	'a changed helper whose dependents are unchanged',
	{ timeout: HELPER_SCENARIO_TIMEOUT },
	() => {
		it('its unchanged dependent passes with it, no entry → red freezes it through that dependent; green takes it', async () => {
			const root = createOrphanHelperPackage()

			const red = await tdd({ cwd: root, argv: ['red'] })
			const green = await tdd({ cwd: root, argv: ['green'] })

			expect(red.output.split('\n')).toContain(
				`frozen   ${ORPHAN_HELPER}  through the unchanged test files importing it, which pass with it: ${ORPHAN_DEPENDENT_TEST}`,
			)
			expect(green.output).not.toContain(
				`test code changed since the last red run: ${ORPHAN_HELPER}`,
			)
		})

		it('its unchanged dependent fails with it → not frozen, the line names the failing file', async () => {
			const root = createOrphanHelperPackage()
			writeFileSync(join(root, ORPHAN_HELPER), 'export const EXPECTED = 4\n')

			const red = await tdd({ cwd: root, argv: ['red'] })

			expect(red.output.split('\n')).toContain(
				`unfrozen  ${ORPHAN_HELPER}  an unchanged test file importing it fails with it: ${ORPHAN_DEPENDENT_TEST}`,
			)
		})

		it('a changed helper no test file imports → not frozen, the line says no test file imports it', async () => {
			const root = createOrphanHelperPackage({
				files: { 'test/unused.ts': 'export const UNUSED = 1\n' },
			})

			const red = await tdd({ cwd: root, argv: ['red'] })

			expect(red.output.split('\n')).toContain(
				'unfrozen  test/unused.ts  no unchanged test file found naming it (a barrel, an alias or a glob is not followed here): a `revised` entry naming it lets a red run freeze it',
			)
		})

		it('its only unchanged dependent runs no case (all skipped) → not frozen, the line says it ran no case', async () => {
			const root = createOrphanHelperPackage()
			writeFileSync(
				join(root, ORPHAN_DEPENDENT_TEST),
				readFileSync(join(root, ORPHAN_DEPENDENT_TEST), 'utf8').replace("\tit('", "\tit.skip('"),
			)
			git({
				root,
				args: ['commit', '-q', '-m', 'test: skip the dependent', '--', ORPHAN_DEPENDENT_TEST],
			})

			const red = await tdd({ cwd: root, argv: ['red'] })

			expect(red.output.split('\n')).toContain(
				`unfrozen  ${ORPHAN_HELPER}  the unchanged test files importing it ran no case: ${ORPHAN_DEPENDENT_TEST}`,
			)
		})

		it('more unchanged test files import it than a red run runs for a helper → not frozen, none run, the line gives the count and the revised entry', async () => {
			const root = createOrphanHelperPackage()
			const dependents = Object.fromEntries(
				Array.from({ length: HELPER_DEPENDENTS_LIMIT + 1 }, (_, index) => [
					`src/extra-${index}.test.ts`,
					readFileSync(join(root, ORPHAN_DEPENDENT_TEST), 'utf8'),
				]),
			)
			writeFiles({ root, files: dependents })
			git({ root, args: ['add', '-A', 'src'] })
			git({ root, args: ['commit', '-q', '-m', 'test: more dependents'] })

			const red = await tdd({ cwd: root, argv: ['red'] })

			expect(red.output.split('\n')).toContain(
				`unfrozen  ${ORPHAN_HELPER}  ${HELPER_DEPENDENTS_LIMIT + 2} unchanged test files import it, more than a red run runs for a helper (${HELPER_DEPENDENTS_LIMIT}): a \`revised\` entry naming it lets a red run freeze it`,
			)
		})
	},
)
