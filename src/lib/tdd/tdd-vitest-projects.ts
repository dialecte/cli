/**
 * The probe of a package's vitest projects, run as a child process in the package: resolves the config as vitest
 * does, writes each project's name, parent, module sharing and the asked files it holds to the report file.
 * No test runs. It imports `vitest/node` from the installation it is given (the run's own, never the cli's): run by
 * path, from the cli's folder.
 */
import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import {
	PROBE_INPUT_VARIABLE,
	REPORT_ENVIRONMENT_VARIABLE,
	VITEST_VM_POOLS,
} from './tdd.constants.ts'

import type { ProbedProject, VitestProbeInput, VitestProbeReport } from './tdd.types.ts'
import type { TestProject, Vitest } from 'vitest/node'

/**
 * Reads the input (`PROBE_INPUT_VARIABLE`), resolves the projects with `createVitest` (no filter, no watch) and
 * writes them to the report file (`REPORT_ENVIRONMENT_VARIABLE`); a config vitest cannot resolve is written as why.
 * Then the process ends itself, as vitest's own command does: a handle the config leaves open (a timer, a socket)
 * never holds it.
 */
export async function probeVitestProjects(): Promise<void> {
	const inputPath = process.env[PROBE_INPUT_VARIABLE]
	const reportPath = process.env[REPORT_ENVIRONMENT_VARIABLE]
	if (!inputPath || !reportPath) return
	const input = JSON.parse(readFileSync(inputPath, 'utf8')) as VitestProbeInput
	const report = await reportOf(input)
	writeFileSync(reportPath, JSON.stringify(report))
	process.exit(0)
}

async function reportOf(input: VitestProbeInput): Promise<VitestProbeReport> {
	try {
		const vitestNode = (await import(nodeEntryOf(input.vitest))) as typeof import('vitest/node')
		// the config loaded in memory first (vite's bundle loader writes a file under node_modules/.vite-temp): the
		// probe leaves the tree as it found it; a config only the bundle loader reads still resolves
		const vitest = await createLeavingTree({ vitestNode, root: input.root })
		try {
			// vitest resolves the root's real path: the asked files are matched under it
			const root = realpathSync(input.root)
			return {
				projects: vitest.projects.map((project) =>
					probedProject({ project, root, files: input.files }),
				),
			}
		} finally {
			await vitest.close()
		}
	} catch (error) {
		return { unresolved: error instanceof Error ? error.message : String(error) }
	}
}

/**
 * vitest created for the root, its config loaded by vite's module runner, else by its bundle loader. A failed first
 * creation hands back nothing to close: what it left open ends with the process (`probeVitestProjects`).
 */
async function createLeavingTree(params: {
	vitestNode: typeof import('vitest/node')
	root: string
}): Promise<Vitest> {
	const { vitestNode, root } = params
	try {
		return await vitestNode.createVitest('test', { watch: false, root, configLoader: 'runner' })
	} catch {
		return await vitestNode.createVitest('test', { watch: false, root })
	}
}

/** One resolved project: its name, the project a browser instance belongs to, its module sharing, the files it holds. */
function probedProject(params: {
	project: TestProject
	root: string
	files: readonly string[]
}): ProbedProject {
	const { project } = params
	const { config } = project
	// a browser instance is a clone of its parent project (vitest keeps it as `_parent`, no public accessor)
	const parent = (project as TestProject & { _parent?: TestProject })._parent
	return {
		name: project.name,
		parent: parent?.name ?? project.name,
		sharesModules: config.browser.enabled
			? config.browser.isolate === false
			: config.isolate === false && !VITEST_VM_POOLS.includes(config.pool),
		holds: params.files.filter((file) => {
			const path = join(params.root, file)
			// a file the change deletes holds no source: an in-source test glob never reads it
			return project.matchesTestGlob(path, () =>
				existsSync(path) ? readFileSync(path, 'utf8') : '',
			)
		}),
	}
}

/** The `vitest/node` entry of the vitest package folder, as its package.json exports it. */
function nodeEntryOf(folder: string): string {
	const manifest = JSON.parse(readFileSync(join(folder, 'package.json'), 'utf8')) as {
		exports?: Record<string, unknown>
	}
	const exported = manifest.exports?.['./node']
	const target =
		typeof exported === 'string'
			? exported
			: ((exported as { import?: unknown; default?: unknown } | undefined)?.default ??
				(exported as { import?: { default?: unknown } } | undefined)?.import?.default)
	if (typeof target !== 'string') throw new Error(`${folder} exports no vitest/node entry`)
	return pathToFileURL(join(folder, target)).href
}

await probeVitestProjects()
