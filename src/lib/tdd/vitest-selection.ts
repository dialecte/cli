/**
 * The vitest projects one tdd command runs its files in: CI's projects (`readCiTestProjects`) matched to the
 * projects vitest resolves (the probe), the files a selected project holds and those none does. Read once per command,
 * on its first use (inside its vitest step when nothing needs it earlier): every run of it (the base runs too) passes
 * the same selection.
 */
import { readCiTestProjects } from './ci-test-projects.ts'
import { fillTemplate } from './moved-cases.ts'
import { packageVitestFolder } from './package-vitest.ts'
import { reporterPath, runReportingChild } from './run-reporting-child.ts'
import { testFileOf } from './run-test-cases.ts'
import {
	BASE_LACKS_CI_PROJECT,
	MODULE_MOCK_UNCHECKED,
	NO_VITEST_TO_PROBE,
	PROBE_FAILURE,
	PROBE_FILE_NAMES,
	PROBE_INPUT_VARIABLE,
	PROBE_TIMEOUT_MS,
	UNDECLARED_CI_PROJECT,
	VITEST_RUN_ENVIRONMENT,
	VITEST_SELECTION_NOTES,
} from './tdd.constants.ts'
import { groupFilesByRunner } from './test-runner.ts'
import { readVitestConfigs } from './vitest-configs.ts'

import type { PackageJson } from '../package-json.types.ts'
import type {
	ChangedTestFile,
	CiTestProjects,
	CommandVitestSelection,
	ProbeAnnouncer,
	ProbedProject,
	TestRunFailure,
	VitestProbeReport,
	VitestSelection,
	VitestSelectionReader,
} from './tdd.types.ts'

/** The command's selection: CI's projects, the resolved ones, the held and outside files, the lines to print. */
export async function readVitestSelection(params: {
	root: string
	packageJson: PackageJson
	/** Every vitest file the command runs, relative to the root. */
	files: readonly string[]
	/** The files a `not in CI's projects` note may name (the head's own). Default: every file. */
	noted?: readonly string[]
}): Promise<VitestSelection | TestRunFailure> {
	const { root, files } = params
	const noted = params.noted ?? files
	const read = readCiTestProjects({ root, packageJson: params.packageJson })
	const probed = await probeProjects({ root, files })
	if ('unprobed' in probed) {
		// no installation to ask: every project runs, as before; a known selection dropped is said, and the mock check
		const ci: CiTestProjects = { kind: 'all', reason: probed.unprobed }
		return {
			ci,
			projects: [],
			held: [],
			outside: [],
			notes: [...(read.kind === 'projects' ? [allNote(ci.reason)] : []), MODULE_MOCK_UNCHECKED],
		}
	}
	if ('failure' in probed) return probed
	const { projects } = probed
	if (read.kind === 'all') {
		const held = files.filter((file) => projects.some((project) => project.holds.includes(file)))
		return {
			ci: read,
			projects,
			held,
			outside: files.filter((file) => !held.includes(file)),
			notes: projects.length > 1 ? [allNote(read.reason)] : [],
		}
	}
	const undeclared = read.names.find(
		(name) => !projects.some((project) => matchesProjectName({ project, names: [name] })),
	)
	if (undeclared !== undefined)
		return {
			failure: fillTemplate({
				template: UNDECLARED_CI_PROJECT,
				values: { name: undeclared, source: read.source },
			}),
		}
	const selected = projects.filter((project) => matchesProjectName({ project, names: read.names }))
	const held = files.filter((file) => selected.some((project) => project.holds.includes(file)))
	const outside = files.filter((file) => !held.includes(file))
	return {
		ci: read,
		projects,
		held,
		outside,
		notes: [
			fillTemplate({
				template: VITEST_SELECTION_NOTES.projects,
				values: { names: read.names.join(', '), source: read.source },
			}),
			...outside
				.filter((file) => noted.includes(file))
				.map((file) =>
					fillTemplate({ template: VITEST_SELECTION_NOTES.outside, values: { file } }),
				),
		],
	}
}

/**
 * The reader of one tdd command's selection over the files it may run with vitest: its test files, the base paths of
 * the renamed ones and the test files the change deletes (a base collect runs those), kept to the files vitest runs.
 * The probe runs on the first `select` (none when no file is a vitest file), the base copy's check once per base.
 */
export function createVitestSelectionReader(params: {
	root: string
	packageJson: PackageJson
	/** The command's test files. */
	files: readonly ChangedTestFile[]
	/** Test files of the base the command may run in a base copy (the change deletes them). */
	baseFiles: readonly string[]
	/** Runs a probe asked outside a test run's step as a progress step of its own. Default: silent. */
	announce?: ProbeAnnouncer
}): VitestSelectionReader {
	const { announce: given, ...selectionParams } = params
	const announce: ProbeAnnouncer = given ?? ((run) => run())
	let selected: Promise<CommandVitestSelection | undefined> | undefined
	let read: { selection: CommandVitestSelection | undefined } | undefined
	const baseChecks = new Map<string, Promise<TestRunFailure | undefined>>()
	function select(options?: { announced?: boolean }): Promise<CommandVitestSelection | undefined> {
		if (!selected) {
			selected = readCommandSelection({
				...selectionParams,
				...(options?.announced && { announce }),
			}).then((selection) => {
				read = { selection }
				return selection
			})
		}
		return selected
	}
	return {
		select,
		peek: () => read?.selection,
		checkBase: async function checkBase(base) {
			const selection = await select({ announced: true })
			if (!selection || 'failure' in selection || selection.ci.kind !== 'projects') return undefined
			const known = baseChecks.get(base.base)
			if (known) return known
			const checked = announce(() => checkBaseProjects({ ...base, selection }))
			baseChecks.set(base.base, checked)
			return checked
		},
	}
}

/**
 * Why a base copy cannot run `files` in the head's CI projects (its config lacks one), checked once per base and only
 * when one of the files is a vitest file of the command; undefined when it can, or with no selection.
 */
export async function baseLacksProjects(params: {
	reader: VitestSelectionReader | undefined
	/** The base copy. */
	folder: string
	base: string
	files: readonly string[]
}): Promise<TestRunFailure | undefined> {
	const { reader } = params
	const selection = await reader?.select({ announced: true })
	if (!reader || !selection || 'failure' in selection) return undefined
	const asked = new Set([...selection.held, ...selection.outside])
	if (!params.files.some((file) => asked.has(file))) return undefined
	return reader.checkBase({ root: params.folder, base: params.base })
}

/**
 * The project of the selection a file mocking a module would run in while sharing modules between files: a
 * selected one holding it, or for an outside file and for `all` any project holding it; undefined when none shares.
 */
export function sharingProjectOf(params: {
	selection: VitestSelection
	file: string
}): string | undefined {
	const { selection, file } = params
	const { ci, projects } = selection
	const runIn =
		ci.kind === 'projects' && selection.held.includes(file)
			? projects.filter((project) => matchesProjectName({ project, names: ci.names }))
			: projects
	return runIn.find((project) => project.sharesModules && project.holds.includes(file))?.name
}

/** The lines a selection says before its run; none for one that could not be read (its vitest run says why). */
export function selectionNotes(params: {
	selection: CommandVitestSelection | undefined
	/** Files refused before the run: they do not run, no note names them. */
	refused: readonly string[]
}): string[] {
	const { selection } = params
	if (!selection || 'failure' in selection) return []
	const unnoted = new Set(
		params.refused.map((file) =>
			fillTemplate({ template: VITEST_SELECTION_NOTES.outside, values: { file } }),
		),
	)
	return selection.notes.filter((note) => !unnoted.has(note))
}

/** The selection over the vitest files among the command's files and base paths; undefined when none is one. */
async function readCommandSelection(params: {
	root: string
	packageJson: PackageJson
	files: readonly ChangedTestFile[]
	baseFiles: readonly string[]
	/** The probe, when one runs, as a progress step of its own. Default: silent (inside a test run's step). */
	announce?: ProbeAnnouncer
}): Promise<CommandVitestSelection | undefined> {
	const { root } = params
	const head = params.files.map((file) => file.file)
	const paths = [
		...new Set([
			...head,
			...params.files.flatMap((file) => (file.baseFile === undefined ? [] : [file.baseFile])),
			...params.baseFiles,
		]),
	]
	const { groups } = groupFilesByRunner({
		root,
		files: paths.map((file) => testFileOf({ root, file })),
		configs: readVitestConfigs({ root }),
	})
	const files = groups.find((group) => group.runner === 'vitest')?.files ?? []
	if (files.length === 0) return undefined
	const { announce } = params
	function read(): Promise<VitestSelection | TestRunFailure> {
		return readVitestSelection({ root, packageJson: params.packageJson, files, noted: head })
	}
	return announce ? announce(read) : read()
}

/**
 * A base copy's run on the head's selection: the base config must declare every name CI runs at the head (a lot
 * adding or renaming a project), else the base run fails naming it. The base copy is probed for that only.
 */
async function checkBaseProjects(params: {
	/** The base copy. */
	root: string
	/** The base's ref, named in the failure. */
	base: string
	selection: VitestSelection
}): Promise<TestRunFailure | undefined> {
	const { ci } = params.selection
	if (ci.kind !== 'projects') return undefined
	const probed = await probeProjects({ root: params.root, files: [] })
	if ('unprobed' in probed) return { failure: probed.unprobed }
	if ('failure' in probed) return probed
	const missing = ci.names.find(
		(name) => !probed.projects.some((project) => matchesProjectName({ project, names: [name] })),
	)
	return missing === undefined
		? undefined
		: {
				failure: fillTemplate({
					template: BASE_LACKS_CI_PROJECT,
					values: { name: missing, base: params.base },
				}),
			}
}

/**
 * The projects as the package's own vitest resolves them, from the probe run with the run's environment and bounded
 * (`PROBE_TIMEOUT_MS`); why there is no installation to ask (the npx fallback); or why the probe failed.
 */
async function probeProjects(params: {
	root: string
	files: readonly string[]
}): Promise<{ projects: ProbedProject[] } | TestRunFailure | { unprobed: string }> {
	const vitest = packageVitestFolder({ root: params.root })
	if (vitest === undefined) return { unprobed: NO_VITEST_TO_PROBE }
	const report: unknown = await runReportingChild({
		runner: 'vitest',
		command: process.execPath,
		args: [reporterPath(PROBE_FILE_NAMES)],
		environment: { ...VITEST_RUN_ENVIRONMENT },
		inputs: {
			[PROBE_INPUT_VARIABLE]: { vitest, root: params.root, files: [...params.files] },
		},
		run: {
			root: params.root,
			files: params.files,
			filter: 'collect',
			timeoutMs: PROBE_TIMEOUT_MS,
		},
	})
	// the probe's own failure (past its bound, stalled), never read as the test run's
	if (isRunFailure(report))
		return {
			...report,
			failure: fillTemplate({
				template: PROBE_FAILURE,
				values: { root: params.root, failure: report.failure },
			}),
		}
	if (!isProbeReport(report))
		return {
			failure: fillTemplate({
				template: PROBE_FAILURE,
				values: { root: params.root, failure: 'it wrote no report' },
			}),
		}
	if ('unresolved' in report)
		return {
			failure: `tdd: vitest could not resolve the projects of ${params.root}: ${report.unresolved}`,
		}
	return report
}

/** A run that answered why it could not run. */
function isRunFailure(value: unknown): value is TestRunFailure {
	return (
		typeof value === 'object' &&
		value !== null &&
		'failure' in value &&
		typeof value.failure === 'string'
	)
}

/** The probe's report: its projects, or why vitest could not resolve them. */
function isProbeReport(value: unknown): value is VitestProbeReport {
	if (typeof value !== 'object' || value === null) return false
	return (
		('projects' in value && Array.isArray(value.projects)) ||
		('unresolved' in value && typeof value.unresolved === 'string')
	)
}

/**
 * vitest 4.1.11's `--project` rule, ported (vitest exports no matcher; `Vitest.matchesProjectFilter` reads the
 * instance's own filter): each name split on `*`, escaped, joined with `.*`, anchored and case-insensitive; a leading
 * `!` negates it (`wildcardPatternToRegExp`). A project matches when any name does (`matchesProjectFilter`).
 */
function matchesProjectName(params: { project: ProbedProject; names: readonly string[] }): boolean {
	const { project, names } = params
	if (project.parent === project.name)
		return names.some((name) => wildcardPattern(name).test(project.name))
	// a browser instance (`resolveBrowserProjects`): its parent excluded by a negation drops it; a parent matching keeps
	// every instance, else the instance's own name decides
	if (isExcludedBy({ name: project.parent, names })) return false
	return names.some(
		(name) =>
			wildcardPattern(name).test(project.parent) || wildcardPattern(name).test(project.name),
	)
}

/** A negated name (`!<pattern>`) excludes the name (`Vitest.isExcludedByProjectFilter`). */
function isExcludedBy(params: { name: string; names: readonly string[] }): boolean {
	return params.names.some(
		(name) => name.startsWith('!') && wildcardPattern(name.slice(1)).test(params.name),
	)
}

/** vitest's `wildcardPatternToRegExp`: `*` any text, anchored, case-insensitive; a leading `!` negates. */
function wildcardPattern(pattern: string): RegExp {
	const negated = pattern.startsWith('!')
	const body = negated ? pattern.slice(1) : pattern
	const expression = `${body
		.split('*')
		.map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
		.join('.*')}$`
	return new RegExp(`^${negated ? `(?!${expression})` : expression}`, 'i')
}

function allNote(reason: string): string {
	return fillTemplate({ template: VITEST_SELECTION_NOTES.all, values: { reason } })
}
