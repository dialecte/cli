/**
 * `lot land` and the design gate (DESIGN-GATE section 3, DG2): after the rebase and before the push, a lot whose
 * required design is missing is refused and nothing is pushed; an approved design lands; each landing records the
 * base's shared areas again, so `lot status` names an area the base declared after the lot started.
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { STORE_GLOB, STORE_NEED } from '../../../test/design-workspace.constants.ts'
import { approvedDesign, landingLot } from '../../../test/design-workspace.ts'
import { landOnOrigin, recordingHost } from '../../../test/land-lot.ts'
import { git } from '../../../test/scratch-repository.ts'
import { SCRATCH_GIT_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { runLot } from '../../commands/lot.ts'
import { landLot } from './land-lot.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { LandingLot } from '../../../test/design-workspace.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** Origin's main declares `STORE_GLOB` a shared area after the lot started. */
function declareOnOrigin(lot: LandingLot): void {
	landOnOrigin({
		origin: lot.origin,
		files: {
			'package.json': `${JSON.stringify({ name: 'demo', dialecte: { risk: { high: [STORE_GLOB] } } })}\n`,
		},
	})
}

function land(lot: LandingLot) {
	return landLot({
		...lot,
		lot: lot.name,
		branch: 'feat/x',
		base: 'main',
		host: recordingHost().host,
		draft: true,
		now: new Date('2026-11-17T12:00:00.000Z'),
	})
}

/** The branches origin holds. */
function originBranches(lot: LandingLot): string {
	return git({ root: lot.root, args: ['ls-remote', '--heads', lot.origin] })
}

describe('lot land - the design gate', { timeout: SCRATCH_GIT_CASE_TIMEOUT }, () => {
	it("a base declaring an area the lot's scope reaches, the design missing -> refused after the rebase, nothing pushed", () => {
		const lot = landingLot()
		declareOnOrigin(lot)

		expect(land(lot)).toMatchObject({
			exitCode: 1,
			lines: expect.arrayContaining([
				`lot land: lot ${lot.name} design missing (shared ${STORE_GLOB}): dialecte lot design ${lot.name} --from <DESIGN.md>, then approve it from the main checkout: dialecte lot design ${lot.name} --approve --by <who>; nothing pushed`,
			]),
		})
		expect(originBranches(lot)).not.toContain('refs/heads/feat/x')
	})

	it('the design approved for the need -> lands', () => {
		const lot = landingLot()
		declareOnOrigin(lot)
		approvedDesign({ lot, need: STORE_NEED })

		expect(land(lot).exitCode).toBe(0)
		expect(originBranches(lot)).toContain('refs/heads/feat/x')
	})

	it('a glob the base adds after lot start -> lot status names it once the lot landed again', () => {
		const lot = landingLot()
		declareOnOrigin(lot)
		approvedDesign({ lot, need: STORE_NEED })
		land(lot)
		// the worktree's working file drops the area: only the base, as the landing recorded it, still names it
		writeFileSync(join(lot.worktree, 'package.json'), `${JSON.stringify({ name: 'demo' })}\n`)

		expect(
			JSON.parse(runLot({ cwd: lot.root, argv: ['status', lot.name, '--json'] }).output),
		).toMatchObject({
			design: { required: true, reasons: [{ kind: 'shared', glob: STORE_GLOB, path: 'src' }] },
		})
	})
})
