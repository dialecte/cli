import { existsSync } from 'node:fs'
import { join } from 'node:path'

import type { CommandOutput } from './command-output.types.ts'

/** A lookup reads the package where it runs: without a package.json there, a usage error saying so. */
export function missingPackage(params: { cwd: string }): CommandOutput | undefined {
	return existsSync(join(params.cwd, 'package.json'))
		? undefined
		: {
				output: `no package.json in ${params.cwd}: run dialecte in your package's folder\n`,
				exitCode: 2,
			}
}
