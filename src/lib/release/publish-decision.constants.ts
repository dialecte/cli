/** npm's code for a package it does not have, in the JSON error `npm view --json` prints. */
export const NPM_NOT_FOUND = /"code"\s*:\s*"E404"/

/** `git ls-remote --exit-code`: the ref is on the remote (0), or it is not (2); any other code is a failed lookup. */
export const LS_REMOTE_FOUND = 0
export const LS_REMOTE_MISSING = 2
