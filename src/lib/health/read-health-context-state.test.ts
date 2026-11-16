import { join } from 'node:path'

import { createBriefWorkspace, writeStoreLot } from '../../../test/brief-workspace.ts'
import { stepRunEvents } from '../../../test/health.ts'
import { transitionOf, writeRecordFile } from '../../../test/store-records.ts'
import { readHealthRepository } from './read-health-context.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { BriefWorkspace } from '../../../test/brief-workspace.types.ts'

const LOT = '0104-cli-state-run'
const SCOPE = ['src/']

type StateCase = {
	name: string
	write: (workspace: BriefWorkspace) => void
	expected: string | undefined
}

const cases: StateCase[] = [
	{
		name: 'a working lot reads working',
		write: (workspace) => void writeStoreLot({ workspace, name: LOT, scope: SCOPE }),
		expected: 'working',
	},
	{
		name: 'a committed lot reads committed',
		write: (workspace) =>
			void writeStoreLot({
				workspace,
				name: LOT,
				scope: SCOPE,
				registry: 'committed',
			}),
		expected: 'committed',
	},
	{
		name: 'a canceled lot reads canceled',
		write: (workspace) =>
			void writeStoreLot({
				workspace,
				name: LOT,
				scope: SCOPE,
				later: [transitionOf({ seq: 2, state: 'canceled', kind: 'stop' })],
			}),
		expected: 'canceled',
	},
	{
		name: 'a lot whose identity does not read is damaged',
		write: (workspace) =>
			void writeRecordFile({
				folder: join(workspace.store, LOT),
				name: 'identity.json',
				text: 'not a lot identity',
			}),
		expected: 'damaged',
	},
	{
		name: 'a folder holding only events.jsonl has no state',
		write: (workspace) =>
			void writeRecordFile({
				folder: join(workspace.store, LOT),
				name: 'events.jsonl',
				text: `${stepRunEvents({
					lot: LOT,
					run: 'run-a',
					step: 'gate-fast',
					startAt: '2026-11-15T01:00:00.000Z',
					endAt: '2026-11-15T01:01:00.000Z',
				})
					.map((event) => JSON.stringify(event))
					.join('\n')}\n`,
			}),
		expected: undefined,
	},
]

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

describe('readHealthRepository: the state of a lot', () => {
	it.each(cases)('$name', function stateCase(row) {
		const workspace = createBriefWorkspace()
		row.write(workspace)
		const common = join(workspace.registry, '..')
		const lot = readHealthRepository({ common }).lots.find((candidate) => candidate.name === LOT)
		expect(lot?.state).toBe(row.expected)
	})
})
