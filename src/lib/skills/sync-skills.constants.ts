/** Per target folder: the skills a sync installed there (ownership for later syncs). */
export const MANIFEST_FILE = '.dialecte-skills.json'

/** Inside a copied skill: the package it came from. */
export const COPY_MARKER_FILE = '.dialecte-skill'

/** Maintainer-only folders of a skill, not installed for agents. */
export const COPY_EXCLUDED_FOLDERS: readonly string[] = ['evals']

/** Where each agent reads project skills. `agents` is the shared folder read by Codex, Cursor, Gemini CLI, Copilot... */
export const AGENT_SKILL_FOLDERS: Readonly<Record<string, string>> = {
	claude: '.claude/skills',
	copilot: '.github/skills',
	agents: '.agents/skills',
}

export const DEFAULT_AGENTS: readonly string[] = ['claude', 'agents']
