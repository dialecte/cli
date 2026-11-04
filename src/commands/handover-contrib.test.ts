/** `handover run`: the `contrib` guard of a contributor, and the rehearsal that makes the contrib record of a tree. */

import {
	CONTRIB_NEVER_RUN,
	NO_GREEN_CONTRIB,
	PROFILE_LOT_MESSAGE,
} from '../../test/handover-profile.constants.ts'
import {
	createBranchToMerge,
	editAgain,
	installAgain,
	editedPackage,
	printCardAgain,
	recordGateAndContrib,
	writeMergeHandoverWithTree,
	writeProfileHandover,
} from '../../test/handover-profile.ts'
import { SCRATCH_REPOSITORY_TIMEOUT } from '../../test/scratch-checks.constants.ts'
import {
	countRuns,
	createCounter,
	gateLinesOf,
	headOf,
	runFolder,
	writeMergeHandover,
} from '../../test/scratch-checks.ts'
import { EDITED_SOURCE_TEXT, SOURCE_FILE } from '../../test/scratch-contrib.constants.ts'
import { counterStep, createContribPackage, runContribIn } from '../../test/scratch-contrib.ts'
import { git, writeFiles } from '../../test/scratch-repository.ts'

import { describe, expect, it } from 'vitest'

/** The guard lines `name` as the run printed them: none when the run has no such guard. */
function guardLines(params: { text: string; name: string }): string[] {
	return params.text
		.split('\n')
		.filter((line) => line.startsWith(`✓ ${params.name} `) || line.startsWith(`✗ ${params.name} `))
}

/** The subject of the commit at HEAD. */
function headSubject(root: string): string {
	return git({ root, args: ['log', '-1', '--format=%s'] }).trim()
}

describe('handover run: the contrib guard', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('contributor without a contrib record → refused at contrib, no commit', async () => {
		const root = editedPackage({ steps: [] })
		const out = writeProfileHandover({ root })
		const head = headOf(root)

		const run = await runFolder({ out })

		expect(guardLines({ text: run.text, name: 'contrib' })).toEqual([
			expect.stringMatching(new RegExp(`^✗ contrib +${NO_GREEN_CONTRIB}`)),
		])
		expect(run.exitCode).toBe(1)
		expect(headOf(root)).toBe(head)
	})

	it('contributor with a green contrib record of another tree → refused at contrib, no commit', async () => {
		const root = editedPackage({ steps: [] })
		await runContribIn({ cwd: root })
		editAgain(root)
		const out = writeProfileHandover({ root })
		const head = headOf(root)

		const run = await runFolder({ out })

		expect(guardLines({ text: run.text, name: 'contrib' })).toEqual([
			expect.stringMatching(new RegExp(`^✗ contrib +${NO_GREEN_CONTRIB}`)),
		])
		expect(run.exitCode).toBe(1)
		expect(headOf(root)).toBe(head)
	})

	it('contributor with a green contrib record of the tree → the contrib guard passes, the lot is committed', async () => {
		const root = editedPackage({ steps: [] })
		await runContribIn({ cwd: root })
		const out = writeProfileHandover({ root })

		const run = await runFolder({ out })

		expect(guardLines({ text: run.text, name: 'contrib' })).toEqual([
			expect.stringMatching(/^✓ contrib\b/),
		])
		expect(run.exitCode).toBe(0)
		expect(headSubject(root)).toBe(PROFILE_LOT_MESSAGE)
	})

	it('contributor with a failed contrib record of the tree → refused naming the failed rows, no commit', async () => {
		const counter = createCounter()
		const root = editedPackage({
			steps: [counterStep({ counter, name: 'type-bench', exitCode: 1 })],
		})
		await runContribIn({ cwd: root })
		const out = writeProfileHandover({ root })
		const head = headOf(root)

		const run = await runFolder({ out })

		expect(guardLines({ text: run.text, name: 'contrib' })).toEqual([
			expect.stringMatching(/^✗ contrib +.*type-bench/),
		])
		expect(run.exitCode).toBe(1)
		expect(headOf(root)).toBe(head)
	})

	it('contributor with a green contrib record of the tree → the contrib guard stands between references and mutation', async () => {
		const root = editedPackage({ steps: [] })
		await runContribIn({ cwd: root })
		const out = writeProfileHandover({ root })

		const run = await runFolder({ out })

		const names = run.text
			.split('\n')
			.flatMap((line) => /^✓ (references|contrib|mutation)\b/.exec(line)?.slice(1) ?? [])
		expect(names).toEqual(['references', 'contrib', 'mutation'])
	})

	it('contributor, a merge lot, a green contrib record of the worktree’s own tree only → refused at contrib, nothing committed', async () => {
		const { root, tip, tree } = createBranchToMerge({})
		await runContribIn({ cwd: root })
		const out = writeMergeHandoverWithTree({ root, tip, tree })
		const head = headOf(root)

		const run = await runFolder({ out })

		expect(guardLines({ text: run.text, name: 'contrib' })).toEqual([
			expect.stringMatching(new RegExp(`^✗ contrib +${NO_GREEN_CONTRIB}`)),
		])
		expect(run.exitCode).toBe(1)
		expect(headOf(root)).toBe(head)
	})

	it('contributor with a green contrib record of the tree, then a new install → refused at contrib, no commit', async () => {
		const root = editedPackage({ steps: [] })
		installAgain(root)
		await runContribIn({ cwd: root })
		writeFiles({ root, files: { 'node_modules/.package-lock.json': '{"packages":{"a":{}}}\n' } })
		const out = writeProfileHandover({ root })
		const head = headOf(root)

		const run = await runFolder({ out })

		expect(guardLines({ text: run.text, name: 'contrib' })).toEqual([
			expect.stringMatching(new RegExp(`^✗ contrib +${NO_GREEN_CONTRIB}`)),
		])
		expect(run.exitCode).toBe(1)
		expect(headOf(root)).toBe(head)
	})

	it('consumer → no contrib guard line', async () => {
		const root = editedPackage({ profile: null })
		const out = writeProfileHandover({ root })

		const run = await runFolder({ out })

		expect(guardLines({ text: run.text, name: 'contrib' })).toEqual([])
		expect(run.exitCode).toBe(0)
	})
})

describe(
	'handover run --rehearse: the contrib record of a tree',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		it('contributor, a merge lot and no contrib record of the merged tree → contrib runs in the clone and the card reads it · rehearsal', async () => {
			const counter = createCounter()
			const root = createContribPackage({ steps: [counterStep({ counter, name: 'bench' })] })
			git({ root, args: ['checkout', '-q', '-b', 'feat/x'] })
			writeFiles({ root, files: { [SOURCE_FILE]: EDITED_SOURCE_TEXT } })
			git({ root, args: ['commit', '-q', '-am', 'feat(a): the branch work'] })
			const tip = headOf(root)
			git({ root, args: ['checkout', '-q', 'main'] })
			const { out } = writeMergeHandover({ root, tip })

			const run = await runFolder({ out, argv: ['--rehearse'] })

			expect(countRuns(counter)).toBe(1)
			expect(run.text).toMatch(/✓ contrib +rules · bench · release · rehearsal/)
			expect(run.exitCode).toBe(0)
		})

		it('contributor, a plain lot and no contrib record of its tree → contrib runs once in the clone and the card reads it · rehearsal', async () => {
			const counter = createCounter()
			const root = editedPackage({ steps: [counterStep({ counter, name: 'bench' })] })
			const out = writeProfileHandover({ root })

			const run = await runFolder({ out, argv: ['--rehearse'] })

			expect(countRuns(counter)).toBe(1)
			expect(run.text).toMatch(/✓ contrib +rules · bench · release · rehearsal/)
			expect(run.exitCode).toBe(0)
		})

		it('contributor, a plain lot rehearsed → the card of the repository reads the rehearsal record · rehearsal', async () => {
			const counter = createCounter()
			const root = editedPackage({ steps: [counterStep({ counter, name: 'bench' })] })
			const out = writeProfileHandover({ root })
			await runFolder({ out, argv: ['--rehearse'] })

			const text = printCardAgain(out)

			expect(gateLinesOf(text)).toContain('✓ contrib rules · bench · release · rehearsal')
		})

		it('contributor, a merge lot rehearsed, then run → the contrib guard passes, the merge is committed', async () => {
			const counter = createCounter()
			const { root, tip, tree } = createBranchToMerge({
				steps: [counterStep({ counter, name: 'bench' })],
			})
			const out = writeMergeHandoverWithTree({ root, tip, tree })
			await runFolder({ out, argv: ['--rehearse'] })

			const run = await runFolder({ out })

			expect(guardLines({ text: run.text, name: 'contrib' })).toEqual([
				expect.stringMatching(/^✓ contrib\b/),
			])
			expect(run.exitCode).toBe(0)
			expect(headSubject(root)).toBe('merge: bring feat/x in')
		})

		it('contributor, a merge lot that changes dialecte.contrib.steps, rehearsed → a line names the contrib steps as why the clone’s record cannot answer the run, and the guard does not advise running contrib alone', async () => {
			const { root, tip, tree } = createBranchToMerge({
				branchSteps: [{ name: 'bench', run: 'true' }],
			})
			const out = writeMergeHandoverWithTree({ root, tip, tree })

			const run = await runFolder({ out, argv: ['--rehearse'] })

			const lines = run.text.split('\n')
			expect(lines.some((line) => line.includes('contrib steps'))).toBe(true)
			expect(
				lines.filter(
					(line) => line.includes('run dialecte contrib') && !line.includes('contrib steps'),
				),
			).toEqual([])
		})

		it('contributor, a rehearsal refused at contrib → the guard line is marked ! and says the real run refuses', async () => {
			const root = editedPackage({
				steps: [counterStep({ counter: createCounter(), name: 'type-bench', exitCode: 1 })],
			})
			await runContribIn({ cwd: root })
			const out = writeProfileHandover({ root })

			const run = await runFolder({ out, argv: ['--rehearse'] })

			expect(run.text.split('\n').filter((line) => /^[!✓✗] contrib\b/.test(line))).toEqual([
				expect.stringMatching(/^! contrib\b.*the real run refuses/),
			])
		})

		it('contributor, a plain lot rehearsed, then run → the contrib guard passes, the lot is committed', async () => {
			const counter = createCounter()
			const root = editedPackage({ steps: [counterStep({ counter, name: 'bench' })] })
			const out = writeProfileHandover({ root })
			await runFolder({ out, argv: ['--rehearse'] })

			const run = await runFolder({ out })

			expect(guardLines({ text: run.text, name: 'contrib' })).toEqual([
				expect.stringMatching(/^✓ contrib\b/),
			])
			expect(run.exitCode).toBe(0)
			expect(headSubject(root)).toBe(PROFILE_LOT_MESSAGE)
		})

		it('contributor, a plain lot and a green contrib record of its tree → contrib is not run again', async () => {
			const counter = createCounter()
			const root = editedPackage({ steps: [counterStep({ counter, name: 'bench' })] })
			await recordGateAndContrib(root)
			const out = writeProfileHandover({ root })
			const runsBefore = countRuns(counter)

			const run = await runFolder({ out, argv: ['--rehearse'] })

			expect(runsBefore).toBe(1)
			expect(countRuns(counter)).toBe(runsBefore)
			expect(run.text).not.toContain(CONTRIB_NEVER_RUN)
			expect(run.exitCode).toBe(0)
		})
	},
)
