/** `buildContribLines`: the contrib rows of the card from the contrib record of the checked tree, then the live mutation row. */

import {
	CONTRIB_NEVER_RUN,
	MUTATION_DECLARATION,
} from '../../../test/handover-profile.constants.ts'
import { editedPackage, recordGateAndContrib } from '../../../test/handover-profile.ts'
import { reportRun } from '../../../test/mutation-hooks.ts'
import { survivorOf } from '../../../test/mutation-package.ts'
import { SCRATCH_REPOSITORY_TIMEOUT } from '../../../test/scratch-checks.constants.ts'
import { createCounter } from '../../../test/scratch-checks.ts'
import { counterStep } from '../../../test/scratch-contrib.ts'
import { buildContribLines } from './card-gates.ts'
import { computeStateTree } from './state-hash.ts'

import { describe, expect, it } from 'vitest'

/** The parameters of the contrib lines of the package as it is, for a hand-over holding no lot. */
function contribParamsOf(root: string): Parameters<typeof buildContribLines>[0] {
	return {
		root,
		folder: root,
		tree: computeStateTree(root),
		branch: 'main',
		mergedBranches: [],
	}
}

describe('buildContribLines', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('a contrib record of the tree → one line per recorded row, in order, and no mutation row without a scope', async () => {
		const counter = createCounter()
		const root = editedPackage({ steps: [counterStep({ counter, name: 'docs' })] })
		await recordGateAndContrib(root)

		expect(buildContribLines(contribParamsOf(root))).toEqual([
			{ name: 'rules', status: 'passed', detail: expect.any(String) },
			{ name: 'docs', status: 'passed', detail: expect.any(String) },
			{ name: 'release', status: 'passed', detail: expect.any(String) },
		])
	})

	it('a declared mutation scope → the live mutation row last, read from the store now', async () => {
		const root = editedPackage({ steps: [], mutation: MUTATION_DECLARATION })
		await recordGateAndContrib(root)
		reportRun({ root, survivors: [survivorOf({ key: 'k1' })] })

		expect(buildContribLines(contribParamsOf(root))).toEqual([
			{ name: 'rules', status: 'passed', detail: expect.any(String) },
			{ name: 'release', status: 'passed', detail: expect.any(String) },
			{ name: 'mutation', status: 'failed', detail: expect.any(String) },
		])
	})

	it('no contrib record → one failed contrib line that says to run dialecte contrib', () => {
		const root = editedPackage({ steps: [] })

		expect(buildContribLines(contribParamsOf(root))).toEqual([
			{ name: 'contrib', status: 'failed', detail: CONTRIB_NEVER_RUN },
		])
	})
})
