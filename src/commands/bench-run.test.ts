/**
 * `dialecte bench` on a real git package: the head measured against the change's base, both trees with the head's
 * compiler, one run per scenario on one checker, and the verdict explained by a type-cost note the change added.
 */
import { existsSync, readdirSync, realpathSync } from 'node:fs'
import { join } from 'node:path'

import {
	BROKEN_CONSTANTS_TEXT,
	HEAD_BRANCH,
	INSTALL_ARGS,
	VERSION,
} from '../../test/bench-repository.constants.ts'
import {
	compilerRunsOf,
	createBaseInstaller,
	createBenchLotWorktree,
	createBenchRepository,
	createUncommittedBenchPackage,
	definitionFilesOf,
} from '../../test/bench-repository.ts'
import { commitFiles } from '../../test/rules-lot-worktree.ts'
import { git } from '../../test/scratch-repository.ts'
import { SCRATCH_GIT_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { runBench } from './bench.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { BenchRepository, CompilerRun } from '../../test/bench-repository.types.ts'
import type { CommandResult } from '../lib/command-result.types.ts'

const WHOLE_PROGRAM = 'whole-program (check)'
const EXPLAIN_LINE =
	'explain it in this lot\'s changelog fragment ("- Type cost: <why>"), or reduce the types'
const NOTE = '- Type cost: the element union grows with the new widget'
const NONE_NOTE = 'Type cost: the widget types are internal'
const FRAGMENT_WITH_NOTE = [
	'### Changed',
	'',
	'- The widget reads its children once',
	NOTE,
	'',
].join('\n')

/** One row of the printed table: its version, scenario, base, head, change, and the mark after it. */
type BenchRow = {
	version: string
	scenario: string
	base: string
	head: string
	change: string
	mark: string
}

/** The rows of every version's table in `output`: `[<version>] | Scenario | Base | Head | Change |` then its rows. */
function benchRowsOf(output: string): BenchRow[] {
	const rows: BenchRow[] = []
	let version = ''
	for (const line of output.split('\n')) {
		const header = /^\[([^\]]+)\]\s+\|/.exec(line)
		if (header) {
			version = header[1] ?? ''
			continue
		}
		const cells = /^\s+\|([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)\|(.*)$/.exec(line)
		if (cells && version)
			rows.push({
				version,
				scenario: (cells[1] ?? '').trim(),
				base: (cells[2] ?? '').trim(),
				head: (cells[3] ?? '').trim(),
				change: (cells[4] ?? '').trim(),
				mark: (cells[5] ?? '').trim(),
			})
	}
	return rows
}

/** The exit code, the whole-program row of the first version, and the lines holding `among`. */
function verdictOf(params: { result: CommandResult; among?: string }): Record<string, unknown> {
	const { result } = params
	const among = params.among
	return {
		exitCode: result.exitCode,
		wholeProgram: benchRowsOf(result.output).find(
			(row) => row.version === VERSION && row.scenario === WHOLE_PROGRAM,
		),
		...(among !== undefined && {
			lines: result.output.split('\n').filter((line) => line.includes(among)),
		}),
	}
}

function runIn(params: {
	repository: BenchRepository
	argv?: string[]
	environment?: Record<string, string>
	install?: Parameters<typeof runBench>[0]['install']
}): Promise<CommandResult> {
	return runBench({
		cwd: params.repository.root,
		argv: params.argv ?? [],
		environment: { ...params.repository.environment, ...params.environment },
		...(params.install && { install: params.install }),
	})
}

function shortOf(params: { root: string; commit: string }): string {
	return git({ root: params.root, args: ['rev-parse', '--short', params.commit] }).trim()
}

afterEach(() => {
	vi.unstubAllEnvs()
})

describe(
	'dialecte bench: the head against the base of the change',
	{ timeout: SCRATCH_GIT_CASE_TIMEOUT },
	() => {
		it("the head grows 3%, a change base set in the process but not in the injected environment → the order's base: exit 0, the table shows base, head and +3.0%", async () => {
			const repository = createBenchRepository({ baseCount: 100, headCount: 103 })
			vi.stubEnv('DIALECTE_CHANGE_BASE', 'no-such-commit')

			await expect(
				runIn({ repository }).then(function verdict(result) {
					return verdictOf({ result })
				}),
			).resolves.toEqual({
				exitCode: 0,
				wholeProgram: expect.objectContaining({ base: '100', head: '103', change: '+3.0%' }),
			})
		})

		it('the head grows 8%, --check, no note → exit 1, the over rows and the explain line', async () => {
			const repository = createBenchRepository({ baseCount: 100, headCount: 108 })

			await expect(
				runIn({ repository, argv: ['--check'] }).then(function verdict(result) {
					return {
						...verdictOf({ result }),
						explained: result.output.includes(EXPLAIN_LINE),
					}
				}),
			).resolves.toEqual({
				exitCode: 1,
				wholeProgram: expect.objectContaining({
					base: '100',
					head: '108',
					change: '+8.0%',
					mark: 'over',
				}),
				explained: true,
			})
		})

		const noteCases: Record<
			string,
			{ params: Parameters<typeof createBenchRepository>[0]; exitCode: number; explained: boolean }
		> = {
			'the head grows 8%, the lot adds "- Type cost: …" to changes/x.md → exit 0, the explained line':
				{
					params: {
						baseCount: 100,
						headCount: 108,
						baseFiles: { 'changes/.gitkeep': '' },
						workingFiles: { 'changes/x.md': FRAGMENT_WITH_NOTE },
					},
					exitCode: 0,
					explained: true,
				},
			'the head grows 8%, the same bullet already at the base → exit 1: only added lines count': {
				params: {
					baseCount: 100,
					headCount: 108,
					baseFiles: { 'changes/x.md': FRAGMENT_WITH_NOTE },
					workingFiles: {
						'changes/y.md': ['### Changed', '', '- The widget reads its items once', ''].join('\n'),
					},
				},
				exitCode: 1,
				explained: false,
			},
			'the head grows 8%, an added changes/x.none.md says "Type cost: …" → exit 0': {
				params: {
					baseCount: 100,
					headCount: 108,
					baseFiles: { 'changes/.gitkeep': '' },
					workingFiles: { 'changes/x.none.md': `${NONE_NOTE}\n` },
				},
				exitCode: 0,
				explained: true,
			},
		}
		for (const [title, noteCase] of Object.entries(noteCases))
			it(title, async () => {
				const repository = createBenchRepository(noteCase.params)

				await expect(
					runIn({ repository, argv: ['--check'] }).then(function verdict(result) {
						return {
							exitCode: result.exitCode,
							explained: result.output
								.split('\n')
								.some((line) => line.includes('explained:') && line.includes('Type cost:')),
						}
					}),
				).resolves.toEqual({ exitCode: noteCase.exitCode, explained: noteCase.explained })
			})

		it('the head shrinks 10% → exit 0, the row is a gain', async () => {
			const repository = createBenchRepository({ baseCount: 100, headCount: 90 })

			await expect(
				runIn({ repository, argv: ['--check'] }).then(function verdict(result) {
					return verdictOf({ result })
				}),
			).resolves.toEqual({
				exitCode: 0,
				wholeProgram: expect.objectContaining({ base: '100', head: '90', change: '-10.0%' }),
			})
		})

		it('the base is HEAD, the tree clean → every row equal on both sides', async () => {
			const repository = createBenchRepository({ baseCount: 100 })

			await expect(
				runIn({ repository, argv: ['--check'] }).then(function parity(result) {
					const rows = benchRowsOf(result.output)
					return {
						exitCode: result.exitCode,
						measured: rows.length > 1,
						unequal: rows.filter(
							(row) => row.base !== row.head || row.mark === 'new' || row.mark === 'gone',
						),
					}
				}),
			).resolves.toEqual({ exitCode: 0, measured: true, unequal: [] })
		})

		it('without --check, the head grows 8% → exit 0', async () => {
			const repository = createBenchRepository({ baseCount: 100, headCount: 108 })

			await expect(
				runIn({ repository }).then(function verdict(result) {
					return verdictOf({ result })
				}),
			).resolves.toEqual({
				exitCode: 0,
				wholeProgram: expect.objectContaining({ base: '100', head: '108' }),
			})
		})

		it('no baseline.json is written; the package is clean but for its ignored probes; no base tree is left', async () => {
			const repository = createBenchRepository({ baseCount: 100, headCount: 103 })
			const { root, scratch } = repository

			await expect(
				runIn({ repository }).then(function leftBehind(result) {
					return {
						exitCode: result.exitCode,
						status: git({ root, args: ['status', '--porcelain'] }),
						baseline: existsSync(join(root, 'benchmarks/types', VERSION, 'baseline.json')),
						temporary: readdirSync(root).filter((name) => name.startsWith('.bench-')),
						scratch: readdirSync(scratch),
					}
				}),
			).resolves.toEqual({ exitCode: 0, status: '', baseline: false, temporary: [], scratch: [] })
		})

		const rulerCases: Record<
			string,
			{ baseLock: string; headLock?: string; installs: string[][] }
		> = {
			"the head's install matches the base's lock → each tree measured once per scenario on one checker, the base with the head's compiler":
				{ baseLock: '1.0.0', installs: [] },
			"the base's lock differs and its install puts another compiler in the base tree → still the head's compiler, once per scenario, one checker":
				{ baseLock: '2.0.0', headLock: '1.0.0', installs: [INSTALL_ARGS] },
		}
		for (const [title, rulerCase] of Object.entries(rulerCases))
			it(title, async () => {
				const repository = createBenchRepository({
					baseCount: 100,
					headCount: 103,
					baseLock: rulerCase.baseLock,
					...(rulerCase.headLock !== undefined && { headLock: rulerCase.headLock }),
				})
				const installer = createBaseInstaller({ log: repository.log, installs: rulerCase.baseLock })
				const headFolder = realpathSync(repository.root)

				/** Whether a run was in the head's folder: a base tree is gone after the run, so it has no real path left. */
				function ranAtHead(run: CompilerRun): boolean {
					return existsSync(run.folder) && realpathSync(run.folder) === headFolder
				}

				/** The runs of each tree: where, with what, how often. */
				function rulerOf(runs: CompilerRun[]): Record<string, unknown> {
					const headRuns = runs.filter(ranAtHead)
					const baseRuns = runs.filter((run) => !ranAtHead(run))
					const headProgram = headRuns[0]?.program
					return {
						headMeasured: headRuns.length > 1,
						baseMeasured: baseRuns.length === headRuns.length,
						baseFolders: [...new Set(baseRuns.map((run) => /bench-base/.test(run.folder)))],
						otherCompiler: runs.filter((run) => run.compiler === 'other'),
						basePrograms: [...new Set(baseRuns.map((run) => run.program === headProgram))],
						oneCheckerMissing: runs.filter((run) => !run.args.includes('--checkers 1')),
						repeatedAtHead: headRuns.length - new Set(headRuns.map((run) => run.args)).size,
						repeatedAtBase: baseRuns.length - new Set(baseRuns.map((run) => run.args)).size,
						installs: installer.calls.map((call) => call.args),
					}
				}

				await expect(
					runIn({ repository, install: installer.install }).then(function ruler() {
						return rulerOf(compilerRunsOf(repository.log))
					}),
				).resolves.toEqual({
					headMeasured: true,
					baseMeasured: true,
					baseFolders: [true],
					otherCompiler: [],
					basePrograms: [true],
					oneCheckerMissing: [],
					repeatedAtHead: 0,
					repeatedAtBase: 0,
					installs: rulerCase.installs,
				})
			})

		it('the lot adds a version → its rows are new, exit 0 with --check', async () => {
			const repository = createBenchRepository({
				baseCount: 100,
				headCount: 100,
				headFiles: definitionFilesOf('v2'),
			})

			await expect(
				runIn({ repository, argv: ['--check'] }).then(function addedVersion(result) {
					const rows = benchRowsOf(result.output).filter((row) => row.version === 'v2')
					return {
						exitCode: result.exitCode,
						measured: rows.length > 0,
						marks: [...new Set(rows.map((row) => row.mark))],
					}
				}),
			).resolves.toEqual({ exitCode: 0, measured: true, marks: ['new'] })
		})
	},
)

describe(
	'dialecte bench: the base it is handed, and the bases it refuses',
	{ timeout: SCRATCH_GIT_CASE_TIMEOUT },
	() => {
		it('DIALECTE_CHANGE_BASE names a commit → the base is that commit, the line says it was handed', async () => {
			const repository = createBenchRepository({ baseCount: 100, headCount: 105 })
			const { root, head } = repository

			await expect(
				runIn({ repository, environment: { DIALECTE_CHANGE_BASE: head } }).then(
					function handed(result) {
						return verdictOf({ result, among: 'bench: base' })
					},
				),
			).resolves.toEqual({
				exitCode: 0,
				wholeProgram: expect.objectContaining({ base: '105', head: '105' }),
				lines: [`bench: base ${shortOf({ root, commit: head })} (handed)`],
			})
		})

		it('--base main, main moved on after the fork → the base is the merge-base, the line names the flag', async () => {
			const repository = createBenchRepository({ baseCount: 100, headCount: 105 })
			const { root, base } = repository
			git({ root, args: ['checkout', '-q', 'main'] })
			commitFiles({ root, files: { 'bench-count.txt': '120\n' }, message: 'feat: main moves on' })
			git({ root, args: ['checkout', '-q', HEAD_BRANCH] })

			await expect(
				runIn({ repository, argv: ['--base', 'main'] }).then(function flagged(result) {
					return verdictOf({ result, among: 'bench: base' })
				}),
			).resolves.toEqual({
				exitCode: 0,
				wholeProgram: expect.objectContaining({ base: '100', head: '105' }),
				lines: [`bench: base ${shortOf({ root, commit: base })} (--base main)`],
			})
		})

		it("DIALECTE_CHANGE_BASE=HEAD^1, the value CI hands → the bench reads it as HEAD's first parent", async () => {
			const repository = createBenchRepository({ baseCount: 100, headCount: 102 })
			const { root } = repository
			const firstParent = repository.head
			commitFiles({
				root,
				files: { 'bench-count.txt': '105\n' },
				message: 'feat: more of the change',
			})

			await expect(
				runIn({ repository, environment: { DIALECTE_CHANGE_BASE: 'HEAD^1' } }).then(
					function handed(result) {
						return verdictOf({ result, among: 'bench: base' })
					},
				),
			).resolves.toEqual({
				exitCode: 0,
				wholeProgram: expect.objectContaining({ base: '102', head: '105' }),
				lines: [`bench: base ${shortOf({ root, commit: firstParent })} (handed)`],
			})
		})

		it('a handed base that is the empty tree → exit 2, the base is no commit, nothing measured', async () => {
			const repository = createBenchRepository({ baseCount: 100, headCount: 105 })
			const emptyTree = git({
				root: repository.root,
				args: ['hash-object', '-t', 'tree', '/dev/null'],
			}).trim()

			await expect(
				runIn({
					repository,
					argv: ['--check'],
					environment: { DIALECTE_CHANGE_BASE: emptyTree },
				}).then(function refused(result) {
					return {
						exitCode: result.exitCode,
						named: result.output.includes(`bench: the base ${emptyTree} is no commit`),
						measured: compilerRunsOf(repository.log),
					}
				}),
			).resolves.toEqual({ exitCode: 2, named: true, measured: [] })
		})

		it('method discovery fails at the head, --check → exit 2', async () => {
			const repository = createBenchRepository({
				baseCount: 100,
				headCount: 101,
				discoveryFailsAtHead: true,
			})

			const headFolder = realpathSync(repository.root)

			await expect(
				runIn({ repository, argv: ['--check'] }).then(function refused(result) {
					return {
						exitCode: result.exitCode,
						measuredAtBase: compilerRunsOf(repository.log).filter(
							(run) => realpathSync(run.folder) !== headFolder,
						),
					}
				}),
			).resolves.toEqual({ exitCode: 2, measuredAtBase: [] })
		})

		it("method discovery fails in the base tree only → coverage: api is new, with the base's line; exit 0", async () => {
			const repository = createBenchRepository({
				baseCount: 100,
				headCount: 100,
				baseLock: '2.0.0',
				headLock: '1.0.0',
			})
			const installer = createBaseInstaller({
				log: repository.log,
				installs: '2.0.0',
				discoveryFails: true,
			})

			await expect(
				runIn({ repository, argv: ['--check'], install: installer.install }).then(
					function apiRow(result) {
						return {
							exitCode: result.exitCode,
							api: benchRowsOf(result.output).find((row) => row.scenario === 'coverage: api')?.mark,
							baseLine: result.output
								.split('\n')
								.some((line) => line.startsWith('bench:') && line.includes('discover')),
						}
					},
				),
			).resolves.toEqual({ exitCode: 0, api: 'new', baseLine: true })
		})

		it('the measure of the base tree fails (its generated constants do not load) → the base tree is removed all the same, no worktree registered', async () => {
			const repository = createBenchRepository({
				baseCount: 100,
				headCount: 101,
				baseFiles: { [`src/${VERSION}/definition/constants.generated.ts`]: BROKEN_CONSTANTS_TEXT },
				headFiles: definitionFilesOf(VERSION),
			})
			const { root, scratch } = repository
			const worktrees = git({ root, args: ['worktree', 'list'] })

			/** What is left after the run, whether it refused or threw (a stub's throw is no outcome). */
			function leftBehind(outcome: string): Record<string, unknown> {
				return {
					outcome,
					scratch: readdirSync(scratch),
					worktrees: git({ root, args: ['worktree', 'list'] }),
				}
			}

			await expect(
				runIn({ repository, argv: ['--check'] }).then(
					function refused(result) {
						return leftBehind(`exit ${result.exitCode}`)
					},
					function threw(error: unknown) {
						return leftBehind(`threw ${String(error)}`)
					},
				),
			).resolves.toEqual({
				outcome: expect.stringMatching(/^(exit 2|threw (?!Error: not implemented))/),
				scratch: [],
				worktrees,
			})
		})

		it('a stacked lot whose parent cannot be read → exit 2 with the no-base line naming why', async () => {
			const repository = createBenchLotWorktree({
				baseCount: 100,
				headCount: 105,
				case: 'unreadable-parent',
			})

			await expect(
				runIn({ repository, argv: ['--check'] }).then(function refused(result) {
					return {
						exitCode: result.exitCode,
						noBase: result.output.split('\n').filter((line) => line.startsWith('bench: no base (')),
					}
				}),
			).resolves.toEqual({ exitCode: 2, noBase: [expect.stringContaining('cannot be read')] })
		})

		const noBaseCases: Record<
			string,
			{ environment: Record<string, string>; exitCode: number; line: string }
		> = {
			'CI set, no base found, --check → exit 2: CI always judges a change': {
				environment: { CI: 'true' },
				exitCode: 2,
				line: 'bench: no base in CI: pass the base',
			},
			'CI=false, no base found, --check → exit 0, nothing compared: false is no CI': {
				environment: { CI: 'false' },
				exitCode: 0,
				line: 'bench: no base: nothing compared',
			},
			'no CI, no base found, --check → exit 0, nothing compared': {
				environment: {},
				exitCode: 0,
				line: 'bench: no base: nothing compared',
			},
		}
		for (const [title, noBaseCase] of Object.entries(noBaseCases))
			it(title, async () => {
				const repository = createBenchRepository({ baseCount: 100 })
				git({ root: repository.root, args: ['branch', '-m', 'main', 'trunk'] })
				// only the injected environment counts: the process's own CI never reaches the bench
				vi.stubEnv('CI', 'true')

				await expect(
					runIn({ repository, argv: ['--check'], environment: noBaseCase.environment }).then(
						function noBase(result) {
							return { exitCode: result.exitCode, said: result.output.includes(noBaseCase.line) }
						},
					),
				).resolves.toEqual({ exitCode: noBaseCase.exitCode, said: true })
			})

		it('inside a store lot whose order finds nothing → exit 2, the lot has no base', async () => {
			const repository = createBenchLotWorktree({ baseCount: 100, headCount: 105, case: 'no-base' })

			await expect(
				runIn({ repository, argv: ['--check'] }).then(function refused(result) {
					return {
						exitCode: result.exitCode,
						said: result.output.includes('bench: the lot has no base'),
					}
				}),
			).resolves.toEqual({ exitCode: 2, said: true })
		})

		it("the head's node_modules does not install the head's lock → exit 2 with its line, nothing measured", async () => {
			const repository = createBenchRepository({
				baseCount: 100,
				headCount: 105,
				baseLock: '1.0.0',
				installed: '3.0.0',
			})

			await expect(
				runIn({ repository, argv: ['--check'] }).then(function refused(result) {
					return {
						exitCode: result.exitCode,
						named: result.output.includes('npm ci'),
						measured: compilerRunsOf(repository.log),
					}
				}),
			).resolves.toEqual({ exitCode: 2, named: true, measured: [] })
		})

		it('a head with no targets → exit 2', async () => {
			const repository = createBenchRepository({
				baseCount: 100,
				headCount: 105,
				withoutTargets: true,
			})

			await expect(
				runIn({ repository, argv: ['--check'] }).then(function refused(result) {
					return { exitCode: result.exitCode, measured: compilerRunsOf(repository.log) }
				}),
			).resolves.toEqual({ exitCode: 2, measured: [] })
		})

		const uncommittedCases: Record<string, { argv: string[] }> = {
			'a package with no commit, no base branch, no tag → no base: nothing compared, exit 0': {
				argv: [],
			},
			'a package with no commit, no base branch, no tag, --check → no base: nothing compared, exit 0':
				{
					argv: ['--check'],
				},
		}
		for (const [title, uncommittedCase] of Object.entries(uncommittedCases))
			it(title, async () => {
				const repository = createUncommittedBenchPackage({ count: 100 })
				const headFolder = realpathSync(repository.root)

				await expect(
					runIn({ repository, argv: uncommittedCase.argv }).then(function headAlone(result) {
						const runs = compilerRunsOf(repository.log)
						return {
							exitCode: result.exitCode,
							said: result.output.includes('bench: no base: nothing compared'),
							installNotChecked: result.output.includes(
								'bench: no commit: the install is not checked',
							),
							headMeasured: runs.length > 0,
							elsewhere: runs.filter((run) => realpathSync(run.folder) !== headFolder),
							headPrinted: result.output
								.split('\n')
								.some((line) => line.includes(WHOLE_PROGRAM) && line.includes('100')),
						}
					}),
				).resolves.toEqual({
					exitCode: 0,
					said: true,
					installNotChecked: true,
					headMeasured: true,
					elsewhere: [],
					headPrinted: true,
				})
			})
	},
)
