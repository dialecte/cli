/**
 * A question the ladder refuses before any rung answers (exit 2): a forced kind the subject cannot fill, an unknown
 * tag or attribute, several dialectes without `--package`, a parent the tag does not admit, an attribute the
 * element lacks. Its message says what failed, where, and the fix.
 */
export class AskRefusal extends Error {
	constructor(message: string) {
		super(message)
		this.name = 'AskRefusal'
	}
}
