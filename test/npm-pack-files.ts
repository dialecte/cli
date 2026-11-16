/**
 * The file paths `npm pack --dry-run --json` lists, in the shapes npm prints: an array of packages (npm up to 11)
 * or an object keyed by package name (npm 12); one bare package object is read too (defensive, no npm seen
 * printing it). A shape holding no package with a files list throws, naming what was printed, so a new shape fails
 * loudly instead of reading as an empty pack.
 */
import type { PackedPackage } from './npm-pack-files.types.ts'

export function packedFilesOf(stdout: string): string[] {
	const printed: unknown = JSON.parse(stdout)
	return packagesOf(printed).flatMap((entry) => entry.files.map((file) => file.path))
}

/** The packages a printed value holds: each element of an array, the object itself, or each value of a keyed object. */
function packagesOf(printed: unknown): PackedPackage[] {
	const packages = Array.isArray(printed)
		? printed.filter(isPackedPackage)
		: isPackedPackage(printed)
			? [printed]
			: typeof printed === 'object' && printed !== null
				? Object.values(printed).filter(isPackedPackage)
				: []
	if (packages.length > 0) return packages
	throw new Error(`npm pack --json printed no files list: ${JSON.stringify(printed).slice(0, 200)}`)
}

/** An object whose `files` is a list of entries each holding a text `path`. */
function isPackedPackage(value: unknown): value is PackedPackage {
	if (typeof value !== 'object' || value === null || !('files' in value)) return false
	const { files } = value as { files: unknown }
	return Array.isArray(files) && files.every(hasTextPath)
}

/** An entry holding a text `path`. */
function hasTextPath(entry: unknown): boolean {
	return (
		typeof entry === 'object' &&
		entry !== null &&
		'path' in entry &&
		typeof (entry as { path: unknown }).path === 'string'
	)
}
