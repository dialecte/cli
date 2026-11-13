/**
 * `dialecte skills` — agent skills shipped with the code they describe (`skills/<name>/SKILL.md` in each
 * package).
 *
 *   sync      install the skills of the app's dependencies (or of a local workspace) for the agents, and for
 *             Claude Code the station agents and the session-start check (`--no-session-check` leaves it out);
 *             the AGENTS.md section is written only when the check is on, a missing AGENTS.md created only
 *             on a yes or with `--agents-file`, the section never removed (`--no-session-check` leaves it in
 *             place, `--no-agents-file` leaves the file alone)
 *   generate  rewrite the generated blocks of the package's skills from its source
 *   changed   which skills the change touches, and whether their evals are due (hand-written text) or not
 *             (generated blocks only)
 *   check     fail when a skill cites an API, path, npm script or cli invocation that does not exist, links
 *             nowhere, has invalid frontmatter or a stale block, or when a method or a function exported by a
 *             package entry has no JSDoc summary / @intent
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'

import { API_JSON_FILE } from '../lib/api/api-json.constants.ts'
import { buildApiJson, renderApiJson } from '../lib/api/api-json.ts'
import { getArg, hasFlag, resolveTargets, tsconfigOf } from '../lib/config.ts'
import { discoverExports, discoverMethods } from '../lib/discover.ts'
import { discoveryEntry } from '../lib/discovery-entry.ts'
import { formatFiles, formatOptsFromArgv } from '../lib/format.ts'
import { askVendor } from '../lib/models/ask-vendor.ts'
import { listManifestFolders, readRememberedVendor } from '../lib/models/remembered-vendor.ts'
import { resolveSyncVendor } from '../lib/models/resolve-sync-vendor.ts'
import { isVendorId } from '../lib/models/vendor-id.ts'
import { printLines, printOut, textOf } from '../lib/print/print.ts'
import { readProfile } from '../lib/profile/profile.ts'
import {
	findQuotedSentences,
	findUndocumentedMethods,
	indexedMethods,
	renderApiIndex,
	renderIntentIndex,
} from '../lib/skills/api-index.ts'
import { checkSkillPage } from '../lib/skills/check-skill-page.ts'
import { STATIONS_FILE } from '../lib/skills/check-station-definitions.constants.ts'
import { checkStationDefinitions } from '../lib/skills/check-station-definitions.ts'
import { NOT_CHECKED_LINE, NOT_CHECKED_SUMMARY } from '../lib/skills/cli-invocations.constants.ts'
import { checkCliInvocations, citedInvocationsOf } from '../lib/skills/cli-invocations.ts'
import { readCliSurface } from '../lib/skills/cli-surface.ts'
import { readExportEntries } from '../lib/skills/export-entries.ts'
import { GENERATED_MARKER_PATTERN } from '../lib/skills/generated-blocks.constants.ts'
import {
	findStaleGeneratedKinds,
	findUnclosedGeneratedBlocks,
	renderCoreMethods,
	renderExtensionsTable,
	renderHooksTable,
	replaceGeneratedBlocks,
} from '../lib/skills/generated-blocks.ts'
import {
	listHookConcernFiles,
	listRepositoryPaths,
	readNpmScripts,
	readWorkspaceFacts,
} from '../lib/skills/package-facts.ts'
import { SKILLS_FOLDER } from '../lib/skills/skill-file.constants.ts'
import { extractClaims } from '../lib/skills/skill-file.ts'
import { AGENT_SKILL_FOLDERS, DEFAULT_AGENTS } from '../lib/skills/sync-skills.constants.ts'
import {
	discoverSkillSources,
	readSyncManifest,
	rememberVendor,
	selectAudience,
	syncSkills,
} from '../lib/skills/sync-skills.ts'
import {
	AGENTS_ADDED_LINE,
	AGENTS_CREATED_LINE,
	AGENTS_LEFT_ALONE_LINE,
	AGENTS_LEFT_IN_PLACE_LINE,
	AGENTS_NOT_CREATED_LINE,
	AGENTS_UNCHANGED_LINE,
	AGENTS_UNCLOSED_LINE,
	AGENTS_UPDATED_LINE,
} from '../lib/stations/agents-file-check.constants.ts'
import { syncAgentsFileCheck } from '../lib/stations/agents-file-check.ts'
import { askCreateAgentsFile } from '../lib/stations/ask-create-agents-file.ts'
import { planStationAgents } from '../lib/stations/render-station-agent.ts'
import {
	CLAUDE_SETTINGS_FILE,
	SESSION_CHECK_COMMAND,
} from '../lib/stations/session-check.constants.ts'
import { syncSessionCheck } from '../lib/stations/session-check.ts'
import { CLAUDE_AGENTS_FOLDER, LOT_SKILL } from '../lib/stations/station-agents.constants.ts'
import { syncStationAgents } from '../lib/stations/sync-station-agents.ts'
import { runSkillsChanged } from './skills-changed.ts'
import {
	AGENTS_FILE_FLAGS_REFUSAL,
	CONTRIBUTOR_SYNC_REFUSAL,
	METHOD_DISCOVERY_DEPTH,
	SUBCOMMAND_NAMES,
} from './skills.constants.ts'

import type { CommandOutput } from '../lib/command-output.types.ts'
import type { MethodEntry } from '../lib/discover.types.ts'
import type { FormatOpts } from '../lib/format.types.ts'
import type { VendorChoice, VendorId } from '../lib/models/model-tiers.types.ts'
import type { PrintedText } from '../lib/print/print.types.ts'
import type { Profile } from '../lib/profile/profile.types.ts'
import type { SkillFinding } from '../lib/skills/skill-file.types.ts'
import type { AgentsFileCheckState } from '../lib/stations/agents-file-check.types.ts'
import type { SkillPage, SkillsSubcommand, SyncResult } from './skills.types.ts'

export async function run(argv: string[]): Promise<void> {
	const [subcommand, ...rest] = argv
	if (!isSubcommand(subcommand))
		throw new Error(
			`skills: expected one of ${SUBCOMMAND_NAMES.join(', ')} (got "${subcommand ?? ''}")`,
		)
	const cwd = process.cwd()
	if (subcommand === 'sync') {
		const result = await runSyncCommand({
			argv: rest,
			cwd,
			interactive: Boolean(process.stdin.isTTY && process.stdout.isTTY),
			input: process.stdin,
			output: process.stdout,
		})
		printOut({ stream: 'stderr', text: result.output, ending: 'as-is' })
		process.exitCode = result.exitCode
		return
	}
	if (subcommand === 'changed') {
		const result = runSkillsChanged({ cwd, argv: rest })
		printOut({ stream: 'stdout', text: result.output, ending: 'as-is' })
		process.exitCode = result.exitCode
		return
	}
	const methods = collectMethods({ argv: rest, cwd })
	const exitCode =
		subcommand === 'generate'
			? generatePages({ cwd, methods, formatOptions: formatOptsFromArgv(rest) })
			: checkPages({ cwd, methods, workspace: getArg(rest, 'workspace') })
	if (exitCode !== 0) process.exit(exitCode)
}

/** One line of what sync, generate or check did, on standard output. */
function printInfo(line: string): void {
	printLines({ stream: 'stdout', lines: [line] })
}

/** One warning or error line, on standard error. */
function printProblem(line: string): void {
	printLines({ stream: 'stderr', lines: [line] })
}

function isSubcommand(value: string | undefined): value is SkillsSubcommand {
	return SUBCOMMAND_NAMES.includes(value as SkillsSubcommand)
}

/** The vendor first, then the sync; what it has to say on stderr. */
export async function runSyncCommand(params: {
	argv: string[]
	cwd: string
	/** Whether a person can answer on `input`/`output` (a terminal). */
	interactive: boolean
	input: NodeJS.ReadableStream
	output: NodeJS.WritableStream
}): Promise<CommandOutput> {
	// refused before the vendor is asked: a person never answers a prompt for a sync that does not run
	refuseNoContributing({ argv: params.argv, cwd: params.cwd })
	refuseAgentsFileClash(params.argv)
	const choice = await chooseVendor(params)
	const result = runSync({ argv: params.argv, cwd: params.cwd, vendor: choice.vendor })
	if (result.agentsFile === 'missing') await offerAgentsFile(params)
	return { output: choice.output, exitCode: 0 }
}

/**
 * The sync would write the section but there is no `AGENTS.md`: on a terminal the person is asked, on a yes
 * the file is created; otherwise it says it was not created.
 */
async function offerAgentsFile(params: {
	cwd: string
	interactive: boolean
	input: NodeJS.ReadableStream
	output: NodeJS.WritableStream
}): Promise<void> {
	const agreed = params.interactive
		? await askCreateAgentsFile({ input: params.input, output: params.output })
		: false
	if (!agreed) {
		printInfo(AGENTS_NOT_CREATED_LINE)
		return
	}
	printAgentsFileState(syncAgentsFileCheck({ cwd: params.cwd, enabled: true, create: true }))
}

/**
 * The model vendor to remember: `--vendor`, the one the manifests remember, the one the project folder says,
 * or the one the person picks. Without one the sync goes on and `models` stays unset: the skills need no vendor.
 */
export async function chooseVendor(params: {
	argv: string[]
	cwd: string
	interactive: boolean
	input: NodeJS.ReadableStream
	output: NodeJS.WritableStream
}): Promise<VendorChoice> {
	const remembered = readRememberedVendor(params.cwd)
	// an explicit --vendor wins and is written everywhere: what the manifests said no longer matters
	const given = getArg(params.argv, 'vendor') !== undefined
	const warnings = (given ? [] : remembered.warnings).map((warning) => `⚠️  ${warning}`)
	const resolution = resolveSyncVendor({
		given: getArg(params.argv, 'vendor'),
		remembered: remembered.vendor,
		cwd: params.cwd,
		interactive: params.interactive,
	})
	if (resolution.kind === 'set')
		return { vendor: resolution.vendor, output: endedLinesOf(warnings) }
	if (resolution.kind === 'unset')
		return {
			vendor: undefined,
			output: endedLinesOf([...warnings, resolution.notice.replace(/\n$/, '')]),
		}
	const vendor = await askVendor({
		candidates: resolution.candidates,
		input: params.input,
		output: params.output,
	})
	return { vendor, output: endedLinesOf(warnings) }
}

/** The lines, each ended by a line feed; no line at all is the empty text. */
function endedLinesOf(lines: readonly string[]): PrintedText {
	return textOf(lines.length === 0 ? [] : [...lines, ''])
}

/** Installs the skills for the agents; throws on an unknown `--agent`. */
export function runSync(params: { argv: string[]; cwd: string; vendor?: VendorId }): SyncResult {
	const { argv, cwd } = params
	const agents = getArg(argv, 'agent')?.split(',') ?? [...DEFAULT_AGENTS]
	const unknownAgents = agents.filter((agent) => !AGENT_SKILL_FOLDERS[agent])
	if (unknownAgents.length)
		throw new Error(
			`skills sync: unknown agent ${unknownAgents.join(', ')} (known: ${Object.keys(AGENT_SKILL_FOLDERS).join(', ')})`,
		)
	if (hasFlag(argv, 'contributing') && hasFlag(argv, 'no-contributing'))
		throw new Error('skills sync: --contributing and --no-contributing exclude each other')
	refuseAgentsFileClash(argv)
	const profile = refuseNoContributing({ argv, cwd })

	// every manifest of the project says the same vendor, the folders of this sync or not
	if (params.vendor !== undefined)
		for (const folder of listManifestFolders(cwd))
			rememberVendor({ folder: join(cwd, folder), vendor: params.vendor })

	const targetFolders = agents.map((agent) => join(cwd, AGENT_SKILL_FOLDERS[agent]))
	const contributing = isContributingSync({ argv, targetFolders, profile })
	const discovered = discoverSkillSources({ cwd, from: getArg(argv, 'from') })
	const { missingDependencies } = discovered
	const { selected: sources, leftOut } = selectAudience({
		sources: discovered.sources,
		contributing,
	})
	const leftOutNames = leftOut.map((source) => source.name)
	const report = syncSkills({
		sources,
		targetFolders,
		mode: hasFlag(argv, 'copy') ? 'copy' : 'link',
		keepUnshipped: missingDependencies.length > 0,
		vendor: params.vendor,
		leftOut: leftOutNames,
		contributing,
	})

	for (const source of sources) printInfo(`✅ ${source.name}  (${source.origin})`)
	for (const name of report.removed)
		printInfo(
			leftOutNames.includes(name)
				? `🗑  ${name}  (contributor skill: --contributing installs it)`
				: `🗑  ${name}  (no longer shipped)`,
		)
	const notInstalled = leftOutNames.filter((name) => !report.removed.includes(name))
	if (notInstalled.length)
		printInfo(
			`contributor skills not installed: ${notInstalled.join(', ')} (to change a dialecte package: --contributing)`,
		)
	syncClaudeCodeExtras({
		argv,
		cwd,
		claudeIsTarget: agents.includes('claude'),
		vendor: params.vendor,
		lotLeftOut: leftOutNames.includes(LOT_SKILL),
	})
	const agentsFile = syncAgentsCheck({
		argv,
		cwd,
		// the check points at the doctor of the cli: enabled while this sync keeps dialecte-lot in any target
		enabled: targetFolders.some((folder) => readSyncManifest(folder).installed.includes(LOT_SKILL)),
	})
	for (const path of report.conflicts)
		printProblem(`⚠️  ${path} exists and was not installed by sync: left untouched`)
	if (missingDependencies.length)
		printProblem(
			`⚠️  not installed, skipped (nothing removed): ${missingDependencies.join(', ')} - run npm install, then sync again`,
		)
	if (sources.length === 0 && missingDependencies.length === 0)
		printInfo('No dependency ships skills (look for skills/<name>/SKILL.md).')
	return { agentsFile }
}

/** `--agents-file` with `--no-agents-file` throws. */
function refuseAgentsFileClash(argv: string[]): void {
	if (hasFlag(argv, 'agents-file') && hasFlag(argv, 'no-agents-file'))
		throw new Error(AGENTS_FILE_FLAGS_REFUSAL)
}

/** The package's profile; `--no-contributing` in a contributor, which always installs the contributor skills, throws. */
function refuseNoContributing(params: { argv: string[]; cwd: string }): Profile {
	const profile = readProfile(params.cwd)
	if (profile === 'contributor' && hasFlag(params.argv, 'no-contributing'))
		throw new Error(CONTRIBUTOR_SYNC_REFUSAL)
	return profile
}

/**
 * A contributor installs the contributor skills, always. In a consumer, `--contributing` installs them too,
 * `--no-contributing` stops; without either, a sync does what the last one did (any target folder's manifest says so).
 */
function isContributingSync(params: {
	argv: string[]
	targetFolders: readonly string[]
	profile: Profile
}): boolean {
	if (params.profile === 'contributor') return true
	if (hasFlag(params.argv, 'contributing')) return true
	if (hasFlag(params.argv, 'no-contributing')) return false
	return params.targetFolders.some((folder) => readSyncManifest(folder).contributing === true)
}

/**
 * What `sync` adds for Claude Code next to the skills: the station agents and the session-start check, both
 * owned through the claude skills manifest. Without the claude target, what an earlier sync wrote is removed.
 */
function syncClaudeCodeExtras(params: {
	argv: string[]
	cwd: string
	claudeIsTarget: boolean
	vendor: VendorId | undefined
	/** `dialecte-lot` is shipped but this consumer sync left it out. */
	lotLeftOut: boolean
}): void {
	const { argv, cwd, claudeIsTarget } = params
	const manifest = readSyncManifest(join(cwd, AGENT_SKILL_FOLDERS.claude))
	const vendor = params.vendor ?? manifest.vendor
	// agents and hook point at the skills: without dialecte-lot installed for Claude Code there is nothing to point at
	const hasLot = claudeIsTarget && manifest.installed.includes(LOT_SKILL)
	const plan = hasLot
		? planStationAgents({ vendor: vendor !== undefined && isVendorId(vendor) ? vendor : undefined })
		: { kind: 'files' as const, files: [] }
	const agents = syncStationAgents({ cwd, plan })
	for (const name of agents.written) printInfo(`✅ ${CLAUDE_AGENTS_FOLDER}/${name}`)
	for (const name of agents.removed)
		printInfo(`🗑  ${CLAUDE_AGENTS_FOLDER}/${name}  (no longer produced)`)
	for (const path of agents.conflicts)
		printProblem(`⚠️  ${path} exists and was not written by sync: left untouched`)
	if (claudeIsTarget && !hasLot)
		printInfo(
			params.lotLeftOut
				? 'no station agents: they come with the contributor skills (--contributing)'
				: `no station agents: no dependency ships the ${LOT_SKILL} skill`,
		)
	if (hasLot && agents.skippedReason) printInfo(agents.skippedReason)

	const session = syncSessionCheck({
		cwd,
		enabled: hasLot && !hasFlag(argv, 'no-session-check'),
	})
	if (session === 'added')
		printInfo(`✅ ${CLAUDE_SETTINGS_FILE}: session-start check (${SESSION_CHECK_COMMAND})`)
	if (session === 'removed') printInfo(`🗑  ${CLAUDE_SETTINGS_FILE}: session-start check removed`)
	if (session === 'invalid')
		printProblem(
			`⚠️  ${CLAUDE_SETTINGS_FILE} is not valid JSON: session-start check not added or removed`,
		)
	if (session === 'not-removed')
		printProblem(
			`⚠️  ${CLAUDE_SETTINGS_FILE} was edited: the session-start check could not be removed cleanly, left as it is - remove its hook by hand`,
		)
	if (session === 'invalid-hooks')
		printProblem(
			`⚠️  ${CLAUDE_SETTINGS_FILE}: "hooks" is not an object or "hooks.SessionStart" is not a list: session-start check not added or removed`,
		)
}

/** The session-start check in the project's `AGENTS.md`, for every agent: independent of the claude target. */
function syncAgentsCheck(params: {
	argv: string[]
	cwd: string
	enabled: boolean
}): SyncResult['agentsFile'] {
	if (hasFlag(params.argv, 'no-agents-file')) {
		printInfo(AGENTS_LEFT_ALONE_LINE)
		return 'left-alone'
	}
	const state = syncAgentsFileCheck({
		cwd: params.cwd,
		enabled: params.enabled && !hasFlag(params.argv, 'no-session-check'),
		create: hasFlag(params.argv, 'agents-file'),
	})
	printAgentsFileState(state)
	return state
}

/** The one line a state of the `AGENTS.md` section prints; `missing` and `absent` print none here. */
function printAgentsFileState(state: AgentsFileCheckState): void {
	switch (state) {
		case 'created':
			return printInfo(AGENTS_CREATED_LINE)
		case 'added':
			return printInfo(AGENTS_ADDED_LINE)
		case 'updated':
			return printInfo(AGENTS_UPDATED_LINE)
		case 'unchanged':
			return printInfo(AGENTS_UNCHANGED_LINE)
		case 'kept':
			return printInfo(AGENTS_LEFT_IN_PLACE_LINE)
		case 'unclosed':
			return printProblem(AGENTS_UNCLOSED_LINE)
		case 'missing':
		case 'absent':
			return
		default:
			state satisfies never
	}
}

/** Rewrites the stale generated blocks and formats the pages written; 1 on an unknown or unclosed block. */
export function generatePages(params: {
	cwd: string
	methods: MethodEntry[]
	formatOptions: FormatOpts
}): number {
	const { cwd } = params
	const blocks = renderBlocks({ cwd, methods: params.methods })
	let failed = false
	const written: string[] = []
	for (const page of listSkillPages(cwd)) {
		const markdown = readPage({ cwd, page })
		const unclosed = findUnclosedGeneratedBlocks(markdown)
		for (const kind of unclosed)
			printProblem(`❌ ${page.file}: generated block "${kind}" has no end marker`)
		if (unclosed.length) {
			failed = true
			continue
		}
		const result = replaceGeneratedBlocks({ markdown, blocks })
		for (const kind of result.unknownKinds) {
			failed = true
			printProblem(`❌ ${page.file}: unknown generated block "${kind}"`)
		}
		if (findStaleGeneratedKinds({ markdown, blocks }).length === 0) continue
		writeFileSync(join(cwd, page.file), result.markdown)
		written.push(page.file)
		printInfo(`✏️  ${page.file}`)
	}
	for (const apiJson of staleApiJsonFiles({ cwd, methods: params.methods })) {
		writeFileSync(join(cwd, apiJson.file), apiJson.content)
		written.push(apiJson.file)
		printInfo(`✏️  ${apiJson.file}`)
	}
	formatFiles({ root: cwd, files: written, options: params.formatOptions })
	return failed ? 1 : 0
}

/** Prints every finding; 1 when one of them is an error. */
export function checkPages(params: {
	cwd: string
	methods: MethodEntry[]
	/** The workspace folder holding the sibling repositories (`--workspace`). */
	workspace: string | undefined
}): number {
	const { cwd, methods, workspace } = params
	const blocks = renderBlocks({ cwd, methods })
	const facts = {
		methodPaths: new Set(methods.map((method) => method.path)),
		repositoryPaths: listRepositoryPaths(cwd),
		npmScripts: readNpmScripts(cwd),
	}
	const workspaceFacts = workspace ? readWorkspaceFacts(workspace) : undefined

	const findings: SkillFinding[] = [
		...findUndocumentedMethods(methods).map((message): SkillFinding => ({
			file: 'src',
			severity: 'error',
			message: `${message} (the skills' API index is built from the JSDoc)`,
		})),
		...findQuotedSentences(methods).map((message): SkillFinding => ({
			file: 'src',
			severity: 'warning',
			message,
		})),
	]
	const pages = listSkillPages(cwd)
	const markdowns = new Map(pages.map((page) => [page, readPage({ cwd, page })]))
	// the map of the cli the package uses, read once when a page cites the cli; without one, said once, not counted
	const citesCli = [...markdowns.values()].some(
		(markdown) => citedInvocationsOf({ markdown }).length > 0,
	)
	const cliSurface = citesCli ? readCliSurface({ cwd }) : undefined
	if (cliSurface && 'unavailable' in cliSurface)
		printProblem(`⚠️  ${NOT_CHECKED_LINE.replace('{reason}', cliSurface.unavailable)}`)
	for (const [page, markdown] of markdowns) {
		if (cliSurface && 'surface' in cliSurface)
			findings.push(
				...checkCliInvocations({
					file: page.file,
					markdown,
					surface: cliSurface.surface,
					ignored: new Set(extractClaims(markdown).ignored),
				}),
			)
		findings.push(
			...checkSkillPage({
				file: page.file,
				markdown,
				folderName: page.isSkillFile ? page.skillName : undefined,
				siblingFiles: siblingFilesOf({ cwd, page: page.file, skillName: page.skillName }),
				facts,
				workspaceFacts,
			}),
		)
		for (const kind of findUnclosedGeneratedBlocks(markdown))
			findings.push({
				file: page.file,
				severity: 'error',
				message: `generated block "${kind}" has no end marker`,
			})
		for (const kind of findStaleGeneratedKinds({ markdown, blocks }))
			findings.push({
				file: page.file,
				severity: 'error',
				message: `generated block "${kind}" is stale: run \`dialecte skills generate\``,
			})
	}

	if (pages.some((page) => page.skillName === LOT_SKILL))
		findings.push(...checkStationDefinitions({ markdown: readStationsPage(cwd) }))

	for (const apiJson of staleApiJsonFiles({ cwd, methods }))
		findings.push({
			file: apiJson.file,
			severity: 'error',
			message: 'missing or stale: run `dialecte skills generate`',
		})

	for (const finding of findings)
		printProblem(
			`${finding.severity === 'error' ? '❌' : '⚠️ '} ${finding.file}${finding.line === undefined ? '' : `:${finding.line}`}: ${finding.message}`,
		)
	const errors = findings.filter((finding) => finding.severity === 'error').length
	const methodCount = methods.filter((method) => method.entry === undefined).length
	// the export rows the index lists: not @internal, defined in the package, not a root's method
	const exportCount = indexedMethods(methods).filter(
		({ entry }) => entry.entry !== undefined,
	).length
	printInfo(
		`${errors ? '❌' : '✅'} ${pages.length} skill page(s), ${methodCount} method(s) and ${exportCount} export(s) checked: ${errors} error(s), ${findings.length - errors} warning(s)${cliSurface && 'unavailable' in cliSurface ? NOT_CHECKED_SUMMARY : ''}`,
	)
	return errors ? 1 : 0
}

/** The methods of q / tx / doc / project, then the functions the package entries export. */
function collectMethods(params: { argv: string[]; cwd: string }): MethodEntry[] {
	const tsconfig = tsconfigOf(params.argv, params.cwd)
	const methodsByPath = new Map<string, MethodEntry>()
	for (const target of resolveTargets(params.argv, params.cwd))
		for (const method of discoverMethods({
			entrySource: discoveryEntry(target.binding),
			tsconfig,
			root: params.cwd,
			maxDepth: METHOD_DISCOVERY_DEPTH,
		}))
			methodsByPath.set(method.path, method)
	const entries = readExportEntries({ root: params.cwd })
	const exported = discoverExports({ entries, tsconfig, root: params.cwd })
	return [...methodsByPath.values(), ...exported]
}

/**
 * `api.json` beside every page holding the generated `api` block, whose data differs from what the methods
 * render to now (or that does not exist). Compared as data: the package's formatter lays the file out.
 */
function staleApiJsonFiles(params: {
	cwd: string
	methods: readonly MethodEntry[]
}): { file: string; content: string }[] {
	const { cwd } = params
	const pagesWithIndex = listSkillPages(cwd).filter((page) =>
		holdsGeneratedBlock({ markdown: readPage({ cwd, page }), kind: 'api' }),
	)
	if (pagesWithIndex.length === 0) return []
	const content = renderApiJson(
		buildApiJson({ packageName: readPackageName(cwd), methods: params.methods, root: cwd }),
	)
	return pagesWithIndex
		.map((page) => ({ file: `${dirname(page.file)}/${API_JSON_FILE}`, content }))
		.filter(
			(apiJson) => !holdsSameJson({ path: join(cwd, apiJson.file), content: apiJson.content }),
		)
}

function holdsGeneratedBlock(params: { markdown: string; kind: string }): boolean {
	return [...params.markdown.matchAll(GENERATED_MARKER_PATTERN)].some(
		(marker) => marker[1] === params.kind,
	)
}

function readPackageName(cwd: string): string {
	const manifest: { name?: unknown } = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8'))
	return typeof manifest.name === 'string' ? manifest.name : ''
}

function holdsSameJson(params: { path: string; content: string }): boolean {
	if (!existsSync(params.path)) return false
	try {
		return (
			JSON.stringify(JSON.parse(readFileSync(params.path, 'utf8'))) ===
			JSON.stringify(JSON.parse(params.content))
		)
	} catch {
		return false
	}
}

function renderBlocks(params: { cwd: string; methods: MethodEntry[] }): Record<string, string> {
	const methodPaths = params.methods.map((method) => method.path)
	return {
		extensions: renderExtensionsTable(methodPaths),
		'core-methods': renderCoreMethods(methodPaths),
		hooks: renderHooksTable(listHookConcernFiles(params.cwd)),
		api: renderApiIndex(params.methods),
		intents: renderIntentIndex(params.methods),
	}
}

/** `skills/dialecte-lot/references/stations.md`, or undefined when the package has none. */
function readStationsPage(cwd: string): string | undefined {
	const path = join(cwd, STATIONS_FILE)
	return existsSync(path) ? readFileSync(path, 'utf8') : undefined
}

function readPage(params: { cwd: string; page: SkillPage }): string {
	return readFileSync(join(params.cwd, params.page.file), 'utf8').replace(/\r\n/g, '\n')
}

/** `skills/<name>/SKILL.md` and the markdown pages under it, evals left out. */
function listSkillPages(cwd: string): SkillPage[] {
	const skillsRoot = join(cwd, SKILLS_FOLDER)
	let skillNames: string[]
	try {
		skillNames = readdirSync(skillsRoot, { withFileTypes: true })
			.filter((entry) => entry.isDirectory())
			.map((entry) => entry.name)
	} catch {
		return []
	}
	return skillNames.flatMap((skillName) =>
		listRepositoryPaths(join(skillsRoot, skillName))
			.filter((path) => path.endsWith('.md') && !path.startsWith('evals/'))
			.map((path) => ({
				file: `${SKILLS_FOLDER}/${skillName}/${path}`,
				skillName,
				isSkillFile: path === 'SKILL.md',
			})),
	)
}

/** The skill's files as a link from `page` would write them (`/`-separated on every platform). */
function siblingFilesOf(params: { cwd: string; page: string; skillName: string }): Set<string> {
	const skillFolder = join(params.cwd, SKILLS_FOLDER, params.skillName)
	const pageFolder = dirname(join(params.cwd, params.page))
	return new Set(
		listRepositoryPaths(skillFolder).map((path) =>
			relative(pageFolder, join(skillFolder, path)).split(sep).join('/'),
		),
	)
}
