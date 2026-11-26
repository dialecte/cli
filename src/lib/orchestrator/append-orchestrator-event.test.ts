import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { temporaryFolder } from '../../../test/scratch-repository.ts'
import { EVENT_LINE_LIMIT } from '../events/events.constants.ts'
import { appendOrchestratorEvent } from './append-orchestrator-event.ts'
import { orchestratorPaths } from './orchestrator-paths.ts'

import { describe, expect, it } from 'vitest'

import type { OrchestratorEvent, OrchestratorState } from './orchestrator.types.ts'

function wholeState(
	workspace: ReturnType<typeof orchestratorPaths>['workspace'],
): OrchestratorState {
	return {
		schema: 1,
		workspace,
		updatedAt: '2026-11-26T09:00:00.000Z',
		lanes: [],
		lots: [],
		runs: [],
		runners: [],
		held: [],
		waitingOnYou: [],
		prs: [],
		next: [],
		seen: [],
	}
}

function testPaths(): {
	paths: ReturnType<typeof orchestratorPaths>
} {
	const root = temporaryFolder('dialecte-orchestrator-append-')
	const workspace = join(root, 'workspace')
	mkdirSync(workspace)
	const paths = orchestratorPaths({
		workspace,
		environment: { XDG_STATE_HOME: join(root, 'state-home') },
	})
	mkdirSync(paths.folder, { recursive: true })
	return { paths }
}

describe('appendOrchestratorEvent', () => {
	const CASES: Record<string, () => void> = {
		'complete event with stale render -> log appended and STATE.md refreshed from the new tail':
			() => {
				const { paths } = testPaths()
				const prior: OrchestratorEvent = {
					schema: 1,
					id: 'event-prior',
					at: '2026-11-26T09:00:00.000Z',
					kind: 'station',
					subject: 'lot-prior',
					facts: { state: 'ready' },
				}
				const event: OrchestratorEvent = {
					schema: 1,
					id: 'event-a',
					at: '2026-11-26T09:01:00.000Z',
					kind: 'station',
					subject: 'lot-a',
					facts: { state: 'working' },
				}
				writeFileSync(paths.log, `${JSON.stringify(prior)}\n`)
				writeFileSync(paths.render, 'stale render\n')

				expect(() =>
					appendOrchestratorEvent({ paths, state: wholeState(paths.workspace), event }),
				).not.toThrow()
				const logBytes = Buffer.from(`${JSON.stringify(prior)}\n${JSON.stringify(event)}\n`, 'utf8')
				const renderBytes = Buffer.from(
					`Status: 0 runs, 0 waiting, 0 next

## Waiting on you
none

## Runners
none

## Lanes
none

## Lots in flight
none

## Held
none

## Next
none

## Recent
- 2026-11-26T09:00:00.000Z station lot-prior event-prior {"state":"ready"}
- 2026-11-26T09:01:00.000Z station lot-a event-a {"state":"working"}
`,
					'utf8',
				)

				expect(readFileSync(paths.log)).toEqual(logBytes)
				expect(readFileSync(paths.render)).toEqual(renderBytes)
			},
		'event over the 4 KiB line limit -> explicit refusal and no append': () => {
			const { paths } = testPaths()
			const oldLog = '{"schema":1,"id":"old"}\n'
			const event: OrchestratorEvent = {
				schema: 1,
				id: 'event-large',
				at: '2026-11-26T09:01:00.000Z',
				kind: 'station',
				subject: 'lot-a',
				facts: { note: 'x'.repeat(EVENT_LINE_LIMIT) },
			}
			const bytes = Buffer.byteLength(`${JSON.stringify(event)}\n`, 'utf8')
			writeFileSync(paths.log, oldLog)
			writeFileSync(paths.render, 'old render\n')

			expect(() =>
				appendOrchestratorEvent({ paths, state: wholeState(paths.workspace), event }),
			).toThrowError(
				`event line of ${String(bytes)} bytes is over the limit of ${String(EVENT_LINE_LIMIT)} bytes`,
			)
			expect(existsSync(paths.log)).toBe(true)
			expect(readFileSync(paths.log, 'utf8')).toBe(oldLog)
			expect(readFileSync(paths.render, 'utf8')).toBe('old render\n')
		},
		'selected paths and state with another workspace root -> exact refusal and no append': () => {
			const { paths } = testPaths()
			const oldLog = Buffer.from('{"schema":1,"id":"old"}\n', 'utf8')
			const oldRender = Buffer.from('old render\n', 'utf8')
			const event: OrchestratorEvent = {
				schema: 1,
				id: 'event-a',
				at: '2026-11-26T09:01:00.000Z',
				kind: 'station',
				subject: 'lot-a',
				facts: { state: 'working' },
			}
			const state = wholeState(paths.workspace)
			writeFileSync(paths.log, oldLog)
			writeFileSync(paths.render, oldRender)

			expect(() =>
				appendOrchestratorEvent({
					paths,
					state: {
						...state,
						workspace: { ...state.workspace, root: `${state.workspace.root}-other` },
					},
					event,
				}),
			).toThrowError(
				`state.workspace.root must equal selected workspace root ${paths.workspace.root}`,
			)
			expect(readFileSync(paths.log)).toEqual(oldLog)
			expect(readFileSync(paths.render)).toEqual(oldRender)
		},
		'state with another workspace key -> exact refusal and no append': () => {
			const { paths } = testPaths()
			const oldLog = Buffer.from('{"schema":1,"id":"old"}\n', 'utf8')
			const oldRender = Buffer.from('old render\n', 'utf8')
			const event: OrchestratorEvent = {
				schema: 1,
				id: 'event-a',
				at: '2026-11-26T09:01:00.000Z',
				kind: 'station',
				subject: 'lot-a',
				facts: { state: 'working' },
			}
			const state = wholeState(paths.workspace)
			writeFileSync(paths.log, oldLog)
			writeFileSync(paths.render, oldRender)

			expect(() =>
				appendOrchestratorEvent({
					paths,
					state: {
						...state,
						workspace: { ...state.workspace, key: `${state.workspace.key}-other` },
					},
					event,
				}),
			).toThrowError(`state.workspace.key must equal selected workspace key ${paths.workspace.key}`)
			expect(readFileSync(paths.log)).toEqual(oldLog)
			expect(readFileSync(paths.render)).toEqual(oldRender)
		},
	}

	it.each(Object.entries(CASES))('%s', (_title, run) => run())
})
