/**
 * What a sync did with the session-start check: `added` (the hook is new), `removed`, `unchanged` (already
 * there, or nothing to remove), `kept` (a hook the user wrote is there: left alone), `invalid`
 * (`.claude/settings.json` is not JSON: left alone), `invalid-hooks` (its `hooks` is not an object, or its
 * `SessionStart` not a list: left alone), `not-removed` (the file was edited so that dropping our hook would not
 * leave valid, otherwise identical settings: left alone).
 */
export type SessionCheckState =
	| 'added'
	| 'removed'
	| 'unchanged'
	| 'kept'
	| 'invalid'
	| 'invalid-hooks'
	| 'not-removed'

export type HookHandler = { command?: unknown }

export type HookGroup = { hooks?: unknown } & Record<string, unknown>

/** The part of `.claude/settings.json` the check reads; every other key is carried through untouched. */
export type Settings = { hooks?: { SessionStart?: unknown } & Record<string, unknown> } & Record<
	string,
	unknown
>
