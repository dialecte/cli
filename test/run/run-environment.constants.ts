import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** The package whose dialecte the run tests drive: core's own test dialecte. */
export const TEST_DIALECTE_PACKAGE = '@dialecte/core/test'

/** The fixtures of the run command's tests. */
export const RUN_FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'run')

/** The namespaces the root of a test file of core's test dialecte declares. */
export const NAMESPACES =
	'xmlns="http://dialecte.dev/XML/DEFAULT" xmlns:dev="http://dialecte.dev/XML/DEV" xmlns:ext="http://dialecte.dev/XML/DEV-EXT"'
