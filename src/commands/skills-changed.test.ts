import { createScratchRepository, writeFiles } from '../../test/scratch-repository.ts'
import { runSkillsChanged } from './skills-changed.ts'

import { describe, expect, it } from 'vitest'

const PAGE = [
	'Guidance.',
	'<!-- dialecte-skills:generated api-index -->',
	'- `q.getTree`',
	'<!-- /dialecte-skills:generated -->',
	'',
].join('\n')

describe('skills changed', () => {
	it('no skill changed → one line saying so, exit 0', () => {
		const root = createScratchRepository({ 'skills/demo/SKILL.md': PAGE })

		expect(runSkillsChanged({ cwd: root, argv: [] })).toEqual({
			exitCode: 0,
			output: 'no skill changed\n',
		})
	})

	it('one regenerated, one reworded → a line per skill: evals due for the hand-written one only, exit 0', () => {
		const root = createScratchRepository({
			'skills/alpha/SKILL.md': PAGE,
			'skills/beta/SKILL.md': PAGE,
		})
		writeFiles({
			root,
			files: {
				'skills/alpha/SKILL.md': PAGE.replace('Guidance.', 'Guidance, reworded.'),
				'skills/beta/SKILL.md': PAGE.replace('- `q.getTree`', '- `q.getAttributes`'),
			},
		})

		expect(runSkillsChanged({ cwd: root, argv: [] })).toEqual({
			exitCode: 0,
			output:
				'alpha  hand-written: run its evals (skill-creator)\n' +
				'beta   generated only: no evals\n',
		})
	})
})
