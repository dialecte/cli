/**
 * The import graph of a package's tests, as its own vitest builds it for `vitest related`: run as a child in the
 * package root (`node test-graph.ts <output file>`), it loads the package's vitest, globs its test files and walks each
 * one's imports through its project's vite server as `vitest related` does, its own imports kept apart (the transform's static and dynamic
 * imports followed, an import query left out of the file it names, `node_modules` and what is no file left out), then writes them as JSON (`TestGraph`) to the output file: paths relative to the package root. Nothing
 * runs: no test, no global setup.
 */
import { statSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'

import { FS_PREFIX, IMPORT_QUERY_PATTERN } from './scoped-tests.constants.ts'

import type { TestGraph } from './scoped-tests.types.ts'
import type { TestProject } from 'vitest/node'

/**
 * What `file` reaches through `project`'s vite server, walked one file at a time: the files it imports itself
 * (`imports`) and every file reached through them (`reached`, the imports among them), `file` left out of both.
 */
async function reachedFrom(params: {
	project: TestProject
	file: string
}): Promise<{ imports: Set<string>; reached: Set<string> }> {
	const ssr = params.project.vite.environments.ssr
	const reached = new Set<string>([params.file])
	const imports = new Set<string>()
	const queue = [params.file]
	while (queue.length > 0) {
		const file = queue.shift() ?? ''
		const transformed =
			ssr.moduleGraph.getModuleById(file)?.transformResult ?? (await ssr.transformRequest(file))
		if (!transformed) continue
		for (const written of [...(transformed.deps ?? []), ...(transformed.dynamicDeps ?? [])]) {
			const path = importedPath({ root: params.project.config.root, written })
			if (path.includes('node_modules') || !isFile(path)) continue
			if (file === params.file && path !== params.file) imports.add(path)
			if (reached.has(path)) continue
			reached.add(path)
			queue.push(path)
		}
	}
	reached.delete(params.file)
	return { imports, reached }
}

/** The file an import of vite's names: `/@fs/` absolute or root-relative, its query (`./x.ts?raw`) left out. */
function importedPath(params: { root: string; written: string }): string {
	const specifier = params.written.replace(IMPORT_QUERY_PATTERN, '')
	return specifier.startsWith(FS_PREFIX)
		? specifier.slice(FS_PREFIX.length - 1)
		: join(params.root, specifier)
}

/** Whether `path` is a file (a folder of the same name as a bare import is none). */
function isFile(path: string): boolean {
	try {
		return statSync(path).isFile()
	} catch {
		return false
	}
}

/** `added` (absolute) made relative to `root` and merged into `earlier`, each path once, sorted. */
function mergedPaths(params: {
	root: string
	earlier: readonly string[] | undefined
	added: ReadonlySet<string>
}): string[] {
	const relativePaths = [...params.added].map((path) => relative(params.root, path))
	return [...new Set([...(params.earlier ?? []), ...relativePaths])].sort()
}

const [output] = process.argv.slice(2)
const root = process.cwd()
const vitestNode = createRequire(join(root, 'package.json')).resolve('vitest/node')
const { createVitest } = (await import(
	pathToFileURL(vitestNode).href
)) as typeof import('vitest/node')
const vitest = await createVitest('test', { watch: false }, {}, {})
try {
	const specifications = await vitest.globTestSpecifications()
	const dependencies: Record<string, string[]> = {}
	const imports: Record<string, string[]> = {}
	for (const specification of specifications) {
		const file = relative(root, specification.moduleId)
		const read = await reachedFrom({ project: specification.project, file: specification.moduleId })
		// a file of several projects: each project's walk added
		dependencies[file] = mergedPaths({ root, earlier: dependencies[file], added: read.reached })
		imports[file] = mergedPaths({ root, earlier: imports[file], added: read.imports })
	}
	const graph: TestGraph = { dependencies, imports }
	writeFileSync(output, `${JSON.stringify(graph)}\n`)
} finally {
	await vitest.close()
}
