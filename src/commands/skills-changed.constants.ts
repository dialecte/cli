import type { SkillChange } from '../lib/skills/skill-changes.types.ts'

export const NO_SKILL_CHANGED = 'no skill changed'

/** What each kind of change asks for, after the skill's name. */
export const SKILL_CHANGE_VERDICTS: Readonly<Record<SkillChange['change'], string>> = {
	'hand-written': 'hand-written: run its evals (skill-creator)',
	'generated only': 'generated only: no evals',
}
