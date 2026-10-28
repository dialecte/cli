import type { ModelTierMap, ModelTierName, VendorHost } from './model-tiers.types.ts'

/** The vendor families of the tier map. */
export const VENDOR_IDS = ['anthropic', 'openai', 'google'] as const

/** What an agent asks for instead of naming a model, cheapest first. */
export const TIER_NAMES = ['fast', 'standard', 'strong', 'frontier'] as const

/** What each tier is for, one line each. */
export const TIER_DEFINITIONS: Readonly<Record<ModelTierName, string>> = {
	fast: 'search and locate, graders with a schema, log and diff summaries, format and shape checks, "does file X say Y"',
	standard:
		'implementer on a mechanical or well-specified lot, fix mode on wording and rename findings, skill-eval runs, independent readers of a standard',
	strong:
		'the orchestrator, an implementer on a design-heavy lot, the review (one agent, both passes), adjudicating a disagreement, the retro',
	frontier:
		'rare: a plan challenge, a cross-repo architecture decision, a stuck lot after the 3-round cap',
}

/** The model each vendor family offers per tier. Refresh with each cli release, against each vendor's own model page. */
export const MODEL_TIERS: ModelTierMap = {
	checkedAt: '2026-10-28',
	vendors: {
		anthropic: {
			tiers: {
				fast: { model: 'Haiku 5.5' },
				standard: { model: 'Sonnet 5.5' },
				strong: { model: 'Opus 5.5' },
				frontier: { model: 'Fable 5.1' },
			},
		},
		openai: {
			tiers: {
				fast: { model: 'Luna' },
				standard: { model: 'Sol' },
				strong: { model: 'Sol', effort: 'high' },
				frontier: { model: 'Astra' },
			},
		},
		google: {
			note: "frontier: check Google's own model page for the current flagship (4 Argon, if generally available)",
			tiers: {
				fast: { model: 'Flash-Lite' },
				standard: { model: 'Flash' },
				strong: { model: 'Pro' },
				frontier: { model: 'the current flagship' },
			},
		},
	},
}

/** Files that tell which agent a project is set up for; every path of an entry must exist. */
export const VENDOR_HOSTS: readonly VendorHost[] = [
	{ agent: 'claude-code', vendor: 'anthropic', anyOf: [['.claude']] },
	{ agent: 'codex', vendor: 'openai', anyOf: [['AGENTS.md', '.codex']] },
	{ agent: 'gemini-cli', vendor: 'google', anyOf: [['.gemini']] },
	{
		agent: 'copilot',
		multiVendor: true,
		anyOf: [['.github/copilot-instructions.md'], ['.github/skills']],
	},
	{ agent: 'cursor', multiVendor: true, anyOf: [['.cursor']] },
]
