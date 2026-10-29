/**
 * A throwaway package that tests with vitest, for the commands that run a package's tests: a git repository
 * whose `node_modules` holds a link to the cli's own vitest (and its `.bin`), so `npx --no-install vitest`
 * runs there offline, and test files import `vitest` as in a real package.
 */
import { mkdirSync, symlinkSync } from 'node:fs'
import { join } from 'node:path'

import { createScratchRepository } from './scratch-repository.ts'
import { VITEST_FOLDER } from './scratch-vitest-package.constants.ts'

/** A repository on `main` with one commit holding a vitest package and `files`, removed when the test ends. */
export function createVitestPackage(params: {
	files?: Record<string, string>
	devDependencies?: Record<string, string>
	dialecte?: Record<string, unknown>
}): string {
	const root = createScratchRepository({
		'package.json': `${JSON.stringify(
			{
				name: 'demo',
				type: 'module',
				devDependencies: { vitest: '^4.1.8', ...params.devDependencies },
				...(params.dialecte && { dialecte: params.dialecte }),
			},
			null,
			'\t',
		)}\n`,
		'.gitignore': 'node_modules\n',
		...params.files,
	})
	mkdirSync(join(root, 'node_modules', '.bin'), { recursive: true })
	symlinkSync(VITEST_FOLDER, join(root, 'node_modules', 'vitest'))
	symlinkSync(join('..', 'vitest', 'vitest.mjs'), join(root, 'node_modules', '.bin', 'vitest'))
	return root
}
