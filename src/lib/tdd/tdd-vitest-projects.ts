/**
 * The probe of a package's vitest projects, run as a child process in the package: resolves the config as vitest
 * does, writes each project's name, parent, module sharing and the asked files it holds to the report file.
 * No test runs. It imports `vitest/node` from the installation it is given (the run's own, never the cli's): run by
 * path, from the cli's folder.
 */
import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { fillMessage } from '../knowledge/standard/fill-message.ts'
import {
	PROBE_INPUT_VARIABLE,
	PROBE_MISSING_API,
	REPORT_ENVIRONMENT_VARIABLE,
	VITEST_NODE_EXPORT,
	VITEST_PROBE_APIS,
	VITEST_VERSION_UNKNOWN,
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
	const version = versionOf(input.vitest)
	/** The refusal of a vitest whose API is not the one the probe calls: its version and the API named. */
	function missing(api: string): VitestProbeReport {
		return { unresolved: fillMessage({ template: PROBE_MISSING_API, values: { version, api } }) }
	}
	try {
		const entry = nodeEntryOf(input.vitest)
		if (entry === undefined) return missing(VITEST_PROBE_APIS.nodeEntry)
		const vitestNode = (await import(entry)) as Partial<typeof import('vitest/node')>
		if (typeof vitestNode.createVitest !== 'function')
			return missing(VITEST_PROBE_APIS.createVitest)
		// the config loaded in memory first (vite's bundle loader writes a file under node_modules/.vite-temp): the
		// probe leaves the tree as it found it; a config only the bundle loader reads still resolves
		const vitest = await createLeavingTree({
			createVitest: vitestNode.createVitest,
			root: input.root,
		})
		try {
			if (!Array.isArray(vitest.projects)) return missing(VITEST_PROBE_APIS.projects)
			if (vitest.projects.some((project) => typeof project.matchesTestGlob !== 'function'))
				return missing(VITEST_PROBE_APIS.matchesTestGlob)
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
	createVitest: (typeof import('vitest/node'))['createVitest']
	root: string
}): Promise<Vitest> {
	const { createVitest, root } = params
	try {
		return await createVitest('test', { watch: false, root, configLoader: 'runner' })
	} catch {
		return await createVitest('test', { watch: false, root })
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

/** The vitest package's manifest: its version and exports. */
function manifestOf(folder: string): { version?: unknown; exports?: Record<string, unknown> } {
	return JSON.parse(readFileSync(join(folder, 'package.json'), 'utf8')) as {
		version?: unknown
		exports?: Record<string, unknown>
	}
}

/** The vitest package's version, as its manifest says. */
function versionOf(folder: string): string {
	const { version } = manifestOf(folder)
	return typeof version === 'string' ? version : VITEST_VERSION_UNKNOWN
}

/** The `vitest/node` entry of the vitest package folder, as its package.json exports it; undefined without one. */
function nodeEntryOf(folder: string): string | undefined {
	const exported = manifestOf(folder).exports?.[VITEST_NODE_EXPORT]
	const target =
		typeof exported === 'string'
			? exported
			: ((exported as { import?: unknown; default?: unknown } | undefined)?.default ??
				(exported as { import?: { default?: unknown } } | undefined)?.import?.default)
	return typeof target === 'string' ? pathToFileURL(join(folder, target)).href : undefined
}

await probeVitestProjects()
