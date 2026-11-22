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
          HTML comment that never closes), the Unreleased part of CHANGELOG.md, then its released
          sections: none altered against the base branch and where the change left it (rules:
          released-changelog); --base <revision> judges against that commit alone, the one the
          change goes onto (the CI check step hands the merge queue's base, or a pull request merge
          ref's first parent)
  release - writes ## [<x.y.z>] - <date> (default today, local) under an emptied ## [Unreleased]
            (written above the first version when missing): the Unreleased summary and entries
            first, then each fragment in file name order, section by section, each section's
            breaking items (a bullet opening with **Breaking, Breaking: or Breaking (types):) first,
            its blocks joined as a markdown formatter leaves them (a blank line after an item
            holding a second paragraph and around any other block); deletes the fragments and the
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
Security - no text before the first heading, no empty or repeated section, no HTML comment that never closes). The release runs
`dialecte changelog release <x.y.z> [--date YYYY-MM-DD]`: the new version's section is written under an emptied
`## [Unreleased]` (written above the first version when the changelog has none; `## UNRELEASED` is read too), the
Unreleased summary and entries first (a section written twice there is merged), then each fragment in file name
order, section by section. In each section the breaking items come first (a `- ` bullet opening with a bold
`**Breaking` in any case, or the plain `Breaking:` / `Breaking (types):`), then every other block in the order written;
a list of another kind, a paragraph, a sub-heading, a fence or an HTML comment (its `<!--` at most three spaces in) is one block, never
reordered, and nothing inside a fence or a comment is read as a heading or an item; a breaking item rises above a
sub-heading or a paragraph written before it, as above any other block. Blocks are joined as a markdown formatter
leaves them: a blank line after an item holding a second paragraph and around any block that is no bullet item, one
line feed between one-line items. The fragments are deleted (`changes/.gitkeep` keeps the folder).
Code fences and a link block at the end of the changelog are kept as they are. In the commit hook the rule reads the
version from the tree the commit records. `dialecte rules` refuses a change that edits
`CHANGELOG.md` without bumping the package version (`changelog-edit`, an error); a package without `changes/` is not
judged. `dialecte contrib`'s `changelog` row (after `rules`) fails a change that edits `README.md` or the command map
with no fragment; a wording-only edit adds `changes/<lot>.none.md` holding why it has no entry instead (the release
deletes those notes without folding them).
