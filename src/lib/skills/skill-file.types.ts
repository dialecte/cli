/** What a SKILL.md (or one of its reference pages) claims about the package it documents. */
export type SkillClaims = {
	/** API paths written as calls or member access from a known root: `q.getTree`, `tx.reference.applyUuidRemap`. */
	apiPaths: string[]
	/** Repository paths (files or folders) named in backticks. */
	repositoryPaths: string[]
	/** `npm run <script>` mentions. */
	npmScripts: string[]
	/** Relative markdown links to other files of the skill. */
	links: string[]
	/** Tokens the author excluded from the check with `<!-- dialecte-skills ignore: a b -->`. */
	ignored: string[]
	/** `<!-- dialecte-skills workspace -->`: the page describes several repositories. */
	describesWorkspace: boolean
}

export type SkillFrontmatter = {
	name: string | undefined
	description: string | undefined
	/** `metadata.audience`: who the skill is for; absent = consumer. */
	audience?: string | undefined
}

export type SkillFinding = {
	file: string
	severity: 'error' | 'warning'
	message: string
	/** 1-based line of the page the finding points at. */
	line?: number
}
