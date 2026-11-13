import { SOURCE_FILE_PATTERN } from './tdd.constants.ts'

/**
 * Whether a dependency of a test file is data (a fixture, a document, a snapshot) rather than code: its extension
 * is not a script extension. A red run freezes the data dependencies of a file whose cases are accepted, never its
 * code dependencies.
 */
export function isDataDependency(path: string): boolean {
	return !SOURCE_FILE_PATTERN.test(path)
}
