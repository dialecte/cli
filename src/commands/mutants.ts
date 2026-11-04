/**
 * `dialecte mutants run | status | schedule | abandon | migrate | judge | record | drop`: mutation testing of a
 * package's declared scope. A run is written to the repository's store before Stryker starts and replaced when it
 * reports, so a run that never reports is found; its survivors go to the ledger, where they stay pending until a test
 * kills them, a committed record explains them (`judge` shows them, `record` writes the record), or they are
 * scheduled for a follow-up. Every verb but `run` prints one JSON object with `--json`.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { computeStateTree } from '../lib/gate-records/state-hash.ts'
import { currentBranchOf, listRepositoryFiles, readGit } from '../lib/git.ts'
import { computeIncrementalKey, packageHashOf } from '../lib/mutation/cache-key.ts'
import { readMutationDeclaration } from '../lib/mutation/declaration.ts'
import { seedIncrementalFile, storeIncrementalFile } from '../lib/mutation/incremental-cache.ts'
import {
	judgeReport,
	mutantKeysOf,
	parseTarget,
	rangesOf,
	withFullRun,
	withinTargets,
	withLoneTimeouts,
} from '../lib/mutation/judge.ts'
import {
	itemsOf,
	pendingOf,
	readLedger,
	scheduleAllNew,
	scheduleItems,
	updateLedger,
} from '../lib/mutation/ledger.ts'
import { effectiveMode, readMutationMode } from '../lib/mutation/lot-mode.ts'
import { migrateRecords } from '../lib/mutation/migrate-records.ts'
import { MUTANTS_JSON_VERBS } from '../lib/mutation/mutation-agent.constants.ts'
import {
	CLI_DIST_FOLDER,
	EMPTY_STRYKER_CONFIG_FILE,
	IGNORER_PLUGIN_FILE,
	LEGACY_RECORDS_PATH,
	MUTANTS_VERBS,
	MUTATION_CONSUMER_OPT_IN,
	MUTANTS_WORK_FOLDER,
	MUTATION_OFF,
	MUTATION_RECORDS_PATH,
	REMOTE_DEFAULT_BRANCH,
	NOTHING_TO_MUTATE,
	RUN_MODES,
	SHORT_TREE_LENGTH,
	TIMEOUT_STATUS,
} from '../lib/mutation/mutation.constants.ts'
import { readRecordsFile, writeRecordsFile } from '../lib/mutation/records-file.ts'
import { abandonRun, finishRun, packageNameOf, startRun } from '../lib/mutation/run-store.ts'
import { isMutable, changedRanges } from '../lib/mutation/scope.ts'
import { buildStrykerOptions } from '../lib/mutation/stryker-options.ts'
import { readPackageJson } from '../lib/package-json.ts'
import { packageRootOf } from '../lib/package-root.ts'
import { isProcessAlive } from '../lib/process-alive.ts'
import { processStartTime } from '../lib/process-start-time.ts'
import { readProfile } from '../lib/profile/profile.ts'
import { readCliVersion } from '../lib/read-cli-version.ts'
import { readArguments } from '../lib/review-rounds/round-arguments.ts'
import { DEFAULT_BASE_BRANCH } from '../lib/worktree/worktree.constants.ts'
import { dropVerb } from './mutants-drop.ts'
import { judgeVerb } from './mutants-judge.ts'
import { answered, asksJson, refused, usageResult } from './mutants-output.ts'
import { recordVerb } from './mutants-record.ts'

import type { CommandResult } from '../lib/command-result.types.ts'
import type {
	KeyedLedgerItem,
	LegacyRecords,
	MutantsDependencies,
	MutantsStatus,
	MutationDeclaration,
	MutationMode,
	MutationRecords,
	MutationReport,
	MutationTier,
	RunCounts,
	RunEntry,
	StartTimeReader,
	StrykerModule,
	StrykerOptions,
	Survivor,
} from '../lib/mutation/mutation.types.ts'

/** The `mutants` command of the bin: runs in the package root, with the package's own StrykerJS. */
export async function run(argv: string[]): Promise<void> {
	const root = packageRootOf(process.cwd()) ?? process.cwd()
	// Stryker resolves the options' paths from the process's folder: the package root, as the options are written
	process.chdir(root)
	const result = await runMutants({
		cwd: root,
		argv,
		dependencies: { runStryker: runStrykerOfPackage },
	})
	// a --json result is one JSON object on stdout, whatever its exit code
	const printsJson =
		MUTANTS_JSON_VERBS.some((known) => known === argv[0]) && asksJson(argv.slice(1))
	;(result.exitCode === 0 || printsJson ? console.log : console.error)(result.output)
	if (result.exitCode !== 0) process.exit(result.exitCode)
}

/** `dialecte mutants run | status | schedule | abandon | migrate | judge | record | drop`. */
export async function runMutants(params: {
	cwd: string
	argv: string[]
	dependencies: MutantsDependencies
}): Promise<CommandResult> {
	const [verb, ...rest] = params.argv
	if (!MUTANTS_VERBS.some((known) => known === verb)) return usage()
	const json = MUTANTS_JSON_VERBS.some((known) => known === verb) && asksJson(rest)
	const root = packageRootOf(params.cwd)
	if (!root) {
		const reason = `no package.json at or above ${params.cwd}`
		return json ? refused({ verb, json, reason }) : { exitCode: 1, output: `mutants: ${reason}` }
	}
	const isAlive = params.dependencies.isAlive ?? isProcessAlive
	const startTimeOf = params.dependencies.startTimeOf ?? processStartTime
	const now = params.dependencies.now ?? newDate
	try {
		if (verb === 'run')
			return await runVerb({
				root,
				argv: rest,
				runStryker: params.dependencies.runStryker,
				startTimeOf,
			})
		if (verb === 'status') return statusVerb({ root, argv: rest, isAlive, startTimeOf, now })
		if (verb === 'schedule') return scheduleVerb({ root, argv: rest })
		if (verb === 'abandon') return abandonVerb({ root, argv: rest, isAlive, startTimeOf })
		if (verb === 'judge') return judgeVerb({ root, argv: rest, isAlive, startTimeOf })
		if (verb === 'record') return recordVerb({ root, argv: rest, isAlive, startTimeOf })
		if (verb === 'drop') return dropVerb({ root, argv: rest, isAlive, startTimeOf })
		return migrateVerb({ root, argv: rest })
	} catch (error) {
		return refused({ verb, json, reason: (error as Error).message })
	}
}

/** The ignorer plugin Stryker loads: the built JS under the cli's `dist/`, never the `.ts` source. */
export function ignorerPluginPath(params: { distFolder: string }): string {
	return join(params.distFolder, IGNORER_PLUGIN_FILE)
}

async function runVerb(params: {
	root: string
	argv: string[]
	runStryker: MutantsDependencies['runStryker']
	startTimeOf: StartTimeReader
}): Promise<CommandResult> {
	const { root, runStryker, startTimeOf } = params
	const read = readArguments({ argv: params.argv, valueOptions: ['mode', 'base'] })
	if (typeof read === 'string' || read.words.length > 0) return usage(read)
	const askedMode = read.values.get('mode')
	if (askedMode !== undefined && !RUN_MODES.some((mode) => mode === askedMode))
		return {
			exitCode: 2,
			output: `mutants run: --mode takes ${RUN_MODES.join(' or ')}, not ${JSON.stringify(askedMode)}`,
		}

	const packageJson = readPackageJson(root)
	const declared = readMutationDeclaration({ packageJson })
	if (declared.kind === 'none' && readProfile(root) === 'consumer')
		return { exitCode: 1, output: `mutants run: ${MUTATION_CONSUMER_OPT_IN}` }
	if (declared.kind === 'none')
		return {
			exitCode: 1,
			output: `mutants run: ${join(root, 'package.json')} declares no dialecte.mutation: declare its scope and fast tier first`,
		}
	if (declared.kind === 'invalid') return { exitCode: 1, output: `mutants run: ${declared.reason}` }
	const { declaration } = declared

	const setting = readMutationMode({ root })
	if (askedMode === undefined && setting.kind === 'invalid')
		return { exitCode: 2, output: `mutants run: ${setting.reason}` }

	const lot = currentBranchOf(root)
	if (lot === 'HEAD')
		return {
			exitCode: 1,
			output: `mutants run: HEAD is detached: check out the lot's branch first (git switch <branch>); a run is filed under its branch`,
		}

	const auditOnly = askedMode === 'audit' || (askedMode === undefined && setting.kind === 'audit')
	const base = auditOnly
		? undefined
		: baseOf({
				root,
				asked: read.values.get('base'),
				branch: packageJson.dialecte?.baseBranch ?? DEFAULT_BASE_BRANCH,
			})
	if (typeof base === 'object') return { exitCode: 2, output: `mutants run: ${base.refused}` }
	const changed = base === undefined ? undefined : changedTargets({ root, declaration, base })
	const mode = runModeOf({
		asked: askedMode,
		setting: setting.kind === 'invalid' ? { kind: 'default' } : setting,
		touchesScope: (changed?.targets.length ?? 0) > 0,
	})
	const since = `no file of the scope changed since ${changed?.base.slice(0, SHORT_TREE_LENGTH)}`
	if (mode === 'off')
		return {
			exitCode: 0,
			output: `mutants run: ${MUTATION_OFF} (${(changed?.targets.length ?? 0) > 0 ? 'the lot declares it off' : `${NOTHING_TO_MUTATE}: ${since}`})`,
		}
	const targets =
		mode === 'audit'
			? listRepositoryFiles({ root, folder: '.' }).filter((file) =>
					isMutable({ declaration, file }),
				)
			: (changed?.targets ?? [])
	if (targets.length === 0)
		return {
			exitCode: 0,
			output: `mutants run: ${NOTHING_TO_MUTATE} (${mode === 'audit' ? 'the scope holds no mutable file' : since})`,
		}

	const tree = computeStateTree(root)
	const entry = startRun({
		root,
		pid: process.pid,
		lot,
		tree,
		mode,
		...(mode === 'changed' && changed ? { base: changed.base } : {}),
		targets,
		startTimeOf,
	})
	const workDir = `${MUTANTS_WORK_FOLDER}/${entry.runId}`
	mkdirSync(join(root, workDir), { recursive: true })
	writeFileSync(join(root, workDir, EMPTY_STRYKER_CONFIG_FILE), '{}\n')
	const records = readRecordsFile({ root })
	const tiers = await runTiers({
		root,
		declaration,
		targets,
		records,
		workDir,
		tree,
		runStryker,
	})
	if ('failure' in tiers)
		return {
			exitCode: 1,
			output: `mutants run: ${tiers.failure}\nrun ${entry.runId} stays running until this process ends, then reads as died: rerun, or dialecte mutants abandon ${entry.runId}`,
		}
	const finished = finishRun({
		root,
		runId: entry.runId,
		counts: countsOf(tiers.report),
		survivors: tiers.survivors,
		...mutantKeysOf({ report: tiers.report }),
	})
	updateLedger({ root, run: finished, records, targets })
	// the reports and sandboxes of a reported run: its entry and the ledger hold what it found
	rmSync(join(root, workDir), { recursive: true, force: true })
	return { exitCode: 0, output: renderRun({ root, run: finished }) }
}

/** The fast tier, the timed-out mutants alone, the full tier on the unlisted survivors when declared: the merged report and its survivors. */
async function runTiers(params: {
	root: string
	declaration: MutationDeclaration
	targets: string[]
	records: MutationRecords
	workDir: string
	tree: string
	runStryker: MutantsDependencies['runStryker']
}): Promise<{ report: MutationReport; survivors: readonly Survivor[] } | { failure: string }> {
	const { root, declaration, targets, records, tree } = params
	const fastOptions = strykerOptionsOf({ ...params, tier: 'fast', mutate: targets })
	const key = computeIncrementalKey({
		root,
		tree,
		options: fastOptions,
		cliVersion: readCliVersion(),
		ignorerPlugin: ignorerPluginPath({ distFolder: cliDistFolder() }),
	})
	const incrementalFile = resolve(root, fastOptions.incrementalFile as string)
	const packageHash = packageHashOf({ root })
	seedIncrementalFile({ root, packageHash, key, incrementalFile })
	const fast = await runTier({ ...params, tier: 'fast', options: fastOptions })
	if ('failure' in fast) return fast
	try {
		storeIncrementalFile({ root, packageHash, key, incrementalFile })
	} catch (error) {
		process.stderr.write(
			`mutants run: the incremental cache was not written (${(error as Error).message}); the next run of this tree starts cold\n`,
		)
	}
	let report = withinTargets({
		report: fast.report,
		targets: targets.map((target) => parseTarget({ target })),
	})

	const timedOut = rangesOf({ report, select: (status) => status === TIMEOUT_STATUS })
	if (timedOut.length > 0) {
		const alone = await runTier({
			...params,
			tier: 'timeouts',
			options: strykerOptionsOf({ ...params, tier: 'timeouts', mutate: timedOut }),
		})
		if ('failure' in alone) return alone
		report = withLoneTimeouts({ report, alone: alone.report })
	}

	const { unlisted } = judgeReport({ report, records })
	if (declaration.full !== undefined && unlisted.length > 0) {
		const mutate = [...new Set(unlisted.map((survivor) => survivor.range))]
		const full = await runTier({
			...params,
			tier: 'full',
			options: strykerOptionsOf({ ...params, tier: 'full', mutate }),
		})
		if ('failure' in full) return full
		report = withFullRun({ fast: report, full: full.report })
	}
	return { report, survivors: judgeReport({ report, records }).survivors }
}

/** The options of one tier's Stryker run, in memory (the empty config file keeps the package's own out). */
function strykerOptionsOf(params: {
	declaration: MutationDeclaration
	workDir: string
	tier: MutationTier
	mutate: string[]
}): StrykerOptions {
	const { declaration, workDir, tier, mutate } = params
	return buildStrykerOptions({
		declaration,
		tier,
		mutate,
		workDir,
		ignorerPlugin: ignorerPluginPath({ distFolder: cliDistFolder() }),
		configFile: `${workDir}/${EMPTY_STRYKER_CONFIG_FILE}`,
	})
}

/** One Stryker run of a tier with its options, and the report it wrote; why it failed otherwise. */
async function runTier(params: {
	root: string
	tier: MutationTier
	options: StrykerOptions
	runStryker: MutantsDependencies['runStryker']
}): Promise<{ report: MutationReport } | { failure: string }> {
	const { root, tier, options, runStryker } = params
	let exitCode: number
	try {
		exitCode = await runStryker({ options })
	} catch (error) {
		return { failure: `Stryker failed in the ${tier} tier: ${(error as Error).message}` }
	}
	if (exitCode !== 0) return { failure: `Stryker exited ${exitCode} in the ${tier} tier` }
	const reportPath = resolve(root, options.jsonReporter.fileName)
	if (!existsSync(reportPath))
		return { failure: `Stryker wrote no report in the ${tier} tier (${reportPath})` }
	return { report: JSON.parse(readFileSync(reportPath, 'utf8')) as MutationReport }
}

/** The mode a run follows: the one asked, else the lot's switch (a gate lot runs as changed). */
function runModeOf(params: {
	asked: string | undefined
	setting: Parameters<typeof effectiveMode>[0]['mode']
	touchesScope: boolean
}): MutationMode {
	const { asked, setting, touchesScope } = params
	if (asked === 'audit' || asked === 'changed') return asked
	const mode = effectiveMode({ mode: setting, touchesScope })
	return mode === 'gate' ? 'changed' : mode
}

/** The `--mutate` targets of the scope lines changed since `base`, and that base. */
function changedTargets(params: { root: string; declaration: MutationDeclaration; base: string }): {
	base: string
	targets: string[]
} {
	const { root, declaration, base } = params
	const diff = readGit({
		root,
		args: [
			'diff',
			'--relative',
			'--no-color',
			'--no-ext-diff',
			'--no-renames',
			'-U0',
			base,
			'--',
			'.',
		],
	})
	const untracked = readGit({
		root,
		args: ['ls-files', '--others', '--exclude-standard', '--', '.'],
	})
		.split('\n')
		.filter(Boolean)
	return { base, targets: changedRanges({ declaration, diff, untracked }) }
}

/**
 * The commit a changed run diffs against: where HEAD left `--base <ref>` (a ref git does not know refuses the run),
 * else where HEAD left the package's base branch, else where it left the remote's default branch
 * (`refs/remotes/origin/HEAD`). With neither, the run is refused: diffing against HEAD would see only the uncommitted
 * work and skip the lot's commits.
 */
function baseOf(params: {
	root: string
	asked: string | undefined
	branch: string
}): string | { refused: string } {
	const { root, asked, branch } = params
	if (asked !== undefined) {
		const base = forkPointOf({ root, ref: asked })
		if (base === undefined) throw new Error(`--base ${asked}: no such commit`)
		return base
	}
	const base =
		forkPointOf({ root, ref: branch }) ?? forkPointOf({ root, ref: REMOTE_DEFAULT_BRANCH })
	if (base === undefined)
		return {
			refused: `no base branch to diff against: no ${branch} and no ${REMOTE_DEFAULT_BRANCH}; name the branch the lot started from as dialecte.baseBranch in package.json, or pass --base <ref>`,
		}
	return base
}

/** Where HEAD left `ref` (their merge base), else the commit `ref` names; undefined when git knows no such ref. */
function forkPointOf(params: { root: string; ref: string }): string | undefined {
	const { root, ref } = params
	return (
		tryReadGit({ root, args: ['merge-base', 'HEAD', ref] }) ??
		tryReadGit({ root, args: ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`] })
	)
}

/** git's answer, trimmed; undefined when git fails. */
function tryReadGit(params: { root: string; args: string[] }): string | undefined {
	try {
		return readGit(params).trim()
	} catch {
		return undefined
	}
}

function countsOf(report: MutationReport): RunCounts {
	const statuses = Object.values(report.files).flatMap(({ mutants }) =>
		mutants.map((mutant) => mutant.status),
	)
	function count(status: string): number {
		return statuses.filter((each) => each === status).length
	}
	return {
		killed: count('Killed'),
		survived: count('Survived'),
		timedOut: count(TIMEOUT_STATUS),
		noCoverage: count('NoCoverage'),
	}
}

/** The last lines of a run: package, lot, tree, mode, counts, each survivor the ledger now holds as new, and each item the run moved to killed or recorded. */
function renderRun(params: { root: string; run: RunEntry }): string {
	const { root, run } = params
	const items = itemsOf({ ledger: readLedger({ root }), packageName: run.package })
	const pendingKeys = new Set(items.filter((item) => item.state === 'new').map((item) => item.key))
	const fresh = (run.survivors ?? []).filter((survivor) => pendingKeys.has(survivor.key))
	const moved = items.filter((item) => item.movedBy === run.runId)
	return [
		`mutants run ${run.runId}: ${run.package} · lot ${run.lot} · tree ${run.tree.slice(0, SHORT_TREE_LENGTH)} · ${run.mode}`,
		renderCounts(run.counts),
		fresh.length === 0
			? 'no new survivor'
			: `${fresh.length} new survivor${fresh.length === 1 ? '' : 's'} (test it, record its reason, or dialecte mutants schedule <follow-up> <key>):`,
		...fresh.map(
			(survivor) => `  ${survivor.key}  ${survivor.file}:${survivor.line} ${survivor.mutation}`,
		),
		...(moved.length === 0
			? []
			: [
					`${moved.length} ledger item${moved.length === 1 ? '' : 's'} moved by this run:`,
					...moved.map((item) => `  ${item.key}  ${item.file}:${item.line}  ${item.state}`),
				]),
	].join('\n')
}

function renderCounts(counts: RunCounts | undefined): string {
	const { killed = 0, survived = 0, timedOut = 0, noCoverage = 0 } = counts ?? {}
	return `killed ${killed} · survived ${survived} · timed out ${timedOut} · no coverage ${noCoverage}`
}

function statusVerb(params: {
	root: string
	argv: string[]
	isAlive: (pid: number) => boolean
	startTimeOf: StartTimeReader
	now: () => Date
}): CommandResult {
	const { root, isAlive, startTimeOf, now } = params
	const read = readArguments({ argv: params.argv, valueOptions: [], flags: ['json'] })
	if (typeof read === 'string' || read.words.length > 0)
		return usageResult({ verb: 'status', json: asksJson(params.argv), read })
	const packageName = packageNameOf(root)
	const pending = pendingOf({ root, isAlive, startTimeOf })
	const scheduled = itemsOf({ ledger: readLedger({ root }), packageName }).filter(
		(item) => item.state === 'scheduled',
	)
	const status: MutantsStatus = {
		running: pending.running,
		died: pending.died,
		new: groupBy({ items: pending.new, by: (item) => item.firstSeen.lot }),
		scheduled: groupBy({ items: scheduled, by: (item) => item.followUp ?? '' }),
	}
	if (read.flags.has('json')) return { exitCode: 0, output: JSON.stringify(status, null, 2) }
	return { exitCode: 0, output: renderStatus({ packageName, status, now: now() }) }
}

function renderStatus(params: { packageName: string; status: MutantsStatus; now: Date }): string {
	const { packageName, status, now } = params
	const lines = [`mutants status: ${packageName}`]
	for (const run of status.running)
		lines.push(
			`  running  ${run.runId}  lot ${run.lot}  tree ${run.tree.slice(0, SHORT_TREE_LENGTH)}  ${run.mode}  ${ageOf({ since: run.startedAt, now })} (pid ${run.pid})`,
		)
	for (const run of status.died)
		lines.push(
			`  died     ${run.runId}  lot ${run.lot}  tree ${run.tree.slice(0, SHORT_TREE_LENGTH)}  ${run.mode}: rerun, or dialecte mutants abandon ${run.runId}`,
		)
	for (const [lot, items] of Object.entries(status.new))
		lines.push(`  new, first seen in lot ${lot}:`, ...items.map(renderItem))
	for (const [followUp, items] of Object.entries(status.scheduled))
		lines.push(`  scheduled for ${followUp}:`, ...items.map(renderItem))
	if (lines.length === 1) lines.push('  nothing pending')
	return lines.join('\n')
}

function renderItem(item: KeyedLedgerItem): string {
	return `    ${item.key}  ${item.file}:${item.line} ${item.mutation}`
}

/** How long ago `since` was: seconds under a minute, minutes under an hour, then hours and minutes. */
function ageOf(params: { since: string; now: Date }): string {
	const seconds = Math.max(
		0,
		Math.round((params.now.getTime() - new Date(params.since).getTime()) / 1000),
	)
	if (seconds < 60) return `${seconds} s`
	const minutes = Math.floor(seconds / 60)
	if (minutes < 60) return `${minutes} m`
	return `${Math.floor(minutes / 60)} h ${minutes % 60} m`
}

function groupBy(params: {
	items: readonly KeyedLedgerItem[]
	by: (item: KeyedLedgerItem) => string
}): Record<string, KeyedLedgerItem[]> {
	const groups: Record<string, KeyedLedgerItem[]> = {}
	for (const item of params.items) (groups[params.by(item)] ??= []).push(item)
	return groups
}

function scheduleVerb(params: { root: string; argv: string[] }): CommandResult {
	const { root } = params
	const json = asksJson(params.argv)
	const read = readArguments({ argv: params.argv, valueOptions: [], flags: ['all-new', 'json'] })
	if (typeof read === 'string') return usageResult({ verb: 'schedule', json, read })
	const [followUp, ...keys] = read.words
	const allNew = read.flags.has('all-new')
	if (!followUp || (keys.length === 0) === !allNew) return usageResult({ verb: 'schedule', json })
	const result = allNew
		? scheduleAllNew({ root, followUp })
		: scheduleItems({ root, keys, followUp })
	if (!result.ok) return refused({ verb: 'schedule', json, reason: result.reason })
	return answered({
		verb: 'schedule',
		json,
		text: `mutants schedule: ${result.scheduled.length} survivor${result.scheduled.length === 1 ? '' : 's'} scheduled for ${followUp}${result.scheduled.map((key) => `\n  ${key}`).join('')}`,
		fields: { followUp, scheduled: result.scheduled },
	})
}

function abandonVerb(params: {
	root: string
	argv: string[]
	isAlive: (pid: number) => boolean
	startTimeOf: StartTimeReader
}): CommandResult {
	const { root, isAlive, startTimeOf } = params
	const json = asksJson(params.argv)
	const read = readArguments({ argv: params.argv, valueOptions: [], flags: ['json'] })
	if (typeof read === 'string' || read.words.length !== 1)
		return usageResult({ verb: 'abandon', json, read })
	const [runId] = read.words
	const result = abandonRun({ root, runId, isAlive, startTimeOf })
	if (!result.ok) return refused({ verb: 'abandon', json, reason: result.reason })
	return answered({
		verb: 'abandon',
		json,
		text: `mutants abandon: run ${runId} abandoned (its entry is kept)`,
		fields: { runId },
	})
}

function migrateVerb(params: { root: string; argv: string[] }): CommandResult {
	const { root } = params
	const json = asksJson(params.argv)
	const read = readArguments({ argv: params.argv, valueOptions: [], flags: ['json'] })
	if (typeof read === 'string' || read.words.length > 0)
		return usageResult({ verb: 'migrate', json, read })
	const legacyPath = join(root, LEGACY_RECORDS_PATH)
	if (!existsSync(legacyPath))
		return refused({ verb: 'migrate', json, reason: `no ${LEGACY_RECORDS_PATH} in ${root}` })
	if (existsSync(join(root, MUTATION_RECORDS_PATH)))
		return refused({
			verb: 'migrate',
			json,
			reason: `${MUTATION_RECORDS_PATH} already exists in ${root}: nothing overwritten`,
		})
	const legacy = JSON.parse(readFileSync(legacyPath, 'utf8')) as LegacyRecords
	const records = migrateRecords({ legacy, readLine: (line) => readLineOf({ root, ...line }) })
	writeRecordsFile({ root, records })
	const count = Object.values(records).reduce(
		(total, mutants) => total + Object.keys(mutants).length,
		0,
	)
	return answered({
		verb: 'migrate',
		json,
		text: `mutants migrate: ${count} record${count === 1 ? '' : 's'} written to ${MUTATION_RECORDS_PATH} (${LEGACY_RECORDS_PATH} kept)`,
		fields: { path: MUTATION_RECORDS_PATH, written: count },
	})
}

/** The text of a line of a package file; empty when the file or the line is gone. */
function readLineOf(params: { root: string; file: string; line: number }): string {
	const path = join(params.root, params.file)
	if (!existsSync(path)) return ''
	return readFileSync(path, 'utf8').split('\n')[params.line - 1] ?? ''
}

function usage(read?: unknown): CommandResult {
	return usageResult({ read })
}

function newDate(): Date {
	return new Date()
}

/** The cli's build output folder: `dist/` beside the cli's package.json (the bundle sits in it, the sources under `src/`). */
function cliDistFolder(): string {
	const start = dirname(fileURLToPath(import.meta.url))
	return join(packageRootOf(start) ?? start, CLI_DIST_FOLDER)
}

/** Runs StrykerJS as the package in the current folder installs it, with the options in memory. */
async function runStrykerOfPackage(params: { options: StrykerOptions }): Promise<number> {
	const requireFromPackage = createRequire(join(process.cwd(), 'package.json'))
	const entry = requireFromPackage.resolve('@stryker-mutator/core')
	const strykerModule = (await import(pathToFileURL(entry).href)) as StrykerModule
	const stryker = new strykerModule.Stryker(params.options)
	await stryker.runMutationTest()
	return 0
}
