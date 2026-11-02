import { realpathSync } from 'node:fs'
import { isAbsolute } from 'node:path'

import {
	EDITED_SCOPE_SOURCE,
	NEW_FILE,
	NEW_SOURCE,
	PACKAGE_NAME,
	RECORDS_FILE,
	SCOPE_FILE,
	SCOPE_SOURCE,
} from '../../test/mutation-package.constants.ts'
import {
	fakeStryker,
	mutationPackage,
	reportOf,
	storedLedger,
	storedRuns,
	survivorLine,
} from '../../test/mutation-package.ts'
import { SCRATCH_REPOSITORY_TIMEOUT } from '../../test/scratch-checks.constants.ts'
import { git, writeFiles } from '../../test/scratch-repository.ts'
import { treeOfWorkingFiles } from '../../test/scratch-tree.ts'
import { judgeReport } from '../lib/mutation/judge.ts'
import { readRuns } from '../lib/mutation/run-store.ts'
import { runMutants } from './mutants.ts'

import { describe, expect, it } from 'vitest'

import type { StrykerCall } from '../../test/mutation-package.types.ts'
import type { CommandResult } from '../lib/command-result.types.ts'
import type { MutationReport } from '../lib/mutation/mutation.types.ts'

const SHORT_TREE_LENGTH = 12
const ONE_RANGE = `${SCOPE_FILE}:2:8-2:15`

const SURVIVING = reportOf({ mutants: [{ id: '1', status: 'Survived', replacement: 'false' }] })
const ALL_KILLED = reportOf({ mutants: [{ id: '1', status: 'Killed', replacement: 'false' }] })

/** The package with an uncommitted edit of its scope file: what a lot in progress looks like. */
function editedPackage(params: { full?: boolean } = {}): string {
	const root = mutationPackage(params)
	writeFiles({ root, files: { [SCOPE_FILE]: EDITED_SCOPE_SOURCE } })
	return root
}

describe(
	'mutants run: what it refuses and what it mutates',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		it('a package with no dialecte.mutation declaration → exit 1 naming dialecte.mutation, no run started, no Stryker call', async () => {
			const root = mutationPackage()
			writeFiles({ root, files: { 'package.json': `${JSON.stringify({ name: PACKAGE_NAME })}\n` } })
			const calls: StrykerCall[] = []

			await expect(
				runMutants({
					cwd: root,
					argv: ['run'],
					dependencies: { runStryker: fakeStryker({ root, reports: {}, calls }) },
				}),
			).resolves.toMatchObject({
				exitCode: 1,
				output: expect.stringContaining('dialecte.mutation'),
			})
			expect(calls).toEqual([])
			expect(storedRuns(root)).toEqual([])
		})

		it('an invalid declaration → exit 1 with the reason, no run started', async () => {
			const root = mutationPackage()
			writeFiles({
				root,
				files: {
					'package.json': `${JSON.stringify({ name: PACKAGE_NAME, dialecte: { mutation: { scope: [], fast: { vitestConfig: 'v.config.ts' } } } })}\n`,
				},
			})
			const calls: StrykerCall[] = []

			await expect(
				runMutants({
					cwd: root,
					argv: ['run'],
					dependencies: { runStryker: fakeStryker({ root, reports: {}, calls }) },
				}),
			).resolves.toMatchObject({
				exitCode: 1,
				output: expect.stringContaining('dialecte.mutation.scope'),
			})
			expect(calls).toEqual([])
			expect(storedRuns(root)).toEqual([])
		})

		it('a mode that is not changed or audit → exit 2, no run started', async () => {
			const root = editedPackage()
			const calls: StrykerCall[] = []

			await expect(
				runMutants({
					cwd: root,
					argv: ['run', '--mode', 'wild'],
					dependencies: { runStryker: fakeStryker({ root, reports: {}, calls }) },
				}),
			).resolves.toMatchObject({ exitCode: 2 })
			expect(storedRuns(root)).toEqual([])
		})

		it('changed → the fast tier mutates the changed lines of the scope file and the untracked scope file whole, nothing outside the scope', async () => {
			const root = editedPackage()
			writeFiles({
				root,
				files: { [NEW_FILE]: NEW_SOURCE, 'src/other.ts': 'export const other = 1\n' },
			})
			const calls: StrykerCall[] = []

			await expect(
				runMutants({
					cwd: root,
					argv: ['run'],
					dependencies: { runStryker: fakeStryker({ root, reports: { fast: ALL_KILLED }, calls }) },
				}),
			).resolves.toMatchObject({ exitCode: 0 })
			expect([...calls[0].options.mutate].sort()).toEqual([`${SCOPE_FILE}:2-2`, NEW_FILE])
		})

		it('changed on a branch, no --base → the lines changed since the merge base with main', async () => {
			const root = mutationPackage()
			git({ root, args: ['checkout', '-q', '-b', 'feat/x'] })
			git({ root, args: ['checkout', '-q', 'main'] })
			writeFiles({
				root,
				files: { [SCOPE_FILE]: SCOPE_SOURCE.replace('pick', 'pickMain') },
			})
			git({ root, args: ['add', '-A'] })
			git({ root, args: ['commit', '-q', '-m', 'feat: main moves on the scope'] })
			git({ root, args: ['checkout', '-q', 'feat/x'] })
			writeFiles({ root, files: { [SCOPE_FILE]: EDITED_SCOPE_SOURCE } })
			git({ root, args: ['add', '-A'] })
			git({ root, args: ['commit', '-q', '-m', 'feat: edit'] })
			const mergeBase = git({ root, args: ['merge-base', 'HEAD', 'main'] }).trim()
			const calls: StrykerCall[] = []

			await expect(
				runMutants({
					cwd: root,
					argv: ['run'],
					dependencies: { runStryker: fakeStryker({ root, reports: { fast: ALL_KILLED }, calls }) },
				}),
			).resolves.toMatchObject({ exitCode: 0 })
			expect(calls[0].options.mutate).toEqual([`${SCOPE_FILE}:2-2`])
			expect(storedRuns(root)).toEqual([expect.objectContaining({ base: mergeBase })])
		})

		it('--base <ref> → the lines changed since that ref; the same state with no --base has nothing to mutate', async () => {
			const root = mutationPackage()
			const first = git({ root, args: ['rev-parse', 'HEAD'] }).trim()
			writeFiles({ root, files: { [SCOPE_FILE]: EDITED_SCOPE_SOURCE } })
			git({ root, args: ['add', '-A'] })
			git({ root, args: ['commit', '-q', '-m', 'feat: edit'] })
			const calls: StrykerCall[] = []
			const dependencies = {
				runStryker: fakeStryker({ root, reports: { fast: ALL_KILLED }, calls }),
			}

			await expect(runMutants({ cwd: root, argv: ['run'], dependencies })).resolves.toMatchObject({
				exitCode: 0,
				output: expect.stringContaining('nothing to mutate'),
			})
			expect(calls).toEqual([])

			await expect(
				runMutants({ cwd: root, argv: ['run', '--base', first], dependencies }),
			).resolves.toMatchObject({ exitCode: 0 })
			expect(calls[0].options.mutate).toEqual([`${SCOPE_FILE}:2-2`])
			expect(storedRuns(root)).toEqual([expect.objectContaining({ mode: 'changed', base: first })])
		})

		it('audit → the whole scope, no line ranges, even when nothing changed', async () => {
			const root = mutationPackage()
			const calls: StrykerCall[] = []

			await expect(
				runMutants({
					cwd: root,
					argv: ['run', '--mode', 'audit'],
					dependencies: {
						runStryker: fakeStryker({
							root,
							reports: {
								fast: reportOf({
									mutants: [{ id: '1', status: 'Killed', replacement: 'false' }],
									source: SCOPE_SOURCE,
								}),
							},
							calls,
						}),
					},
				}),
			).resolves.toMatchObject({ exitCode: 0 })
			const { mutate } = calls[0].options
			expect(mutate.some((target) => target === SCOPE_FILE || target === 'src/engine/*.ts')).toBe(
				true,
			)
			expect(mutate.filter((target) => /:\d+(-|$)/.test(target))).toEqual([])
		})

		it('an empty target → "nothing to mutate", exit 0, no run started, no Stryker call', async () => {
			const root = mutationPackage()
			writeFiles({ root, files: { 'src/other.ts': 'export const other = 1\n' } })
			const calls: StrykerCall[] = []

			await expect(
				runMutants({
					cwd: root,
					argv: ['run'],
					dependencies: { runStryker: fakeStryker({ root, reports: {}, calls }) },
				}),
			).resolves.toMatchObject({
				exitCode: 0,
				output: expect.stringContaining('nothing to mutate'),
			})
			expect(calls).toEqual([])
			expect(storedRuns(root)).toEqual([])
		})
	},
)

describe('mutants run: the order of a run', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	const TIMED_OUT = reportOf({
		mutants: [
			{ id: '1', status: 'Timeout', replacement: 'true' },
			{ id: '2', status: 'Survived', replacement: 'false' },
		],
	})
	const TIMEOUT_ALONE = reportOf({ mutants: [{ id: '1', status: 'Killed', replacement: 'true' }] })
	const FULL_SURVIVES = reportOf({
		mutants: [{ id: '2', status: 'Survived', replacement: 'false' }],
	})

	it('the run is written before Stryker is called: the first call finds a running entry', async () => {
		const root = editedPackage()
		const calls: StrykerCall[] = []

		await expect(
			runMutants({
				cwd: root,
				argv: ['run'],
				dependencies: { runStryker: fakeStryker({ root, reports: { fast: ALL_KILLED }, calls }) },
			}),
		).resolves.toMatchObject({ exitCode: 0 })
		expect(calls[0].runStatesAtCall).toEqual(['running'])
	})

	it('a timed-out mutant → run again alone in the timeouts tier, then the unlisted survivor in the full tier when declared; the run ends reported', async () => {
		const root = editedPackage({ full: true })
		const calls: StrykerCall[] = []

		await expect(
			runMutants({
				cwd: root,
				argv: ['run'],
				dependencies: {
					runStryker: fakeStryker({
						root,
						reports: { fast: TIMED_OUT, timeouts: TIMEOUT_ALONE, full: FULL_SURVIVES },
						calls,
					}),
				},
			}),
		).resolves.toMatchObject({ exitCode: 0 })
		expect(calls.map(({ tier }) => tier)).toEqual(['fast', 'timeouts', 'full'])
		expect(calls[1].options.mutate).toEqual([ONE_RANGE])
		expect(calls[2].options.mutate).toEqual([ONE_RANGE])
		expect(calls.map(({ runStatesAtCall }) => runStatesAtCall)).toEqual([
			['running'],
			['running'],
			['running'],
		])
		expect(storedRuns(root)).toEqual([
			expect.objectContaining({
				state: 'reported',
				counts: { killed: 1, survived: 1, timedOut: 0, noCoverage: 0 },
				survivors: [expect.objectContaining({ line: 2 })],
			}),
		])
	})

	it('no timed-out mutant → no timeouts tier', async () => {
		const root = editedPackage()
		const calls: StrykerCall[] = []

		await expect(
			runMutants({
				cwd: root,
				argv: ['run'],
				dependencies: { runStryker: fakeStryker({ root, reports: { fast: SURVIVING }, calls }) },
			}),
		).resolves.toMatchObject({ exitCode: 0 })
		expect(calls.map(({ tier }) => tier)).toEqual(['fast'])
	})

	it('a survivor and no full tier declared → no full tier', async () => {
		const root = editedPackage()
		const calls: StrykerCall[] = []

		await expect(
			runMutants({
				cwd: root,
				argv: ['run'],
				dependencies: { runStryker: fakeStryker({ root, reports: { fast: SURVIVING }, calls }) },
			}),
		).resolves.toMatchObject({ exitCode: 0 })
		expect(calls.map(({ tier }) => tier)).toEqual(['fast'])
	})

	it('a survivor the records list with a reason and a family → no full tier, and nothing new in the ledger', async () => {
		const root = editedPackage({ full: true })
		const [survivor] = judgeReport({ report: SURVIVING, records: {} }).survivors
		writeFiles({
			root,
			files: {
				[RECORDS_FILE]: JSON.stringify({
					[SCOPE_FILE]: {
						[survivor.key]: {
							line: 2,
							mutation: survivor.mutation,
							family: 'invariant-guard',
							reason: 'always true here',
							removable: false,
							lineHash: survivor.lineHash,
						},
					},
				}),
			},
		})
		const calls: StrykerCall[] = []

		await expect(
			runMutants({
				cwd: root,
				argv: ['run'],
				dependencies: { runStryker: fakeStryker({ root, reports: { fast: SURVIVING }, calls }) },
			}),
		).resolves.toMatchObject({
			exitCode: 0,
			output: expect.not.stringContaining(survivorLine({ replacement: 'false' })),
		})
		expect(calls.map(({ tier }) => tier)).toEqual(['fast'])
		expect(Object.values(storedLedger(root)).filter(({ state }) => state === 'new')).toEqual([])
	})

	it('the ignorer plugin the options name is the built JS, never the .ts source', async () => {
		const root = editedPackage()
		const calls: StrykerCall[] = []

		await expect(
			runMutants({
				cwd: root,
				argv: ['run'],
				dependencies: { runStryker: fakeStryker({ root, reports: { fast: ALL_KILLED }, calls }) },
			}),
		).resolves.toMatchObject({ exitCode: 0 })
		const ignorers = calls[0].options.plugins.filter((plugin) =>
			/ignorers\.[cm]?[jt]s$/.test(plugin),
		)
		expect(ignorers).toEqual([expect.stringMatching(/ignorers\.js$/)])
	})
})

describe('mutants run: the result', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('survivors never fail the command: exit 0; the output names the package, lot, tree (12), mode, counts and each new survivor', async () => {
		const root = editedPackage()
		const tree = treeOfWorkingFiles(root)
		const calls: StrykerCall[] = []
		const report: MutationReport = reportOf({
			mutants: [
				{ id: '1', status: 'Killed', replacement: 'true' },
				{ id: '2', status: 'Survived', replacement: 'false' },
			],
		})

		await expect(
			runMutants({
				cwd: root,
				argv: ['run'],
				dependencies: { runStryker: fakeStryker({ root, reports: { fast: report }, calls }) },
			}),
		).resolves.toSatisfy(function endsNamingTheRun(result: CommandResult) {
			const [entry] = storedRuns(root)
			const output = result.output
			expect(result.exitCode).toBe(0)
			expect(entry.lot).not.toBe('')
			expect(output).toContain(PACKAGE_NAME)
			expect(output).toContain(entry.lot)
			expect(output).toContain(tree.slice(0, SHORT_TREE_LENGTH))
			expect(output).toContain('changed')
			expect(output).toContain(survivorLine({ replacement: 'false' }))
			expect(output).toContain('killed 1 · survived 1 · timed out 0 · no coverage 0')
			return true
		})
	})

	it('the run entry holds the tree of the working files, the mode and the package; the survivor is new in the ledger with this run as first seen', async () => {
		const root = editedPackage()
		const tree = treeOfWorkingFiles(root)
		const mergeBase = git({ root, args: ['merge-base', 'HEAD', 'main'] }).trim()
		const calls: StrykerCall[] = []

		await expect(
			runMutants({
				cwd: root,
				argv: ['run'],
				dependencies: { runStryker: fakeStryker({ root, reports: { fast: SURVIVING }, calls }) },
			}),
		).resolves.toMatchObject({ exitCode: 0 })
		const [entry] = storedRuns(root)
		expect(entry).toMatchObject({
			state: 'reported',
			tree,
			mode: 'changed',
			base: mergeBase,
			package: PACKAGE_NAME,
			pid: process.pid,
		})
		expect(Object.values(storedLedger(root))).toEqual([
			expect.objectContaining({
				state: 'new',
				file: SCOPE_FILE,
				line: 2,
				firstSeen: { runId: entry.runId, tree: entry.tree, lot: entry.lot },
			}),
		])
	})

	it('audit → the run entry says audit', async () => {
		const root = mutationPackage()
		const calls: StrykerCall[] = []

		await expect(
			runMutants({
				cwd: root,
				argv: ['run', '--mode', 'audit'],
				dependencies: {
					runStryker: fakeStryker({
						root,
						reports: {
							fast: reportOf({
								mutants: [{ id: '1', status: 'Killed', replacement: 'false' }],
								source: SCOPE_SOURCE,
							}),
						},
						calls,
					}),
				},
			}),
		).resolves.toMatchObject({ exitCode: 0 })
		expect(storedRuns(root)).toEqual([expect.objectContaining({ mode: 'audit' })])
		expect(storedRuns(root)[0]).not.toHaveProperty('base')
	})

	it('a later audit that no longer reports the survivor → it is killed in the ledger', async () => {
		const root = editedPackage()
		const calls: StrykerCall[] = []

		await expect(
			runMutants({
				cwd: root,
				argv: ['run'],
				dependencies: { runStryker: fakeStryker({ root, reports: { fast: SURVIVING }, calls }) },
			}),
		).resolves.toMatchObject({ exitCode: 0 })
		await expect(
			runMutants({
				cwd: root,
				argv: ['run', '--mode', 'audit'],
				dependencies: { runStryker: fakeStryker({ root, reports: { fast: ALL_KILLED }, calls }) },
			}),
		).resolves.toMatchObject({ exitCode: 0 })

		expect(Object.values(storedLedger(root))).toEqual([
			expect.objectContaining({ state: 'killed' }),
		])
	})

	it('a Stryker that exits 1 → exit 1, the run stays running until its process ends, then reads as died; the ledger is untouched', async () => {
		const root = editedPackage()
		const calls: StrykerCall[] = []

		await expect(
			runMutants({
				cwd: root,
				argv: ['run'],
				dependencies: { runStryker: fakeStryker({ root, reports: {}, calls, exitCode: 1 }) },
			}),
		).resolves.toMatchObject({ exitCode: 1 })
		expect(storedRuns(root)).toEqual([expect.objectContaining({ state: 'running' })])
		expect(readRuns({ root })).toEqual([expect.objectContaining({ state: 'running' })])
		expect(readRuns({ root, isAlive: () => false })).toEqual([
			expect.objectContaining({ state: 'died' }),
		])
		expect(() => storedLedger(root)).toThrow()
	})

	it('a Stryker that throws → exit 1 with its message, the run stays running', async () => {
		const root = editedPackage()
		const calls: StrykerCall[] = []

		await expect(
			runMutants({
				cwd: root,
				argv: ['run'],
				dependencies: { runStryker: fakeStryker({ root, reports: {}, calls, throws: true }) },
			}),
		).resolves.toMatchObject({ exitCode: 1, output: expect.stringContaining('stryker crashed') })
		expect(storedRuns(root)).toEqual([expect.objectContaining({ state: 'running' })])
	})

	it('a later run that kills the survivor → it is killed in the ledger', async () => {
		const root = editedPackage()
		const calls: StrykerCall[] = []
		function dependencies(report: MutationReport) {
			return { runStryker: fakeStryker({ root, reports: { fast: report }, calls }) }
		}

		await expect(
			runMutants({ cwd: root, argv: ['run'], dependencies: dependencies(SURVIVING) }),
		).resolves.toMatchObject({ exitCode: 0 })
		await expect(
			runMutants({ cwd: root, argv: ['run'], dependencies: dependencies(ALL_KILLED) }),
		).resolves.toMatchObject({ exitCode: 0 })

		expect(Object.values(storedLedger(root))).toEqual([
			expect.objectContaining({ state: 'killed' }),
		])
	})
})

describe(
	'mutants run: the lot, and the mode the lot switch gives',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		const OFF_LINE = 'mutation off for this lot'

		function lotFile(mutation: string): Record<string, string> {
			return { '.dialecte/lot.json': `${JSON.stringify({ mutation })}\n` }
		}

		it('the lot and the branch of the entry are the current branch name; the worktree is the absolute path of the worktree root', async () => {
			const root = mutationPackage()
			git({ root, args: ['checkout', '-q', '-b', 'feat/lot-x'] })
			writeFiles({ root, files: { [SCOPE_FILE]: EDITED_SCOPE_SOURCE } })
			const calls: StrykerCall[] = []

			await expect(
				runMutants({
					cwd: root,
					argv: ['run'],
					dependencies: { runStryker: fakeStryker({ root, reports: { fast: ALL_KILLED }, calls }) },
				}),
			).resolves.toMatchObject({ exitCode: 0 })

			const [entry] = storedRuns(root)
			expect(entry).toMatchObject({ lot: 'feat/lot-x', branch: 'feat/lot-x' })
			expect(isAbsolute(entry.worktree)).toBe(true)
			expect(realpathSync(entry.worktree)).toBe(realpathSync(root))
		})

		it('switch off → "mutation off for this lot", exit 0, no run, no Stryker call', async () => {
			const root = editedPackage()
			writeFiles({ root, files: lotFile('off') })
			const calls: StrykerCall[] = []

			await expect(
				runMutants({
					cwd: root,
					argv: ['run'],
					dependencies: { runStryker: fakeStryker({ root, reports: {}, calls }) },
				}),
			).resolves.toMatchObject({ exitCode: 0, output: expect.stringContaining(OFF_LINE) })
			expect(calls).toEqual([])
			expect(storedRuns(root)).toEqual([])
		})

		it('switch audit → runs as audit: the whole scope, the entry says audit', async () => {
			const root = editedPackage()
			writeFiles({ root, files: lotFile('audit') })
			const calls: StrykerCall[] = []

			await expect(
				runMutants({
					cwd: root,
					argv: ['run'],
					dependencies: { runStryker: fakeStryker({ root, reports: { fast: ALL_KILLED }, calls }) },
				}),
			).resolves.toMatchObject({ exitCode: 0 })
			expect(storedRuns(root)).toEqual([expect.objectContaining({ mode: 'audit' })])
			expect(calls[0].options.mutate.filter((target) => /:\d+(-|$)/.test(target))).toEqual([])
		})

		for (const mutation of ['changed', 'gate'])
			it(`switch ${mutation} → runs as changed: the changed lines, the entry says changed`, async () => {
				const root = editedPackage()
				writeFiles({ root, files: lotFile(mutation) })
				const calls: StrykerCall[] = []

				await expect(
					runMutants({
						cwd: root,
						argv: ['run'],
						dependencies: {
							runStryker: fakeStryker({ root, reports: { fast: ALL_KILLED }, calls }),
						},
					}),
				).resolves.toMatchObject({ exitCode: 0 })
				expect(storedRuns(root)).toEqual([expect.objectContaining({ mode: 'changed' })])
				expect(calls[0].options.mutate).toEqual([`${SCOPE_FILE}:2-2`])
			})

		it('no switch and the diff touches the scope → runs as changed', async () => {
			const root = editedPackage()
			const calls: StrykerCall[] = []

			await expect(
				runMutants({
					cwd: root,
					argv: ['run'],
					dependencies: { runStryker: fakeStryker({ root, reports: { fast: ALL_KILLED }, calls }) },
				}),
			).resolves.toMatchObject({ exitCode: 0 })
			expect(storedRuns(root)).toEqual([expect.objectContaining({ mode: 'changed' })])
		})

		it('no switch and the diff touches no scope file → the off line, exit 0, no run', async () => {
			const root = mutationPackage()
			writeFiles({ root, files: { 'src/other.ts': 'export const other = 1\n' } })
			const calls: StrykerCall[] = []

			await expect(
				runMutants({
					cwd: root,
					argv: ['run'],
					dependencies: { runStryker: fakeStryker({ root, reports: {}, calls }) },
				}),
			).resolves.toMatchObject({ exitCode: 0, output: expect.stringContaining(OFF_LINE) })
			expect(calls).toEqual([])
			expect(storedRuns(root)).toEqual([])
		})

		it('an explicit --mode overrides the switch: audit over off, changed over audit', async () => {
			const root = editedPackage()
			writeFiles({ root, files: lotFile('off') })
			const calls: StrykerCall[] = []
			const dependencies = {
				runStryker: fakeStryker({ root, reports: { fast: ALL_KILLED }, calls }),
			}

			await expect(
				runMutants({ cwd: root, argv: ['run', '--mode', 'audit'], dependencies }),
			).resolves.toMatchObject({ exitCode: 0 })
			writeFiles({ root, files: lotFile('audit') })
			await expect(
				runMutants({ cwd: root, argv: ['run', '--mode', 'changed'], dependencies }),
			).resolves.toMatchObject({ exitCode: 0 })

			expect(
				storedRuns(root)
					.map(({ mode }) => mode)
					.sort(),
			).toEqual(['audit', 'changed'])
		})

		it('an invalid switch value → exit 2 naming the four modes, no run', async () => {
			const root = editedPackage()
			writeFiles({ root, files: lotFile('sometimes') })
			const calls: StrykerCall[] = []

			await expect(
				runMutants({
					cwd: root,
					argv: ['run'],
					dependencies: { runStryker: fakeStryker({ root, reports: {}, calls }) },
				}),
			).resolves.toMatchObject({
				exitCode: 2,
				output: expect.stringMatching(/off.*changed.*audit.*gate/s),
			})
			expect(calls).toEqual([])
			expect(storedRuns(root)).toEqual([])
		})
	},
)
