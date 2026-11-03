import { claudeModelAlias, planStationAgents } from './render-station-agent.ts'
import {
	GENERATED_NOTE,
	LOAD_SKILLS_LINE,
	NEVER_LINE,
	STATIONS,
} from './station-agents.constants.ts'

import { describe, expect, it } from 'vitest'

import type { StationAgentFile } from './station-agents.types.ts'

function planFiles(): StationAgentFile[] {
	const plan = planStationAgents({ vendor: 'anthropic' })
	if (plan.kind !== 'files') throw new Error(`expected files, got: ${plan.reason}`)
	return plan.files
}

function fileOf(station: string): string {
	const content = planFiles().find(
		(candidate) => candidate.name === `dialecte-${station}.md`,
	)?.content
	expect(content, `no agent file for ${station}`).toBeTypeOf('string')
	return content ?? ''
}

function frontmatterLine(params: { content: string; key: string }): string | undefined {
	return params.content
		.split('\n')
		.find((line) => line.startsWith(`${params.key}: `))
		?.slice(params.key.length + 2)
}

function toolsOf(station: string): string[] {
	return (frontmatterLine({ content: fileOf(station), key: 'tools' }) ?? '').split(', ')
}

describe('claudeModelAlias', () => {
	it.each([
		['Sonnet 5.5', 'sonnet'],
		['Opus 5.5', 'opus'],
		['Haiku 5.5', 'haiku'],
		['Fable 5.1', 'fable'],
		['Sol', undefined],
	])('%s -> %s', (modelName, alias) => {
		expect(claudeModelAlias(modelName)).toBe(alias)
	})
})

describe('planStationAgents', () => {
	it('anthropic -> the reviewer on the strong model, with no Write and no Edit', () => {
		expect(frontmatterLine({ content: fileOf('reviewer'), key: 'model' })).toBe('opus')
		expect(toolsOf('reviewer')).toContain('Bash')
		expect(toolsOf('reviewer')).not.toContain('Write')
		expect(toolsOf('reviewer')).not.toContain('Edit')
	})

	it('every station -> a file named dialecte-<station>.md whose name field matches', () => {
		const files = planFiles()
		expect(files.map((file) => file.name)).toEqual([
			'dialecte-test-writer.md',
			'dialecte-test-reviewer.md',
			'dialecte-implementer.md',
			'dialecte-implementer-strong.md',
			'dialecte-reviewer.md',
			'dialecte-fixer.md',
			'dialecte-eval-runner.md',
			'dialecte-grader.md',
			'dialecte-standard-reader.md',
			'dialecte-searcher.md',
		])
		for (const file of files)
			expect(frontmatterLine({ content: file.content, key: 'name' })).toBe(
				file.name.replace(/\.md$/, ''),
			)
	})

	it('tiers -> implementer sonnet, implementer-strong opus, grader opus (strong, amendment 1), searcher haiku', () => {
		function modelOf(station: string): string | undefined {
			return frontmatterLine({ content: fileOf(station), key: 'model' })
		}
		expect(modelOf('implementer')).toBe('sonnet')
		expect(modelOf('implementer-strong')).toBe('opus')
		expect(modelOf('fixer')).toBe('sonnet')
		expect(modelOf('grader')).toBe('opus')
		expect(modelOf('searcher')).toBe('haiku')
	})

	it('grader and searcher -> read-only tools: no Bash, Write or Edit', () => {
		for (const station of ['grader', 'searcher'])
			for (const forbidden of ['Bash', 'Write', 'Edit'])
				expect(toolsOf(station)).not.toContain(forbidden)
	})

	it('test-writer -> standard, the edit tools; test-reviewer -> strong, read-only (Bash to run tdd status, no Write, no Edit)', () => {
		expect(frontmatterLine({ content: fileOf('test-writer'), key: 'model' })).toBe('sonnet')
		for (const needed of ['Write', 'Edit', 'Bash']) expect(toolsOf('test-writer')).toContain(needed)
		expect(frontmatterLine({ content: fileOf('test-reviewer'), key: 'model' })).toBe('opus')
		expect(toolsOf('test-reviewer')).toContain('Bash')
		expect(toolsOf('test-reviewer')).not.toContain('Write')
		expect(toolsOf('test-reviewer')).not.toContain('Edit')
	})

	it('implementer and fixer -> the edit tools', () => {
		for (const station of ['implementer', 'fixer'])
			for (const needed of ['Write', 'Edit', 'Bash']) expect(toolsOf(station)).toContain(needed)
	})

	it('the body points at the skills and carries the never-list, without repeating skill content', () => {
		const content = fileOf('implementer')
		for (const skill of ['dialecte-lot', 'dialecte-contributing', 'dialecte'])
			expect(content).toContain(`\`${skill}\``)
		for (const forbidden of ['commit', 'stage', 'push', 'merge', 'stash', 'reset', 'restore', 'rm'])
			expect(content).toContain(forbidden)
		expect(content.split('\n').length).toBeLessThan(25)
	})

	it('the frontmatter of each station -> name, description, tools and model byte for byte as at a0b70c8, except the grader on the strong model (amendment 1)', () => {
		const expectedByStation: Record<string, string[]> = {
			'test-writer': [
				'name: dialecte-test-writer',
				'description: "Dialecte lot, test station of one brief step: writes the tests (and stubs) from the brief and the existing code, then proves them red with `dialecte tdd red`. Give it the brief step."',
				'tools: Read, Write, Edit, Glob, Grep, Bash, Skill',
				'model: sonnet',
			],
			'test-reviewer': [
				'name: dialecte-test-reviewer',
				'description: "Dialecte lot, test review before any code: reads only the tests against the brief (does each pin a behaviour, would a plausible wrong implementation fail it). Read-only."',
				'tools: Read, Glob, Grep, Bash, Skill',
				'model: opus',
			],
			implementer: [
				'name: dialecte-implementer',
				'description: "Dialecte lot, Station 1 (implement) on a mechanical or fully specified lot: production code only until `dialecte tdd green`, then the fast gate. Give it the brief."',
				'tools: Read, Write, Edit, Glob, Grep, Bash, Skill',
				'model: sonnet',
			],
			'implementer-strong': [
				'name: dialecte-implementer-strong',
				'description: "Dialecte lot, Station 1 (implement) on a design-heavy lot: production code only until `dialecte tdd green`, then the fast gate. Give it the brief."',
				'tools: Read, Write, Edit, Glob, Grep, Bash, Skill',
				'model: opus',
			],
			reviewer: [
				'name: dialecte-reviewer',
				'description: "Dialecte lot, Station 3 (independent review): pass 1 correctness, pass 2 fit, read-only. Give it the brief and the diff, not the implementer conclusions."',
				'tools: Read, Glob, Grep, Bash, Skill',
				'model: opus',
			],
			fixer: [
				'name: dialecte-fixer',
				'description: "Dialecte lot, Station 4 (fix mode) on wording and naming findings: fixed, disagreed or escalated per finding. Give it the findings."',
				'tools: Read, Write, Edit, Glob, Grep, Bash, Skill',
				'model: sonnet',
			],
			'eval-runner': [
				'name: dialecte-eval-runner',
				'description: "Runs one skill-eval case of a Dialecte skill, with or without the skill, and leaves the outputs the graders read."',
				'tools: Read, Write, Edit, Glob, Grep, Bash, Skill',
				'model: sonnet',
			],
			grader: [
				'name: dialecte-grader',
				'description: "Grades the output of a skill-eval run against one grader file, pass or fail with the evidence. Read-only."',
				'tools: Read, Glob, Grep, Skill',
				'model: opus',
			],
			'standard-reader': [
				'name: dialecte-standard-reader',
				'description: "Independent reader of the IEC standard markdown for one question, with line references. Read-only."',
				'tools: Read, Glob, Grep, Skill',
				'model: sonnet',
			],
			searcher: [
				'name: dialecte-searcher',
				'description: "Finds where something lives in a Dialecte repository (files, symbols, API paths) and answers with paths and line numbers. Read-only."',
				'tools: Read, Glob, Grep, Skill',
				'model: haiku',
			],
		}
		for (const [station, lines] of Object.entries(expectedByStation)) {
			const content = fileOf(station)
			expect(content.split('\n').slice(0, lines.length + 2)).toEqual(['---', ...lines, '---'])
		}
	})

	it('STATIONS -> an access per station (no tools, no role), as the brief pins them', () => {
		expect(STATIONS.map((station) => [station.name, station.access])).toEqual([
			['test-writer', 'edit'],
			['test-reviewer', 'review'],
			['implementer', 'edit'],
			['implementer-strong', 'edit'],
			['reviewer', 'review'],
			['fixer', 'edit'],
			['eval-runner', 'edit'],
			['grader', 'read'],
			['standard-reader', 'read'],
			['searcher', 'read'],
		])
		for (const station of STATIONS) {
			expect(station).not.toHaveProperty('tools')
			expect(station).not.toHaveProperty('role')
		}
	})

	it('the file of a station -> the frontmatter, then exactly: generated note, the station line, the load line, the never line', () => {
		const lines = fileOf('reviewer').split('\n')

		expect(lines.slice(0, 2)).toEqual(['---', 'name: dialecte-reviewer'])
		expect(lines.slice(lines.indexOf('---', 1) + 1)).toEqual([
			`<!-- ${GENERATED_NOTE} -->`,
			'',
			'You play the `reviewer` station of `dialecte-lot`: its definition is .claude/skills/dialecte-lot/references/stations.md, section `reviewer`.',
			'',
			LOAD_SKILLS_LINE,
			'',
			NEVER_LINE,
			'',
		])
	})

	it('every station -> its body names its own station and no longer carries a role text', () => {
		for (const station of ['test-writer', 'implementer-strong', 'searcher']) {
			const content = fileOf(station)
			expect(content).toContain(
				`You play the \`${station}\` station of \`dialecte-lot\`: its definition is .claude/skills/dialecte-lot/references/stations.md, section \`${station}\`.`,
			)
			expect(content).not.toContain('You are the')
		}
	})

	it('eval-runner and grader -> the brief carries their definition: station line, no load line, never line', () => {
		for (const station of ['eval-runner', 'grader']) {
			const lines = fileOf(station).split('\n')

			expect(lines.slice(lines.indexOf('---', 1) + 1)).toEqual([
				`<!-- ${GENERATED_NOTE} -->`,
				'',
				`You play the \`${station}\` station of \`dialecte-lot\`: your brief carries your definition and names the only skill text you read; read no other.`,
				'',
				NEVER_LINE,
				'',
			])
		}
	})

	it('another vendor -> no file, one line saying why', () => {
		const plan = planStationAgents({ vendor: 'openai' })
		expect(plan.kind).toBe('skipped')
		if (plan.kind === 'skipped') expect(plan.reason).toMatch(/openai/)
	})

	it('no vendor known -> no file, the reason names --vendor', () => {
		const plan = planStationAgents({ vendor: undefined })
		expect(plan.kind).toBe('skipped')
		if (plan.kind === 'skipped') expect(plan.reason).toMatch(/--vendor/)
	})
})
