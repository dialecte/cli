/** Where `handover run --rehearse` makes its rehearsal folder and its hook's temporary folder. */
import { rmSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { temporaryFolder } from '../../../test/scratch-repository.ts'
import { machineScratchRoots, makeHookTemporaryFolder } from './rehearse-handover.ts'

import { describe, expect, it, vi } from 'vitest'

/** The longest socket a hook's tool makes under its TMPDIR: tsx's IPC pipe, its uid and pid at their widest. */
const LONGEST_SOCKET_SUFFIX = '/tsx-4294967295/4294967295.pipe'

/** The socket path limit of macOS (`sun_path`, the shorter of the POSIX systems). */
const SOCKET_PATH_LIMIT = 104

/** A rehearsal folder where the scratch root puts it in a workspace: a long path. */
function rehearsalFolderInWorkspace(): string {
	return join(
		temporaryFolder('dialecte-rehearsal-workspace-'),
		'.worktrees',
		'_scratch',
		'dialecte-rehearse-AbCdEf',
	)
}

/** The hook's temporary folder made for a rehearsal on `platform`, read through `read`, then removed. */
function readHookFolder<T>(params: {
	platform: NodeJS.Platform
	rehearsalFolder: string
	read: (folder: string) => T
}): T {
	const folder = makeHookTemporaryFolder(params)
	try {
		return params.read(folder)
	} finally {
		rmSync(folder, { recursive: true, force: true })
	}
}

describe('the rehearsal hook temporary folder', () => {
	it('a POSIX system, a rehearsal folder deep in a workspace → a folder of its own directly under /tmp', () => {
		expect(
			readHookFolder({
				platform: 'darwin',
				rehearsalFolder: rehearsalFolderInWorkspace(),
				read: dirname,
			}),
		).toBe('/tmp')
	})

	it('a POSIX system → its longest tool socket path stays under the 104-byte limit', () => {
		expect(
			readHookFolder({
				platform: 'linux',
				rehearsalFolder: rehearsalFolderInWorkspace(),
				read: (folder) =>
					Buffer.byteLength(`${folder}${LONGEST_SOCKET_SUFFIX}`) < SOCKET_PATH_LIMIT,
			}),
		).toBe(true)
	})

	it("Windows → the rehearsal folder's .tmp", () => {
		const rehearsalFolder = rehearsalFolderInWorkspace()
		expect(readHookFolder({ platform: 'win32', rehearsalFolder, read: (folder) => folder })).toBe(
			join(rehearsalFolder, '.tmp'),
		)
	})
})

describe('the machine scratch roots', () => {
	it('DIALECTE_SCRATCH set → rehearsals made in it, the short POSIX root read as the former one', () => {
		const scratch = temporaryFolder('dialecte-rehearsal-scratch-')
		vi.stubEnv('DIALECTE_SCRATCH', scratch)
		try {
			expect(machineScratchRoots({ cwd: scratch })).toEqual({
				scratchRoot: scratch,
				formerScratchRoot: process.platform === 'win32' ? expect.any(String) : '/tmp',
				scratchFolderRoot: scratch,
			})
		} finally {
			vi.unstubAllEnvs()
		}
	})
})
