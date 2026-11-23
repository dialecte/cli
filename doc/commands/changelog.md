# dialecte changelog

<!-- dialecte-reference: generated from the command map by npm run doc:generate; edit the map, not this block -->

Changelog fragments (changes/&lt;lot&gt;.md): check them, or fold them into CHANGELOG.md for a release

```text
changelog - Changelog fragments (changes/<lot>.md): check them, or fold them into CHANGELOG.md for a release

  dialecte changelog check [--base <revision>]
  dialecte changelog release <x.y.z> [--date YYYY-MM-DD]

  a fragment: one changes/<name>.md per lot (a no-entry note changes/<name>.none.md holds why a
    visible change has none), its entries under the changelog headings ### Added, Changed,
    Deprecated, Removed, Fixed, Security; a package keeping a changes/ folder edits CHANGELOG.md
    only in a release (rules: changelog-edit)
  check - every fragment readable (a known heading, no loose text, no empty or repeated section, no
          HTML comment, code fence or HTML block that never closes, and in each block or item a
          release moves no raw HTML but whole comments and balanced bare tags of an inert element,
          nor a block that moving the breaking items first would read otherwise; read as CommonMark
          reads it), the Unreleased part of CHANGELOG.md, then its released sections: none altered
          against the base branch and where the change left it (rules: released-changelog); --base
          <revision> judges against that commit alone, the one the change goes onto (the CI check
          step hands the merge queue's base, or a `pull_request` merge ref's first parent)
  release - writes ## [<x.y.z>] - <date> (default today, local) under an emptied ## [Unreleased]
            (written above the first version when missing): the Unreleased summary and entries
            first, then each fragment in file name order, section by section, each section's
            breaking items (a bullet opening with **Breaking, Breaking: or Breaking (types):) first,
            the blocks read as CommonMark reads them (each item of a - list a block, any other block
            whole and never reordered) and joined as oxfmt leaves them (a blank line after an item
            holding a second block and around any other block); deletes the fragments and the
            no-entry notes; nothing written when a fragment or the Unreleased part cannot be read

exit codes:
  1  a fragment or the Unreleased part cannot be read, a released section is altered (check), the release is refused (no CHANGELOG.md, version already there, nothing to release), or a fragment could not be deleted
  2  usage: no verb, a version that is no x.y.z, a date that is no YYYY-MM-DD; --base names no commit of the repository
e.g. dialecte changelog release 0.8.0
```

Verbs: `check`, `release`

Flags: `--base`, `--date`
<!-- /dialecte-reference -->

## Changelog fragments

A package that keeps a `changes/` folder never has two lots editing `CHANGELOG.md`: each lot writes its entry in
`changes/<lot>.md`, under the changelog's own headings:

```md
### Added

- `dialecte changelog release`.
```

`dialecte changelog check` reads every fragment (a known heading - Added, Changed, Deprecated, Removed, Fixed,
Security - no text before the first heading, no empty or repeated section, no HTML comment, code fence or HTML block
that never closes). Raw HTML in a fragment or the Unreleased part is held to what reads the same in every renderer, so
that reordering blocks never changes what a raw-HTML render hides: each block or item a release moves (an item of a
`- ` list, any other top-level block) holds only whole comments and bare tags with no attribute of `<b>`, `<i>`, `<u>`,
`<s>`, `<em>`, `<strong>`, `<small>`, `<mark>`, `<del>`, `<ins>`, `<sub>`, `<sup>`, `<code>`, `<kbd>`, `<samp>`,
`<var>`, `<details>`, `<summary>`, `<br>` and `<wbr>`, each closed inside it; a tag inside a comment is text. Anything
else is refused, naming the piece: write a placeholder such as `<version>` in backticks, and use markdown links and
images. HTML already in a released section or above the Unreleased part is not read. A section keeps every line's
indentation (only blank lines around it are dropped), and a section whose blocks, joined with the breaking items
first, read otherwise (indented code or HTML placed after an item joins that item) is refused, naming the block, and at
release the fragment it comes from and the one it joins (two fragments can meet only there): fence it, or indent it
less. Fragments and the changelog are read as CommonMark reads them (markdown-it): a section heading is
a top-level `###` heading, a version heading a top-level `##` one. The release runs
`dialecte changelog release <x.y.z> [--date YYYY-MM-DD]`: the new version's section is written under an emptied
`## [Unreleased]` (written above the first version when the changelog has none; `## UNRELEASED` is read too), the
Unreleased summary and entries first (a section written twice there is merged), then each fragment in file name
order, section by section. In each section the breaking items come first (a `- ` bullet opening with a bold
`**Breaking` in any case, or the plain `Breaking:` / `Breaking (types):`), then every other block in the order written;
each item of a `- ` list is a block, and every other CommonMark block - a list of another kind, a paragraph, a
sub-heading, a fence, an HTML block or comment, a quote, a rule - is one block, never reordered; nothing inside a
block is read as a heading or an item, and every line is the author's own (a line no block covers, such as a link
reference definition, is kept in place). A breaking item rises above a sub-heading or a paragraph written before it,
as above any other block. Blocks are joined as oxfmt leaves them: a blank line after an item holding a second paragraph and around any block that is no bullet item, one
line feed between one-line items. The fragments are deleted (`changes/.gitkeep` keeps the folder).
Code fences and a link block at the end of the changelog are kept as they are. The released-changelog rule compares
a released section with each run of blank and link reference definition lines that holds a definition read as one
blank line: a definition renders nothing, and the first definition of a label (the Unreleased part stands above every
released section) already decides a link's target, but the blank line it brings ends a paragraph or an item. So adding
a definition beside the others, even before text that follows them, alters no released section; editing that text
does, and so does a definition that splits a paragraph or turns a line into indented code. Splitting a loose list with
a definition between two items is spacing only and not reported. In the commit hook the rule reads the
version from the tree the commit records. `dialecte rules` refuses a change that edits
`CHANGELOG.md` without bumping the package version (`changelog-edit`, an error); a package without `changes/` is not
judged. `dialecte contrib`'s `changelog` row (after `rules`) fails a change that edits `README.md` or the command map
with no fragment; a wording-only edit adds `changes/<lot>.none.md` holding why it has no entry instead (the release
deletes those notes without folding them).
