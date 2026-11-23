# dialecte text

<!-- dialecte-reference: generated from the command map by npm run doc:generate; edit the map, not this block -->

The human part of a host text, before it is posted

```text
text - The human part of a host text, before it is posted

  dialecte text check <file> [--kind change-request|issue|comment|commit]

  the lines before <details: headings What changes, Why, How to check it (then Watch out) for
    change-request and issue, none for comment and commit; word cap 150 | 200 | 80 | 100, headings
    and code blocks not counted; a commit subject of 72 at most

e.g. dialecte text check change-request.md
```

Verbs: `check`

Flags: `--kind`
<!-- /dialecte-reference -->

## Host text: lot recap and text check

Text written with an assistant tends to retell the diff and grow long. The change request splits in two:
an expandable part made from records, and a short human part that is checked before it is posted. Both
commands only print; the user posts.

- `dialecte text check <file> [--kind change-request|issue|comment|commit]` checks every line before the first `<details`
  line (the recap is not checked). A change request or an issue holds the headings `What changes`, `Why`, `How
  to check it` in this order, then `Watch out` only when it has something to say; each with text under it,
  nothing before the first. A comment or a commit holds no heading; a commit's line 1 is its subject, not
  empty and at most 72 characters (longer ones are cut in one-line logs), with a blank line before
  the body. The word cap: 150 for a change request (the diff carries the rest), 200 for an issue (it stands
  alone), 80 for a comment (it answers one point), 100 for a commit body (the why; the subject is not
  counted). Words hold a letter or a digit; headings and fenced code blocks are not counted. Past the cap it
  prints the count, the cap and every line from the one that passed it. Exit 0 when the text holds, 1 with one
  line per problem.
