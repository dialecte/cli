/** The Claude Code hook `skills sync` adds: its stdout is added to the session's context when it is not empty. */
/** `--no-install`: the cli installed in the project or nothing, never a download at a session start. */
export const SESSION_CHECK_COMMAND = 'npx --no-install @dialecte/cli doctor --brief'

/** Where Claude Code reads the project's shared settings. */
export const CLAUDE_SETTINGS_FILE = '.claude/settings.json'

/** The sources a hook runs for: a session that starts or resumes, not every clear or compaction. */
export const SESSION_CHECK_MATCHER = 'startup|resume'

/** Seconds: a session start must never wait on it. */
export const SESSION_CHECK_TIMEOUT = 30

/** What a settings file sync creates starts as. */
export const NEW_SETTINGS_FILE = '{}\n'

/** The matcher group inserted under `hooks.SessionStart`. */
export const SESSION_CHECK_GROUP = {
	matcher: SESSION_CHECK_MATCHER,
	hooks: [{ type: 'command', command: SESSION_CHECK_COMMAND, timeout: SESSION_CHECK_TIMEOUT }],
}

/** Our hook as any release wrote it: with or without `--no-install`, so an older hook is found, never doubled. */
export const SESSION_CHECK_COMMAND_PATTERN = /^npx(?: --no-install)? @dialecte\/cli doctor --brief$/

/** More handlers than this in one file is not ours: the cut loop stops. */
export const MAX_CUTS = 50
