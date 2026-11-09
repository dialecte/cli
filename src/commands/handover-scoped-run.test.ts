/**
 * `handover run` (real and `--rehearse`) on a package with a scoped step: the config validated before the guards
 * (A11), the hand-over base resolved once and handed to every hook with the hand-over folder, the rehearsal marker
 * that names the run, and a two-lot hand-over on the base branch whose second hook reuses the `--full` record (A4).
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'

import { ISO_TIME_PATTERN } from '../../test/gate-records.constants.ts'
import { readRecordFile } from '../../test/gate-records.ts'
import { FEATURE_BRANCH } from '../../test/scoped-gate-package.constants.ts'
import { createScopedStep, readScopedRuns } from '../../test/scoped-gate-package.ts'
import { GATE_HOOK_SCRIPT } from '../../test/scoped-hook-package.constants.ts'
import {
	createScopedHookedPackage,
	createScopedNonTestStep,
	gateOfLayout,
	handoverEnvironmentProbe,
} from '../../test/scoped-hook-package.ts'
import {
	HOOK_RECORD_FILE,
	READ_LOT,
	SCRATCH_REPOSITORY_TIMEOUT,
	SHORT_SHA_LENGTH,
} from '../../test/scratch-checks.constants.ts'
import {
	countRuns,
	countingStep,
	createCounter,
	editReadLot,
	headOf,
	runFolder,
	runGateIn,
	writeHandoverFolder,
} from '../../test/scratch-checks.ts'
import { git, temporaryFolder } from '../../test/scratch-repository.ts'
import { hashHookCommand } from '../lib/gate-records/check-key.ts'
import { INVALID_STEP, INVALID_STEP_PROBLEMS } from '../lib/gate/gate-config.constants.ts'
import { REHEARSAL_MARKER_FILE } from '../lib/handover/handover.constants.ts'
import { processStartTime } from '../lib/process-start-time.ts'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { GateLayout } from '../../test/scoped-hook-package.types.ts'
import type { GateRecord } from '../lib/gate-records/gate-records.types.ts'

/** The variables a hand-over run hands its hooks: a test's own shell may hold them (a hand-over running this suite). */
const HANDOVER_VARIABLES = ['DIALECTE_HANDOVER_BASE', 'DIALECTE_HANDOVER_FOLDER']

beforeEach(function clearHandoverVariables() {
	for (const name of HANDOVER_VARIABLES) vi.stubEnv(name, undefined)
})

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** What the hook saw of the two variables, one `base|folder` line per run (`unset` when absent). */
function readProbe(log: string): string[] {
	return existsSync(log) ? readFileSync(log, 'utf8').split('\n').filter(Boolean) : []
}

/** A feature-branch package whose hook records the variables it got; its lot edited and handed over. */
function probedHandOver(params: { layout: GateLayout }) {
	const log = join(temporaryFolder('dialecte-probe-'), 'env.log')
	const root = createScopedHookedPackage({
		gate: gateOfLayout({
			layout: params.layout,
			scoped: createScopedStep().step,
			plain: countingStep({ counter: createCounter() }),
		}),
		hookScript: handoverEnvironmentProbe(log),
		onFeatureBranch: true,
	})
	editReadLot(root)
	const { out } = writeHandoverFolder({ root, lots: [READ_LOT], branch: FEATURE_BRANCH })
	const base = git({ root, args: ['merge-base', 'HEAD', 'main'] }).trim()
	return { root, out, base, log }
}

describe('handover run: what the hooks are handed', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it.each([
		{ label: 'a real run', argv: [] as string[] },
		{ label: 'a rehearsal', argv: ['--rehearse'] },
	])(
		'$label on a scoped package → the hook got the merge-base of the lots file HEAD and the base branch, and the real path of the hand-over folder',
		async ({ argv }) => {
			const { out, base, log } = probedHandOver({ layout: 'full' })

			const ran = await runFolder({ out, argv })

			expect(ran.exitCode).toBe(0)
			expect(readProbe(log)).toEqual([`${base}|${realpathSync(out)}`])
		},
	)

	it.each([
		{ label: 'a real run', layout: 'none' as const, argv: [] as string[] },
		{ label: 'a rehearsal', layout: 'none' as const, argv: ['--rehearse'] },
		{ label: 'a real run, the only scoped step in fast', layout: 'fast-only' as const, argv: [] },
		{
			label: 'a rehearsal, the only scoped step in fast',
			layout: 'fast-only' as const,
			argv: ['--rehearse'],
		},
		{
			label: 'a real run, the only scoped step in release',
			layout: 'release-only' as const,
			argv: [],
		},
		{
			label: 'a rehearsal, the only scoped step in release',
			layout: 'release-only' as const,
			argv: ['--rehearse'],
		},
	])(
		'$label: no scoped step in the full test steps → the hook got neither variable',
		async ({ argv, layout }) => {
			const { out, log } = probedHandOver({ layout })

			const ran = await runFolder({ out, argv })

			expect(ran.exitCode).toBe(0)
			expect(readProbe(log)).toEqual(['unset|unset'])
		},
	)
})

describe(
	'handover run --rehearse: the marker of the clone names the run',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		it.each([{ layout: 'full' as const }, { layout: 'none' as const }])(
			'layout $layout → { pid, startedAt, handover, startTime }: the real path of the hand-over folder and the start time of the owner',
			async ({ layout }) => {
				const { root, out } = probedHandOver({ layout })

				const ran = await runFolder({ out, argv: ['--rehearse', '--keep'] })

				const clone = join(ran.scratchRoot, ran.rehearsalFolders[0] ?? '', basename(root))
				const marker: unknown = JSON.parse(
					readFileSync(join(clone, '.git', REHEARSAL_MARKER_FILE), 'utf8'),
				)
				expect(ran.exitCode).toBe(0)
				expect(marker).toEqual({
					pid: process.pid,
					startedAt: expect.stringMatching(ISO_TIME_PATTERN),
					handover: realpathSync(out),
					startTime: processStartTime(process.pid),
				})
			},
		)
	},
)

describe(
	'A11: handover run on a package whose gate config is invalid',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		const MESSAGE = INVALID_STEP.replace('{list}', 'dialecte.gate.fast')
			.replace('{step}', '"both"')
			.replace('{problem}', INVALID_STEP_PROBLEMS.scopedWithChangedOnly)

		it.each([
			{ label: 'a real run', argv: [] as string[] },
			{ label: 'a rehearsal', argv: ['--rehearse'] },
		])(
			'$label → refused before the guards: exit 2 with the message, nothing staged, no commit, no clone',
			async ({ argv }) => {
				const { root, out } = probedHandOver({ layout: 'full' })
				const head = headOf(root)
				// the config breaks after the hand-over was written
				const broken = [{ name: 'both', run: 'true', scoped: true, changedOnly: true }]
				writeFileSync(
					join(root, 'package.json'),
					`${JSON.stringify({ name: 'demo', scripts: {}, dialecte: { gate: { fast: broken, full: broken } } })}\n`,
				)

				await expect(runFolder({ out, argv })).resolves.toMatchObject({
					exitCode: 2,
					text: expect.stringContaining(MESSAGE),
					rehearsalFolders: [],
				})

				expect(git({ root, args: ['diff', '--cached', '--name-only'] })).toBe('')
				expect(headOf(root)).toBe(head)
			},
		)
	},
)

/** sha256 of the hook's files folded with the base, as the hook record's command hash holds it. */
function foldedHookHash(params: { hook: string; gateBase: string }): string {
	return createHash('sha256')
		.update(JSON.stringify({ hook: params.hook, gateBase: params.gateBase }))
		.digest('hex')
}

describe(
	'a two-lot hand-over on the base branch whose only scoped full step counts no test',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		it('gate --full green on the final tree first → both hooks got the hand-over variables, the second commit reuses that record without running a test step, no hook prints a base line', async () => {
			const counter = createCounter()
			const log = join(temporaryFolder('dialecte-probe-'), 'env.log')
			const scoped = createScopedNonTestStep()
			const plain = countingStep({ counter, name: 'tests' })
			const root = createScopedHookedPackage({
				gate: { fast: [plain], full: [scoped.step, plain] },
				hookScript: [handoverEnvironmentProbe(log), GATE_HOOK_SCRIPT].join('\n'),
			})
			editReadLot(root)
			const base = headOf(root)
			const fullGate = await runGateIn({ cwd: root, argv: ['--full'] })
			expect(fullGate.exitCode).toBe(0)
			const { out } = writeHandoverFolder({
				root,
				lots: [
					{ paths: ['src/read.ts'], message: 'feat(read): read answers one' },
					{ paths: ['CHANGELOG.md'], message: 'docs(changelog): note the read' },
				],
			})

			const ran = await runFolder({ out })

			expect(ran.exitCode).toBe(0)
			const finalTree = git({ root, args: ['rev-parse', 'HEAD^{tree}'] }).trim()
			const logs = [...ran.text.matchAll(/full log: (\S+)/g)].map((match) =>
				readFileSync(match[1], 'utf8'),
			)
			expect(logs).toHaveLength(2)
			expect(readProbe(log)).toEqual([
				`${base}|${realpathSync(out)}`,
				`${base}|${realpathSync(out)}`,
			])
			// the gate's own run, then the first commit's hook; the second commit's hook ran no test step
			expect(countRuns(counter)).toBe(2)
			expect(logs[1]).toContain(
				`gate --hook: tests reused from gate --full green on tree ${finalTree.slice(0, SHORT_SHA_LENGTH)}`,
			)
			for (const hookLog of logs) expect(hookLog).not.toContain('gate --hook: base')
		})
	},
)

describe(
	'A4: a two-lot hand-over committing on the base branch',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		it('gate --full green on the final tree first → the second commit reuses that record with the hand-over base, not its HEAD; the first commit ran the step with the hand-over base on its own tree', async () => {
			const scoped = createScopedStep()
			const root = createScopedHookedPackage({
				gate: { fast: [scoped.step], full: [scoped.step] },
				hookScript: GATE_HOOK_SCRIPT,
			})
			editReadLot(root)
			const base = headOf(root)
			const hook = hashHookCommand(root)
			const fullGate = await runGateIn({ cwd: root, argv: ['--full'] })
			expect(fullGate.exitCode).toBe(0)
			const { out } = writeHandoverFolder({
				root,
				lots: [
					{ paths: ['src/read.ts'], message: 'feat(read): read answers one' },
					{ paths: ['CHANGELOG.md'], message: 'docs(changelog): note the read' },
				],
			})

			const ran = await runFolder({ out })

			expect(ran.exitCode).toBe(0)
			const firstTree = git({ root, args: ['rev-parse', 'HEAD~1^{tree}'] }).trim()
			const finalTree = git({ root, args: ['rev-parse', 'HEAD^{tree}'] }).trim()
			const logs = [...ran.text.matchAll(/full log: (\S+)/g)].map((match) =>
				readFileSync(match[1], 'utf8'),
			)
			// the gate's own run on the final tree, then the first commit's hook; the second commit's hook ran nothing
			expect(readScopedRuns(scoped)).toEqual([
				{ base, tree: finalTree },
				{ base, tree: firstTree },
			])
			expect(logs).toHaveLength(2)
			expect(logs[0]).toContain(`gate --hook: base ${base} (handover), selected T0`)
			expect(logs[1]).toContain(
				`gate --hook: tests reused from gate --full green on tree ${finalTree.slice(0, SHORT_SHA_LENGTH)}`,
			)
			expect(logs[1]).toContain(`gate --hook: base ${base} (handover), reused`)
			const record = readRecordFile<GateRecord>({ root, name: HOOK_RECORD_FILE })
			expect(record?.base).toMatchObject({ commit: base })
			expect(record?.key?.commandHash).toBe(foldedHookHash({ hook, gateBase: base }))
		})

		it('--rehearse, no record to reuse (the clone keeps its own store) → the clone’s real gate --hook of each lot got the hand-over base: its base line says (handover) with the base of the lots file HEAD, the second commit not its HEAD', async () => {
			const scoped = createScopedStep()
			const root = createScopedHookedPackage({
				gate: { fast: [scoped.step], full: [scoped.step] },
				hookScript: GATE_HOOK_SCRIPT,
			})
			editReadLot(root)
			const base = headOf(root)
			const { out } = writeHandoverFolder({
				root,
				lots: [
					{ paths: ['src/read.ts'], message: 'feat(read): read answers one' },
					{ paths: ['CHANGELOG.md'], message: 'docs(changelog): note the read' },
				],
			})

			const ran = await runFolder({ out, argv: ['--rehearse'] })

			expect(ran.exitCode).toBe(0)
			const logs = [...ran.text.matchAll(/full log: (\S+)/g)].map((match) =>
				readFileSync(match[1], 'utf8'),
			)
			expect(logs).toHaveLength(2)
			for (const log of logs)
				expect(log).toContain(`gate --hook: base ${base} (handover), selected T0`)
			expect(readScopedRuns(scoped).map((run) => run.base)).toEqual([base, base])
		})
	},
)
