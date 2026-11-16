/** `dialecte inbox` reads each repository once: the registry entries it read are handed to the health read. */
import { realpathSync } from 'node:fs'

import { counted } from '../../test/counting-fs.ts'
import { INBOX_HEALTH_NOW } from '../../test/inbox-health.constants.ts'
import {
	addFixture0105,
	addReadyLot,
	createHealthInboxWorkspace,
	inboxHealthIn,
} from '../../test/inbox-health.ts'
import { temporaryFolder } from '../../test/scratch-repository.ts'
import { runInbox } from './inbox.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { HealthInboxWorkspace } from '../../test/inbox-health.types.ts'

vi.mock('node:fs', async (importOriginal) => {
	const { countingFs } = await import('../../test/counting-fs.ts')
	const actual = await importOriginal<typeof import('node:fs')>()
	return countingFs(actual)
})

afterEach(function restoreEnvironment() {
	counted.armed = false
	counted.paths.length = 0
	counted.reads.length = 0
	vi.unstubAllEnvs()
})

const REGISTRY_FOLDER = 'dialecte-handover'

function readCountsOf(reads: readonly string[]): number[] {
	return [...new Set(reads)].map((path) => reads.filter((read) => read === path).length)
}

function healthReadsOf(params: { target: HealthInboxWorkspace; words: string[] }): string[] {
	const reads: string[] = []
	runInbox({
		cwd: params.target.workspace.repository,
		argv: params.words,
		now: INBOX_HEALTH_NOW,
		tmp: temporaryFolder('dialecte-inbox-tmp-'),
		isAlive: () => false,
		seams: { onHealthRead: (common) => reads.push(common) },
	})
	return reads
}

describe('inbox health reads', () => {
	it('a store holding lots and health findings → every registry entry file is read once', () => {
		const target = createHealthInboxWorkspace()
		addFixture0105(target)
		addReadyLot(target)

		counted.armed = true
		inboxHealthIn({ workspace: target })
		counted.armed = false

		const entryReads = counted.reads.filter(
			(path) => path.includes(`/${REGISTRY_FOLDER}/`) && path.endsWith('.json'),
		)
		expect(readCountsOf(entryReads).filter((count) => count !== 1)).toEqual([])
	})

	it('no --repository → the repository is read for health once; --repository other → it is not read for health', () => {
		const target = createHealthInboxWorkspace()
		addFixture0105(target)

		expect({
			all: healthReadsOf({ target, words: [] }),
			other: healthReadsOf({ target, words: ['--repository', 'other'] }),
		}).toEqual({ all: [realpathSync(target.common)], other: [] })
	})
})
