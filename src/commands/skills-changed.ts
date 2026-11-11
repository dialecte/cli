/**
 * `dialecte skills changed [--base <ref>]` - which skills the change touches (since `base`, default HEAD: the
 * uncommitted change) and whether their evals are due: a hand-written change calls for them, a
 * regeneration of the generated blocks alone does not.
 */
import { getArg } from '../lib/config.ts'
import { textOf } from '../lib/print/print.ts'
import { classifySkillChanges } from '../lib/skills/skill-changes.ts'
import { NO_SKILL_CHANGED, SKILL_CHANGE_VERDICTS } from './skills-changed.constants.ts'

import type { CommandOutput } from '../lib/command-output.types.ts'

export function runSkillsChanged(params: { cwd: string; argv: string[] }): CommandOutput {
	const changes = classifySkillChanges({ root: params.cwd, base: getArg(params.argv, 'base') })
	if (changes.length === 0) return { exitCode: 0, output: textOf([NO_SKILL_CHANGED, '']) }
	const width = Math.max(...changes.map((change) => change.skill.length))
	const lines = changes.map(
		(change) => `${change.skill.padEnd(width)}  ${SKILL_CHANGE_VERDICTS[change.change]}`,
	)
	return { exitCode: 0, output: textOf([...lines, '']) }
}
