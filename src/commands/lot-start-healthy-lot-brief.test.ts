/**
 * R1-B4: a healthy open lot (its identity and records read) whose `brief.json` cannot give its scope holds every
 * path: a real `lot start` is refused naming it; the overlap check never fails open on a brief it cannot read.
 */
import { rmSync } from 'node:fs'
import { join } from 'node:path'

import { writeStoreLot } from '../../test/brief-workspace.ts'
import {
	BRIEF_DAMAGES,
	DAMAGED_NAME,
	OVERLAPPING_SCOPE,
	SCOPE_UNREADABLE,
} from '../../test/damaged-lot-workspace.constants.ts'
import { refusalsOf, replaceRecord, startDefaultBrief } from '../../test/damaged-lot-workspace.ts'
import { createStartWorkspace, entriesOf } from '../../test/lot-start-workspace.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { BriefDamage } from '../../test/damaged-lot-workspace.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** A real lot whose records all read, its `brief.json` then spoilt as `brief` says. */
function healthyLotWithBrief(params: { brief: BriefDamage }): {
	start: ReturnType<typeof createStartWorkspace>
	lotFolder: string
} {
	const start = createStartWorkspace()
	const lotFolder = writeStoreLot({
		workspace: start.workspace,
		name: DAMAGED_NAME,
		scope: OVERLAPPING_SCOPE,
		repository: start.workspace.repository,
	})
	if (params.brief === 'missing') rmSync(join(lotFolder, 'brief.json'))
	if (params.brief === 'unparsable')
		replaceRecord({ folder: lotFolder, name: 'brief.json', text: '{ "scope": [' })
	if (params.brief === 'scopeNotList')
		replaceRecord({
			folder: lotFolder,
			name: 'brief.json',
			text: JSON.stringify({ scope: OVERLAPPING_SCOPE[0] }),
		})
	return { start, lotFolder }
}

describe('a healthy open lot whose brief cannot be read', { timeout: STORE_CASE_TIMEOUT }, () => {
	for (const row of BRIEF_DAMAGES)
		it(`${row.title} -> lot start refused (exit 2) naming the lot and that its scope cannot be read, no lot made`, () => {
			const { start } = healthyLotWithBrief({ brief: row.kind })

			const started = startDefaultBrief({ start })

			expect(started.exitCode).toBe(2)
			const [refusal] = refusalsOf({ json: started.json })
			expect(refusal).toMatchObject({ field: 'scope', rule: 'overlap' })
			expect(refusal?.detail).toContain(`overlap with ${DAMAGED_NAME}`)
			expect(refusal?.detail).toContain(SCOPE_UNREADABLE)
			expect(entriesOf(start.store)).toEqual([DAMAGED_NAME])
		})
})
