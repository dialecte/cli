import {
	corporaProblem,
	loadProblem,
	mappingProblem,
	referencesProblem,
	stringListProblem,
	stringProblem,
} from './config-checks.ts'

import type { ConfigKeySpec } from './config.types.ts'

/** The registry's entries as written, their literal keys and layers kept (`as const`). */
const CONFIG_KEY_ENTRIES = [
	{
		key: 'profile',
		layer: 'project',
		repoOverride: false,
		description:
			'`contributor` (a package of the Dialecte family) or `consumer` (an app; the default).',
		problemOf: stringProblem,
	},
	{
		key: 'baseBranch',
		layer: 'project',
		repoOverride: false,
		description: 'The branch work is merged into (`main` when not said).',
		problemOf: stringProblem,
	},
	{
		key: 'gate',
		layer: 'project',
		repoOverride: false,
		description: 'Steps replacing the default ones of `dialecte gate` (fast, full, release, skip).',
		problemOf: mappingProblem,
	},
	{
		key: 'contrib',
		layer: 'project',
		repoOverride: false,
		description: 'The package steps of `dialecte contrib` (steps, skip).',
		problemOf: mappingProblem,
	},
	{
		key: 'tdd',
		layer: 'project',
		repoOverride: false,
		description: '`dialecte tdd` settings (production: folders whose files are production code).',
		problemOf: mappingProblem,
	},
	{
		key: 'references',
		layer: 'project',
		repoOverride: false,
		description:
			'allow: labels of generic patterns committed on purpose; patterns: regular expressions never committed.',
		problemOf: referencesProblem,
	},
	{
		key: 'mutation',
		layer: 'project',
		repoOverride: false,
		description: 'Mutation testing settings.',
		problemOf: mappingProblem,
	},
	{
		key: 'generatedDocs',
		layer: 'project',
		repoOverride: false,
		description: 'Files a docs build rewrites, restored byte for byte after `gate --full`.',
		problemOf: stringListProblem,
	},
	{
		key: 'risk',
		layer: 'project',
		repoOverride: false,
		description: 'Lot risk settings (high: globs whose change makes a lot high risk).',
		problemOf: mappingProblem,
	},
	{
		key: 'rebuiltIgnored',
		layer: 'project',
		repoOverride: false,
		description:
			'Ignored folders a build or a run rebuilds (`coverage/`): a worktree removal may delete them.',
		problemOf: stringListProblem,
	},
	{
		key: 'tsconfig',
		layer: 'project',
		repoOverride: false,
		description: 'The tsconfig of the type benchmarks.',
		problemOf: stringProblem,
	},
	{
		key: 'namespace',
		layer: 'project',
		repoOverride: false,
		description:
			'The hydrated namespace of the dialect (the capitalized package name when not said).',
		problemOf: stringProblem,
	},
	{
		key: 'entry',
		layer: 'project',
		repoOverride: false,
		description: 'The import the type benchmarks read the dialect from.',
		problemOf: stringProblem,
	},
	{
		key: 'constantsDir',
		layer: 'project',
		repoOverride: false,
		description: 'The folder holding the generated constants of the dialect.',
		problemOf: stringProblem,
	},
	{
		key: 'out',
		layer: 'project',
		repoOverride: false,
		description: 'The folder the type benchmarks are written to.',
		problemOf: stringProblem,
	},
	{
		key: 'editor',
		layer: 'personal',
		repoOverride: true,
		description: 'The command opening a file in your editor.',
		problemOf: stringProblem,
	},
	{
		key: 'load',
		layer: 'personal',
		repoOverride: true,
		description: 'Machine load settings (budget: a whole number of 1 or more).',
		problemOf: loadProblem,
	},
	{
		key: 'personProcesses',
		layer: 'personal',
		repoOverride: true,
		description:
			"Your own tools' process names (a terminal, an editor), never counted as left behind in a worktree.",
		problemOf: stringListProblem,
	},
	{
		key: 'forbiddenWords',
		layer: 'personal',
		repoOverride: true,
		description: 'Words never committed, checked by `dialecte rules`.',
		problemOf: stringListProblem,
	},
	{
		key: 'consumerNames',
		layer: 'personal',
		repoOverride: true,
		description:
			'The tools that consume a contributor package, which its committed text never names.',
		problemOf: stringListProblem,
	},
	{
		key: 'corpora',
		layer: 'personal',
		repoOverride: false,
		description: 'Licensed corpora by name: { xsd: path, instances?: folder }, never committed.',
		problemOf: corporaProblem,
	},
] as const satisfies readonly ConfigKeySpec[]

/**
 * The registry of every config key: project keys (`.dialecterc`) first, then personal keys (`config.yml`). Each
 * entry keeps its literal key and layer, so the settings types are checked against them, and reads as a
 * `ConfigKeySpec` (its optional fields included).
 */
export const CONFIG_KEYS: readonly ((typeof CONFIG_KEY_ENTRIES)[number] & ConfigKeySpec)[] =
	CONFIG_KEY_ENTRIES
