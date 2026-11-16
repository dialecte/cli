import { normaliseText } from '../standard/normalise-text.ts'
import { anchorsOf, subjectNamesOf } from './anchors-of.ts'
import {
	BOUNDED_NAME_FLAGS,
	BOUNDED_NAME_INSENSITIVE_FLAGS,
	DEPENDS_VERDICT,
	EXCEPTION_CUES,
	UPPER_CASE_PATTERN,
} from './ask.constants.ts'
import { boundedNamePatternOf } from './bounded-name-pattern-of.ts'
import { claimContradictsQuestion, isNegated } from './claim-contradicts-question.ts'
import { cueCountOf } from './cue-count-of.ts'
import { keyTermsOf } from './key-terms-of.ts'

import type {
	CheckClaimParams,
	CheckedClaim,
	ClaimRefusal,
	GivenSlice,
	VerifiedCite,
} from './ask.types.ts'

/**
 * Checks one claim against its verified cites: it names a key term, every key term is in one quote, the subject
 * is in a quote or a cited clause title, and it supports the report's verdict; then the three polarity
 * comparisons (quote against claim, claim against verdict under the question's wording, exception cues).
 */
export function checkClaim(params: CheckClaimParams): CheckedClaim {
	const { claim, cites } = params
	const verified = cites.filter((checked): checked is VerifiedCite => checked.verified)
	const terms = keyTermsOf({
		text: claim.text,
		vocabulary: params.vocabulary,
		subject: params.subject,
	})
	const refused = claimRefusalOf({ params, verified, terms })
	return {
		claim,
		cites,
		verified: refused === null,
		refused,
		polarityConflict: refused === null && polarityConflictOf({ params, verified, terms }),
	}
}

/** Why the claim is refused, in the order of the checks, or null. */
function claimRefusalOf(params: {
	params: CheckClaimParams
	verified: VerifiedCite[]
	terms: string[]
}): ClaimRefusal | null {
	const { claim, verdict, subject } = params.params
	if (params.terms.length === 0) return 'no-key-term'
	const quotes = params.verified.map((checked) => normaliseText(checked.cite.quote))
	const missing = params.terms.find(
		(term) => !quotes.some((quote) => mentions({ text: quote, name: term })),
	)
	if (missing !== undefined) return `term-missing:${missing}`
	const titles = params.verified.map((checked) => titleOf({ slice: checked.slice }))
	const subjectNames = subjectNamesOf({ subject })
	const named = subjectNames.some((name) =>
		[...quotes, ...titles].some((text) => mentions({ text, name })),
	)
	if (!named) return 'off-subject'
	if (claim.supports !== verdict) return 'does-not-support'
	return null
}

/** The heading of the clause a slice holds, or nothing. */
function titleOf(params: { slice: GivenSlice }): string {
	return params.slice.title ?? ''
}

/** True when the text holds the name word-bounded: case kept for a name with a capital, else any case. */
function mentions(params: { text: string; name: string }): boolean {
	const flags = UPPER_CASE_PATTERN.test(params.name)
		? BOUNDED_NAME_FLAGS
		: BOUNDED_NAME_INSENSITIVE_FLAGS
	return boundedNamePatternOf({ name: params.name, flags }).test(params.text)
}

/** True when any of the three polarity comparisons fails. */
function polarityConflictOf(params: {
	params: CheckClaimParams
	verified: VerifiedCite[]
	terms: string[]
}): boolean {
	const { claim, verdict, question, subject } = params.params
	// exception cues are forgiven only to a `depends` report that gives its condition (R1-12)
	const condition = params.params.value ?? ''
	const forgiven = verdict === DEPENDS_VERDICT && condition.trim() !== ''
	const names = subjectNamesOf({ subject })
	const fallback = params.terms[0]
	const claimNegated = isNegated({
		text: claim.text,
		anchors: anchorsOf({ text: claim.text, names, fallback }),
	})
	if (
		claimContradictsQuestion({
			claimText: claim.text,
			supports: claim.supports,
			question,
			subject,
			fallback,
		})
	)
		return true
	return params.verified.some((checked) => {
		const quote = checked.cite.quote
		const anchors = anchorsOf({ text: quote, names, fallback })
		if (isNegated({ text: quote, anchors }) !== claimNegated) return true
		return !forgiven && cueCountOf({ text: quote, anchors, cues: EXCEPTION_CUES }) > 0
	})
}
