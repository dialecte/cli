/** What the cli's refusals and hints about a file under a repository's `.git` may and may not say. */

/** Telling the reader to delete, remove or edit a file: the cli never asks that of a file under `.git`. */
export const TOUCH_THE_GIT_FOLDER = /\b(delete|remove|rm|edit)\b/i

/** Who a refusal hands a held file's path to, instead of asking the reader to touch it. */
export const PERSON_WHO_RUNS_THE_REPOSITORY = 'the person who runs the repository'

/** A refusal held by a hand-over says to run it. */
export const RUN_THE_HANDOVER = /\brun (it|the hand-over)\b/i
