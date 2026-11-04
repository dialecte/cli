/** One skill a change touches: only its generated blocks, or its hand-written text. */
export type SkillChange = {
	/** The skill's folder name under `skills/`. */
	skill: string
	change: 'hand-written' | 'generated only'
}
