/** `handover run --rehearse`: a lot is rehearsed only when it can find something new; the card reads the store. */

import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'

import { ISO_TIME_PATTERN } from '../../test/gate-records.constants.ts'
import { noRepositoryCli } from '../../test/repository-cli-probe.ts'
import {
	BRANCH_NAME,
	READ_LOT,
	SCRATCH_REPOSITORY_TIMEOUT,
	SHORT_SHA_LENGTH,
	WRITER_CLI,
} from '../../test/scratch-checks.constants.ts'
import {
	countRuns,
	createBranchScenario,
	createCounter,
	createHookedPackage,
	createRehearsedScenario,
	createReusableScenario,
	editReadLot,
	gateStepLinesOf,
	headOf,
	lotLine,
	lotLinePattern,
	runFolder,
	seedFullGate,
	writeHandoverFolder,
	writeMergeHandover,
	writeReadLotHandover,
} from '../../test/scratch-checks.ts'
import { git, writeFiles } from '../../test/scratch-repository.ts'
import { addWorktree, commonGitDirOf, treeOfWorkingFiles } from '../../test/scratch-tree.ts'
import { readTreeRecords } from '../lib/gate-records/check-store.ts'
import { CHECK_STORE_FOLDER } from '../lib/gate-records/gate-records.constants.ts'
import { REHEARSAL_FOLDER_PREFIX } from '../lib/handover/handover.constants.ts'
import { runHandover } from './handover.ts'

import { describe, expect, it } from 'vitest'

import type { RehearsedVariant } from '../../test/scratch-checks.types.ts'

const SKIPPED_LINE = "rehearsal skipped: every lot's tree has a green record"

function short(sha: string): string {
	return sha.slice(0, SHORT_SHA_LENGTH)
}

function readRehearsalFile(out: string): { at: string; lots: Record<string, unknown>[] } {
	return JSON.parse(readFileSync(join(out, 'rehearsal.json'), 'utf8'))
}

describe(
	'handover run --rehearse: every lot reused',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		it('one plain lot with a green gate --full of its tree → its reuse line and the skipped line, no clone at any time, the hook not run, rehearsal.json written, exit 0', async () => {
			const { root, hookCounter, out } = await createReusableScenario()
			const tree = treeOfWorkingFiles(root)

			const result = await runFolder({ out, argv: ['--rehearse'] })

			expect(result.exitCode).toBe(0)
			expect(result.text).toContain(
				lotLine({
					index: 1,
					count: 1,
					decision: 'reused',
					reason: `green gate --full on tree ${short(tree)}`,
				}),
			)
			expect(result.text).toContain(SKIPPED_LINE)
			expect(result.rehearsalFolders).toEqual([])
			expect(countRuns(hookCounter)).toBe(0)
			expect(readRehearsalFile(out)).toEqual({
				at: expect.stringMatching(ISO_TIME_PATTERN),
				lots: [
					expect.objectContaining({
						lot: 1,
						tree,
						decision: 'reused',
						reason: `green gate --full on tree ${short(tree)}`,
						record: {
							mode: 'full',
							at: expect.stringMatching(ISO_TIME_PATTERN),
							head: headOf(root),
						},
					}),
				],
			})
		})
	},
)

describe(
	'handover run --rehearse: a lot rehearsed',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		const VARIANTS: RehearsedVariant[] = [
			'a gate of an earlier tree',
			'the lot changes package-lock.json',
			'the hook stages files',
			'node_modules/.package-lock.json changed since the gate',
			'a linked dependency changed since the gate',
			'--full',
		]

		for (const variant of VARIANTS)
			it(`${variant} → its rehearse line with the reason, a clone, the hook runs in it once, rehearsal.json says rehearsed`, async () => {
				const scenario = await createRehearsedScenario(variant)

				const result = await runFolder({
					out: scenario.out,
					argv: ['--rehearse', ...(scenario.full ? ['--full'] : [])],
				})

				expect(result.exitCode).toBe(0)
				expect(result.text).toMatch(
					lotLinePattern({
						index: 1,
						count: 1,
						decision: 'rehearse',
						reason: scenario.reason ?? /\S.*/,
					}),
				)
				expect(result.text).not.toContain(SKIPPED_LINE)
				expect(result.rehearsalFolders).toHaveLength(1)
				expect(countRuns(scenario.hookCounter)).toBe(1)
				expect(readRehearsalFile(scenario.out).lots).toEqual([
					expect.objectContaining({ lot: 1, decision: 'rehearsed' }),
				])
			})

		it("two lots, the first's tree with a green gate --full, the second's without → a clone, the first lot committed in it without the hook, the second with it (one run)", async () => {
			const hookCounter = createCounter()
			const root = createHookedPackage({ hookCounter, gateCounter: createCounter() })
			writeFiles({ root, files: { 'src/read.ts': 'export function read() {\n\treturn 1\n}\n' } })
			await seedFullGate(root)
			const firstTree = treeOfWorkingFiles(root)
			editReadLot(root)
			const secondTree = treeOfWorkingFiles(root)
			const { out } = writeHandoverFolder({
				root,
				lots: [
					{ paths: ['src/read.ts'], message: 'feat(read): read answers one' },
					{ paths: ['CHANGELOG.md'], message: 'docs(changelog): read answers one' },
				],
			})

			const result = await runFolder({ out, argv: ['--rehearse', '--keep'] })

			const [rehearsalFolder] = readdirSync(result.scratchRoot).filter((name) =>
				name.startsWith(REHEARSAL_FOLDER_PREFIX),
			)
			const clone = join(result.scratchRoot, rehearsalFolder, basename(root))
			// the first lot was committed in the kept clone (a lot that is skipped would leave no commit), without its hook
			expect(
				git({ root: clone, args: ['log', '--format=%s', `${headOf(root)}..HEAD`] })
					.trim()
					.split('\n'),
			).toEqual(['docs(changelog): read answers one', 'feat(read): read answers one'])
			// the rehearsal's record is in the repository's store, not in the clone, and only for the lot that ran the hook
			expect(readTreeRecords({ root, tree: secondTree })).toContainEqual(
				expect.objectContaining({ mode: 'hook', origin: 'rehearsal' }),
			)
			expect(readTreeRecords({ root, tree: firstTree }).filter((record) => record.origin)).toEqual(
				[],
			)
			expect(result.exitCode).toBe(0)
			expect(result.text).toMatch(
				lotLinePattern({
					index: 1,
					count: 2,
					decision: 'reused',
					reason: /green gate --full on tree [0-9a-f]{12}/,
				}),
			)
			expect(result.text).toMatch(
				lotLinePattern({
					index: 2,
					count: 2,
					decision: 'rehearse',
					reason: /no green gate --full on tree [0-9a-f]{12}/,
				}),
			)
			expect(result.rehearsalFolders).toHaveLength(1)
			expect(countRuns(hookCounter)).toBe(1)
			expect(readRehearsalFile(out).lots).toEqual([
				expect.objectContaining({ lot: 1, decision: 'reused' }),
				expect.objectContaining({ lot: 2, decision: 'rehearsed' }),
			])
		})
	},
)

describe('handover run --rehearse: a merge lot', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it("the branch commit's hook record is in the store, main unchanged → reused, no clone, the hook not run, the tree line printed and written to rehearsal.json", async () => {
		const hookCounter = createCounter()
		const { root, tip } = await createBranchScenario({
			recorded: true,
			mainMoved: false,
			hookCounter,
			gateCounter: createCounter(),
		})
		const runsBefore = countRuns(hookCounter)
		const { out } = writeMergeHandover({ root, tip })
		const tipTree = git({ root, args: ['rev-parse', `${tip}^{tree}`] }).trim()

		const result = await runFolder({ out, argv: ['--rehearse'] })

		expect(result.exitCode).toBe(0)
		expect(result.text).toContain(
			lotLine({
				index: 1,
				count: 1,
				decision: 'reused',
				reason: `green hook record of the tip's tree ${short(tipTree)}`,
			}),
		)
		expect(result.text).toContain(SKIPPED_LINE)
		expect(result.text).toContain(`tree ${tipTree}`)
		expect(result.rehearsalFolders).toEqual([])
		expect(countRuns(hookCounter) - runsBefore).toBe(0)
		expect(readRehearsalFile(out).lots).toEqual([
			expect.objectContaining({ lot: 1, tree: tipTree, decision: 'reused' }),
		])
	})

	it("the reused merge's printed tree is the lot's tree: put it in the lots file, --rehash, then the real run exits 0, commits the merge of the tip and runs the hook once", async () => {
		const hookCounter = createCounter()
		const { root, tip } = await createBranchScenario({
			recorded: true,
			mainMoved: false,
			hookCounter,
			gateCounter: createCounter(),
		})
		const runsBefore = countRuns(hookCounter)
		const { out } = writeMergeHandover({ root, tip })
		const rehearsal = await runFolder({ out, argv: ['--rehearse'] })
		const printedTree = /^\s*tree ([0-9a-f]{40})$/m.exec(rehearsal.text)?.[1]
		const lotsPath = join(out, 'lots.json')
		const lotsFile = JSON.parse(readFileSync(lotsPath, 'utf8'))
		lotsFile.lots[0].tree = printedTree
		writeFileSync(lotsPath, JSON.stringify(lotsFile))

		const rehashed = runHandover({
			argv: [lotsPath, '--rehash'],
			cliPath: WRITER_CLI,
			probe: noRepositoryCli,
		})
		const real = await runFolder({ out })

		expect(printedTree).toBe(git({ root, args: ['rev-parse', `${tip}^{tree}`] }).trim())
		expect(rehashed.exitCode).toBe(0)
		expect(real.exitCode).toBe(0)
		expect(git({ root, args: ['rev-parse', 'HEAD^2'] }).trim()).toBe(tip)
		expect(countRuns(hookCounter) - runsBefore).toBe(1)
	})

	it('main moved after the cut → rehearsed with main moved, the merge tree and the tip’s; a clone, the hook runs once', async () => {
		const hookCounter = createCounter()
		const { root, tip } = await createBranchScenario({
			recorded: true,
			mainMoved: true,
			hookCounter,
			gateCounter: createCounter(),
		})
		const runsBefore = countRuns(hookCounter)
		const { out } = writeMergeHandover({ root, tip })
		const tipTree = git({ root, args: ['rev-parse', `${tip}^{tree}`] }).trim()
		const mergeTree = git({ root, args: ['merge-tree', '--write-tree', 'main', BRANCH_NAME] })
			.split('\n')[0]
			.trim()

		const result = await runFolder({ out, argv: ['--rehearse'] })

		expect(result.exitCode).toBe(0)
		expect(result.text).toContain(
			lotLine({
				index: 1,
				count: 1,
				decision: 'rehearse',
				reason: `main moved: the merge leaves tree ${short(mergeTree)}, the tip holds ${short(tipTree)}`,
			}),
		)
		expect(result.rehearsalFolders).toHaveLength(1)
		expect(countRuns(hookCounter) - runsBefore).toBe(1)
	})

	it("the tree equals the tip's but no record of it → rehearsed with no green record; a clone, the hook runs once", async () => {
		const hookCounter = createCounter()
		const { root, tip } = await createBranchScenario({
			recorded: false,
			mainMoved: false,
			hookCounter,
			gateCounter: createCounter(),
		})
		const { out } = writeMergeHandover({ root, tip })
		const tipTree = git({ root, args: ['rev-parse', `${tip}^{tree}`] }).trim()

		const result = await runFolder({ out, argv: ['--rehearse'] })

		expect(result.exitCode).toBe(0)
		expect(result.text).toContain(
			lotLine({
				index: 1,
				count: 1,
				decision: 'rehearse',
				reason: `no green record of the tip's tree ${short(tipTree)}`,
			}),
		)
		expect(result.rehearsalFolders).toHaveLength(1)
		expect(countRuns(hookCounter)).toBe(1)
	})
})

describe(
	'handover run: the real run keeps its hook',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		it("a lot whose tree has a green gate --full: the rehearsal skips it (hook not run), the real run (no --rehearse) still runs the commit's hook once and commits the lot", async () => {
			const { root, hookCounter, out } = await createReusableScenario()
			const before = headOf(root)
			const rehearsal = await runFolder({ out, argv: ['--rehearse'] })
			const runsAfterRehearsal = countRuns(hookCounter)

			const result = await runFolder({ out })

			expect(rehearsal.text).toContain(SKIPPED_LINE)
			expect(runsAfterRehearsal).toBe(0)
			expect(result.exitCode).toBe(0)
			expect(countRuns(hookCounter)).toBe(1)
			expect(headOf(root)).not.toBe(before)
		})
	},
)

describe(
	'handover run --rehearse: when the plan cannot be made or the store is damaged',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		it('the gate steps are not a list in the committed package.json → refused before the guards: the gate config message, exit 2, no lot rehearsed', async () => {
			const root = createHookedPackage({
				hookCounter: createCounter(),
				gateCounter: createCounter(),
			})
			editReadLot(root)
			await seedFullGate(root)
			writeFileSync(
				join(root, 'package.json'),
				JSON.stringify({ name: 'demo', dialecte: { gate: { full: 5 } } }),
			)
			let out = ''
			expect(() => {
				out = writeHandoverFolder({
					root,
					lots: [{ ...READ_LOT, paths: [...READ_LOT.paths, 'package.json'] }],
				}).out
			}).not.toThrow()

			const result = await runFolder({ out, argv: ['--rehearse'] })

			expect(result.exitCode).toBe(2)
			expect(result.text).toMatch(/full: a list of steps/)
			expect(result.text).toMatch(/nothing staged, nothing committed/)
			expect(result.text).not.toMatch(
				lotLinePattern({ index: 1, count: 1, decision: 'rehearse', reason: /.+/ }),
			)
			expect(result.text).not.toContain(SKIPPED_LINE)
		})

		it('a malformed dialecte.gate in the package.json a hand-over commits → the written card is printed, no crash', async () => {
			const root = createHookedPackage({
				hookCounter: createCounter(),
				gateCounter: createCounter(),
			})
			editReadLot(root)
			await seedFullGate(root)
			writeFileSync(
				join(root, 'package.json'),
				JSON.stringify({ name: 'demo', dialecte: { gate: { full: 5, fast: 'no' } } }),
			)
			let output = ''

			expect(() => {
				output = writeHandoverFolder({
					root,
					lots: [{ ...READ_LOT, paths: [...READ_LOT.paths, 'package.json'] }],
				}).output
			}).not.toThrow()
			expect(output).toContain('hand-over:')
		})

		it('a store file of the lot tree holding a record without steps → the lot is rehearsed as if no gate ran, no crash', async () => {
			const { root, hookCounter, out } = await createReusableScenario()
			const tree = treeOfWorkingFiles(root)
			writeFileSync(
				join(commonGitDirOf(root), CHECK_STORE_FOLDER, `${tree}.json`),
				JSON.stringify([{ mode: 'full', at: '2999-01-01T00:00:00.000Z', head: headOf(root) }]),
			)

			const settled = runFolder({ out, argv: ['--rehearse'] })

			await expect(settled).resolves.toMatchObject({ exitCode: 0 })
			const result = await settled
			expect(result.text).toMatch(
				lotLinePattern({
					index: 1,
					count: 1,
					decision: 'rehearse',
					reason: `no green gate --full on tree ${short(tree)}`,
				}),
			)
			expect(countRuns(hookCounter)).toBe(1)
		})
	},
)

describe(
	'the card reads the records of the tree it checks',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		const NEVER_RUN = 'never run on this tree'

		it("a merge lot, main unchanged: the written card and the skipped rehearsal's card show the branch commit's hook record, current, ending from its sha, READY", async () => {
			const { root, tip } = await createBranchScenario({
				recorded: true,
				mainMoved: false,
				hookCounter: createCounter(),
				gateCounter: createCounter(),
			})
			const written = writeMergeHandover({ root, tip })

			const rehearsal = await runFolder({ out: written.out, argv: ['--rehearse'] })

			// the branch commit's hook record was made at the branch commit, not at main's HEAD: it ends from that commit
			for (const card of [written.output, rehearsal.text]) {
				expect(gateStepLinesOf(card).filter((line) => line.includes(NEVER_RUN))).toEqual([])
				expect(
					gateStepLinesOf(card).filter((line) => line.includes('the tree changed since')),
				).toEqual([])
				expect(gateStepLinesOf(card).filter((line) => /^[✓!✗] test:run\b/.test(line))).toEqual([
					expect.stringMatching(new RegExp(`^✓ test:run .*· from ${short(tip)}$`)),
				])
				expect(card).toMatch(/│ READY /)
			}
		})

		it('a merge lot, main moved, no rehearsal yet → no current record of the merge tree, BLOCKED; after the rehearsal that ran the hook → the lines end rehearsal, READY', async () => {
			const { root, tip } = await createBranchScenario({
				recorded: true,
				mainMoved: true,
				hookCounter: createCounter(),
				gateCounter: createCounter(),
			})
			const written = writeMergeHandover({ root, tip })

			const rehearsal = await runFolder({ out: written.out, argv: ['--rehearse'] })

			// the branch commit's record is of another tree than the merge leaves: stale, or no record at all
			expect(
				gateStepLinesOf(written.output).filter(
					(line) => /^[✓!✗] test:run\b/.test(line) && !line.endsWith('(the tree changed since)'),
				),
			).toEqual([])
			expect(written.output).toMatch(/│ BLOCKED /)
			expect(gateStepLinesOf(rehearsal.text).filter((line) => line.includes(NEVER_RUN))).toEqual([])
			expect(
				gateStepLinesOf(rehearsal.text).filter((line) => /^[✓!✗] test:run\b/.test(line)),
			).toEqual([expect.stringMatching(/^✓ test:run (?!.*· from).*· rehearsal$/)])
			expect(rehearsal.text).toMatch(/│ READY /)
		})

		it('a record another worktree stored for this tree against other node_modules or another linked dependency → not current: the card does not read it as green, not READY', async () => {
			for (const variant of ['node_modules', 'linked dependency'] as const) {
				const root = createHookedPackage({
					hookCounter: createCounter(),
					gateCounter: createCounter(),
					...(variant === 'linked dependency' && { linkedDependency: true }),
				})
				const second = addWorktree(root)
				editReadLot(second)
				editReadLot(root)
				// the second worktree is installed otherwise: another npm lock (or, for the link, no ../dep beside it)
				if (variant === 'node_modules')
					writeFiles({
						root: second,
						files: { 'node_modules/.package-lock.json': '{"packages":{}}\n' },
					})
				await seedFullGate(second)

				const { output } = writeReadLotHandover(root)

				expect({
					variant,
					lines: gateStepLinesOf(output).filter((line) => /^✓ count\b/.test(line)),
				}).toEqual({
					variant,
					lines: [],
				})
				expect({ variant, blocked: /│ BLOCKED /.test(output) }).toEqual({ variant, blocked: true })
			}
		})

		it('a store file of the checked tree holding a record without steps → the card is still written, that record ignored', async () => {
			const root = createHookedPackage({
				hookCounter: createCounter(),
				gateCounter: createCounter(),
			})
			editReadLot(root)
			await seedFullGate(root)
			writeFileSync(
				join(commonGitDirOf(root), CHECK_STORE_FOLDER, `${treeOfWorkingFiles(root)}.json`),
				JSON.stringify([{ mode: 'full', at: '2999-01-01T00:00:00.000Z', head: headOf(root) }]),
			)

			expect(() => writeHandoverFolder({ root, lots: [READ_LOT], branch: 'main' })).not.toThrow()
		})

		it("a gate --full another worktree ran at this HEAD → the card shows its configured steps only: that worktree's tdd step is left out", async () => {
			const root = createHookedPackage({
				hookCounter: createCounter(),
				gateCounter: createCounter(),
			})
			const second = addWorktree(root)
			editReadLot(second)
			editReadLot(root)
			await seedFullGate(second)

			const { output } = writeReadLotHandover(root)

			expect(gateStepLinesOf(output)).toEqual(['✓ count 4/4', '✓ effort no effort recorded'])
		})

		it("a gate run whose files changed while its steps ran (no key, nothing stored) → the worktree's own card does not read it as green for the state after the run", async () => {
			const root = createHookedPackage({
				hookCounter: createCounter(),
				gateCounter: createCounter(),
				gateEdits: 'src/read.ts',
			})
			editReadLot(root)
			await seedFullGate(root)

			const { output } = writeReadLotHandover(root)

			expect(gateStepLinesOf(output).filter((line) => /^✓ count\b/.test(line))).toEqual([])
			expect(output).toMatch(/│ BLOCKED /)
		})

		it("a hand-over of a plain lot → the card reads the store's record of the worktree's own tree: a gate --full another worktree ran at this same HEAD on the same files shows with no suffix (a record made at this HEAD carries none), READY", async () => {
			const root = createHookedPackage({
				hookCounter: createCounter(),
				gateCounter: createCounter(),
			})
			const second = addWorktree(root)
			editReadLot(second)
			editReadLot(root)
			await seedFullGate(second)

			const { output } = writeReadLotHandover(root)

			expect(gateStepLinesOf(output).filter((line) => line.includes(NEVER_RUN))).toEqual([])
			expect(gateStepLinesOf(output).filter((line) => /^[✓!✗] count\b/.test(line))).toEqual([
				expect.stringMatching(/^✓ count 4\/4$/),
			])
			expect(output).toMatch(/│ READY /)
		})
	},
)
