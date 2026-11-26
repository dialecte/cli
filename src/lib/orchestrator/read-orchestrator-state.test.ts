import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { temporaryFolder } from '../../../test/scratch-repository.ts'
import { orchestratorPaths } from './orchestrator-paths.ts'
import { readOrchestratorState } from './read-orchestrator-state.ts'

import { describe, expect, it } from 'vitest'

import type { OrchestratorState, ReadOrchestratorStateResult } from './orchestrator.types.ts'

describe('readOrchestratorState', () => {
	const CASES: Record<string, () => void> = {
		'valid whole state with stale STATE.md -> parsed state remains readable with explicit render damage':
			() => {
				const root = temporaryFolder('dialecte-orchestrator-read-state-')
				const workspace = join(root, 'workspace')
				mkdirSync(workspace)
				const paths = orchestratorPaths({
					workspace,
					environment: { XDG_STATE_HOME: join(root, 'state-home') },
				})
				mkdirSync(paths.folder, { recursive: true })
				const state: OrchestratorState = {
					schema: 1,
					workspace: paths.workspace,
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
				writeFileSync(paths.state, `${JSON.stringify(state, null, 2)}\n`)
				writeFileSync(paths.render, 'stale render\n')
				let result: ReadOrchestratorStateResult | undefined

				expect(() => {
					result = readOrchestratorState({ paths })
				}).not.toThrow()
				expect(result).toEqual({
					state,
					records: [],
					damage: [
						{
							source: 'render',
							message: 'STATE.md is stale for state.json and log.jsonl',
						},
					],
				})
			},
		'complete malformed state document -> explicit state damage and no empty-state fallback':
			() => {
				const root = temporaryFolder('dialecte-orchestrator-read-state-damaged-')
				const workspace = join(root, 'workspace')
				mkdirSync(workspace)
				const paths = orchestratorPaths({
					workspace,
					environment: { XDG_STATE_HOME: join(root, 'state-home') },
				})
				mkdirSync(paths.folder, { recursive: true })
				const malformed = {
					schema: 1,
					workspace: paths.workspace,
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
				writeFileSync(paths.state, `${JSON.stringify(malformed, null, 2)}\n`)
				mkdirSync(paths.log)
				let result: ReadOrchestratorStateResult | undefined

				expect(() => {
					result = readOrchestratorState({ paths })
				}).not.toThrow()
				expect(result).toEqual({
					state: null,
					records: [],
					damage: [
						{
							source: 'state',
							message: 'state.json: updatedAt: expected string',
						},
					],
				})
			},
		'missing state with damaged log -> only missing state damage': () => {
			const root = temporaryFolder('dialecte-orchestrator-read-state-missing-')
			const workspace = join(root, 'workspace')
			mkdirSync(workspace)
			const paths = orchestratorPaths({
				workspace,
				environment: { XDG_STATE_HOME: join(root, 'state-home') },
			})
			mkdirSync(paths.log, { recursive: true })
			let result: ReadOrchestratorStateResult | undefined

			expect(() => {
				result = readOrchestratorState({ paths })
			}).not.toThrow()
			expect(result).toEqual({
				state: null,
				records: [],
				damage: [{ source: 'state', message: 'state.json: missing' }],
			})
		},
		'state with another workspace root -> explicit root damage and no support reads': () => {
			const root = temporaryFolder('dialecte-orchestrator-read-state-root-')
			const workspace = join(root, 'workspace')
			mkdirSync(workspace)
			const paths = orchestratorPaths({
				workspace,
				environment: { XDG_STATE_HOME: join(root, 'state-home') },
			})
			mkdirSync(paths.folder, { recursive: true })
			const otherRoot = join(root, 'other')
			const state: OrchestratorState = {
				schema: 1,
				workspace: { root: otherRoot, key: paths.workspace.key },
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
			writeFileSync(paths.state, `${JSON.stringify(state, null, 2)}\n`)
			mkdirSync(paths.log)
			let result: ReadOrchestratorStateResult | undefined

			expect(() => {
				result = readOrchestratorState({ paths })
			}).not.toThrow()
			expect(result).toEqual({
				state: null,
				records: [],
				damage: [
					{
						source: 'state',
						message: `state.json: state.workspace.root must equal selected workspace root ${paths.workspace.root}`,
					},
				],
			})
		},
		'state with another workspace key -> explicit key damage and no support reads': () => {
			const root = temporaryFolder('dialecte-orchestrator-read-state-key-')
			const workspace = join(root, 'workspace')
			mkdirSync(workspace)
			const paths = orchestratorPaths({
				workspace,
				environment: { XDG_STATE_HOME: join(root, 'state-home') },
			})
			mkdirSync(paths.folder, { recursive: true })
			const state: OrchestratorState = {
				schema: 1,
				workspace: { root: paths.workspace.root, key: 'other-workspace-key' },
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
			writeFileSync(paths.state, `${JSON.stringify(state, null, 2)}\n`)
			mkdirSync(paths.log)
			let result: ReadOrchestratorStateResult | undefined

			expect(() => {
				result = readOrchestratorState({ paths })
			}).not.toThrow()
			expect(result).toEqual({
				state: null,
				records: [],
				damage: [
					{
						source: 'state',
						message: `state.json: state.workspace.key must equal selected workspace key ${paths.workspace.key}`,
					},
				],
			})
		},
	}

	it.each(Object.entries(CASES))('%s', (_title, run) => run())
})
