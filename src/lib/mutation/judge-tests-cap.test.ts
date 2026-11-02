import { SCOPE_FILE } from '../../../test/mutation-package.constants.ts'
import { mutationPackage, storedReportedRun, survivorOf } from '../../../test/mutation-package.ts'
import { SCRATCH_REPOSITORY_TIMEOUT } from '../../../test/scratch-checks.constants.ts'
import { judgePackets } from './judge-packet.ts'
import { hashTests, judgeReport } from './judge.ts'

import { describe, expect, it } from 'vitest'

import type { MutationReport } from './mutation.types.ts'

const TEST_FILE = 'test/a.test.ts'
const SOURCE = 'export function f(x: number) {\n\treturn x === 1\n}\n'

/** `case 01` .. `case <count>` of the test file, as the report names them. */
function namesOf(count: number): string[] {
	return Array.from(
		{ length: count },
		(_unused, index) => `${TEST_FILE}#case ${String(index + 1).padStart(2, '0')}`,
	)
}

/** A report of one surviving mutant on line 2 covered by `count` tests, ids given in reverse. */
function coveredBy(count: number): MutationReport {
	const tests = Array.from({ length: count }, (_unused, index) => ({
		id: String(index),
		name: `case ${String(index + 1).padStart(2, '0')}`,
	}))
	return {
		files: {
			[SCOPE_FILE]: {
				source: SOURCE,
				mutants: [
					{
						id: '1',
						mutatorName: 'ConditionalExpression',
						replacement: 'true',
						status: 'Survived',
						coveredBy: tests.map(({ id }) => id).reverse(),
						location: { start: { line: 2, column: 9 }, end: { line: 2, column: 16 } },
					},
				],
			},
		},
		testFiles: { [TEST_FILE]: { tests } },
	}
}

describe(
	'judgeReport: a survivor stores at most five test names',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		it('eight covering tests → the first five in sort order, three counted in testsMore, the tests hash over all eight', () => {
			const [survivor] = judgeReport({ report: coveredBy(8), records: {} }).survivors

			expect(survivor).toMatchObject({ tests: namesOf(5), testsMore: 3 })
			expect(survivor.testsHash).toBe(hashTests({ tests: namesOf(8) }))
			expect(judgeReport({ report: coveredBy(5), records: {} }).survivors[0]).toSatisfy(
				function noneCut(fiveCovered: { tests?: string[] }) {
					return fiveCovered.tests?.length === 5 && !Object.hasOwn(fiveCovered, 'testsMore')
				},
			)
		})

		it('a packet of a stored survivor → the stored testsMore added to what the packet cuts', () => {
			const root = mutationPackage()
			storedReportedRun({
				root,
				startedAt: '2026-11-02T10:00:00.000Z',
				survivors: [{ ...survivorOf({ key: 'k1' }), tests: namesOf(5), testsMore: 7 }],
			})

			expect(judgePackets({ root })[0].survivors[0]).toMatchObject({
				tests: namesOf(5),
				testsMore: 7,
			})
		})
	},
)
