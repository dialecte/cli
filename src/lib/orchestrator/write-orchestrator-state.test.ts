import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { temporaryFolder } from '../../../test/scratch-repository.ts'
import { orchestratorPaths } from './orchestrator-paths.ts'
import { writeOrchestratorState } from './write-orchestrator-state.ts'

import { describe, expect, it } from 'vitest'

import type { OrchestratorState } from './orchestrator.types.ts'

function wholeState(params: { root: string; key: string; updatedAt: string }): OrchestratorState {
	return {
		schema: 1,
		workspace: { root: params.root, key: params.key },
		updatedAt: params.updatedAt,
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

/** What a write threw: whether it is an Error, its name, code, field and message. */
function faultView(failure: unknown): unknown {
	const fault = failure as { code?: unknown; field?: unknown }
	return {
		isError: failure instanceof Error,
		name: failure instanceof Error ? failure.name : typeof failure,
		code: fault?.code,
		field: fault?.field,
		message: failure instanceof Error ? failure.message : String(failure),
	}
}

describe('writeOrchestratorState', () => {
	const CASES: Record<string, () => void> = {
		'complete whole state -> exact state.json and STATE.md bytes': () => {
			const root = temporaryFolder('dialecte-orchestrator-write-success-')
			const workspace = join(root, 'workspace')
			const stateHome = join(root, 'state-home')
			mkdirSync(workspace)
			const paths = orchestratorPaths({
				workspace,
				environment: { XDG_STATE_HOME: stateHome },
				home: join(root, 'home'),
			})
			const state = wholeState({
				root: paths.workspace.root,
				key: paths.workspace.key,
				updatedAt: '2026-11-26T09:00:00.000Z',
			})
			const expectedState = Buffer.from(`${JSON.stringify(state, null, 2)}\n`, 'utf8')
			const expectedRender = Buffer.from(
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
none
`,
				'utf8',
			)

			expect(() => writeOrchestratorState({ paths, state })).not.toThrow()
			expect(readFileSync(paths.state)).toEqual(expectedState)
			expect(readFileSync(paths.render)).toEqual(expectedRender)
		},
		'old whole state and render -> failure after temporary state file keeps both old documents':
			() => {
				const root = temporaryFolder('dialecte-orchestrator-write-')
				const workspace = join(root, 'workspace')
				const stateHome = join(root, 'state-home')
				mkdirSync(workspace)
				const paths = orchestratorPaths({
					workspace,
					environment: { XDG_STATE_HOME: stateHome },
					home: join(root, 'home'),
				})
				mkdirSync(paths.folder, { recursive: true })
				const oldState = wholeState({
					root: paths.workspace.root,
					key: paths.workspace.key,
					updatedAt: '2026-11-26T08:00:00.000Z',
				})
				const newState = wholeState({
					root: paths.workspace.root,
					key: paths.workspace.key,
					updatedAt: '2026-11-26T09:00:00.000Z',
				})
				const oldStateBytes = Buffer.from(`${JSON.stringify(oldState, null, 2)}\n`, 'utf8')
				const oldRenderBytes = Buffer.from('old complete render\n', 'utf8')
				writeFileSync(paths.state, oldStateBytes)
				writeFileSync(paths.render, oldRenderBytes)

				expect(() =>
					writeOrchestratorState({
						paths,
						state: newState,
						afterStateTemporaryWritten(temporary) {
							expect(readFileSync(temporary)).toEqual(
								Buffer.from(`${JSON.stringify(newState, null, 2)}\n`, 'utf8'),
							)
							throw new Error('injected failure after temporary state write')
						},
					}),
				).toThrowError('injected failure after temporary state write')
				expect(readFileSync(paths.state)).toEqual(oldStateBytes)
				expect(readFileSync(paths.render)).toEqual(oldRenderBytes)
			},
		'state with another workspace root -> explicit refusal with no write': () => {
			const root = temporaryFolder('dialecte-orchestrator-write-root-')
			const workspace = join(root, 'workspace')
			const stateHome = join(root, 'state-home')
			mkdirSync(workspace)
			const paths = orchestratorPaths({
				workspace,
				environment: { XDG_STATE_HOME: stateHome },
				home: join(root, 'home'),
			})
			const state = wholeState({
				root: join(root, 'other'),
				key: paths.workspace.key,
				updatedAt: '2026-11-26T09:00:00.000Z',
			})
			let failure: unknown

			try {
				writeOrchestratorState({ paths, state })
			} catch (error) {
				failure = error
			}

			expect({
				fault: faultView(failure),
				folderExists: existsSync(paths.folder),
			}).toEqual({
				fault: {
					isError: true,
					name: 'OrchestratorFault',
					code: 'workspace-mismatch',
					field: undefined,
					message: `state.workspace.root must equal selected workspace root ${paths.workspace.root}`,
				},
				folderExists: false,
			})
		},
		'state with another workspace key -> explicit refusal with no write': () => {
			const root = temporaryFolder('dialecte-orchestrator-write-key-')
			const workspace = join(root, 'workspace')
			const stateHome = join(root, 'state-home')
			mkdirSync(workspace)
			const paths = orchestratorPaths({
				workspace,
				environment: { XDG_STATE_HOME: stateHome },
				home: join(root, 'home'),
			})
			const state = wholeState({
				root: paths.workspace.root,
				key: 'other-workspace-key',
				updatedAt: '2026-11-26T09:00:00.000Z',
			})
			let failure: unknown

			try {
				writeOrchestratorState({ paths, state })
			} catch (error) {
				failure = error
			}

			expect({
				fault: faultView(failure),
				folderExists: existsSync(paths.folder),
			}).toEqual({
				fault: {
					isError: true,
					name: 'OrchestratorFault',
					code: 'workspace-mismatch',
					field: undefined,
					message: `state.workspace.key must equal selected workspace key ${paths.workspace.key}`,
				},
				folderExists: false,
			})
		},
		'state without updatedAt -> state-invalid with its field and the parser message after "state.json: ", nothing written':
			function invalidStateRefused() {
				const root = temporaryFolder('dialecte-orchestrator-write-invalid-')
				const workspace = join(root, 'workspace')
				const stateHome = join(root, 'state-home')
				mkdirSync(workspace)
				const paths = orchestratorPaths({
					workspace,
					environment: { XDG_STATE_HOME: stateHome },
					home: join(root, 'home'),
				})
				const state = Object.fromEntries(
					Object.entries(
						wholeState({
							root: paths.workspace.root,
							key: paths.workspace.key,
							updatedAt: '2026-11-26T09:00:00.000Z',
						}),
					).filter(([key]) => key !== 'updatedAt'),
				) as unknown as OrchestratorState
				let failure: unknown

				try {
					writeOrchestratorState({ paths, state })
				} catch (error) {
					failure = error
				}

				expect({ fault: faultView(failure), stateHomeExists: existsSync(stateHome) }).toEqual({
					fault: {
						isError: true,
						name: 'OrchestratorFault',
						code: 'state-invalid',
						field: 'updatedAt',
						message: 'state.json: updatedAt: expected string',
					},
					stateHomeExists: false,
				})
			},
	}

	it.each(Object.entries(CASES))('%s', (_title, run) => run())
})
