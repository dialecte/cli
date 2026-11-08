/** A static walk of the imports of a module: which files it reaches, and whether one imports a child process. */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

import { CHILD_PROCESS_PATTERN, IMPORT_PATTERN } from './import-reach.constants.ts'

/** The specifiers `source` imports as values. */
export function importSpecifiersOf(source: string): string[] {
	return [...source.matchAll(IMPORT_PATTERN)].map((match) => match[1] ?? match[2] ?? match[3])
}

/**
 * The files reachable from `entry` through relative value imports (itself included), and the files that import a
 * child process. A relative import that resolves to no file throws, naming the importer and the specifier.
 */
export function reachFrom(entry: string): { files: string[]; childProcessImporters: string[] } {
	const files: string[] = []
	const childProcessImporters: string[] = []
	const pending = [entry]
	for (let file = pending.pop(); file !== undefined; file = pending.pop()) {
		if (files.includes(file)) continue
		files.push(file)
		for (const specifier of importSpecifiersOf(readFileSync(file, 'utf8'))) {
			if (CHILD_PROCESS_PATTERN.test(specifier)) {
				childProcessImporters.push(file)
			} else if (specifier.startsWith('.')) {
				const target = resolve(dirname(file), specifier)
				if (!existsSync(target))
					throw new Error(`${file} imports ${specifier}: no file at ${target}`)
				pending.push(target)
			}
		}
	}
	return { files: files.sort(), childProcessImporters: childProcessImporters.sort() }
}
