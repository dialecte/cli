/**
 * `lot scope --add` with the forecast (33CO 4.1, 4.2): an add meeting an open lot waits only when the two lots' work
 * collides (or the forecast cannot run); `--overlap-ok` passes it and records it. The forecast run is recorded with
 * trigger `scope`.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
	SHARED_LINE10_B,
	SHARED_LINE1_A,
	SHARED_LINE2_A,
	SHARED_LINE2_B,
} from '../../test/forecast-workspace.constants.ts'
import {
	createForecastWorkspace,
	startForecastLot,
	workInLot,
} from '../../test/forecast-workspace.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { readForecastRecord } from '../lib/coordination/forecast-record.ts'
import { STORE_FILES } from '../lib/store/store.constants.ts'
import { runLotScope } from './lot-scope.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ForecastTestLot } from '../../test/forecast-workspace.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

const NOW = new Date('2026-11-17T13:00:00.000Z')
const GO_AHEAD = ['--by', 'reviewer', '--reason', 'the shared file is needed']

/** Two lots: the first holds `src/shared.ts`, the second `src/other.ts`; each rewrites the shared file as given. */
function twoLots(params: { first: string; second: string }): {
	first: ForecastTestLot
	second: ForecastTestLot
} {
	const workspace = createForecastWorkspace()
	const first = startForecastLot({ workspace, feature: 'lot-a', scope: ['src/shared.ts'] })
	const second = startForecastLot({ workspace, feature: 'lot-b', scope: ['src/other.ts'] })
	workInLot({ lot: first, files: { 'src/shared.ts': params.first } })
	workInLot({ lot: second, files: { 'src/shared.ts': params.second } })
	return { first, second }
}

/** `lot scope <second> --add src/shared.ts` with the go-ahead and the extra words. */
function addShared(params: { second: ForecastTestLot; extra?: string[] }) {
	return runLotScope({
		cwd: params.second.worktree,
		argv: [params.second.name, '--add', 'src/shared.ts', ...GO_AHEAD, ...(params.extra ?? [])],
		now: NOW,
	})
}

/** The scope changes the lot recorded (its file's text, empty when there is none). */
function scopeChangesOf(lot: ForecastTestLot): string {
	const file = join(lot.lotFolder, STORE_FILES.scopeChanges)
	return existsSync(file) ? readFileSync(file, 'utf8') : ''
}

describe('lot scope --add with the forecast', { timeout: STORE_CASE_TIMEOUT }, () => {
	it("lot scope --add on a lot whose work conflicts with the met lot's work -> refused naming files and ranges, nothing written: no scope change, no forecast run", () => {
		const { first, second } = twoLots({ first: SHARED_LINE2_A, second: SHARED_LINE2_B })

		const result = addShared({ second })

		expect({
			exitCode: result.exitCode,
			output: result.output,
			changes: scopeChangesOf(second),
			triggers: readForecastRecord({ lotFolder: second.lotFolder }).lines.map(
				(line) => line.trigger,
			),
		}).toEqual({
			exitCode: 2,
			output: expect.stringContaining(
				`the added paths meet the open lot ${first.name}: src/shared.ts meets src/shared.ts: forecast conflict: src/shared.ts:2-6 (content): nothing written`,
			),
			changes: '',
			// a refusal writes nothing: the newest run is still the start's
			triggers: ['start', 'start'],
		})
	})

	it("lot scope --add where the two lots' work merges clean -> added, no overlaps.jsonl line, the scope forecast recorded", () => {
		const { second } = twoLots({ first: SHARED_LINE1_A, second: SHARED_LINE10_B })

		const result = addShared({ second })

		expect({
			exitCode: result.exitCode,
			added: scopeChangesOf(second).includes('"op":"add"'),
			overlaps: existsSync(join(second.lotFolder, STORE_FILES.overlaps)),
			last: readForecastRecord({ lotFolder: second.lotFolder }).lines.map((line) => line.trigger),
		}).toEqual({ exitCode: 0, added: true, overlaps: false, last: ['scope', 'scope'] })
	})

	it('the conflicting add with --overlap-ok -> added and recorded in overlaps.jsonl', () => {
		const { first, second } = twoLots({ first: SHARED_LINE2_A, second: SHARED_LINE2_B })

		const result = addShared({ second, extra: ['--overlap-ok'] })

		expect({
			exitCode: result.exitCode,
			added: scopeChangesOf(second).includes('"op":"add"'),
			overlaps: readFileSync(join(second.lotFolder, STORE_FILES.overlaps), 'utf8'),
		}).toEqual({
			exitCode: 0,
			added: true,
			overlaps: expect.stringContaining(`"lot":"${first.name}"`),
		})
	})
})
