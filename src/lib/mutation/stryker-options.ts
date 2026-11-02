import { INCREMENTAL_FILE_NAME } from './incremental-cache.constants.ts'
import {
	IGNORER_NAMES,
	STRYKER_IGNORE_PATTERNS,
	STRYKER_REPORTERS,
	SINGLE_WORKER_TIERS,
	STRYKER_VITEST_RUNNER_PLUGIN,
	TIER_TIMEOUT_MS,
} from './mutation.constants.ts'

import type { MutationDeclaration, MutationTier, StrykerOptions } from './mutation.types.ts'

/**
 * The StrykerJS options of one tier, built in memory (nothing is written): fast (vitest, per-test coverage,
 * incremental, its file in the run's work folder), timeouts (the same, one worker, a long limit) or full (the declared command, one worker). The
 * report file and temp folder sit under `workDir`, apart per tier; `concurrency` is set only when passed, or
 * always 1 for the tiers that need it; only the fast tier is incremental (said explicitly, so no config file turns it on
 * elsewhere). Throws for `full` on a declaration without `full.command`.
 */
export function buildStrykerOptions(params: {
	declaration: MutationDeclaration
	tier: MutationTier
	mutate: string[]
	workDir: string
	ignorerPlugin: string
	concurrency?: number
	/** The config file Stryker reads under these options (an empty one keeps the package's own config out). */
	configFile?: string
}): StrykerOptions {
	const { declaration, tier, mutate, workDir, ignorerPlugin, concurrency, configFile } = params
	const common = {
		mutate,
		ignorers: [...IGNORER_NAMES],
		reporters: [...STRYKER_REPORTERS],
		ignorePatterns: [...STRYKER_IGNORE_PATTERNS],
		dialecteMutation: { errorFactories: declaration.errorFactories },
		jsonReporter: { fileName: `${workDir}/report-${tier}.json` },
		tempDirName: `${workDir}/stryker-tmp-${tier}`,
		disableTypeChecks: false,
		timeoutMS: TIER_TIMEOUT_MS[tier],
		...(configFile === undefined ? {} : { configFile }),
		...(SINGLE_WORKER_TIERS.includes(tier)
			? { concurrency: 1 }
			: concurrency === undefined
				? {}
				: { concurrency }),
	}

	if (tier === 'full') {
		if (declaration.full === undefined)
			throw new Error('dialecte.mutation.full.command is required to run the full tier')
		return {
			...common,
			testRunner: 'command',
			commandRunner: { command: declaration.full.command },
			coverageAnalysis: 'off',
			incremental: false,
			plugins: [ignorerPlugin],
		}
	}

	return {
		...common,
		testRunner: 'vitest',
		vitest: { configFile: declaration.fast.vitestConfig, related: false },
		coverageAnalysis: 'perTest',
		incremental: tier === 'fast',
		...(tier === 'fast' ? { incrementalFile: `${workDir}/${INCREMENTAL_FILE_NAME}` } : {}),
		plugins: [STRYKER_VITEST_RUNNER_PLUGIN, ignorerPlugin],
	}
}
