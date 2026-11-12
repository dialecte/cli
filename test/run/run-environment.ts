import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { loadRunEnvironment } from '../../src/lib/run/load-run-environment.ts'
import { NAMESPACES, TEST_DIALECTE_PACKAGE } from './run-environment.constants.ts'

import type { RunEnvironment } from '../../src/lib/run/run.types.ts'

/**
 * The environment of the cli's run tests: core's own test dialecte (`@dialecte/core/test`), from the
 * core build `DIALECTE_CORE_DIR` names (a core checkout, built), or else the core installed with the cli.
 */
export async function loadTestEnvironment(): Promise<RunEnvironment> {
	return loadRunEnvironment({
		projectDirectory: testProjectDirectory(),
		packageName: TEST_DIALECTE_PACKAGE,
	})
}

/**
 * Where the run tests resolve `@dialecte/core` from: `DIALECTE_CORE_DIR` (a built core checkout) when
 * set, the cli itself otherwise (its `@dialecte/core` devDependency). Neither → the tests fail, loudly.
 */
export function testProjectDirectory(): string {
	if (process.env.DIALECTE_CORE_DIR) return resolve(process.env.DIALECTE_CORE_DIR)
	const cliRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
	try {
		createRequire(join(cliRoot, 'package.json')).resolve(TEST_DIALECTE_PACKAGE)
	} catch {
		throw new Error(
			'run tests: no @dialecte/core to run on - install the devDependency (npm install) or set DIALECTE_CORE_DIR to a built core checkout',
		)
	}
	return cliRoot
}

/** An XML file of core's test dialecte, its root's namespaces declared. */
export function testFile(params: { body: string; name?: string }): File {
	const xml = `<?xml version="1.0" encoding="UTF-8"?><Root ${NAMESPACES}>${params.body}</Root>`
	return new File([xml], params.name ?? 'input.xml', { type: 'application/xml' })
}
