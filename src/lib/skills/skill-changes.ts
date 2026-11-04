/**
 * Which skills a change touches, and how: a regeneration of their generated blocks only, or their
 * hand-written text. Only a hand-written change calls for the skill's evals.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { readGit } from '../git.ts'
import { GENERATED_BLOCK_PATTERN } from './generated-blocks.constants.ts'
import { MARKDOWN_PATTERN, SKILL_PATH_PATTERN } from './skill-changes.constants.ts'

import type { SkillChange } from './skill-changes.types.ts'

/** The page with every generated block emptied: its markers kept, its content left out. */
export function handWrittenText(markdown: string): string {
	return markdown.replace(GENERATED_BLOCK_PATTERN, '$1$3')
}

/**
 * The skills under `skills/<name>/` that differ from `base` (default HEAD: the uncommitted change), sorted
 * by name. A skill is `generated only` when every changed file is a page whose hand-written text is the
 * same on both sides; a new, deleted or non-markdown file makes it `hand-written`.
 */
export function classifySkillChanges(params: { root: string; base?: string }): SkillChange[] {
	const { root } = params
	const base = params.base ?? 'HEAD'
	const handWrittenBySkill = new Map<string, boolean>()
	for (const file of changedSkillFiles({ root, base })) {
		const skill = SKILL_PATH_PATTERN.exec(file)?.[1]
		if (!skill) continue
		const handWritten = handWrittenBySkill.get(skill) || isHandWrittenChange({ root, base, file })
		handWrittenBySkill.set(skill, handWritten)
	}
	return [...handWrittenBySkill.entries()]
		.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
		.map(([skill, handWritten]) => ({
			skill,
			change: handWritten ? 'hand-written' : 'generated only',
		}))
}

function changedSkillFiles(params: { root: string; base: string }): string[] {
	const changed = readGit({
		root: params.root,
		args: ['diff', '--name-only', '--relative', '--no-renames', params.base, '--', 'skills'],
	})
	const untracked = readGit({
		root: params.root,
		args: ['ls-files', '--others', '--exclude-standard', '--', 'skills'],
	})
	return [...new Set(`${changed}\n${untracked}`.split('\n').filter(Boolean))]
}

function isHandWrittenChange(params: { root: string; base: string; file: string }): boolean {
	const { root, base, file } = params
	const path = join(root, file)
	if (!MARKDOWN_PATTERN.test(file) || !existsSync(path)) return true
	const before = baseContent({ root, base, file })
	if (before === undefined) return true
	return handWrittenText(before) !== handWrittenText(readFileSync(path, 'utf8'))
}

/** The file as `base` holds it; undefined when `base` has no such file. */
function baseContent(params: { root: string; base: string; file: string }): string | undefined {
	try {
		// `./`: the path relative to `root`, which may be a package folder inside the repository
		return readGit({ root: params.root, args: ['show', `${params.base}:./${params.file}`] })
	} catch {
		return undefined
	}
}
