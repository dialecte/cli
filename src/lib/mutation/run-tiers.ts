/** A mutation run's Stryker tiers: the fast tier, the timed-out mutants alone, the full tier when declared. */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { packageRootOf } from '../package-root.ts'
import { printLines } from '../print/print.ts'
import { readCliVersion } from '../read-cli-version.ts'
import { computeIncrementalKey, packageHashOf } from './cache-key.ts'
import { seedIncrementalFile, storeIncrementalFile } from './incremental-cache.ts'
import {
	judgeReport,
	parseTarget,
	rangesOf,
	withFullRun,
	withinTargets,
	withLoneTimeouts,
} from './judge.ts'
import {
	CLI_DIST_FOLDER,
	EMPTY_STRYKER_CONFIG_FILE,
	IGNORER_PLUGIN_FILE,
	TIMEOUT_STATUS,
} from './mutation.constants.ts'
import { buildStrykerOptions } from './stryker-options.ts'

import type {
	MutationDeclaration,
	MutationRecords,
	MutationReport,
	MutationTier,
	StrykerOptions,
	StrykerRunner,
	TierResult,
	MergedTiersResult,
} from './mutation.types.ts'

/** The ignorer plugin Stryker loads: the built JS under the cli's `dist/`, never the `.ts` source. */
export function ignorerPluginPath(params: { distFolder: string }): string {
	return join(params.distFolder, IGNORER_PLUGIN_FILE)
}

/** The fast tier, the timed-out mutants alone, the full tier on the unlisted survivors when declared: the merged report and its survivors. */
export async function runTiers(params: {
	root: string
	declaration: MutationDeclaration
	targets: string[]
	records: MutationRecords
	workDir: string
	tree: string
	runStryker: StrykerRunner
}): Promise<MergedTiersResult> {
	const { declaration, records } = params
	const fast = await runFastTier(params)
	if ('failure' in fast) return fast
	let { report } = fast

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

/** The fast tier on the targets, seeded from and stored to the incremental cache: its report cut to the targets. */
async function runFastTier(params: {
	root: string
	declaration: MutationDeclaration
	targets: string[]
	workDir: string
	tree: string
	runStryker: StrykerRunner
}): Promise<TierResult> {
	const { root, targets, tree } = params
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
		printLines({
			stream: 'stderr',
			lines: [
				`mutants run: the incremental cache was not written (${(error as Error).message}); the next run of this tree starts cold`,
			],
		})
	}
	return {
		report: withinTargets({
			report: fast.report,
			targets: targets.map((target) => parseTarget({ target })),
		}),
	}
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
	runStryker: StrykerRunner
}): Promise<TierResult> {
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

/** The cli's build output folder: `dist/` beside the cli's package.json (the bundle sits in it, the sources under `src/`). */
function cliDistFolder(): string {
	const start = dirname(fileURLToPath(import.meta.url))
	return join(packageRootOf(start) ?? start, CLI_DIST_FOLDER)
}
