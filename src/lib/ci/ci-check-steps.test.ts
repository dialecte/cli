/**
 * The check job runs what the commit hook runs and `--no-verify` skips: the package's `skills:check` script when it
 * has one (the `skillsCheck` fact), and the cli's `rules --base` over the change, against the base the released
 * changelog step reads (the queue's base sha, else the pull request merge ref's first parent), on every event but a
 * dispatch.
 */
import { ciPackage } from '../../../test/ci-package.ts'
import { readCiFacts } from './ci-facts.ts'
import { readCiTemplate, renderCiFiles } from './ci-template.ts'

import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

import type { CiFacts } from './ci-template.types.ts'

/** The facts of a package that runs the installed cli and has none of the optional jobs. */
const PLAIN: CiFacts = {
	cli: 'installed',
	typePerf: false,
	docs: false,
	playwright: false,
	testMode: false,
	skillsCheck: false,
}

/** The steps of the rendered check job for `facts`. */
function checkStepsOf(facts: CiFacts): Record<string, unknown>[] {
	const workflow = parse(
		renderCiFiles({ facts, template: readCiTemplate() }).get('.github/workflows/_check.yml') ?? '',
	) as { jobs: { check: { steps: Record<string, unknown>[] } } }
	return workflow.jobs.check.steps
}

/** The rules step the check job runs with `cli` filling the cli slot. */
function rulesStepOf(cli: string): Record<string, unknown> {
	return {
		name: 'Code rules over the change',
		if: "github.event_name != 'workflow_dispatch'",
		env: {
			BASE: "${{ github.event_name == 'merge_group' && github.event.merge_group.base_sha || 'HEAD^1' }}",
		},
		run: `${cli} rules --base "$BASE"`,
	}
}

const SKILLS_STEP = {
	name: 'Skill pages in step with the package (its skills:check script)',
	run: 'npm run skills:check',
}

describe('readCiFacts: skillsCheck', () => {
	it.each([
		{
			label: 'a skills:check script → skillsCheck',
			scripts: { build: 'tsup', 'skills:check': 'dialecte skills check' },
			skillsCheck: true,
		},
		{
			label: 'no skills:check script → no skillsCheck',
			scripts: { build: 'tsup' },
			skillsCheck: false,
		},
	])('$label', ({ scripts, skillsCheck }) => {
		const root = ciPackage({
			files: { 'package.json': JSON.stringify({ name: '@scope/x', version: '1.0.0', scripts }) },
		})

		const read = readCiFacts(root)

		expect('facts' in read && read.facts.skillsCheck).toBe(skillsCheck)
	})
})

describe('the rendered check job', () => {
	it.each([
		{ label: 'skillsCheck → the skills step', skillsCheck: true, skills: [SKILLS_STEP] },
		{ label: 'no skillsCheck → no skills step', skillsCheck: false, skills: [] },
	])('$label', ({ skillsCheck, skills }) => {
		const steps = checkStepsOf({ ...PLAIN, skillsCheck })

		expect(steps.filter((step) => step.run === 'npm run skills:check')).toEqual(skills)
	})

	it.each([
		{ label: 'the installed cli', facts: PLAIN, cli: 'npx --no-install dialecte' },
		{
			label: 'the cli from its sources',
			facts: { ...PLAIN, cli: 'source' as const },
			cli: 'node src/cli.ts',
		},
	])(
		'$label → the rules step over the change, after the released changelog step',
		({ facts, cli }) => {
			const steps = checkStepsOf(facts)
			const names = steps.map((step) => step.name)

			expect({
				rules: steps.filter((step) => step.name === 'Code rules over the change'),
				afterChangelog:
					names.indexOf('Code rules over the change') >
					names.indexOf('Released changelog sections stay as released'),
			}).toEqual({ rules: [rulesStepOf(cli)], afterChangelog: true })
		},
	)
})
