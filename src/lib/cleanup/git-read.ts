/**
 * A git read a removal decision rests on: its output, or why it could not be read. A failed read never answers
 * empty: the item it decides is kept with the reason.
 */
import { readGit } from '../git.ts'
import { fillMessage } from '../knowledge/standard/fill-message.ts'
import { GIT_READ_TEXTS } from './git-read.constants.ts'

/**
 * The output of `git <args>` in `root`, or why it could not be read (`could not read <what>: <git's error>`).
 *
 * @intent read git for a removal decision without taking a failure for an empty answer
 * @internal
 */
export function readGitOrWhy(params: {
	root: string
	args: string[]
	what: string
	input?: string
}): { output: string } | { why: string } {
	try {
		return {
			output: readGit({
				root: params.root,
				args: params.args,
				...(params.input !== undefined && { input: params.input }),
			}),
		}
	} catch (error) {
		return {
			why: fillMessage({
				template: GIT_READ_TEXTS.unread,
				values: { what: params.what, error: (error as Error).message.trim() },
			}),
		}
	}
}

/** The non-empty lines of a read's output. */
export function linesOf(output: string): string[] {
	return output.split('\n').filter(Boolean)
}
