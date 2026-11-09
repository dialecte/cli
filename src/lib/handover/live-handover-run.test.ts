import { realpathSync, rmSync } from 'node:fs'
import { join } from 'node:path'

import { deadPid } from '../../../test/dead-pid.ts'
import { SCRATCH_REPOSITORY_TIMEOUT } from '../../../test/scratch-checks.constants.ts'
import {
	createScratchRepository,
	temporaryFolder,
	writeFiles,
} from '../../../test/scratch-repository.ts'
import { processStartTime } from '../process-start-time.ts'
import {
	COMMIT_SCRIPT_FILE,
	HANDOVER_LOCK_FILE,
	HANDOVER_RUN_MARKER_FILE,
	REHEARSAL_MARKER_FILE,
} from './handover.constants.ts'
import { readLiveHandoverRun } from './live-handover-run.ts'

import { describe, expect, it } from 'vitest'

const OTHER_START_TIME = 'Thu Jan  1 00:00:00 1970'

/** A hand-over folder holding its script, with the repository's lock naming that script. */
function holdRepository(params: { root: string }): string {
	const folder = temporaryFolder('dialecte-handover-')
	writeFiles({
		root: folder,
		files: { [COMMIT_SCRIPT_FILE]: '#!/bin/sh\nexit 0\n' },
	})
	writeFiles({
		root: params.root,
		files: { [`.git/${HANDOVER_LOCK_FILE}`]: `${join(folder, COMMIT_SCRIPT_FILE)}\n` },
	})
	return folder
}

function markRun(params: { folder: string; pid: number }): void {
	writeFiles({
		root: params.folder,
		files: {
			[HANDOVER_RUN_MARKER_FILE]: `${JSON.stringify({ pid: params.pid, startedAt: '2026-11-08T10:00:00.000Z' })}\n`,
		},
	})
}

/** The rehearsal marker of a clone: `fields` over today's pid and start; a field set to undefined is left out. */
function markClone(params: { root: string; fields: Record<string, unknown> }): void {
	writeFiles({
		root: params.root,
		files: {
			[`.git/${REHEARSAL_MARKER_FILE}`]: `${JSON.stringify({ pid: process.pid, startedAt: '2026-11-08T10:00:00.000Z', ...params.fields })}\n`,
		},
	})
}

/** The run expected in `folder`: matched by real path (the spelling the lock or marker used does not matter). */
function runIn(folder: string): { folder: unknown } {
	return {
		folder: expect.toSatisfy((given: string) => realpathSync(given) === realpathSync(folder)),
	}
}

describe('readLiveHandoverRun in a repository', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('no hand-over lock → undefined', () => {
		expect(readLiveHandoverRun(createScratchRepository())).toBeUndefined()
	})

	it('a lock naming a hand-over whose run marker holds a live pid → that folder', () => {
		const root = createScratchRepository()
		const folder = holdRepository({ root })
		markRun({ folder, pid: process.pid })

		expect(readLiveHandoverRun(root)).toEqual(runIn(folder))
	})

	it('a lock and a run marker whose pid is dead → undefined', () => {
		const root = createScratchRepository()
		const folder = holdRepository({ root })
		markRun({ folder, pid: deadPid() })

		expect(readLiveHandoverRun(root)).toBeUndefined()
	})

	it('a lock with no run marker (a hand-over waiting for a human) → undefined', () => {
		const root = createScratchRepository()
		holdRepository({ root })

		expect(readLiveHandoverRun(root)).toBeUndefined()
	})

	it('a live run marker in a folder no lock names → undefined', () => {
		const root = createScratchRepository()
		const other = temporaryFolder('dialecte-handover-')
		markRun({ folder: other, pid: process.pid })

		expect(readLiveHandoverRun(root)).toBeUndefined()
	})

	it('a lock whose hand-over folder was deleted → undefined, nothing thrown', () => {
		const root = createScratchRepository()
		const folder = holdRepository({ root })
		markRun({ folder, pid: process.pid })
		rmSync(folder, { recursive: true, force: true })

		expect(() => readLiveHandoverRun(root)).not.toThrow()
		expect(readLiveHandoverRun(root)).toBeUndefined()
	})

	it('a lock with a live run and a rehearsal marker naming another folder → the lock is read first', () => {
		const root = createScratchRepository()
		const folder = holdRepository({ root })
		markRun({ folder, pid: process.pid })
		const clonedFor = temporaryFolder('dialecte-handover-')
		markClone({
			root,
			fields: { handover: realpathSync(clonedFor), startTime: processStartTime(process.pid) },
		})

		expect(readLiveHandoverRun(root)).toEqual(runIn(folder))
	})
})

describe(
	'readLiveHandoverRun in a rehearsal clone',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		it('a marker with a live pid, its start time and the real path of a folder → that folder', () => {
			const root = createScratchRepository()
			const folder = realpathSync(temporaryFolder('dialecte-handover-'))
			markClone({ root, fields: { handover: folder, startTime: processStartTime(process.pid) } })

			expect(readLiveHandoverRun(root)).toEqual(runIn(folder))
		})

		it('a marker whose pid is dead (a --keep clone left behind) → undefined', () => {
			const root = createScratchRepository()
			const folder = realpathSync(temporaryFolder('dialecte-handover-'))
			markClone({
				root,
				fields: { pid: deadPid(), handover: folder, startTime: processStartTime(process.pid) },
			})

			expect(readLiveHandoverRun(root)).toBeUndefined()
		})

		it('a pid that runs but started at another time (a reused pid) → undefined', () => {
			const root = createScratchRepository()
			const folder = realpathSync(temporaryFolder('dialecte-handover-'))
			markClone({ root, fields: { handover: folder, startTime: OTHER_START_TIME } })

			expect(readLiveHandoverRun(root)).toBeUndefined()
		})

		it("a live pid and today's marker, with no handover field → undefined", () => {
			const root = createScratchRepository()
			markClone({ root, fields: {} })

			expect(readLiveHandoverRun(root)).toBeUndefined()
		})

		it('a handover field and a live pid, with no startTime → undefined', () => {
			const root = createScratchRepository()
			const folder = realpathSync(temporaryFolder('dialecte-handover-'))
			markClone({ root, fields: { handover: folder } })

			expect(readLiveHandoverRun(root)).toBeUndefined()
		})
	},
)
