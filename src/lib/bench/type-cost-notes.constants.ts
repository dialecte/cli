/** A type-cost note: a fragment's bullet `- Type cost: <why>`, or a no-entry note's line `Type cost: <why>`. */
export const TYPE_COST_NOTE_PATTERN = /^(- )?Type cost: \S/

/** Why the notes cannot be judged: the base's fragments not listed, or not read; `{base}`, `{files}` filled. */
export const TYPE_COST_NOTES_REFUSALS = {
	unlisted: 'the type-cost notes: the fragments of the base {base} cannot be listed',
	unread: 'the type-cost notes: the fragments {files} of the base {base} cannot be read',
} as const
