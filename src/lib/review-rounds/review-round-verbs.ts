/** The review rounds' verbs of `lot`, read from the one table of the renamed forms. */
import { RENAMED_FORMS } from '../command-map/renamed.constants.ts'
import { LOT_COMMAND } from './review-rounds.constants.ts'

import type {
	DeclaredRenamedForm,
	RecordVerb,
	RenamedCommandName,
	RenamedEntry,
	ReviewRoundVerb,
} from '../command-map/command-map.types.ts'

/** What a review rounds' verb prints first: `lot <verb>`. */
export function verbPrefix(verb: ReviewRoundVerb): string {
	return `${LOT_COMMAND} ${verb}`
}

/** The `lot` verb an old word of a renamed command names (the first word `runReview` reads), if any. */
export function lotVerbOfWord(params: {
	command: RenamedCommandName
	word: string | undefined
}): ReviewRoundVerb | undefined {
	return RENAMED_FORMS.find(
		(form) => form.command === params.command && 'verb' in form && form.verb === params.word,
	)?.lotVerb
}

/** The verb of `runRecord` an old word names (its first word), if any. */
export function recordVerbOfWord(word: string | undefined): RecordVerb | undefined {
	return RENAMED_FORMS.find(
		(form): form is Extract<DeclaredRenamedForm, { command: 'record' }> =>
			form.command === 'record' && form.verb === word,
	)?.lotVerb
}

/** The `lot` forms that replaced a renamed command, `|`-separated: what the command map says it was renamed to. */
export function lotFormsOf(command: RenamedCommandName): string {
	return RENAMED_FORMS.filter((form) => form.command === command)
		.map((form) => `${LOT_COMMAND} ${form.lotVerb}`)
		.join(' | ')
}

/**
 * The command map's entries of the renamed commands, each naming the `lot` forms the one table says replaced it: a
 * command of `RenamedCommandName` left out here does not compile.
 */
export function renamedEntriesOf(): Record<RenamedCommandName, RenamedEntry> {
	return {
		record: { renamedTo: lotFormsOf('record') },
		review: { renamedTo: lotFormsOf('review') },
		recap: { renamedTo: lotFormsOf('recap') },
	} satisfies Record<RenamedCommandName, RenamedEntry>
}

/** The renamed form a `lot` verb replaced, or undefined for a verb that is no review rounds' verb. */
export function formOfLotVerb(verb: string | undefined): DeclaredRenamedForm | undefined {
	return RENAMED_FORMS.find((form) => form.lotVerb === verb)
}
