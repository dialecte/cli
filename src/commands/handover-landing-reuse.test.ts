/**
 * `handover run` and its rehearsal on a package whose commit hook is the real `gate --hook`: the rehearsal clone's hook
 * reads and writes the repository's store, every commit prints what its hook reused and ran, and a real run after a
 * green rehearsal of the same trees and install starts no step.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { commonGitDirOf, hookRecordsOf, readFullRecord } from '../../test/gate-hook.ts'
import {
	ALL_RAN_LANDING,
	ALL_REUSED_LANDING,
	CHECK_STORE_PROBE,
	LANDING_LINE_START,
	LANDING_STEP_NAMES,
} from '../../test/handover-landing.constants.ts'
import {
	createLandingScenario,
	landingLinesOf,
	mergeTreeOf,
	recordMergeTree,
	rehashFolder,
	reusedLandingOf,
	runCounts,
	setTestsPassing,
	writeInstalledLock,
} from '../../test/handover-landing.ts'
import { PACKAGES, PACKAGES_A_NEWER, ROOT_FIELDS_B } from '../../test/install-key.constants.ts'
import { READ_LOT, SCRATCH_REPOSITORY_TIMEOUT } from '../../test/scratch-checks.constants.ts'
import {
	createCounter,
	createHookedPackage,
	editReadLot,
	runFolder,
	writeHandoverFolder,
} from '../../test/scratch-checks.ts'
import { temporaryFolder, writeFiles } from '../../test/scratch-repository.ts'
import { shellQuote } from '../lib/shell-quote.ts'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

beforeEach(function clearStoreVariable() {
	vi.stubEnv('DIALECTE_CHECK_STORE', undefined)
})

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

describe(
	'handover run --rehearse: the clone’s hooks use the repository’s store',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		it('a lot, a hook that records its environment, rehearsed then run for real → the clone’s hook got DIALECTE_CHECK_STORE = the absolute git common dir of the rehearsed repository, the real run’s hook none', async () => {
			const log = join(temporaryFolder('dialecte-probe-'), 'store.log')
			const { root, out } = await createLandingScenario({
				merge: false,
				gated: false,
				hookExtra: CHECK_STORE_PROBE.replace('{log}', shellQuote(log)),
			})

			const rehearsed = await runFolder({ out, argv: ['--rehearse'] })
			const real = await runFolder({ out })

			expect(rehearsed.exitCode).toBe(0)
			expect(real.exitCode).toBe(0)
			// the clone's hook got the repository's store, the real run's hook none
			expect(readFileSync(log, 'utf8').split('\n').filter(Boolean)).toEqual([
				commonGitDirOf(root),
				'unset',
			])
		})

		it('a lot and a merge lot, no record → both clone hooks left a hook-gate record marked as a rehearsal in the repository’s store, before any real run', async () => {
			const { root, out, lotTree } = await createLandingScenario({ merge: true, gated: false })

			const ran = await runFolder({ out, argv: ['--rehearse'] })

			expect(ran.exitCode).toBe(0)
			for (const tree of [lotTree, mergeTreeOf(ran.text)])
				expect(hookRecordsOf({ root, tree })).toEqual(
					expect.arrayContaining([expect.objectContaining({ origin: 'rehearsal' })]),
				)
		})

		it('a green gate --full of the lot’s tree, rehearsed with --full → the clone’s hook answers every step from it: no step runs, the landing line says so', async () => {
			const { out, counters } = await createLandingScenario({ merge: false, gated: true })
			const before = runCounts(counters)

			const ran = await runFolder({ out, argv: ['--rehearse', '--full'] })

			expect(ran.exitCode).toBe(0)
			expect(runCounts(counters)).toEqual(before)
			expect(landingLinesOf({ text: ran.text, start: LANDING_LINE_START })).toEqual([
				expect.stringMatching(ALL_REUSED_LANDING),
			])
		})
	},
)

describe('handover run: the landing line', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('no record of the lot’s tree → the hook ran check, build and tests: the landing line names them, nothing reused', async () => {
		const { out, counters } = await createLandingScenario({ merge: false, gated: false })

		const ran = await runFolder({ out })

		expect(ran.exitCode).toBe(0)
		expect(runCounts(counters)).toEqual([1, 1, 1])
		expect(landingLinesOf({ text: ran.text, start: LANDING_LINE_START })).toEqual([ALL_RAN_LANDING])
	})

	it('the lot rewritten with another file content after its rehearsal → the real run’s hook ran every step of the new tree, the landing line names them', async () => {
		const { root, out, counters } = await createLandingScenario({ merge: false, gated: false })
		const rehearsed = await runFolder({ out, argv: ['--rehearse'] })
		expect(rehearsed.exitCode).toBe(0)
		const before = runCounts(counters)
		writeFiles({ root, files: { 'src/read.ts': 'export function read() {\n\treturn 2\n}\n' } })
		rehashFolder(out)

		const ran = await runFolder({ out })

		expect(ran.exitCode).toBe(0)
		expect(runCounts(counters).map((count, index) => count - before[index])).toEqual(
			LANDING_STEP_NAMES.map(() => 1),
		)
		expect(landingLinesOf({ text: ran.text, start: LANDING_LINE_START })).toEqual([ALL_RAN_LANDING])
	})
})

describe(
	'handover run: a hook that is not gate --hook',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		it('a plain pre-commit printing a test step → no landing line, exit 0', async () => {
			const root = createHookedPackage({
				hookCounter: createCounter(),
				gateCounter: createCounter(),
			})
			editReadLot(root)
			const { out } = writeHandoverFolder({ root, lots: [READ_LOT] })

			const ran = await runFolder({ out })

			expect(ran.exitCode).toBe(0)
			expect(landingLinesOf({ text: ran.text, start: LANDING_LINE_START })).toEqual([])
		})
	},
)

describe(
	'handover run after a green rehearsal of the same trees and install',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		it('a lot gated with gate --full, a merge lot of a moved main, rehearsed → the real run starts no step: every commit’s landing line names the run that answered it and says ran none, the records of both trees are the real run’s, exit 0', async () => {
			const { root, out, counters, lotTree } = await createLandingScenario({
				merge: true,
				gated: true,
			})
			const full = readFullRecord(root)
			const rehearsed = await runFolder({ out, argv: ['--rehearse'] })
			expect(rehearsed.exitCode).toBe(0)
			const mergeTree = recordMergeTree({ root, out, lotTree })
			const [rehearsal] = hookRecordsOf({ root, tree: mergeTree })
			const before = runCounts(counters)

			const ran = await runFolder({ out })

			expect(ran.exitCode).toBe(0)
			expect(runCounts(counters)).toEqual(before)
			expect(landingLinesOf({ text: ran.text, start: LANDING_LINE_START })).toEqual([
				reusedLandingOf({ mode: 'full', at: full.at }),
				reusedLandingOf({ mode: 'hook-gate', at: rehearsal.at }),
			])
			// the real run's hook records replace the rehearsal's: none is marked as a rehearsal's
			for (const tree of [lotTree, mergeTree])
				expect(hookRecordsOf({ root, tree }).map((record) => record.origin)).toEqual([undefined])
		})

		it('the installed packages changed between the rehearsal and the real run → both hooks ran every step, the landing lines name them', async () => {
			const { root, out, counters, lotTree } = await createLandingScenario({
				merge: true,
				gated: true,
			})
			const rehearsed = await runFolder({ out, argv: ['--rehearse'] })
			expect(rehearsed.exitCode).toBe(0)
			recordMergeTree({ root, out, lotTree })
			const before = runCounts(counters)
			writeInstalledLock({ root, packages: PACKAGES_A_NEWER })

			const ran = await runFolder({ out })

			expect(ran.exitCode).toBe(0)
			expect(runCounts(counters).map((count, index) => count - before[index])).toEqual([2, 2, 2])
			expect(landingLinesOf({ text: ran.text, start: LANDING_LINE_START })).toEqual([
				ALL_RAN_LANDING,
				ALL_RAN_LANDING,
			])
		})

		it('the rehearsal’s hook failed on the merge lot (a failing test step) → the real run’s hook runs the merge lot’s steps again, the first lot’s hook answers', async () => {
			const { root, out, counters, requires, lotTree } = await createLandingScenario({
				merge: true,
				gated: true,
			})
			setTestsPassing({ requires, passing: false })
			const rehearsed = await runFolder({ out, argv: ['--rehearse'] })
			expect(rehearsed.exitCode).not.toBe(0)
			recordMergeTree({ root, out, lotTree })
			const before = runCounts(counters)
			setTestsPassing({ requires, passing: true })

			const ran = await runFolder({ out })

			expect(ran.exitCode).toBe(0)
			expect(runCounts(counters).map((count, index) => count - before[index])).toEqual([1, 1, 1])
			expect(landingLinesOf({ text: ran.text, start: LANDING_LINE_START })).toEqual([
				expect.stringMatching(ALL_REUSED_LANDING),
				ALL_RAN_LANDING,
			])
		})

		it('the same packages written with another root version and name between the rehearsal and the real run → nothing runs', async () => {
			const { root, out, counters, lotTree } = await createLandingScenario({
				merge: true,
				gated: true,
			})
			const rehearsed = await runFolder({ out, argv: ['--rehearse'] })
			expect(rehearsed.exitCode).toBe(0)
			recordMergeTree({ root, out, lotTree })
			const before = runCounts(counters)
			writeInstalledLock({
				root,
				fields: { ...ROOT_FIELDS_B, version: '9.9.9' },
				packages: PACKAGES,
			})

			const ran = await runFolder({ out })

			expect(ran.exitCode).toBe(0)
			expect(runCounts(counters)).toEqual(before)
			expect(landingLinesOf({ text: ran.text, start: LANDING_LINE_START })).toEqual([
				expect.stringMatching(ALL_REUSED_LANDING),
				expect.stringMatching(ALL_REUSED_LANDING),
			])
		})
	},
)
