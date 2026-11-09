/** `runGateSteps` with a scoped step: its environment, its selection file and the verdicts of spec sections 5 to 7. */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { join } from 'node:path'

import { createFakeClock } from '../../../test/fake-clock.ts'
import { createFakeTree } from '../../../test/fake-process-tree.ts'
import { FAKE_VITEST } from '../../../test/fake-vitest.constants.ts'
import { SCRATCH_REPOSITORY_TIMEOUT } from '../../../test/scratch-checks.constants.ts'
import { createScratchRepository, git, writeFiles } from '../../../test/scratch-repository.ts'
import { computeStateTree } from '../gate-records/state-hash.ts'
import { runGateSteps } from './run-gate.ts'

import { describe, expect, it, onTestFinished, vi } from 'vitest'

import type { GateStep } from './gate-config.types.ts'
import type { GateScope } from './gate.types.ts'

/** The paths that change between the base and the tree, in the byte order git lists them. */
const CHANGED_PATHS = [
	'README.md',
	'new.ts',
	'old.ts',
	'src/a.ts',
	'src/b.ts',
	'src/odd\nname.ts',
	'src/wip.ts',
	'src/é.ts',
]
const CHANGED_COUNT = CHANGED_PATHS.length
const PRINTED_PASSED = ' Test Files  1 passed (1)\n      Tests  3 passed (3)\n'
const PRINTED_FAILED_FILE =
	' FAIL  |node| src/a.test.ts > group > one\n Test Files  1 failed (1)\n      Tests  1 failed | 2 passed (3)\n'
const SELECTION_LIMIT_BYTES = 1024 * 1024
const SCOPED: GateStep = { name: 'scoped', run: 'sh ./step.sh scoped', scoped: true }
const SCOPED_TESTS: GateStep = { ...SCOPED, counts: 'tests' }
const SCOPED_VITEST: GateStep = {
	name: 'scoped-vitest',
	run: 'sh ./step.sh vitest',
	counts: 'tests',
	scoped: true,
}

/** What a scoped step does, as a script: it records its environment, then writes the files the case holds. */
const STEP_SCRIPT = `
mode=
case " $* " in *" --no-file-parallelism "*) mode=-serial ;; esac
label=$1
{ env | grep -E '^DIALECTE_(GATE|HANDOVER)_' | sort; echo ---; } >> "env-$label.log"
if [ -n "$DIALECTE_GATE_SELECTION" ]; then
	if [ -e "$DIALECTE_GATE_SELECTION" ]; then echo present >> "state-$label.log"; else echo absent >> "state-$label.log"; fi
fi
if [ -n "$DIALECTE_GATE_CHANGED" ]; then cp "$DIALECTE_GATE_CHANGED" "changed-$label.bin"; fi
if [ -n "$DIALECTE_GATE_CHANGED" ]; then (cd "$(dirname "$DIALECTE_GATE_CHANGED")" && pwd -P) > "dir-$label.txt"; fi
if [ -n "$DIALECTE_GATE_SELECTION" ] && ! { [ "$mode" = -serial ] && [ -f no-selection-serial ]; }; then
	if [ -f "selection$mode.json" ]; then cp "selection$mode.json" "$DIALECTE_GATE_SELECTION"
	elif [ -f selection.json ]; then cp selection.json "$DIALECTE_GATE_SELECTION"; fi
fi
if [ -f "output$mode.txt" ]; then cat "output$mode.txt"; else cat output.txt; fi
if [ -f "exit$mode.txt" ]; then code=$(cat "exit$mode.txt"); else code=$(cat exit.txt); fi
exit "$code"
`

type Fixture = { root: string; base: string; tree: string; scope: GateScope }

/** A repository whose base and tree differ by `CHANGED_PATHS` (an added, a modified, a renamed, a non-ASCII and a newline path). */
function fixture(): Fixture {
	const root = createScratchRepository({
		'old.ts': 'export const moved = 1\n',
		'src/keep.ts': 'export const keep = 1\n',
	})
	const base = git({ root, args: ['rev-parse', 'HEAD'] }).trim()
	rmSync(join(root, 'old.ts'))
	writeFiles({
		root,
		files: {
			'new.ts': 'export const moved = 1\n',
			'README.md': 'changed\n',
			'src/a.ts': 'a\n',
			'src/b.ts': 'b\n',
			'src/é.ts': 'e\n',
			'src/odd\nname.ts': 'odd\n',
		},
	})
	git({ root, args: ['add', '-A'] })
	git({ root, args: ['commit', '-q', '-m', 'feat: the change'] })
	// a file only the worktree has: the tree the gate keys is not HEAD's
	writeFiles({ root, files: { 'src/wip.ts': 'wip\n' } })
	const tree = computeStateTree(root)
	writeFiles({ root, files: { 'step.sh': STEP_SCRIPT, 'exit.txt': '0', 'output.txt': '' } })
	return { root, base, tree, scope: { base, tree } }
}

/** A valid selection of this fixture; `overrides` replace its fields. */
function selectionOf(params: {
	given: Fixture
	overrides?: Record<string, unknown>
}): Record<string, unknown> {
	const { given, overrides = {} } = params
	return {
		schema: 1,
		base: given.base,
		tree: given.tree,
		changed: CHANGED_COUNT,
		selected: [
			{ id: 'T0', reasons: ['always'] },
			{ id: 'T4', reasons: ['src/a.ts -> test/a.test.ts'] },
		],
		skipped: [{ id: 'T5', reason: 'release only' }],
		...overrides,
	}
}

/** Runs git in the repository with `input` on its standard input; its standard output as bytes. */
function gitBytesIn(params: { root: string; args: string[]; input: Buffer }): Buffer {
	const run = spawnSync('git', params.args, {
		cwd: params.root,
		input: params.input,
		timeout: SCRATCH_REPOSITORY_TIMEOUT,
	})
	if (run.status !== 0) throw new Error(`git ${params.args.join(' ')} failed: ${run.stderr}`)
	return run.stdout
}

function writeSelection(params: { given: Fixture; file?: string; selection: unknown }): void {
	const text =
		typeof params.selection === 'string' ? params.selection : JSON.stringify(params.selection)
	writeFiles({ root: params.given.root, files: { [params.file ?? 'selection.json']: text } })
}

function writeOutput(params: { given: Fixture; output: string; exit?: number; serial?: boolean }) {
	const suffix = params.serial ? '-serial' : ''
	writeFiles({
		root: params.given.root,
		files: {
			[`output${suffix}.txt`]: params.output,
			[`exit${suffix}.txt`]: String(params.exit ?? 0),
		},
	})
}

async function runOne(params: { given: Fixture; step: GateStep }) {
	const [result] = await runGateSteps({
		root: params.given.root,
		steps: [params.step],
		packageJson: {},
		scope: params.given.scope,
	})
	return result
}

/** The `DIALECTE_*` variables each run of the step labelled `label` saw, in order. */
function envOfRuns(params: { given: Fixture; label: string }): Record<string, string>[] {
	return readFileSync(join(params.given.root, `env-${params.label}.log`), 'utf8')
		.split('---\n')
		.filter((block) => block.trim() !== '')
		.map((block) =>
			Object.fromEntries(
				block
					.trim()
					.split('\n')
					.map((line) => {
						const at = line.indexOf('=')
						return [line.slice(0, at), line.slice(at + 1)]
					}),
			),
		)
}

describe(
	'runGateSteps: the environment of a scoped step',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		it('a scoped step → the base and tree it was given, a changed file, a selection path that does not exist yet', async () => {
			const given = fixture()

			await runOne({ given, step: SCOPED })

			const [env] = envOfRuns({ given, label: 'scoped' })
			expect(env).toMatchObject({
				DIALECTE_GATE_BASE: given.base,
				DIALECTE_GATE_TREE: given.tree,
				DIALECTE_GATE_CHANGED: expect.stringMatching(/^\//),
				DIALECTE_GATE_SELECTION: expect.stringMatching(/^\//),
			})
			expect(readFileSync(join(given.root, 'state-scoped.log'), 'utf8').trim()).toBe('absent')
		})

		it('the changed file → the paths of git diff --name-only -z --no-renames, NUL-separated, byte-sorted, both paths of a rename, non-ASCII and newline paths raw', async () => {
			const given = fixture()

			await runOne({ given, step: SCOPED })

			const changedFile = join(given.root, 'changed-scoped.bin')
			const changed = existsSync(changedFile) ? readFileSync(changedFile, 'utf8') : ''
			expect(changed.split('\0').filter((path) => path !== '')).toEqual(CHANGED_PATHS)
			expect(changed).not.toContain('"')
			expect(changed).not.toContain('\\303')
		})

		it('R1-12: a changed path holding a byte that is no UTF-8 → the changed file holds it byte for byte', async () => {
			const given = fixture()
			const rawName = Buffer.from([0x61, 0xe9, 0x2e, 0x74, 0x73])
			const blob = gitBytesIn({
				root: given.root,
				args: ['hash-object', '-w', '--stdin'],
				input: Buffer.from('raw\n'),
			})
				.toString()
				.trim()
			const entry = Buffer.concat([Buffer.from(`100644 blob ${blob}\t`), rawName, Buffer.from([0])])
			const tree = gitBytesIn({ root: given.root, args: ['mktree', '-z'], input: entry })
				.toString()
				.trim()
			const empty = git({
				root: given.root,
				args: ['hash-object', '-t', 'tree', '/dev/null'],
			}).trim()

			await runOne({ given: { ...given, tree, scope: { base: empty, tree } }, step: SCOPED })

			const changed = readFileSync(join(given.root, 'changed-scoped.bin'))
			expect(changed.toString('hex')).toBe(
				Buffer.concat([rawName, Buffer.from([0])]).toString('hex'),
			)
		})

		it('an unscoped step → none of DIALECTE_GATE_*, even when the cli environment holds them; no step has the hand-over variables', async () => {
			const given = fixture()
			vi.stubEnv('DIALECTE_GATE_BASE', 'stray-base')
			vi.stubEnv('DIALECTE_GATE_TREE', 'stray-tree')
			vi.stubEnv('DIALECTE_GATE_CHANGED', '/stray/changed')
			vi.stubEnv('DIALECTE_GATE_SELECTION', '/stray/selection')
			vi.stubEnv('DIALECTE_HANDOVER_BASE', 'stray-handover-base')
			vi.stubEnv('DIALECTE_HANDOVER_FOLDER', '/stray/handover')
			onTestFinished(() => {
				vi.unstubAllEnvs()
			})

			const results = await runGateSteps({
				root: given.root,
				steps: [
					{ name: 'plain', run: 'sh ./step.sh plain' },
					{ name: 'scoped', run: 'sh ./step.sh scoped', scoped: true },
				],
				packageJson: {},
				scope: given.scope,
			})

			const [plain] = envOfRuns({ given, label: 'plain' })
			const [scoped] = envOfRuns({ given, label: 'scoped' })
			expect(Object.keys(plain ?? {})).toEqual([])
			expect(Object.keys(scoped ?? {}).sort()).toEqual([
				'DIALECTE_GATE_BASE',
				'DIALECTE_GATE_CHANGED',
				'DIALECTE_GATE_SELECTION',
				'DIALECTE_GATE_TREE',
			])
			expect(scoped?.DIALECTE_GATE_BASE).toBe(given.base)
			expect(results).toHaveLength(2)
		})

		it('a scoped step with stray values in the cli environment → the given tree and base, the changed file and selection path the cli made (not the stray ones)', async () => {
			const given = fixture()
			vi.stubEnv('DIALECTE_GATE_BASE', 'stray-base')
			vi.stubEnv('DIALECTE_GATE_TREE', 'stray-tree')
			vi.stubEnv('DIALECTE_GATE_CHANGED', '/stray/changed')
			vi.stubEnv('DIALECTE_GATE_SELECTION', '/stray/selection')
			onTestFinished(() => {
				vi.unstubAllEnvs()
			})

			await runOne({ given, step: SCOPED })

			const [env] = envOfRuns({ given, label: 'scoped' })
			expect(env).toMatchObject({
				DIALECTE_GATE_BASE: given.base,
				DIALECTE_GATE_TREE: given.tree,
			})
			expect(env?.DIALECTE_GATE_CHANGED).not.toBe('/stray/changed')
			expect(env?.DIALECTE_GATE_SELECTION).not.toBe('/stray/selection')
		})

		it('the tree of the scope is the worktree’s, not HEAD’s → its extra path is in the changed file and in the count', async () => {
			const given = fixture()
			writeSelection({ given, selection: selectionOf({ given }) })

			const result = await runOne({ given, step: SCOPED })

			const changedFile = join(given.root, 'changed-scoped.bin')
			const changed = existsSync(changedFile) ? readFileSync(changedFile, 'utf8') : ''
			expect(changed.split('\0')).toContain('src/wip.ts')
			expect(result).toMatchObject({ status: 'passed', selection: { changed: CHANGED_COUNT } })
		})

		it('the changed file and the selection path → in a folder the cli made outside the package root, both gone once the run returns', async () => {
			const given = fixture()
			writeSelection({ given, selection: selectionOf({ given }) })

			await runOne({ given, step: SCOPED })

			const [env] = envOfRuns({ given, label: 'scoped' })
			expect(env?.DIALECTE_GATE_CHANGED).toEqual(expect.any(String))
			const folder = readFileSync(join(given.root, 'dir-scoped.txt'), 'utf8').trim()
			expect(folder.startsWith(realpathSync(given.root))).toBe(false)
			expect(existsSync(env?.DIALECTE_GATE_CHANGED ?? '')).toBe(false)
			expect(existsSync(env?.DIALECTE_GATE_SELECTION ?? '')).toBe(false)
		})

		it('two scoped steps in one run → distinct selection paths, each absent at its start', async () => {
			const given = fixture()
			writeSelection({ given, selection: selectionOf({ given }) })

			await runGateSteps({
				root: given.root,
				steps: [
					{ name: 'one', run: 'sh ./step.sh one', scoped: true },
					{ name: 'two', run: 'sh ./step.sh two', scoped: true },
				],
				packageJson: {},
				scope: given.scope,
			})

			const [one] = envOfRuns({ given, label: 'one' })
			const [two] = envOfRuns({ given, label: 'two' })
			expect(one?.DIALECTE_GATE_SELECTION).toEqual(expect.any(String))
			expect(two?.DIALECTE_GATE_SELECTION).not.toBe(one?.DIALECTE_GATE_SELECTION)
			expect(readFileSync(join(given.root, 'state-one.log'), 'utf8').trim()).toBe('absent')
			expect(readFileSync(join(given.root, 'state-two.log'), 'utf8').trim()).toBe('absent')
		})
	},
)

describe(
	'runGateSteps: the verdicts of a scoped step',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		it('a valid selection and tests that passed → passed, the selection kept with its ids, reasons and skipped', async () => {
			const given = fixture()
			writeSelection({ given, selection: selectionOf({ given }) })
			writeOutput({ given, output: PRINTED_PASSED })

			const outcome = await runOne({ given, step: SCOPED_TESTS })
			expect(outcome).toMatchObject({
				status: 'passed',
				counts: { tests: { passed: 3, failed: 0, total: 3 } },
				selection: {
					base: given.base,
					tree: given.tree,
					changed: CHANGED_COUNT,
					ids: ['T0', 'T4'],
					reasons: {
						T0: { shown: ['always'], more: 0 },
						T4: { shown: ['src/a.ts -> test/a.test.ts'], more: 0 },
					},
					skipped: [{ id: 'T5', reason: 'release only' }],
				},
			})
		})

		it.each([
			{ count: 25, more: 5 },
			{ count: 21, more: 1 },
		])('an id with $count reasons → 20 shown, the other $more counted', async ({ count, more }) => {
			const given = fixture()
			const reasons = Array.from(
				{ length: count },
				(_, index) => `src/${index}.ts -> test/t.test.ts`,
			)
			writeSelection({
				given,
				selection: selectionOf({
					given,
					overrides: { selected: [{ id: 'T9', reasons }], skipped: [] },
				}),
			})
			writeOutput({ given, output: PRINTED_PASSED })

			const result = await runOne({ given, step: SCOPED_TESTS })

			expect(result?.selection?.reasons.T9).toEqual({ shown: reasons.slice(0, 20), more })
		})

		it('a step exiting non-zero → failed as today, whatever its selection says', async () => {
			const given = fixture()
			writeSelection({ given, selection: selectionOf({ given }) })
			writeOutput({ given, output: PRINTED_PASSED, exit: 3 })

			const outcome = await runOne({ given, step: SCOPED_TESTS })
			expect(outcome).toMatchObject({
				status: 'failed',
				exitCode: 3,
				reason: 'exit 3',
			})
		})

		it('a step exiting non-zero beside an invalid selection → the exit code is the reason (the first row of the table)', async () => {
			const given = fixture()
			writeSelection({ given, selection: selectionOf({ given, overrides: { schema: 2 } }) })
			writeOutput({ given, output: PRINTED_PASSED, exit: 1 })

			const outcome = await runOne({ given, step: SCOPED_TESTS })
			expect(outcome).toMatchObject({ reason: 'exit 1' })
		})

		it.each([
			{ label: 'no selection file', selection: undefined, why: /\(missing\)$/ },
			{
				label: 'a file that is not JSON',
				selection: 'not json {',
				why: /\(.*(json|unreadable).*\)$/i,
			},
			{
				label: 'selected that is not an array',
				selection: (given: Fixture) => selectionOf({ given, overrides: { selected: 'T0' } }),
				why: /\(.*selected.*\)$/,
			},
			{
				label: 'a reason that is not a string',
				selection: (given: Fixture) =>
					selectionOf({ given, overrides: { selected: [{ id: 'T0', reasons: [1] }] } }),
				why: /\(.*reason.*\)$/,
			},
			{
				label: 'an invalid id in skipped',
				selection: (given: Fixture) =>
					selectionOf({ given, overrides: { skipped: [{ id: '-bad', reason: 'release only' }] } }),
				why: /\(.*\bid\b.*\)$/,
			},
			{
				label: 'a skipped entry without a reason',
				selection: (given: Fixture) =>
					selectionOf({ given, overrides: { skipped: [{ id: 'T5' }] } }),
				why: /\(.*reason.*\)$/,
			},
			{
				label: 'changed given as the string "8"',
				selection: (given: Fixture) =>
					selectionOf({ given, overrides: { changed: String(CHANGED_COUNT) } }),
				why: /\(.*changed.*\)$/,
			},
			{
				label: 'an id containing a slash',
				selection: (given: Fixture) =>
					selectionOf({ given, overrides: { selected: [{ id: 'T0/x', reasons: ['always'] }] } }),
				why: /\(.*\bid\b.*\)$/,
			},
			{
				label: 'a schema other than 1',
				why: /\(.*schema.*\)$/,
				selection: (given: Fixture) => selectionOf({ given, overrides: { schema: 2 } }),
			},
			{
				label: 'a file larger than 1 MiB',
				why: /\(.*too large.*\)$/,
				selection: (given: Fixture) =>
					JSON.stringify(
						selectionOf({
							given,
							overrides: {
								selected: [{ id: 'T0', reasons: ['x'.repeat(SELECTION_LIMIT_BYTES + 1)] }],
							},
						}),
					),
			},
			{
				label: 'an id starting with a dash',
				why: /\(.*\bid\b.*\)$/,
				selection: (given: Fixture) =>
					selectionOf({ given, overrides: { selected: [{ id: '-bad', reasons: ['always'] }] } }),
			},
			{
				label: 'an id of 65 characters',
				why: /\(.*\bid\b.*\)$/,
				selection: (given: Fixture) =>
					selectionOf({
						given,
						overrides: { selected: [{ id: 'a'.repeat(65), reasons: ['always'] }] },
					}),
			},
			{
				label: 'an id in selected and skipped',
				why: /\(.*duplicate.*\)$/,
				selection: (given: Fixture) =>
					selectionOf({
						given,
						overrides: {
							selected: [{ id: 'T0', reasons: ['always'] }],
							skipped: [{ id: 'T0', reason: 'release only' }],
						},
					}),
			},
			{
				label: 'the same id twice in selected',
				why: /\(.*duplicate.*\)$/,
				selection: (given: Fixture) =>
					selectionOf({
						given,
						overrides: {
							selected: [
								{ id: 'T0', reasons: ['always'] },
								{ id: 'T0', reasons: ['always'] },
							],
							skipped: [],
						},
					}),
			},
			{
				label: 'a selected id without a reason',
				why: /\(.*reason.*\)$/,
				selection: (given: Fixture) =>
					selectionOf({ given, overrides: { selected: [{ id: 'T0', reasons: [] }] } }),
			},
		])(
			'$label → failed, scoped step wrote no valid selection (why), with or without counts',
			async ({ selection, why }) => {
				for (const step of [SCOPED_TESTS, SCOPED]) {
					const given = fixture()
					if (selection !== undefined)
						writeSelection({
							given,
							selection: typeof selection === 'function' ? selection(given) : selection,
						})
					writeOutput({ given, output: PRINTED_PASSED })

					const outcome = await runOne({ given, step })
					expect(outcome).toMatchObject({
						status: 'failed',
						reason: expect.stringMatching(
							new RegExp(`^scoped step wrote no valid selection ${why.source}`, why.flags),
						),
					})
				}
			},
		)

		it('an id of 64 characters (the boundary) → accepted, the selection kept', async () => {
			const given = fixture()
			const id = 'a'.repeat(64)
			writeSelection({
				given,
				selection: selectionOf({
					given,
					overrides: { selected: [{ id, reasons: ['always'] }], skipped: [] },
				}),
			})
			writeOutput({ given, output: PRINTED_PASSED })

			const outcome = await runOne({ given, step: SCOPED_TESTS })
			expect(outcome).toMatchObject({
				status: 'passed',
				selection: { ids: [id] },
			})
		})

		it('a scoped step without counts and a valid non-empty selection, exit 0 → passed, the selection kept', async () => {
			const given = fixture()
			writeSelection({ given, selection: selectionOf({ given }) })

			const outcome = await runOne({ given, step: SCOPED })
			expect(outcome).toMatchObject({
				status: 'passed',
				selection: { ids: ['T0', 'T4'], changed: CHANGED_COUNT },
			})
		})

		it.each([
			{
				label: 'another base',
				overrides: { base: 'f'.repeat(40) },
				reason: 'the selection is of another base or tree',
			},
			{
				label: 'another count',
				overrides: { changed: 3 },
				reason: `the selection judged 3 changed paths, the gate handed ${CHANGED_COUNT}`,
			},
		])(
			'a scoped step without counts and a selection of $label → failed with the same reason',
			async ({ overrides, reason }) => {
				const given = fixture()
				writeSelection({ given, selection: selectionOf({ given, overrides }) })

				const outcome = await runOne({ given, step: SCOPED })
				expect(outcome).toMatchObject({ status: 'failed', reason })
			},
		)

		it('an invalid selection beside another base → the validity reason comes first', async () => {
			const given = fixture()
			writeSelection({
				given,
				selection: selectionOf({ given, overrides: { schema: 2, base: 'f'.repeat(40) } }),
			})
			writeOutput({ given, output: PRINTED_PASSED })

			const outcome = await runOne({ given, step: SCOPED_TESTS })
			expect(outcome).toMatchObject({
				reason: expect.stringMatching(/^scoped step wrote no valid selection/),
			})
		})

		it('an empty selection, exit 0, one failed test counted → failed, 1 test(s) failed', async () => {
			const given = fixture()
			writeSelection({
				given,
				selection: selectionOf({ given, overrides: { selected: [], skipped: [] } }),
			})
			writeOutput({
				given,
				output: ' Test Files  1 failed (1)\n      Tests  1 failed | 2 passed (3)\n',
			})

			const outcome = await runOne({ given, step: SCOPED_TESTS })
			expect(outcome).toMatchObject({
				status: 'failed',
				reason: '1 test(s) failed',
			})
		})

		it.each([
			{ label: 'another base', overrides: { base: 'f'.repeat(40) } },
			{ label: 'another tree', overrides: { tree: 'e'.repeat(40) } },
		])(
			'a selection of $label → failed, the selection is of another base or tree',
			async ({ overrides }) => {
				const given = fixture()
				writeSelection({ given, selection: selectionOf({ given, overrides }) })
				writeOutput({ given, output: PRINTED_PASSED })

				const outcome = await runOne({ given, step: SCOPED_TESTS })
				expect(outcome).toMatchObject({
					status: 'failed',
					reason: 'the selection is of another base or tree',
				})
			},
		)

		it('another base and another count → the base is reported first', async () => {
			const given = fixture()
			writeSelection({
				given,
				selection: selectionOf({ given, overrides: { base: 'f'.repeat(40), changed: 1 } }),
			})
			writeOutput({ given, output: PRINTED_PASSED })

			const outcome = await runOne({ given, step: SCOPED_TESTS })
			expect(outcome).toMatchObject({
				reason: 'the selection is of another base or tree',
			})
		})

		it('a changed count other than the gate’s → failed, naming both counts', async () => {
			const given = fixture()
			writeSelection({ given, selection: selectionOf({ given, overrides: { changed: 3 } }) })
			writeOutput({ given, output: PRINTED_PASSED })

			const outcome = await runOne({ given, step: SCOPED_TESTS })
			expect(outcome).toMatchObject({
				status: 'failed',
				reason: `the selection judged 3 changed paths, the gate handed ${CHANGED_COUNT}`,
			})
		})

		it('an empty selection, exit 0, no test printed → passed with the note naming the short base and the count', async () => {
			const given = fixture()
			writeSelection({
				given,
				selection: selectionOf({ given, overrides: { selected: [], skipped: [] } }),
			})
			writeOutput({ given, output: '' })

			const result = await runOne({ given, step: SCOPED_TESTS })

			expect(result).toMatchObject({
				status: 'passed',
				note: expect.stringMatching(
					new RegExp(
						`^nothing selected since ${given.base.slice(0, 7)}[0-9a-f]* \\(${CHANGED_COUNT} paths changed\\)$`,
					),
				),
				selection: { ids: [], changed: CHANGED_COUNT },
			})
			expect(result?.note).not.toBe('no test file is affected by the change')
		})

		it('R1-8: an empty selection after one changed path → the note says (1 path changed)', async () => {
			const given = fixture()
			const previous = git({ root: given.root, args: ['rev-parse', 'HEAD'] }).trim()
			writeFiles({ root: given.root, files: { 'one.ts': 'one\n' } })
			git({ root: given.root, args: ['add', 'one.ts'] })
			git({ root: given.root, args: ['commit', '-q', '-m', 'feat: one path'] })
			const tree = git({ root: given.root, args: ['rev-parse', 'HEAD^{tree}'] }).trim()
			const one = { ...given, base: previous, tree, scope: { base: previous, tree } }
			writeSelection({
				given: one,
				selection: selectionOf({
					given: one,
					overrides: { changed: 1, selected: [], skipped: [] },
				}),
			})
			writeOutput({ given: one, output: '' })

			const result = await runOne({ given: one, step: SCOPED_TESTS })

			expect(result).toMatchObject({
				status: 'passed',
				note: expect.stringMatching(/ \(1 path changed\)$/),
			})
		})

		it('a non-empty selection and counts: tests with no test printed → failed, no test ran', async () => {
			const given = fixture()
			writeSelection({ given, selection: selectionOf({ given }) })
			writeOutput({ given, output: '' })

			const outcome = await runOne({ given, step: SCOPED_TESTS })
			expect(outcome).toMatchObject({
				status: 'failed',
				reason: 'no test ran',
			})
		})

		it('the configured heavy mark → carried on the result step', async () => {
			const given = fixture()
			writeSelection({ given, selection: selectionOf({ given }) })
			writeOutput({ given, output: PRINTED_PASSED })

			const result = await runOne({ given, step: { ...SCOPED_TESTS, heavy: true } })

			expect(result?.step.heavy).toBe(true)
		})
	},
)

describe(
	'runGateSteps: the serial rerun of a failed scoped vitest step',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		it('fails in parallel, passes serially → the same base, tree and changed file, a new selection path absent at start; flaky; the first run’s selection kept', async () => {
			const given = fixture()
			writeSelection({ given, selection: selectionOf({ given }) })
			writeOutput({ given, output: PRINTED_FAILED_FILE, exit: 1 })
			writeOutput({ given, output: PRINTED_PASSED, serial: true })

			const result = await runOne({ given, step: SCOPED_VITEST })

			const [first, second] = envOfRuns({ given, label: 'vitest' })
			expect(second).toMatchObject({
				DIALECTE_GATE_BASE: first?.DIALECTE_GATE_BASE,
				DIALECTE_GATE_TREE: first?.DIALECTE_GATE_TREE,
				DIALECTE_GATE_CHANGED: first?.DIALECTE_GATE_CHANGED,
				DIALECTE_GATE_SELECTION: expect.stringMatching(/^\//),
			})
			expect(second?.DIALECTE_GATE_SELECTION).not.toBe(first?.DIALECTE_GATE_SELECTION)
			expect(readFileSync(join(given.root, 'state-vitest.log'), 'utf8').trim().split('\n')).toEqual(
				['absent', 'absent'],
			)
			expect(result).toMatchObject({
				status: 'passed',
				note: 'flaky in parallel',
				selection: { ids: ['T0', 'T4'], changed: CHANGED_COUNT },
			})
		})

		it('R1-11: exit 0 with no valid selection → failed on its selection, run once: no serial rerun that cannot pass', async () => {
			const given = fixture()
			writeOutput({ given, output: PRINTED_PASSED })

			const result = await runOne({ given, step: SCOPED_VITEST })

			expect(result).toMatchObject({
				status: 'failed',
				reason: expect.stringMatching(/wrote no valid selection/),
			})
			expect(result?.rerun).toBeUndefined()
			expect(envOfRuns({ given, label: 'vitest' })).toHaveLength(1)
		})

		it('the rerun selects other ids than the first run → failed, naming both id lists', async () => {
			const given = fixture()
			writeSelection({ given, selection: selectionOf({ given }) })
			writeSelection({
				given,
				file: 'selection-serial.json',
				selection: selectionOf({
					given,
					overrides: {
						selected: [
							{ id: 'T0', reasons: ['always'] },
							{ id: 'T9', reasons: ['src/b.ts -> test/b.test.ts'] },
						],
					},
				}),
			})
			writeOutput({ given, output: PRINTED_FAILED_FILE, exit: 1 })
			writeOutput({ given, output: PRINTED_PASSED, serial: true })

			const outcome = await runOne({ given, step: SCOPED_VITEST })
			expect(outcome).toMatchObject({
				status: 'failed',
				reason: expect.stringMatching(/the rerun selected .*T9.*, the first run .*T4/),
				selection: { ids: ['T0', 'T4'] },
			})
		})

		it('the rerun writes no valid selection → failed, scoped step wrote no valid selection', async () => {
			const given = fixture()
			writeSelection({ given, selection: selectionOf({ given }) })
			writeFiles({ root: given.root, files: { 'no-selection-serial': '' } })
			writeOutput({ given, output: PRINTED_FAILED_FILE, exit: 1 })
			writeOutput({ given, output: PRINTED_PASSED, serial: true })

			const outcome = await runOne({ given, step: SCOPED_VITEST })
			expect(outcome).toMatchObject({
				status: 'failed',
				reason: expect.stringMatching(/wrote no valid selection/),
			})
		})

		it('the rerun selects the same ids with other reasons and skipped entries → the result holds the first run’s reasons and skipped', async () => {
			const given = fixture()
			writeSelection({ given, selection: selectionOf({ given }) })
			writeSelection({
				given,
				file: 'selection-serial.json',
				selection: selectionOf({
					given,
					overrides: {
						selected: [
							{ id: 'T0', reasons: ['changed in the rerun'] },
							{ id: 'T4', reasons: ['another reason'] },
						],
						skipped: [{ id: 'T7', reason: 'skipped only in the rerun' }],
					},
				}),
			})
			writeOutput({ given, output: PRINTED_FAILED_FILE, exit: 1 })
			writeOutput({ given, output: PRINTED_PASSED, serial: true })

			const outcome = await runOne({ given, step: SCOPED_VITEST })
			expect(outcome).toMatchObject({
				status: 'passed',
				selection: {
					reasons: {
						T0: { shown: ['always'], more: 0 },
						T4: { shown: ['src/a.ts -> test/a.test.ts'], more: 0 },
					},
					skipped: [{ id: 'T5', reason: 'release only' }],
				},
			})
		})

		it('the rerun selects the same ids in another order → passes (ids compared as a set)', async () => {
			const given = fixture()
			writeSelection({ given, selection: selectionOf({ given }) })
			writeSelection({
				given,
				file: 'selection-serial.json',
				selection: selectionOf({
					given,
					overrides: {
						selected: [
							{ id: 'T4', reasons: ['src/a.ts -> test/a.test.ts'] },
							{ id: 'T0', reasons: ['always'] },
						],
					},
				}),
			})
			writeOutput({ given, output: PRINTED_FAILED_FILE, exit: 1 })
			writeOutput({ given, output: PRINTED_PASSED, serial: true })

			const outcome = await runOne({ given, step: SCOPED_VITEST })
			expect(outcome).toMatchObject({
				status: 'passed',
				note: 'flaky in parallel',
				selection: { ids: ['T0', 'T4'] },
			})
		})

		it('the rerun echoes another base with the same ids → failed, the selection is of another base or tree', async () => {
			const given = fixture()
			writeSelection({ given, selection: selectionOf({ given }) })
			writeSelection({
				given,
				file: 'selection-serial.json',
				selection: selectionOf({ given, overrides: { base: 'f'.repeat(40) } }),
			})
			writeOutput({ given, output: PRINTED_FAILED_FILE, exit: 1 })
			writeOutput({ given, output: PRINTED_PASSED, serial: true })

			const outcome = await runOne({ given, step: SCOPED_VITEST })
			expect(outcome).toMatchObject({
				status: 'failed',
				reason: expect.stringMatching(/another base or tree/),
			})
		})

		it('a scoped script running two vitest invocations, each given --passWithNoTests when it got file arguments → the rerun passes flagged flaky, the selection kept', async () => {
			const given = fixture()
			writeSelection({ given, selection: selectionOf({ given }) })
			writeFiles({
				root: given.root,
				files: {
					vitest: FAKE_VITEST,
					mode: 'flaky',
					'project-b.sh': [
						'printf \'%s\\n\' "$*" >> calls-b.txt',
						'case " $* " in *" --passWithNoTests "*) pass=1 ;; esac',
						'case "$*" in *.test.ts*) files=1 ;; esac',
						'if [ -n "$files" ] && [ -z "$pass" ]; then printf \'No test files found, exiting with code 1\\n\'; exit 1; fi',
						'if [ -n "$files" ]; then printf \'No test files found, exiting with code 0\\n\'; exit 0; fi',
						"printf ' Test Files  1 passed (1)\\n      Tests  2 passed (2)\\n'",
						'',
					].join('\n'),
					'two-vitests.sh': [
						'label=$1; shift',
						'{ env | grep -E "^DIALECTE_(GATE|HANDOVER)_" | sort; echo ---; } >> "env-$label.log"',
						'cp selection.json "$DIALECTE_GATE_SELECTION"',
						'extra=; [ $# -gt 0 ] && extra=--passWithNoTests',
						'sh ./vitest run --project a "$@" $extra; a=$?',
						'sh ./project-b.sh run --project b "$@" $extra; b=$?',
						'[ "$a" -eq 0 ] && [ "$b" -eq 0 ]',
						'',
					].join('\n'),
				},
			})

			const result = await runOne({
				given,
				step: { name: 'two', run: 'sh ./two-vitests.sh vitest', counts: 'tests', scoped: true },
			})

			const callsOfB = readFileSync(join(given.root, 'calls-b.txt'), 'utf8').trim().split('\n')
			expect(callsOfB).toHaveLength(2)
			expect(callsOfB[1]).toContain('--passWithNoTests')
			expect(result).toMatchObject({
				status: 'passed',
				note: 'flaky in parallel',
				selection: { ids: ['T0', 'T4'] },
			})
		})
	},
)

describe('runGateSteps: a stalled scoped step', { timeout: 20_000 }, () => {
	it('silent with no CPU gained for stallAfter → the stall reason kept, no selection verdict, no serial rerun', async () => {
		const given = fixture()
		const clock = createFakeClock()
		const tree = createFakeTree()

		const running = runGateSteps({
			root: given.root,
			steps: [{ name: 'hang', run: 'sleep 2; echo vitest', counts: 'tests', scoped: true }],
			packageJson: {},
			scope: given.scope,
			clock,
			watchdog: { stallAfter: 60_000, checkEvery: 10_000, ...tree },
		})
		await clock.whenPending(1)
		clock.advance(70_000)
		const [result] = await running

		expect(result).toMatchObject({
			status: 'failed',
			reason: expect.stringMatching(/^stalled: no output, no CPU for 1 m/),
		})
		expect(result?.selection).toBeUndefined()
		expect(result?.rerun).toBeUndefined()
		expect(tree.killed).toHaveLength(1)
	})
})
