import { createScratchRepository, git, writeFiles } from '../../../test/scratch-repository.ts'
import { classifySkillChanges, handWrittenText } from './skill-changes.ts'

import { describe, expect, it } from 'vitest'

const PAGE = [
	'# demo',
	'',
	'Hand-written guidance.',
	'',
	'<!-- dialecte-skills:generated api-index -->',
	'- `q.getTree`',
	'<!-- /dialecte-skills:generated -->',
	'',
].join('\n')

const REGENERATED_PAGE = PAGE.replace('- `q.getTree`', '- `q.getTree`\n- `q.getAttributes`')
const REWORDED_PAGE = PAGE.replace('Hand-written guidance.', 'Hand-written guidance, reworded.')

describe('handWrittenText', () => {
	it('a generated block → its markers kept, its content left out', () => {
		expect(handWrittenText(PAGE)).toBe(
			[
				'# demo',
				'',
				'Hand-written guidance.',
				'',
				'<!-- dialecte-skills:generated api-index --><!-- /dialecte-skills:generated -->',
				'',
			].join('\n'),
		)
	})

	it('a regenerated block → the same hand-written text', () => {
		expect(handWrittenText(REGENERATED_PAGE)).toBe(handWrittenText(PAGE))
	})
})

describe('classifySkillChanges', () => {
	it('nothing changed under skills/ → no skill listed', () => {
		const root = createScratchRepository({ 'skills/demo/SKILL.md': PAGE, 'src/a.ts': 'a\n' })
		writeFiles({ root, files: { 'src/a.ts': 'b\n' } })

		expect(classifySkillChanges({ root })).toEqual([])
	})

	it('only a generated block changed → generated only', () => {
		const root = createScratchRepository({ 'skills/demo/SKILL.md': PAGE })
		writeFiles({ root, files: { 'skills/demo/SKILL.md': REGENERATED_PAGE } })

		expect(classifySkillChanges({ root })).toEqual([{ skill: 'demo', change: 'generated only' }])
	})

	it('text outside the generated blocks changed → hand-written', () => {
		const root = createScratchRepository({ 'skills/demo/SKILL.md': PAGE })
		writeFiles({ root, files: { 'skills/demo/SKILL.md': REWORDED_PAGE } })

		expect(classifySkillChanges({ root })).toEqual([{ skill: 'demo', change: 'hand-written' }])
	})

	it('a new file in the skill folder (an eval case, a reference page) → hand-written', () => {
		const root = createScratchRepository({ 'skills/demo/SKILL.md': PAGE })
		writeFiles({ root, files: { 'skills/demo/references/new.md': 'New page.\n' } })

		expect(classifySkillChanges({ root })).toEqual([{ skill: 'demo', change: 'hand-written' }])
	})

	it('a deleted page → hand-written', () => {
		const root = createScratchRepository({
			'skills/demo/SKILL.md': PAGE,
			'skills/demo/references/old.md': 'Old page.\n',
		})
		git({ root, args: ['rm', '-q', 'skills/demo/references/old.md'] })

		expect(classifySkillChanges({ root })).toEqual([{ skill: 'demo', change: 'hand-written' }])
	})

	it('two skills, one regenerated and one reworded → each classified, sorted by name', () => {
		const root = createScratchRepository({
			'skills/beta/SKILL.md': PAGE,
			'skills/alpha/SKILL.md': PAGE,
		})
		writeFiles({
			root,
			files: { 'skills/beta/SKILL.md': REGENERATED_PAGE, 'skills/alpha/SKILL.md': REWORDED_PAGE },
		})

		expect(classifySkillChanges({ root })).toEqual([
			{ skill: 'alpha', change: 'hand-written' },
			{ skill: 'beta', change: 'generated only' },
		])
	})

	it('--base: the committed changes since that ref count, not only the uncommitted ones', () => {
		const root = createScratchRepository({ 'skills/demo/SKILL.md': PAGE })
		const base = git({ root, args: ['rev-parse', 'HEAD'] }).trim()
		writeFiles({ root, files: { 'skills/demo/SKILL.md': REWORDED_PAGE } })
		git({ root, args: ['commit', '-q', '-am', 'reword'] })

		expect(classifySkillChanges({ root })).toEqual([])
		expect(classifySkillChanges({ root, base })).toEqual([
			{ skill: 'demo', change: 'hand-written' },
		])
	})
})
