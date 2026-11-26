import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'

import { schemaFaultsOf } from '../../test/json-schema-faults.ts'
import { snapshotOf } from '../../test/lot-start-workspace.ts'
import { temporaryFolder } from '../../test/scratch-repository.ts'
import { textOf } from '../lib/print/print.ts'

import { describe, expect, it } from 'vitest'

import type { JsonSchema } from '../../test/json-schema-faults.types.ts'
import type { CommandResult } from '../lib/command-result.types.ts'
import type { OrchestratorState } from '../lib/orchestrator/orchestrator.types.ts'

type OrchestrateParams = {
	cwd: string
	argv: readonly string[]
	environment: Record<string, string | undefined>
}

type OrchestratorTestPaths = {
	workspace: { root: string; key: string }
	folder: string
	state: string
	render: string
	log: string
}

type StoredCase = {
	paths: OrchestratorTestPaths
	state: Record<string, unknown>
	environment: Record<string, string | undefined>
	workspace: string
}

const WAITING_RENDER = `Status: 2 runs, 1 waiting, 1 next

## Waiting on you
- gate-status: kind=gate; text=Approve the status command before handover; line=dialecte orchestrate status; options=approve, hold

## Runners
- runner-a: available=true; until=none; tokensSinceReset=3200; usage=64%

## Lanes
- cli: repos=cli; holds=none; owns=0401-cli-state, 0402-cli-status; mode=running; plan=implementation-plans/AGENT_TOOLING/research/40-SO1; queue=none; pin=lot-0403

## Lots in flight
- 0401-cli-state: lane=cli; repo=cli; state=working; station=test; attempt=1; pr=; head=0401-aaaa; run=runner-a/run-waiting-1
- 0402-cli-status: lane=cli; repo=cli; state=working; station=review; attempt=2; pr=pr-402; head=0402-bbbb; run=runner-a/run-waiting-2

## Held
none

## Next
- cli: 0403-cli-render

## Recent
none
`

const PUBLIC_USAGE = 'dialecte orchestrate status [--workspace <path>] [--json]'
const STATE_SCHEMA = join(
	import.meta.dirname,
	'..',
	'lib',
	'orchestrator',
	'orchestrator-state.schema.json',
)
const STATUS_SCHEMA = join(
	import.meta.dirname,
	'..',
	'lib',
	'orchestrator',
	'orchestrator-status.schema.json',
)

function fixture(name: string): string {
	return readFileSync(
		join(import.meta.dirname, '..', 'lib', 'orchestrator', 'fixtures', `${name}.json`),
		'utf8',
	)
}

function pathsOf(params: { workspace: string; stateHome: string }): OrchestratorTestPaths {
	const root = realpathSync.native(params.workspace)
	const key = `${basename(root)}-${createHash('sha256').update(root).digest('hex').slice(0, 12)}`
	const folder = join(params.stateHome, 'dialecte', 'orchestrator', key)
	return {
		workspace: { root, key },
		folder,
		state: join(folder, 'state.json'),
		render: join(folder, 'STATE.md'),
		log: join(folder, 'log.jsonl'),
	}
}

function casePaths(prefix: string): {
	root: string
	workspace: string
	stateHome: string
	environment: Record<string, string | undefined>
	paths: OrchestratorTestPaths
} {
	const root = temporaryFolder(prefix)
	const workspace = join(root, 'workspace')
	const stateHome = join(root, 'state-home')
	mkdirSync(workspace)
	return {
		root,
		workspace,
		stateHome,
		environment: { XDG_STATE_HOME: stateHome },
		paths: pathsOf({ workspace, stateHome }),
	}
}

function storedWaiting(): StoredCase {
	const testCase = casePaths('dialecte-orchestrate-waiting-')
	const source = JSON.parse(fixture('waiting')) as Record<string, unknown>
	const state = { ...source, workspace: testCase.paths.workspace }
	mkdirSync(testCase.paths.folder, { recursive: true })
	writeFileSync(testCase.paths.state, `${JSON.stringify(state, null, 2)}\n`)
	writeFileSync(testCase.paths.render, WAITING_RENDER)
	return { ...testCase, state }
}

function store(params: {
	paths: OrchestratorTestPaths
	state: Record<string, unknown>
	render?: string
}): void {
	mkdirSync(params.paths.folder, { recursive: true })
	writeFileSync(params.paths.state, `${JSON.stringify(params.state, null, 2)}\n`)
	writeFileSync(params.paths.render, params.render ?? WAITING_RENDER)
}

function jsonView(result: CommandResult): { exitCode: number; json: unknown } {
	try {
		return { exitCode: result.exitCode, json: JSON.parse(result.output) }
	} catch {
		return { exitCode: result.exitCode, json: undefined }
	}
}

function commandFailure(error: unknown): CommandResult {
	return {
		exitCode: -1,
		output: textOf([error instanceof Error ? error.message : String(error)]),
	}
}

async function statusOf(params: OrchestrateParams): Promise<CommandResult> {
	try {
		const command = (await import('./orchestrate.ts')) as {
			runOrchestrate: (input: OrchestrateParams) => CommandResult
		}
		return command.runOrchestrate(params)
	} catch (error) {
		return commandFailure(error)
	}
}

function schemaFaults(params: { value: unknown; file: string }): string[] {
	if (!existsSync(params.file)) return ['$: schema missing']
	const schema = JSON.parse(readFileSync(params.file, 'utf8')) as JsonSchema
	if (schema.type === 'null') return ['schema is a placeholder']
	return schemaFaultsOf({ value: params.value, schema })
}

async function parsedFixture(params: { name: string }): Promise<OrchestratorState | CommandResult> {
	try {
		const parser = (await import('../lib/orchestrator/parse-orchestrator-state.ts')) as {
			parseOrchestratorState: (input: { text: string }) => unknown
		}
		return parser.parseOrchestratorState({ text: fixture(params.name) }) as OrchestratorState
	} catch (error) {
		return commandFailure(error)
	}
}

describe('orchestrate status, whole public documents', () => {
	const CASES: Record<string, () => Promise<void>> = {
		'valid stored state -> status text (exit 0), exact STATE.md, no file changed':
			async function validText() {
				const stored = storedWaiting()
				const before = snapshotOf(stored.paths.folder)

				const result = await statusOf({
					cwd: stored.workspace,
					argv: ['status'],
					environment: stored.environment,
				})

				expect({
					exitCode: result.exitCode,
					output: result.output,
					after: snapshotOf(stored.paths.folder),
				}).toEqual({
					exitCode: 0,
					output: WAITING_RENDER.slice(0, -1),
					after: before,
				})
			},
		'valid stored state -> status JSON (exit 0), versioned whole document, both schemas validate':
			async function validJson() {
				const stored = storedWaiting()

				const command = await statusOf({
					cwd: stored.workspace,
					argv: ['status', '--json'],
					environment: stored.environment,
				})
				const result = jsonView(command)
				const status = {
					schema: 1,
					workspace: stored.paths.workspace,
					outcome: 'present',
					state: stored.state,
					statusLine: 'Status: 2 runs, 1 waiting, 1 next',
					damage: [],
				}
				const stateWithExtra = { ...stored.state, unexpected: true }
				const stateWithWrongType = { ...stored.state, updatedAt: 7 }
				const statusWithExtra = { ...status, unexpected: true }
				const statusWithWrongType = { ...status, outcome: 7 }

				expect({
					result,
					stateSchema: {
						complete: schemaFaults({ value: stored.state, file: STATE_SCHEMA }),
						extra: schemaFaults({ value: stateWithExtra, file: STATE_SCHEMA }),
						wrongType: schemaFaults({ value: stateWithWrongType, file: STATE_SCHEMA }),
					},
					statusSchema: {
						complete: schemaFaults({ value: result.json, file: STATUS_SCHEMA }),
						extra: schemaFaults({ value: statusWithExtra, file: STATUS_SCHEMA }),
						wrongType: schemaFaults({
							value: statusWithWrongType,
							file: STATUS_SCHEMA,
						}),
					},
				}).toEqual({
					result: { exitCode: 0, json: status },
					stateSchema: {
						complete: [],
						extra: ['$.unexpected: unknown key'],
						wrongType: ['$.updatedAt: not a string'],
					},
					statusSchema: {
						complete: [],
						extra: ['$.unexpected: unknown key'],
						wrongType: ['$.outcome: not a string'],
					},
				})
			},
		'invalid JSON state -> damaged text (exit 1), exact syntax diagnostic, no file changed':
			async function invalidJsonText() {
				const stored = storedWaiting()
				writeFileSync(stored.paths.state, '{"schema":1,\n')
				const before = snapshotOf(stored.paths.folder)

				const result = await statusOf({
					cwd: stored.workspace,
					argv: ['status'],
					environment: stored.environment,
				})

				expect({
					exitCode: result.exitCode,
					output: result.output,
					after: snapshotOf(stored.paths.folder),
				}).toEqual({
					exitCode: 1,
					output: 'state.json: invalid JSON',
					after: before,
				})
			},
		'invalid JSON state -> damaged JSON (exit 1), null state, exact syntax damage, no file changed':
			async function invalidJsonDocument() {
				const stored = storedWaiting()
				writeFileSync(stored.paths.state, '{"schema":1,\n')
				const before = snapshotOf(stored.paths.folder)

				const command = await statusOf({
					cwd: stored.workspace,
					argv: ['status', '--json'],
					environment: stored.environment,
				})

				expect({
					result: jsonView(command),
					answer: command.answer,
					after: snapshotOf(stored.paths.folder),
				}).toEqual({
					result: {
						exitCode: 1,
						json: {
							schema: 1,
							workspace: stored.paths.workspace,
							outcome: 'damaged',
							state: null,
							statusLine: `invalid orchestrator state for ${stored.paths.workspace.key}`,
							damage: [{ source: 'state', message: 'state.json: invalid JSON' }],
						},
					},
					answer: true,
					after: before,
				})
			},
		'valid state with stale STATE.md -> damaged text (exit 1), exact render diagnostic, no file changed':
			async function staleRenderText() {
				const stored = storedWaiting()
				writeFileSync(stored.paths.render, 'stale\n')
				const before = snapshotOf(stored.paths.folder)

				const result = await statusOf({
					cwd: stored.workspace,
					argv: ['status'],
					environment: stored.environment,
				})

				expect({
					exitCode: result.exitCode,
					output: result.output,
					after: snapshotOf(stored.paths.folder),
				}).toEqual({
					exitCode: 1,
					output: 'STATE.md is stale for state.json and log.jsonl',
					after: before,
				})
			},
		'valid state with stale STATE.md -> damaged JSON (exit 1), exact whole document, no file changed':
			async function staleRenderDocument() {
				const stored = storedWaiting()
				writeFileSync(stored.paths.render, 'stale\n')
				const before = snapshotOf(stored.paths.folder)

				const command = await statusOf({
					cwd: stored.workspace,
					argv: ['status', '--json'],
					environment: stored.environment,
				})

				expect({
					result: jsonView(command),
					after: snapshotOf(stored.paths.folder),
				}).toEqual({
					result: {
						exitCode: 1,
						json: {
							schema: 1,
							workspace: stored.paths.workspace,
							outcome: 'damaged',
							state: stored.state,
							statusLine: 'Status: 2 runs, 1 waiting, 1 next',
							damage: [
								{
									source: 'render',
									message: 'STATE.md is stale for state.json and log.jsonl',
								},
							],
						},
					},
					after: before,
				})
			},
		'valid state with blank and invalid log rows -> damaged text (exit 1), exact two-record diagnostic, no file changed':
			async function damagedLogText() {
				const stored = storedWaiting()
				writeFileSync(stored.paths.log, '\n{"schema":1\n')
				const before = snapshotOf(stored.paths.folder)

				const result = await statusOf({
					cwd: stored.workspace,
					argv: ['status'],
					environment: stored.environment,
				})

				expect({
					exitCode: result.exitCode,
					output: result.output,
					after: snapshotOf(stored.paths.folder),
				}).toEqual({
					exitCode: 1,
					output: 'log.jsonl: 2 damaged records',
					after: before,
				})
			},
		'valid state with blank and invalid log rows -> damaged JSON (exit 1), exact whole document, no file changed':
			async function damagedLogDocument() {
				const stored = storedWaiting()
				writeFileSync(stored.paths.log, '\n{"schema":1\n')
				const before = snapshotOf(stored.paths.folder)

				const command = await statusOf({
					cwd: stored.workspace,
					argv: ['status', '--json'],
					environment: stored.environment,
				})

				expect({
					result: jsonView(command),
					after: snapshotOf(stored.paths.folder),
				}).toEqual({
					result: {
						exitCode: 1,
						json: {
							schema: 1,
							workspace: stored.paths.workspace,
							outcome: 'damaged',
							state: stored.state,
							statusLine: 'Status: 2 runs, 1 waiting, 1 next',
							damage: [{ source: 'log', message: 'log.jsonl: 2 damaged records' }],
						},
					},
					after: before,
				})
			},
		'directory at log -> damaged text (exit 1), exact directory diagnostic, no file changed':
			async function logDirectoryText() {
				const stored = storedWaiting()
				mkdirSync(stored.paths.log)
				const before = snapshotOf(stored.paths.folder)

				const result = await statusOf({
					cwd: stored.workspace,
					argv: ['status'],
					environment: stored.environment,
				})

				expect({
					exitCode: result.exitCode,
					output: result.output,
					after: snapshotOf(stored.paths.folder),
				}).toEqual({
					exitCode: 1,
					output: 'log.jsonl: is a directory',
					after: before,
				})
			},
		'directory at log -> damaged JSON (exit 1), exact whole document, no file changed':
			async function logDirectoryDocument() {
				const stored = storedWaiting()
				mkdirSync(stored.paths.log)
				const before = snapshotOf(stored.paths.folder)

				const command = await statusOf({
					cwd: stored.workspace,
					argv: ['status', '--json'],
					environment: stored.environment,
				})

				expect({
					result: jsonView(command),
					after: snapshotOf(stored.paths.folder),
				}).toEqual({
					result: {
						exitCode: 1,
						json: {
							schema: 1,
							workspace: stored.paths.workspace,
							outcome: 'damaged',
							state: stored.state,
							statusLine: 'Status: 2 runs, 1 waiting, 1 next',
							damage: [{ source: 'log', message: 'log.jsonl: is a directory' }],
						},
					},
					after: before,
				})
			},
		'directory at render -> damaged text (exit 1), exact directory diagnostic, no file changed':
			async function renderDirectoryText() {
				const stored = storedWaiting()
				rmSync(stored.paths.render)
				mkdirSync(stored.paths.render)
				const before = snapshotOf(stored.paths.folder)

				const result = await statusOf({
					cwd: stored.workspace,
					argv: ['status'],
					environment: stored.environment,
				})

				expect({
					exitCode: result.exitCode,
					output: result.output,
					after: snapshotOf(stored.paths.folder),
				}).toEqual({
					exitCode: 1,
					output: 'STATE.md: is a directory',
					after: before,
				})
			},
		'directory at render -> damaged JSON (exit 1), exact whole document, no file changed':
			async function renderDirectoryDocument() {
				const stored = storedWaiting()
				rmSync(stored.paths.render)
				mkdirSync(stored.paths.render)
				const before = snapshotOf(stored.paths.folder)

				const command = await statusOf({
					cwd: stored.workspace,
					argv: ['status', '--json'],
					environment: stored.environment,
				})

				expect({
					result: jsonView(command),
					after: snapshotOf(stored.paths.folder),
				}).toEqual({
					result: {
						exitCode: 1,
						json: {
							schema: 1,
							workspace: stored.paths.workspace,
							outcome: 'damaged',
							state: stored.state,
							statusLine: 'Status: 2 runs, 1 waiting, 1 next',
							damage: [{ source: 'render', message: 'STATE.md: is a directory' }],
						},
					},
					after: before,
				})
			},
		'missing state -> missing JSON (exit 1), null state, canonical damage, no directory':
			async function missingJson() {
				const testCase = casePaths('dialecte-orchestrate-missing-')

				const command = await statusOf({
					cwd: testCase.workspace,
					argv: ['status', '--json'],
					environment: testCase.environment,
				})
				const result = jsonView(command)

				expect({ result, folderExists: existsSync(testCase.paths.folder) }).toEqual({
					result: {
						exitCode: 1,
						json: {
							schema: 1,
							workspace: testCase.paths.workspace,
							outcome: 'missing',
							state: null,
							statusLine: `no orchestrator state for ${testCase.paths.workspace.key}`,
							damage: [{ source: 'state', message: 'state.json: missing' }],
						},
					},
					folderExists: false,
				})
			},
		'malformed state -> damaged JSON (exit 1), null state, first error, no fallback':
			async function malformedJson() {
				const stored = storedWaiting()
				const malformed = Object.fromEntries(
					Object.entries(stored.state).filter(([field]) => field !== 'updatedAt'),
				)
				writeFileSync(stored.paths.state, `${JSON.stringify(malformed, null, 2)}\n`)
				const before = snapshotOf(stored.paths.folder)

				const command = await statusOf({
					cwd: stored.workspace,
					argv: ['status', '--json'],
					environment: stored.environment,
				})

				expect({
					result: jsonView(command),
					after: snapshotOf(stored.paths.folder),
				}).toEqual({
					result: {
						exitCode: 1,
						json: {
							schema: 1,
							workspace: stored.paths.workspace,
							outcome: 'damaged',
							state: null,
							statusLine: `invalid orchestrator state for ${stored.paths.workspace.key}`,
							damage: [{ source: 'state', message: 'state.json: updatedAt: expected string' }],
						},
					},
					after: before,
				})
			},
		'different default and selected states -> relative --workspace JSON selects selected state (exit 0), neither folder changes':
			async function relativeWorkspaceDocument() {
				const root = temporaryFolder('dialecte-orchestrate-workspace-')
				const workspace = join(root, 'default')
				const selected = join(root, 'selected')
				const stateHome = join(root, 'state-home')
				mkdirSync(workspace)
				mkdirSync(selected)
				const environment = { XDG_STATE_HOME: stateHome }
				const defaultPaths = pathsOf({ workspace, stateHome })
				const selectedPaths = pathsOf({ workspace: selected, stateHome })
				const source = JSON.parse(fixture('waiting')) as Record<string, unknown>
				const defaultState = {
					...source,
					workspace: defaultPaths.workspace,
					updatedAt: '2026-11-26T10:00:00.000Z',
				}
				const selectedState = {
					...source,
					workspace: selectedPaths.workspace,
					updatedAt: '2026-11-26T11:00:00.000Z',
				}
				store({ paths: defaultPaths, state: defaultState })
				store({ paths: selectedPaths, state: selectedState })
				const defaultBefore = snapshotOf(defaultPaths.folder)
				const selectedBefore = snapshotOf(selectedPaths.folder)

				const command = await statusOf({
					cwd: workspace,
					argv: ['status', '--workspace', '../selected', '--json'],
					environment,
				})

				expect({
					result: jsonView(command),
					defaultAfter: snapshotOf(defaultPaths.folder),
					selectedAfter: snapshotOf(selectedPaths.folder),
				}).toEqual({
					result: {
						exitCode: 0,
						json: {
							schema: 1,
							workspace: selectedPaths.workspace,
							outcome: 'present',
							state: selectedState,
							statusLine: 'Status: 2 runs, 1 waiting, 1 next',
							damage: [],
						},
					},
					defaultAfter: defaultBefore,
					selectedAfter: selectedBefore,
				})
			},
		'bad --workspace -> explicit refusal (exit 2), no state read': async function badWorkspace() {
			const stored = storedWaiting()
			const missing = join(stored.workspace, 'not-a-workspace')
			const before = snapshotOf(stored.paths.folder)

			const result = await statusOf({
				cwd: stored.workspace,
				argv: ['status', '--workspace', missing],
				environment: stored.environment,
			})

			expect({
				exitCode: result.exitCode,
				output: result.output,
				after: snapshotOf(stored.paths.folder),
			}).toEqual({
				exitCode: 2,
				output: `workspace must be a directory: ${missing}`,
				after: before,
			})
		},
		'unknown option -> explicit usage (exit 2), no state read': async function unknownOption() {
			const stored = storedWaiting()
			const before = snapshotOf(stored.paths.folder)

			const result = await statusOf({
				cwd: stored.workspace,
				argv: ['status', '--bogus'],
				environment: stored.environment,
			})

			expect({
				exitCode: result.exitCode,
				output: result.output,
				after: snapshotOf(stored.paths.folder),
			}).toEqual({
				exitCode: 2,
				output: `unknown option --bogus\nUsage: ${PUBLIC_USAGE}`,
				after: before,
			})
		},
	}

	for (const [title, run] of Object.entries(CASES)) it(title, run)
})

describe('orchestrator take-over fixtures', () => {
	const CASES: Record<string, { name: string }> = {
		'waiting fixture -> parsed state and exact take-over object': {
			name: 'waiting',
		},
		'runner-fallback fixture -> parsed state and exact take-over object': {
			name: 'runner-fallback',
		},
		'held fixture -> parsed state and exact take-over object': {
			name: 'held',
		},
	}

	for (const [title, testCase] of Object.entries(CASES))
		it(title, async () => {
			const wholeState = JSON.parse(fixture(testCase.name))
			const takeover = JSON.parse(fixture(`${testCase.name}.takeover`))
			const parsed = await parsedFixture({ name: testCase.name })
			const projected =
				'exitCode' in parsed
					? undefined
					: {
							inFlight: parsed.lots
								.filter((lot) => lot.state !== 'committed' && lot.state !== 'canceled')
								.map((lot) => lot.id),
							waitingOnYou: parsed.waitingOnYou.map((item) => item.text),
							next: parsed.next.map((item) => item.lot),
						}

			expect({
				parsed,
				projected,
				takeover,
				stateFaults: schemaFaults({ value: wholeState, file: STATE_SCHEMA }),
			}).toEqual({
				parsed: wholeState,
				projected: takeover,
				takeover,
				stateFaults: [],
			})
		})
})
