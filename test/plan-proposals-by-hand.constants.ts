/**
 * The blocks and facts of the two mornings whose proposals were made by hand (2026-11-08 and 2026-11-10), the cases
 * `plan next` must reproduce. Entries are copied from the lot block of the engine plan, trimmed to what the cases
 * need; spec files are absolute beside the plan. V1's dependsOn follows the spec's case (TS-CLI only: V1 is held),
 * not the live block, which lists more dependencies.
 */
import {
	blockOf,
	factsOf,
	fixOf,
	lotOf,
	personOf,
	planFile,
	registryOf,
	worktreeOf,
} from './plan-state-facts.ts'

import type { PlanBlock, PlanEntry } from '../src/lib/plan/plan-block.types.ts'
import type { PlanFacts, RegistryFact, SpecStatusName } from '../src/lib/plan/plan.types.ts'

const CLI_SHARED = {
	cli: [
		'CHANGELOG.md',
		'README.md',
		'src/lib/command-map/command-map.constants.ts',
		'src/cli.constants.ts',
	],
}

/** A committed registry entry for each entry (by its branch; by its hand-over folder when it names one). */
function committedFor(entries: PlanEntry[]): RegistryFact[] {
	return entries.map((entry) =>
		registryOf({
			name: `2026-11-01-${entry.id.toLowerCase()}`,
			branch: entry.match?.branch ?? '',
			folder: entry.match?.handover ?? planFile(`done-${entry.id}`),
			state: 'committed',
		}),
	)
}

// ------------------------------------------------------------------------------------ 2026-11-08 morning

const MORNING_NOV_08_DONE: PlanEntry[] = [
	lotOf('A1', {
		group: 'A',
		scope: { cli: ['src/lib/command-map/', 'src/commands/', 'src/cli.ts'] },
	}),
	lotOf('A1b', { group: 'A', dependsOn: ['A1'], scope: { cli: ['src/lib/skills/'] } }),
	lotOf('W', { scope: { cli: ['src/lib/worktree/'] } }),
	lotOf('WP', {
		dependsOn: ['A1', 'W'],
		scope: { cli: ['src/lib/worktree/', 'src/lib/handover/close-handovers.ts'] },
	}),
]

/** 2026-11-08 morning: K1 open (manual), S1a, T, F (spec DRAFT) and K2. */
export const MORNING_NOV_08_BLOCK: PlanBlock = blockOf({
	lots: [
		...MORNING_NOV_08_DONE,
		lotOf('K1', {
			group: 'K',
			dependsOn: ['A1'],
			scope: { cli: ['src/lib/knowledge/standard/', 'src/commands/standard.ts'] },
			match: { branch: 'feat/standard-index' },
		}),
		lotOf('S1a', {
			group: 'S',
			dependsOn: ['A', 'W', 'WP'],
			spec: planFile('33S-LOT-STORE.md'),
			scope: {
				cli: ['src/lib/store/', 'src/commands/lot-start.ts', 'src/commands/lot-status.ts'],
			},
		}),
		fixOf('T', { scope: { cli: ['src/lib/tdd/', 'src/lib/gate/'] }, heavy: ['mutation'] }),
		lotOf('F', {
			spec: planFile('33F-FIXTURE-BREAK.md'),
			scope: { cli: ['src/lib/fixture/', 'src/commands/fixture.ts'] },
		}),
		lotOf('K2', { dependsOn: ['K1', 'S1a'], scope: { cli: ['src/lib/schema/'] } }),
	],
})

export const MORNING_NOV_08_FACTS: PlanFacts = factsOf({
	repositories: {
		cli: {
			registry: committedFor(MORNING_NOV_08_DONE),
			worktrees: [worktreeOf('0005-cli-standard-index', 'feat/standard-index')],
		},
	},
	specs: {
		[planFile('33S-LOT-STORE.md')]: 'written',
		[planFile('33F-FIXTURE-BREAK.md')]: 'DRAFT',
	},
})

// ------------------------------------------------------------------------------------ 2026-11-10 morning

const MORNING_NOV_10_DONE_BEFORE: PlanEntry[] = [
	lotOf('A1', {
		group: 'A',
		scope: { cli: ['src/lib/command-map/', 'src/commands/', 'src/cli.ts'] },
	}),
	lotOf('A1b', { group: 'A', dependsOn: ['A1'], scope: { cli: ['src/lib/skills/'] } }),
	lotOf('W', { scope: { cli: ['src/lib/worktree/'] } }),
	lotOf('WP', {
		dependsOn: ['A1', 'W'],
		scope: { cli: ['src/lib/worktree/', 'src/lib/handover/close-handovers.ts'] },
	}),
	lotOf('K1', {
		group: 'K',
		dependsOn: ['A1'],
		spec: planFile('33K-ANSWER-LADDER.md'),
		scope: {
			cli: [
				'src/lib/knowledge/standard/',
				'src/lib/standard/',
				'src/commands/standard.ts',
				'src/lookups.ts',
			],
		},
		match: { branch: 'feat/standard-index' },
	}),
	fixOf('T', { scope: { cli: ['src/lib/tdd/', 'src/lib/gate/'] } }),
	lotOf('S1a', {
		group: 'S',
		dependsOn: ['A', 'W', 'WP'],
		scope: { cli: ['src/lib/store/', 'src/commands/lot-start.ts', 'src/commands/lot-status.ts'] },
	}),
	lotOf('S1b', {
		group: 'S',
		dependsOn: ['S1a'],
		scope: { cli: ['src/lib/store/', 'src/lib/handover/', 'src/commands/lot.ts'] },
	}),
	lotOf('S2', {
		group: 'S',
		dependsOn: ['S1b'],
		scope: { cli: ['src/lib/store/', 'src/commands/lot.ts', 'src/commands/inbox.ts'] },
	}),
	lotOf('TS-CLI', {
		scope: { cli: ['src/lib/gate/', 'src/lib/gate-records/', 'src/lib/contrib/'] },
	}),
	fixOf('T2', { scope: { cli: ['src/lib/tdd/'] } }),
	lotOf('L0-0', {
		group: 'L0',
		dependsOn: ['S1b'],
		scope: { cli: ['src/lib/cleanup/', 'src/lib/worktree/', 'src/commands/lot-close.ts'] },
		match: { branch: 'feat/events-report-l0', handover: planFile('L0-0') },
	}),
]

const MORNING_NOV_10_OPEN_AND_LATER: PlanEntry[] = [
	lotOf('L0a1', {
		group: 'L0',
		dependsOn: ['L0-0', 'S2'],
		spec: planFile('33L0-EVENTS-REPORT.md'),
		scope: {
			cli: [
				'src/lib/events/',
				'src/commands/lot.ts',
				'src/lib/gate/run-gate.ts',
				'src/lib/handover/run-handover-folder.ts',
				'src/lib/store/',
				'package.json',
			],
		},
		match: { branch: 'feat/events-report-l0', handover: planFile('L0a1') },
	}),
	lotOf('L0a2', {
		group: 'L0',
		dependsOn: ['L0a1'],
		spec: planFile('33L0-EVENTS-REPORT.md'),
		scope: {
			cli: ['src/lib/events/', 'src/lib/handover/', 'src/lib/card/', 'src/commands/lot-report.ts'],
		},
		match: { branch: 'feat/events-report-l0', handover: planFile('L0a2') },
	}),
	lotOf('L0b', {
		group: 'L0',
		dependsOn: ['L0a2'],
		spec: planFile('33L0-EVENTS-REPORT.md'),
		scope: { cli: ['src/lib/cleanup/', 'src/lib/worktree/', 'src/commands/lot-prune.ts'] },
		match: { branch: 'feat/events-report-l0', handover: planFile('L0b') },
	}),
	lotOf('P0', {
		dependsOn: ['S2', 'TS-CLI', 'T2'],
		scope: {
			cli: [
				'src/lib/card/',
				'src/lib/handover/',
				'src/lib/rules/',
				'src/lib/progress/',
				'src/lib/store/',
				'src/commands/',
				'src/lib/format.ts',
				'test/',
			],
		},
		match: { branch: 'feat/cli-polish-p0' },
	}),
	personOf('K0', { spec: planFile('33K0-STANDARD-CONVERT.md') }),
]

const MORNING_NOV_10_FIX: PlanEntry = fixOf('FIX-lookups-docs', {
	scope: { cli: ['src/lookups', '.github/'] },
	match: { branch: 'fix/lookups-docs' },
})

const MORNING_NOV_10_WAITING: PlanEntry[] = [
	lotOf('K2a', {
		group: 'K2',
		dependsOn: ['K1', 'P0', 'FIX-lookups-docs'],
		spec: planFile('33K-ANSWER-LADDER.md'),
		scope: { cli: ['src/lib/schema/', 'src/lookups.ts', 'src/commands/schema.ts'] },
	}),
	lotOf('K2b', {
		group: 'K2',
		dependsOn: ['K2a'],
		spec: planFile('33K-ANSWER-LADDER.md'),
		scope: { cli: ['src/lib/knowledge/facts/', 'src/commands/facts.ts'] },
	}),
	lotOf('K2c', {
		group: 'K2',
		dependsOn: ['K2a', 'K2b', 'L0a1', 'P0'],
		spec: planFile('33K-ANSWER-LADDER.md'),
		scope: { cli: ['src/lib/knowledge/ask/', 'src/commands/ask.ts', 'src/lookups.ts'] },
	}),
	lotOf('K3', {
		group: 'K',
		dependsOn: ['K2'],
		spec: planFile('33K-ANSWER-LADDER.md'),
		scope: { cli: ['src/lib/knowledge/ask/', 'src/commands/ask.ts'], core: ['skills/'] },
	}),
	lotOf('N1', {
		group: 'N',
		dependsOn: ['S2', 'L0a1'],
		spec: planFile('33N-PLAN-NEXT.md'),
		scope: { cli: ['src/lib/plan/', 'src/lib/heavy/', 'src/commands/plan.ts'] },
	}),
	lotOf('N2', {
		group: 'N',
		dependsOn: ['N1', 'L0a1'],
		spec: planFile('33N-PLAN-NEXT.md'),
		scope: { cli: ['src/lib/heavy/', 'src/lib/gate/run-gate.ts', 'src/commands/inbox.ts'] },
	}),
	lotOf('L1a', {
		group: 'L1',
		dependsOn: ['L0a1', 'P0'],
		spec: planFile('33L1-STATUS-RISK.md'),
		scope: {
			cli: ['src/lib/store/next-station', 'src/lib/review-rounds/', 'src/commands/record.ts'],
		},
	}),
	lotOf('L1b', {
		group: 'L1',
		dependsOn: ['S2', 'L1a'],
		spec: planFile('33L1-STATUS-RISK.md'),
		scope: { cli: ['src/lib/risk/', 'src/lib/card/', 'package.json'] },
	}),
	lotOf('L1c', {
		group: 'L1',
		dependsOn: ['L0a1'],
		spec: planFile('33L1-STATUS-RISK.md'),
		scope: { cli: ['src/lib/handover/commit-lots.ts', 'src/lib/card/'] },
	}),
	lotOf('RG', {
		dependsOn: ['P0'],
		spec: planFile('33RG-RULE-GAPS.md'),
		scope: { cli: ['src/lib/tdd/', 'src/lib/gate/', 'src/lib/card/', 'src/lib/handover/'] },
	}),
	lotOf('Q1', {
		group: 'Q',
		dependsOn: ['P0', 'RG'],
		spec: planFile('33Q-QUALITY-CHECKS.md'),
		scope: { cli: ['src/lib/rules/', 'src/commands/rules.ts'] },
	}),
	lotOf('V1', {
		dependsOn: ['TS-CLI'],
		spec: planFile('33V1-PROGRESS-TREE.md'),
		scope: { cli: ['src/lib/progress/', 'src/lib/handover/'] },
	}),
	lotOf('F', {
		spec: planFile('33F-FIXTURE-BREAK.md'),
		parked: "the user's call: core's tests are slow (2026-11-10)",
		scope: { cli: ['src/lib/fixture/'], core: ['src/'] },
	}),
	lotOf('L2', { dependsOn: ['L1', 'K', 'K2'], scope: { cli: ['src/lib/engine/'] } }),
	lotOf('U', { dependsOn: ['L2', 'F'], scope: { cli: ['src/lib/spike/'] } }),
]

/** 2026-11-10 morning, with the lookups fix entry. */
export const MORNING_NOV_10_BLOCK: PlanBlock = blockOf({
	repositories: ['cli', 'core'],
	shared: CLI_SHARED,
	lots: [
		...MORNING_NOV_10_DONE_BEFORE,
		...MORNING_NOV_10_OPEN_AND_LATER,
		MORNING_NOV_10_FIX,
		...MORNING_NOV_10_WAITING,
	],
})

/** 2026-11-10 morning without the fix entry (K2a no longer depends on it). */
export const MORNING_NOV_10_BLOCK_WITHOUT_FIX: PlanBlock = {
	...MORNING_NOV_10_BLOCK,
	lots: MORNING_NOV_10_BLOCK.lots
		.filter((entry) => entry.id !== 'FIX-lookups-docs')
		.map((entry) => (entry.id === 'K2a' ? { ...entry, dependsOn: ['K1', 'P0'] } : entry)),
}

const MORNING_NOV_10_SPEC_STATUS: [string, SpecStatusName][] = [
	['33K-ANSWER-LADDER.md', 'DRAFT'],
	['33N-PLAN-NEXT.md', 'DRAFT'],
	['33L1-STATUS-RISK.md', 'DRAFT'],
	['33L0-EVENTS-REPORT.md', 'written'],
	['33RG-RULE-GAPS.md', 'written'],
	['33Q-QUALITY-CHECKS.md', 'written'],
	['33V1-PROGRESS-TREE.md', 'written'],
	['33F-FIXTURE-BREAK.md', 'written'],
	['33K0-STANDARD-CONVERT.md', 'DRAFT'],
]

/** What is on disk that morning: everything before L0a1 committed, L0a1 and P0 working in their worktrees. */
export const MORNING_NOV_10_FACTS: PlanFacts = factsOf({
	repositories: {
		cli: {
			registry: committedFor(MORNING_NOV_10_DONE_BEFORE),
			worktrees: [
				worktreeOf('0016-cli-events-report-l0', 'feat/events-report-l0'),
				worktreeOf('0015-cli-cli-polish-p0', 'feat/cli-polish-p0'),
			],
		},
		core: {},
	},
	specs: Object.fromEntries(
		MORNING_NOV_10_SPEC_STATUS.map(([file, status]) => [planFile(file), status]),
	),
})
