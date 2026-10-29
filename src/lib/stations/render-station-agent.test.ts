import { claudeModelAlias, planStationAgents } from './render-station-agent.ts'

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

	it('tiers -> implementer sonnet, implementer-strong opus, grader and searcher haiku', () => {
		function modelOf(station: string): string | undefined {
			return frontmatterLine({ content: fileOf(station), key: 'model' })
		}
		expect(modelOf('implementer')).toBe('sonnet')
		expect(modelOf('implementer-strong')).toBe('opus')
		expect(modelOf('fixer')).toBe('sonnet')
		expect(modelOf('grader')).toBe('haiku')
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

	it('test-writer -> its body names tdd red and the stubs; implementer -> tdd green', () => {
		expect(fileOf('test-writer')).toContain('`dialecte tdd red`')
		expect(fileOf('test-writer')).toContain('not implemented')
		expect(fileOf('implementer')).toContain('`dialecte tdd green`')
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
