import { join } from 'node:path'

import { temporaryFolder } from '../../../test/scratch-repository.ts'
import { formerScratchRoots } from './former-scratch-roots.ts'

import { describe, expect, it, vi } from 'vitest'

describe('formerScratchRoots', () => {
	const testCases: Record<string, { platform: NodeJS.Platform; short: string[] }> = {
		'macOS → the system temporary folder, then the short root /tmp': {
			platform: 'darwin',
			short: ['/tmp'],
		},
		'Linux → the system temporary folder, then the short root /tmp': {
			platform: 'linux',
			short: ['/tmp'],
		},
		'Windows → the system temporary folder only': { platform: 'win32', short: [] },
	}

	it.each(Object.entries(testCases))('%s', (_name, testCase) => {
		const temporary = join(temporaryFolder('dialecte-former-roots-'), 'T')
		vi.stubEnv('TMPDIR', temporary)
		vi.stubEnv('TMP', temporary)
		vi.stubEnv('TEMP', temporary)
		try {
			expect(formerScratchRoots({ platform: testCase.platform })).toEqual([
				temporary,
				...testCase.short,
			])
		} finally {
			vi.unstubAllEnvs()
		}
	})
})
