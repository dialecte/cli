import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

import { temporaryFolder } from '../../../test/scratch-repository.ts'
import { makeScratchFolder } from './make-scratch-folder.ts'

import { describe, expect, it } from 'vitest'

/** Where a folder made under `root` sits, and whether its name starts with `purpose`. */
function placementOf(params: { root: string; purpose: string }): {
	parent: string
	prefixed: boolean
} {
	const folder = makeScratchFolder({
		purpose: params.purpose,
		env: { DIALECTE_SCRATCH: params.root },
	})
	return { parent: dirname(folder), prefixed: basename(folder).startsWith(params.purpose) }
}

/** The entries of `root` after two folders of one purpose were made in it. */
function entriesAfterTwo(root: string): string[] {
	const env = { DIALECTE_SCRATCH: root }
	makeScratchFolder({ purpose: 'dialecte-tdd-', env })
	makeScratchFolder({ purpose: 'dialecte-tdd-', env })
	return readdirSync(root)
}

/** The marker of a folder made now under `root`, its time read as within the call or not. */
function markerOfNewFolder(root: string): Record<string, unknown> {
	const before = Date.now()
	const folder = makeScratchFolder({ purpose: 'dialecte-tdd-', env: { DIALECTE_SCRATCH: root } })
	const after = Date.now()
	const file = join(folder, 'scratch.json')
	const marker = existsSync(file)
		? (JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>)
		: {}
	const startedAt = typeof marker.startedAt === 'string' ? Date.parse(marker.startedAt) : Number.NaN
	return {
		pid: marker.pid,
		startedInCall: startedAt >= before - 1000 && startedAt <= after,
		command: marker.command,
	}
}

describe('makeScratchFolder', () => {
	it('a missing root → made, the folder in it named with the purpose prefix', () => {
		const root = join(temporaryFolder('dialecte-scratch-make-'), 'missing', 'root')
		expect(placementOf({ root, purpose: 'dialecte-gate-scope-' })).toEqual({
			parent: root,
			prefixed: true,
		})
	})

	it('two folders of one purpose → two different folders', () => {
		expect(entriesAfterTwo(temporaryFolder('dialecte-scratch-make-'))).toHaveLength(2)
	})

	it('a folder made → its scratch.json names this process, the time it was made and the command line', () => {
		expect(markerOfNewFolder(temporaryFolder('dialecte-scratch-make-'))).toEqual({
			pid: process.pid,
			startedInCall: true,
			command: process.argv.slice(1).join(' '),
		})
	})
})
