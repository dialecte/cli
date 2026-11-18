/** `createModuleResolver` over a file set (a base's): it resolves to files the disk no longer holds. */
import { temporaryFolder, writeFiles } from '../../../test/scratch-repository.ts'
import { createModuleResolver, fileSetHost } from './module-resolver.ts'

import { describe, expect, it } from 'vitest'

const TSCONFIG = `${JSON.stringify({ compilerOptions: { baseUrl: '.', paths: { '@core/*': ['src/core/*'] } } })}\n`

describe('createModuleResolver: a host over a file set', () => {
	const testCases: Record<string, { specifier: string; baseFiles: string[]; expected: string }> = {
		'a relative import of a file the change renamed away → the base file': {
			specifier: './old-name.ts',
			baseFiles: ['src/use.ts', 'src/old-name.ts'],
			expected: 'src/old-name.ts',
		},
		'a tsconfig paths alias to a file the change renamed away → the base file': {
			specifier: '@core/old-name',
			baseFiles: ['src/use.ts', 'src/core/old-name.ts'],
			expected: 'src/core/old-name.ts',
		},
	}

	for (const [title, testCase] of Object.entries(testCases))
		it(title, () => {
			// the disk holds the tree: the renamed file under its new name only
			const root = temporaryFolder('dialecte-resolver-')
			writeFiles({
				root,
				files: {
					'tsconfig.json': TSCONFIG,
					'src/use.ts': 'export {}\n',
					'src/new-name.ts': 'export {}\n',
					'src/core/new-name.ts': 'export {}\n',
				},
			})

			const resolver = createModuleResolver({
				root,
				host: fileSetHost({ root, files: testCase.baseFiles }),
			})

			expect(resolver({ specifier: testCase.specifier, from: 'src/use.ts' })).toEqual({
				kind: 'local',
				file: testCase.expected,
			})
		})
})
