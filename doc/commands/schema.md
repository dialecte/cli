# dialecte schema

<!-- dialecte-reference: generated from the command map by npm run doc:generate; edit the map, not this block -->

What an element may hold and where: parents, children, attributes

```text
schema - What an element may hold and where: parents, children, attributes

  dialecte schema <Tag> [--under <Parent>] [--package <name>] [--json]

  parents, children with how often, attributes, type, documentation; an unknown tag answers the
    closest
  a tag declared several ways is printed per declaration, with the parents holding each; --under
    <Parent> picks the one that parent holds

e.g. dialecte schema Bay
```

Flags: `--under`, `--package`, `--json`
<!-- /dialecte-reference -->

- `dialecte schema <Tag> [--under <Parent>] [--package <name>]`: parents, children in order with how often each
  may appear, attributes (required, identity, default, fixed, enumeration, pattern), text, xsi:type variants,
  the declared type and documentation - read through the readers of the core each installed dialecte depends on
  (how often a child may appear is core's `childOccurrences`). A tag declared several ways prints each declaration
  with the parents that hold it; `--under <Parent>` prints the one that parent holds (or those it holds, when it
  does not decide), and a tag that is not a child of that parent answers its parents (exit 1). With `--json` each
  element carries `declarations` and `resolved`, and when known `type`, `documentation`, `declaration` (the key
  of the declaration described, when the tag is declared several ways) and `ways` (when unresolved). A dialecte
  names the standard it implements in its `package.json`, `"dialecte": { "standard": "<public name>" }` (the
  usual public name, no part or clause); a value that is not a non-empty string skips the dialecte, naming
  `dialecte.standard`. An unknown tag
  answers the closest; a dialecte not built is reported as skipped.
