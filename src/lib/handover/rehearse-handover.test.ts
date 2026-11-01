/** Where `handover run --rehearse` makes its rehearsal folder. */
import { rehearsalScratchRoot } from './rehearse-handover.ts'

import { describe, expect, it } from 'vitest'

describe('rehearsalScratchRoot: a short folder on a POSIX system, the system temporary folder elsewhere', () => {
	const rows: { platform: NodeJS.Platform; systemTemporaryFolder: string; root: string }[] = [
		{
			platform: 'darwin',
			systemTemporaryFolder: '/var/folders/nf/mz0fk8xj5w9cr7f9l6myqb980000gn/T',
			root: '/tmp',
		},
		{ platform: 'darwin', systemTemporaryFolder: '/tmp', root: '/tmp' },
		{ platform: 'linux', systemTemporaryFolder: '/home/dev/.cache/tmp/build', root: '/tmp' },
		{ platform: 'linux', systemTemporaryFolder: '/tmp', root: '/tmp' },
		{
			platform: 'win32',
			systemTemporaryFolder: 'C:\\Users\\dev\\AppData\\Local\\Temp',
			root: 'C:\\Users\\dev\\AppData\\Local\\Temp',
		},
	]
	for (const row of rows)
		it(`${row.platform}, the system temporary folder ${row.systemTemporaryFolder} → ${row.root}`, () => {
			expect(
				rehearsalScratchRoot({
					platform: row.platform,
					systemTemporaryFolder: row.systemTemporaryFolder,
				}),
			).toBe(row.root)
		})
})
