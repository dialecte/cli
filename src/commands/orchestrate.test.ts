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

type OrchestrateParams = {
	cwd: string
	argv: readonly string[]
	environment: Record<string, string | undefined>
	home: string
}

type OrchestratorTestPaths = {
	workspace: { root: string; key: string }
	folder: string
	state: string
	render: string
	log: string
}

type CasePaths = {
	root: string
	workspace: string
	stateHome: string
	home: string
	environment: Record<string, string | undefined>
	paths: OrchestratorTestPaths
}

type StoredCase = CasePaths & { state: Record<string, unknown> }

type StatusRow = { source: string; code: string; message: string }

const WAITING_RENDER = `Status: 2 runs, 1 waiting, 1 next

## Waiting on you
- gate-status: kind=gate; text=Approve the status command before handover; line=dialecte orchestrate status; options=approve, hold

## Runners
- runner-a: available=true; until=none; tokensSinceReset=3200; usage=64%

## Lanes
- cli: repos=cli; holds=none; owns=lot-state, lot-status; mode=running; plan=plans/cli; queue=none; pin=lot-pin

## Lots in flight
- lot-state: lane=cli; repo=cli; state=working; station=test; attempt=1; pr=; head=head-state; run=runner-a/run-waiting-1
- lot-status: lane=cli; repo=cli; state=working; station=review; attempt=2; pr=pr-status; head=head-status; run=runner-a/run-waiting-2

## Held
none

## Next
- cli: lot-next

## Recent
none
`

/** The render as the text mode prints it: its lines, without the final newline. */
const WAITING_TEXT = WAITING_RENDER.slice(0, -1)
const WAITING_STATUS_LINE = 'Status: 2 runs, 1 waiting, 1 next'

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

const STALE_NOTE: StatusRow = {
	source: 'render',
	code: 'render-stale',
	message: 'STATE.md is stale for state.json and log.jsonl',
}

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

/** A temporary workspace, state home and home (never the real one), nothing stored yet. */
function casePaths(prefix: string): CasePaths {
	const root = temporaryFolder(prefix)
	const workspace = join(root, 'workspace')
	const stateHome = join(root, 'state-home')
	mkdirSync(workspace)
	return {
		root,
		workspace,
		stateHome,
		home: join(root, 'home'),
		environment: { XDG_STATE_HOME: stateHome },
		paths: pathsOf({ workspace, stateHome }),
	}
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

/** The waiting fixture stored for a fresh workspace, with its exact render. */
function storedWaiting(): StoredCase {
	const testCase = casePaths('dialecte-orchestrate-waiting-')
	const source = JSON.parse(fixture('waiting')) as Record<string, unknown>
	const state = { ...source, workspace: testCase.paths.workspace }
	store({ paths: testCase.paths, state })
	return { ...testCase, state }
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

/** `orchestrate status` of a stored case, with its explicit environment and home. */
function statusOfCase(params: {
	stored: CasePaths
	argv: readonly string[]
}): Promise<CommandResult> {
	return statusOf({
		cwd: params.stored.workspace,
		argv: params.argv,
		environment: params.stored.environment,
		home: params.stored.home,
	})
}

function schemaOf(file: string): JsonSchema | undefined {
	if (!existsSync(file)) return undefined
	const schema = JSON.parse(readFileSync(file, 'utf8')) as JsonSchema
	return schema.type === 'null' ? undefined : schema
}

/** The faults of `value` against the state schema alone. */
function stateFaultsOf(value: unknown): string[] {
	const schema = schemaOf(STATE_SCHEMA)
	if (schema === undefined) return ['$: schema missing']
	return schemaFaultsOf({ value, schema })
}

/** The faults of `value` against the whole status schema, its references into the state schema resolved. */
function statusFaultsOf(value: unknown): string[] {
	const status = schemaOf(STATUS_SCHEMA)
	const state = schemaOf(STATE_SCHEMA)
	if (status === undefined || state === undefined) return ['$: schema missing']
	try {
		return schemaFaultsOf({ value, schema: status, schemas: [state] })
	} catch (error) {
		return [String(error)]
	}
}

/** The exit code, the parsed JSON and its faults against the whole status schema. */
function jsonOutcome(result: CommandResult): {
	exitCode: number
	json: unknown
	statusFaults: string[]
} {
	const view = jsonView(result)
	return { ...view, statusFaults: statusFaultsOf(view.json) }
}

/** The status JSON of `paths` with the given outcome, state, status line, damage and notes. */
function statusJson(params: {
	paths: OrchestratorTestPaths
	outcome: 'present' | 'missing' | 'damaged'
	state: unknown
	statusLine: string
	damage?: readonly StatusRow[]
	notes?: readonly StatusRow[]
}): unknown {
	return {
		schema: 1,
		workspace: params.paths.workspace,
		outcome: params.outcome,
		state: params.state,
		statusLine: params.statusLine,
		damage: params.damage ?? [],
		notes: params.notes ?? [],
	}
}

describe('orchestrate status, text mode', function orchestrateStatusTextMode() {
	const CASES: Record<string, () => Promise<void>> = {
		'valid stored state -> status text (exit 0), exact STATE.md, no file changed':
			async function validText() {
				const stored = storedWaiting()
				const before = snapshotOf(stored.paths.folder)

				const result = await statusOfCase({ stored, argv: ['status'] })

				expect({
					exitCode: result.exitCode,
					output: result.output,
					after: snapshotOf(stored.paths.folder),
				}).toEqual({ exitCode: 0, output: WAITING_TEXT, after: before })
			},
		'valid state with stale STATE.md -> the render then its note line (exit 0), no file changed':
			async function staleRenderText() {
				const stored = storedWaiting()
				writeFileSync(stored.paths.render, 'stale\n')
				const before = snapshotOf(stored.paths.folder)

				const result = await statusOfCase({ stored, argv: ['status'] })

				expect({
					exitCode: result.exitCode,
					output: result.output,
					after: snapshotOf(stored.paths.folder),
				}).toEqual({
					exitCode: 0,
					output: `${WAITING_TEXT}\nnote: STATE.md is stale for state.json and log.jsonl`,
					after: before,
				})
			},
		'valid state without STATE.md -> the render then its note line (exit 0), nothing written':
			async function missingRenderText() {
				const stored = storedWaiting()
				rmSync(stored.paths.render)
				const before = snapshotOf(stored.paths.folder)

				const result = await statusOfCase({ stored, argv: ['status'] })

				expect({
					exitCode: result.exitCode,
					output: result.output,
					after: snapshotOf(stored.paths.folder),
				}).toEqual({
					exitCode: 0,
					output: `${WAITING_TEXT}\nnote: STATE.md: missing`,
					after: before,
				})
			},
		'directory at render -> the render then its note line (exit 0), no file changed':
			async function renderDirectoryText() {
				const stored = storedWaiting()
				rmSync(stored.paths.render)
				mkdirSync(stored.paths.render)
				const before = snapshotOf(stored.paths.folder)

				const result = await statusOfCase({ stored, argv: ['status'] })

				expect({
					exitCode: result.exitCode,
					output: result.output,
					after: snapshotOf(stored.paths.folder),
				}).toEqual({
					exitCode: 0,
					output: `${WAITING_TEXT}\nnote: STATE.md: is a directory`,
					after: before,
				})
			},
		'an empty line and a sealed torn line in the log -> the render then the skipped note (exit 0), no file changed':
			async function skippedLogText() {
				const stored = storedWaiting()
				writeFileSync(stored.paths.log, '\n{"schema":1\n')
				const before = snapshotOf(stored.paths.folder)

				const result = await statusOfCase({ stored, argv: ['status'] })

				expect({
					exitCode: result.exitCode,
					output: result.output,
					after: snapshotOf(stored.paths.folder),
				}).toEqual({
					exitCode: 0,
					output: `${WAITING_TEXT}\nnote: log.jsonl: 2 unreadable lines skipped`,
					after: before,
				})
			},
		'a torn log tail and a stale render -> the render, the damage line, then the note line (exit 1)':
			async function tornLogText() {
				const stored = storedWaiting()
				writeFileSync(stored.paths.log, '{"schema":1,"id":"event-')
				writeFileSync(stored.paths.render, 'stale\n')
				const before = snapshotOf(stored.paths.folder)

				const result = await statusOfCase({ stored, argv: ['status'] })

				expect({
					exitCode: result.exitCode,
					output: result.output,
					after: snapshotOf(stored.paths.folder),
				}).toEqual({
					exitCode: 1,
					output: `${WAITING_TEXT}\ndamage: log.jsonl: 1 damaged record\nnote: STATE.md is stale for state.json and log.jsonl`,
					after: before,
				})
			},
		'directory at log -> the render then the damage line (exit 1), no file changed':
			async function logDirectoryText() {
				const stored = storedWaiting()
				mkdirSync(stored.paths.log)
				const before = snapshotOf(stored.paths.folder)

				const result = await statusOfCase({ stored, argv: ['status'] })

				expect({
					exitCode: result.exitCode,
					output: result.output,
					after: snapshotOf(stored.paths.folder),
				}).toEqual({
					exitCode: 1,
					output: `${WAITING_TEXT}\ndamage: log.jsonl: is a directory`,
					after: before,
				})
			},
		'invalid JSON state -> damaged text (exit 1), exact syntax diagnostic, no file changed':
			async function invalidJsonText() {
				const stored = storedWaiting()
				writeFileSync(stored.paths.state, '{"schema":1,\n')
				const before = snapshotOf(stored.paths.folder)

				const result = await statusOfCase({ stored, argv: ['status'] })

				expect({
					exitCode: result.exitCode,
					output: result.output,
					after: snapshotOf(stored.paths.folder),
				}).toEqual({ exitCode: 1, output: 'state.json: invalid JSON', after: before })
			},
		'missing state -> the status line (exit 1), no folder created': async function missingText() {
			const testCase = casePaths('dialecte-orchestrate-missing-')

			const result = await statusOfCase({ stored: testCase, argv: ['status'] })

			expect({
				exitCode: result.exitCode,
				output: result.output,
				folderExists: existsSync(testCase.paths.folder),
			}).toEqual({
				exitCode: 1,
				output: `no orchestrator state for ${testCase.paths.workspace.key}`,
				folderExists: false,
			})
		},
		'directory at state.json -> the state-unreadable damage line (exit 1)':
			async function stateDirectoryText() {
				const testCase = casePaths('dialecte-orchestrate-state-directory-')
				mkdirSync(testCase.paths.state, { recursive: true })

				const result = await statusOfCase({ stored: testCase, argv: ['status'] })

				expect({ exitCode: result.exitCode, output: result.output }).toEqual({
					exitCode: 1,
					output: 'state.json: is a directory',
				})
			},
		'state of another workspace root -> the workspace-mismatch damage line (exit 1)':
			async function mismatchText() {
				const stored = storedWaiting()
				const other = {
					...stored.state,
					workspace: { ...stored.paths.workspace, root: `${stored.paths.workspace.root}-other` },
				}
				writeFileSync(stored.paths.state, `${JSON.stringify(other, null, 2)}\n`)

				const result = await statusOfCase({ stored, argv: ['status'] })

				expect({ exitCode: result.exitCode, output: result.output }).toEqual({
					exitCode: 1,
					output: `state.json: state.workspace.root must equal selected workspace root ${stored.paths.workspace.root}`,
				})
			},
		'XDG_STATE_HOME inside the workspace -> the exact refusal (exit 2), nothing written':
			async function stateHomeInsideText() {
				const testCase = casePaths('dialecte-orchestrate-inside-')
				const stateHome = join(testCase.workspace, '.state')
				const before = snapshotOf(testCase.root)

				const result = await statusOf({
					cwd: testCase.workspace,
					argv: ['status'],
					environment: { XDG_STATE_HOME: stateHome },
					home: testCase.home,
				})

				expect({
					exitCode: result.exitCode,
					output: result.output,
					after: snapshotOf(testCase.root),
				}).toEqual({
					exitCode: 2,
					output: `state home ${stateHome} (from XDG_STATE_HOME) must be outside the workspace ${testCase.paths.workspace.root}`,
					after: before,
				})
			},
		'XDG_STATE_HOME below a regular file -> the state home refusal with its errno code (exit 2)':
			async function stateHomeBelowFileText() {
				const testCase = casePaths('dialecte-orchestrate-below-file-')
				const file = join(testCase.root, 'file')
				writeFileSync(file, 'not a folder\n')
				const stateHome = join(file, 'state')

				const result = await statusOf({
					cwd: testCase.workspace,
					argv: ['status'],
					environment: { XDG_STATE_HOME: stateHome },
					home: testCase.home,
				})

				expect({ exitCode: result.exitCode, output: result.output }).toEqual({
					exitCode: 2,
					output: `state home ${stateHome} (from XDG_STATE_HOME) cannot be read: ENOTDIR`,
				})
			},
		'bad --workspace -> explicit refusal (exit 2), no state read': async function badWorkspace() {
			const stored = storedWaiting()
			const missing = join(stored.workspace, 'not-a-workspace')
			const before = snapshotOf(stored.paths.folder)

			const result = await statusOfCase({ stored, argv: ['status', '--workspace', missing] })

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

			const result = await statusOfCase({ stored, argv: ['status', '--bogus'] })

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

describe('orchestrate status --json, every outcome checked against the whole status schema', function orchestrateStatusJsonEveryOutcome() {
	const CASES: Record<string, () => Promise<void>> = {
		'valid stored state -> present (exit 0), no damage, no note, the schemas validate it and refuse broken copies':
			async function validJson() {
				const stored = storedWaiting()

				const command = await statusOfCase({ stored, argv: ['status', '--json'] })
				const result = jsonOutcome(command)
				const status = statusJson({
					paths: stored.paths,
					outcome: 'present',
					state: stored.state,
					statusLine: WAITING_STATUS_LINE,
				})

				expect({
					result,
					stateSchema: {
						complete: stateFaultsOf(stored.state),
						extra: stateFaultsOf({ ...stored.state, unexpected: true }),
						wrongType: stateFaultsOf({ ...stored.state, updatedAt: 7 }),
					},
					statusSchema: {
						extra: statusFaultsOf({ ...(status as object), unexpected: true }),
						presentWithDamage: statusFaultsOf({
							...(status as object),
							damage: [
								{ source: 'log', code: 'log-damaged', message: 'log.jsonl: 1 damaged record' },
							],
						}),
					},
				}).toEqual({
					result: { exitCode: 0, json: status, statusFaults: [] },
					stateSchema: {
						complete: [],
						extra: ['$.unexpected: unknown key'],
						wrongType: ['$.updatedAt: not a string'],
					},
					statusSchema: {
						extra: ['$.unexpected: unknown key'],
						presentWithDamage: ['$.damage: above maxItems 0'],
					},
				})
			},
		'valid state with stale STATE.md -> present with its render-stale note (exit 0), no file changed':
			async function staleRenderJson() {
				const stored = storedWaiting()
				writeFileSync(stored.paths.render, 'stale\n')
				const before = snapshotOf(stored.paths.folder)

				const command = await statusOfCase({ stored, argv: ['status', '--json'] })

				expect({ result: jsonOutcome(command), after: snapshotOf(stored.paths.folder) }).toEqual({
					result: {
						exitCode: 0,
						json: statusJson({
							paths: stored.paths,
							outcome: 'present',
							state: stored.state,
							statusLine: WAITING_STATUS_LINE,
							notes: [STALE_NOTE],
						}),
						statusFaults: [],
					},
					after: before,
				})
			},
		'valid state without STATE.md -> present with its render-missing note (exit 0)':
			async function missingRenderJson() {
				const stored = storedWaiting()
				rmSync(stored.paths.render)

				const command = await statusOfCase({ stored, argv: ['status', '--json'] })

				expect(jsonOutcome(command)).toEqual({
					exitCode: 0,
					json: statusJson({
						paths: stored.paths,
						outcome: 'present',
						state: stored.state,
						statusLine: WAITING_STATUS_LINE,
						notes: [{ source: 'render', code: 'render-missing', message: 'STATE.md: missing' }],
					}),
					statusFaults: [],
				})
			},
		'directory at render -> present with its render-unreadable note (exit 0)':
			async function renderDirectoryJson() {
				const stored = storedWaiting()
				rmSync(stored.paths.render)
				mkdirSync(stored.paths.render)

				const command = await statusOfCase({ stored, argv: ['status', '--json'] })

				expect(jsonOutcome(command)).toEqual({
					exitCode: 0,
					json: statusJson({
						paths: stored.paths,
						outcome: 'present',
						state: stored.state,
						statusLine: WAITING_STATUS_LINE,
						notes: [
							{ source: 'render', code: 'render-unreadable', message: 'STATE.md: is a directory' },
						],
					}),
					statusFaults: [],
				})
			},
		'an empty line and a sealed torn line in the log -> present with its log-skipped note (exit 0)':
			async function skippedLogJson() {
				const stored = storedWaiting()
				writeFileSync(stored.paths.log, '\n{"schema":1\n')

				const command = await statusOfCase({ stored, argv: ['status', '--json'] })

				expect(jsonOutcome(command)).toEqual({
					exitCode: 0,
					json: statusJson({
						paths: stored.paths,
						outcome: 'present',
						state: stored.state,
						statusLine: WAITING_STATUS_LINE,
						notes: [
							{
								source: 'log',
								code: 'log-skipped',
								message: 'log.jsonl: 2 unreadable lines skipped',
							},
						],
					}),
					statusFaults: [],
				})
			},
		'a torn log tail -> damaged (exit 1), the parsed state, log-damaged, no note':
			async function tornLogJson() {
				const stored = storedWaiting()
				writeFileSync(stored.paths.log, '{"schema":1,"id":"event-')

				const command = await statusOfCase({ stored, argv: ['status', '--json'] })

				expect(jsonOutcome(command)).toEqual({
					exitCode: 1,
					json: statusJson({
						paths: stored.paths,
						outcome: 'damaged',
						state: stored.state,
						statusLine: WAITING_STATUS_LINE,
						damage: [
							{ source: 'log', code: 'log-damaged', message: 'log.jsonl: 1 damaged record' },
						],
					}),
					statusFaults: [],
				})
			},
		'a complete JSON log line that is not a valid event -> damaged (exit 1), log-damaged':
			async function invalidEventJson() {
				const stored = storedWaiting()
				writeFileSync(stored.paths.log, '{"schema":1,"id":"event-b"}\n')

				const command = await statusOfCase({ stored, argv: ['status', '--json'] })

				expect(jsonOutcome(command)).toEqual({
					exitCode: 1,
					json: statusJson({
						paths: stored.paths,
						outcome: 'damaged',
						state: stored.state,
						statusLine: WAITING_STATUS_LINE,
						damage: [
							{ source: 'log', code: 'log-damaged', message: 'log.jsonl: 1 damaged record' },
						],
					}),
					statusFaults: [],
				})
			},
		'directory at log -> damaged (exit 1), the parsed state, log-unreadable, no file changed':
			async function logDirectoryJson() {
				const stored = storedWaiting()
				mkdirSync(stored.paths.log)
				const before = snapshotOf(stored.paths.folder)

				const command = await statusOfCase({ stored, argv: ['status', '--json'] })

				expect({ result: jsonOutcome(command), after: snapshotOf(stored.paths.folder) }).toEqual({
					result: {
						exitCode: 1,
						json: statusJson({
							paths: stored.paths,
							outcome: 'damaged',
							state: stored.state,
							statusLine: WAITING_STATUS_LINE,
							damage: [
								{ source: 'log', code: 'log-unreadable', message: 'log.jsonl: is a directory' },
							],
						}),
						statusFaults: [],
					},
					after: before,
				})
			},
		'invalid JSON state -> damaged (exit 1), null state, state-invalid, an answer, no file changed':
			async function invalidJsonDocument() {
				const stored = storedWaiting()
				writeFileSync(stored.paths.state, '{"schema":1,\n')
				const before = snapshotOf(stored.paths.folder)

				const command = await statusOfCase({ stored, argv: ['status', '--json'] })

				expect({
					result: jsonOutcome(command),
					answer: command.answer,
					after: snapshotOf(stored.paths.folder),
				}).toEqual({
					result: {
						exitCode: 1,
						json: statusJson({
							paths: stored.paths,
							outcome: 'damaged',
							state: null,
							statusLine: `invalid orchestrator state for ${stored.paths.workspace.key}`,
							damage: [
								{ source: 'state', code: 'state-invalid', message: 'state.json: invalid JSON' },
							],
						}),
						statusFaults: [],
					},
					answer: true,
					after: before,
				})
			},
		'malformed state -> damaged (exit 1), null state, state-invalid with the first error, no fallback':
			async function malformedJson() {
				const stored = storedWaiting()
				const malformed = Object.fromEntries(
					Object.entries(stored.state).filter(([field]) => field !== 'updatedAt'),
				)
				writeFileSync(stored.paths.state, `${JSON.stringify(malformed, null, 2)}\n`)

				const command = await statusOfCase({ stored, argv: ['status', '--json'] })

				expect(jsonOutcome(command)).toEqual({
					exitCode: 1,
					json: statusJson({
						paths: stored.paths,
						outcome: 'damaged',
						state: null,
						statusLine: `invalid orchestrator state for ${stored.paths.workspace.key}`,
						damage: [
							{
								source: 'state',
								code: 'state-invalid',
								message: 'state.json: updatedAt: expected string',
							},
						],
					}),
					statusFaults: [],
				})
			},
		'directory at state.json -> damaged (exit 1), null state, state-unreadable':
			async function stateDirectoryJson() {
				const testCase = casePaths('dialecte-orchestrate-state-directory-')
				mkdirSync(testCase.paths.state, { recursive: true })

				const command = await statusOfCase({ stored: testCase, argv: ['status', '--json'] })

				expect(jsonOutcome(command)).toEqual({
					exitCode: 1,
					json: statusJson({
						paths: testCase.paths,
						outcome: 'damaged',
						state: null,
						statusLine: `unreadable orchestrator state for ${testCase.paths.workspace.key}`,
						damage: [
							{ source: 'state', code: 'state-unreadable', message: 'state.json: is a directory' },
						],
					}),
					statusFaults: [],
				})
			},
		'state of another workspace root -> damaged (exit 1), null state, workspace-mismatch':
			async function mismatchJson() {
				const stored = storedWaiting()
				const other = {
					...stored.state,
					workspace: { ...stored.paths.workspace, root: `${stored.paths.workspace.root}-other` },
				}
				writeFileSync(stored.paths.state, `${JSON.stringify(other, null, 2)}\n`)

				const command = await statusOfCase({ stored, argv: ['status', '--json'] })

				expect(jsonOutcome(command)).toEqual({
					exitCode: 1,
					json: statusJson({
						paths: stored.paths,
						outcome: 'damaged',
						state: null,
						statusLine: `orchestrator state of another workspace for ${stored.paths.workspace.key}`,
						damage: [
							{
								source: 'state',
								code: 'workspace-mismatch',
								message: `state.json: state.workspace.root must equal selected workspace root ${stored.paths.workspace.root}`,
							},
						],
					}),
					statusFaults: [],
				})
			},
		'missing state -> missing (exit 1), null state, state-missing, no note, no directory':
			async function missingJson() {
				const testCase = casePaths('dialecte-orchestrate-missing-')

				const command = await statusOfCase({ stored: testCase, argv: ['status', '--json'] })

				expect({
					result: jsonOutcome(command),
					folderExists: existsSync(testCase.paths.folder),
				}).toEqual({
					result: {
						exitCode: 1,
						json: statusJson({
							paths: testCase.paths,
							outcome: 'missing',
							state: null,
							statusLine: `no orchestrator state for ${testCase.paths.workspace.key}`,
							damage: [{ source: 'state', code: 'state-missing', message: 'state.json: missing' }],
						}),
						statusFaults: [],
					},
					folderExists: false,
				})
			},
		'XDG_STATE_HOME inside the workspace -> the exact refusal as JSON (exit 2), nothing written':
			async function stateHomeInsideJson() {
				const testCase = casePaths('dialecte-orchestrate-inside-')
				const stateHome = join(testCase.workspace, '.state')
				const before = snapshotOf(testCase.root)

				const command = await statusOf({
					cwd: testCase.workspace,
					argv: ['status', '--json'],
					environment: { XDG_STATE_HOME: stateHome },
					home: testCase.home,
				})

				expect({ result: jsonView(command), after: snapshotOf(testCase.root) }).toEqual({
					result: {
						exitCode: 2,
						json: {
							error: `state home ${stateHome} (from XDG_STATE_HOME) must be outside the workspace ${testCase.paths.workspace.root}`,
							next: null,
						},
					},
					after: before,
				})
			},
		'relative XDG_STATE_HOME -> ignored: the state below <home>/.local/state of the given home is read (exit 0)':
			async function relativeStateHomeJson() {
				const testCase = casePaths('dialecte-orchestrate-relative-state-home-')
				const paths = pathsOf({
					workspace: testCase.workspace,
					stateHome: join(testCase.home, '.local', 'state'),
				})
				const source = JSON.parse(fixture('waiting')) as Record<string, unknown>
				const state = { ...source, workspace: paths.workspace }
				store({ paths, state })

				const command = await statusOf({
					cwd: testCase.workspace,
					argv: ['status', '--json'],
					environment: { XDG_STATE_HOME: 'relative-state' },
					home: testCase.home,
				})

				expect(jsonOutcome(command)).toEqual({
					exitCode: 0,
					json: statusJson({
						paths,
						outcome: 'present',
						state,
						statusLine: WAITING_STATUS_LINE,
					}),
					statusFaults: [],
				})
			},
		'different default and selected states -> relative --workspace selects the selected state (exit 0), neither folder changes':
			async function relativeWorkspaceDocument() {
				const root = temporaryFolder('dialecte-orchestrate-workspace-')
				const workspace = join(root, 'default')
				const selected = join(root, 'selected')
				const stateHome = join(root, 'state-home')
				mkdirSync(workspace)
				mkdirSync(selected)
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
					environment: { XDG_STATE_HOME: stateHome },
					home: join(root, 'home'),
				})

				expect({
					result: jsonOutcome(command),
					defaultAfter: snapshotOf(defaultPaths.folder),
					selectedAfter: snapshotOf(selectedPaths.folder),
				}).toEqual({
					result: {
						exitCode: 0,
						json: statusJson({
							paths: selectedPaths,
							outcome: 'present',
							state: selectedState,
							statusLine: WAITING_STATUS_LINE,
						}),
						statusFaults: [],
					},
					defaultAfter: defaultBefore,
					selectedAfter: selectedBefore,
				})
			},
	}

	for (const [title, run] of Object.entries(CASES)) it(title, run)
})

/** Every `$ref` of a schema, depth first. */
function referencesOf(value: unknown): string[] {
	if (Array.isArray(value)) return value.flatMap(referencesOf)
	if (typeof value !== 'object' || value === null) return []
	return Object.entries(value).flatMap(function referencesOfEntry([key, inner]) {
		return key === '$ref' && typeof inner === 'string' ? [inner] : referencesOf(inner)
	})
}

describe('the status schema', function statusSchemaCases() {
	it('each outcome branch -> its valid copy accepted, its broken copies refused by the whole status schema', function statusBranches() {
		const state = JSON.parse(fixture('waiting')) as Record<string, unknown>
		const workspace = state.workspace
		const stateDamage = {
			source: 'state',
			code: 'state-invalid',
			message: 'state.json: invalid JSON',
		}
		const missingDamage = { source: 'state', code: 'state-missing', message: 'state.json: missing' }
		const present = {
			schema: 1,
			workspace,
			outcome: 'present',
			state,
			statusLine: WAITING_STATUS_LINE,
			damage: [],
			notes: [STALE_NOTE],
		}
		const missing = {
			schema: 1,
			workspace,
			outcome: 'missing',
			state: null,
			statusLine: 'no orchestrator state for cli-123456789abc',
			damage: [missingDamage],
			notes: [],
		}
		const damaged = {
			schema: 1,
			workspace,
			outcome: 'damaged',
			state: null,
			statusLine: 'invalid orchestrator state for cli-123456789abc',
			damage: [stateDamage],
			notes: [],
		}

		expect({
			accepted: {
				present: statusFaultsOf(present),
				missing: statusFaultsOf(missing),
				damaged: statusFaultsOf(damaged),
			},
			refused: {
				missingWithState: statusFaultsOf({ ...missing, state }).length > 0,
				missingWithoutDamage: statusFaultsOf({ ...missing, damage: [] }).length > 0,
				missingWithTwoDamageRows:
					statusFaultsOf({ ...missing, damage: [missingDamage, stateDamage] }).length > 0,
				damagedWithoutDamage: statusFaultsOf({ ...damaged, damage: [] }).length > 0,
			},
		}).toEqual({
			accepted: { present: [], missing: [], damaged: [] },
			refused: {
				missingWithState: true,
				missingWithoutDamage: true,
				missingWithTwoDamageRows: true,
				damagedWithoutDamage: true,
			},
		})
	})

	it('its own $defs -> exactly damage and note; state and its shapes taken from orchestrator-state.schema.json by $ref', function statusDefinitions() {
		const status = schemaOf(STATUS_SCHEMA) ?? {}
		const properties = (status.properties ?? {}) as Record<string, unknown>

		expect({
			definitions: Object.keys((status.$defs ?? {}) as Record<string, unknown>).sort(),
			stateReferences: referencesOf(properties.state),
			foreignReferences: referencesOf(status).filter(function isForeign(reference) {
				return (
					!reference.startsWith('orchestrator-state.schema.json') &&
					reference !== '#/$defs/damage' &&
					reference !== '#/$defs/note'
				)
			}),
		}).toEqual({
			definitions: ['damage', 'note'],
			stateReferences: ['orchestrator-state.schema.json'],
			foreignReferences: [],
		})
	})
})
