import { INSTALL_WORKFLOW } from './ci-package.constants.ts'

/** What the `dialecte ci` tests read of the rendered template files. */
import { parse } from 'yaml'

import type { CiFiles } from '../src/lib/ci/ci-template.types.ts'
import type { CiSummary } from './ci-summary.types.ts'

/**
 * The jobs, inputs, cli runs and Playwright steps of the rendered files; a slot left is the cli slot, or a `{{` not
 * opening a GitHub `${{ }}` expression.
 */
export function summaryOf(files: CiFiles): CiSummary {
	const ci = parse(files.get('.github/workflows/ci.yml') ?? '') as {
		jobs: Record<string, { needs?: string[]; with?: unknown }>
	}
	const runs = [...files.values()].flatMap((text) =>
		text
			.split('\n')
			.map((line) => /^\s*(?:- )?run: (.*\bci [a-z-]+)$/.exec(line)?.[1])
			.filter((run): run is string => run !== undefined),
	)
	return {
		paths: [...files.keys()].sort(),
		ciJobs: Object.keys(ci.jobs).sort(),
		ciOkNeeds: [...(ci.jobs['ci-ok']?.needs ?? [])].sort(),
		testWith: ci.jobs.test?.with,
		cliRuns: runs.sort(),
		playwright: (files.get(INSTALL_WORKFLOW) ?? '').includes('playwright'),
		slotsLeft: [...files]
			.filter(([, text]) => /(?<!\$)\{\{|__dialecte_cli__/.test(text))
			.map(([path]) => path),
		restoresFailOnMiss: nodeModulesRestoresOf(files).every(
			(step) => step.with?.['fail-on-cache-miss'] === true,
		),
	}
}

/** Every node_modules cache step of the rendered workflows but the install workflow's. */
function nodeModulesRestoresOf(files: CiFiles): { with?: Record<string, unknown> }[] {
	return [...files]
		.filter(([path]) => path.endsWith('.yml') && path !== INSTALL_WORKFLOW)
		.flatMap(([, text]) => {
			const workflow = parse(text) as {
				jobs?: Record<string, { steps?: { uses?: string; with?: Record<string, unknown> }[] }>
			}
			return Object.values(workflow.jobs ?? {}).flatMap((job) => job.steps ?? [])
		})
		.filter((step) => step.uses?.startsWith('actions/cache') && step.with?.path === 'node_modules')
}
