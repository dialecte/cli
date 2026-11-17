# dialecte fixture

<!-- dialecte-reference: generated from the command map by npm run doc:generate; edit the map, not this block -->

The smallest valid XML document holding an element, built by the installed dialecte's engine

```text
fixture - The smallest valid XML document holding an element, built by the installed dialecte's engine

  dialecte fixture <Tag> [--under A/B] [--package <name>] [--out <file>] [--json]

  the chain from the root (or --under), required children and attributes, hooks applied; the same
    bytes every time; an unknown tag answers the closest

e.g. dialecte fixture AAA_1 --package @dialecte/core/test
```

Flags: `--under`, `--package`, `--out`, `--json`
<!-- /dialecte-reference -->

`dialecte fixture <Tag>` answers the smallest XML document holding `<Tag>` that is valid against the
dialecte's full schema, built by the engine of the dialecte your project installs - never written by hand.
It is a `dialecte run` of a script the command writes from the definition, read through core's readers:

- the chain of parents from the root down to the element: the shortest one (among chains as short, the
  first in sequence order), or the one `--under A/B` names (the root may be named first or left out);
- every child an element on the way requires, as many times as it is required, and the first branch of
  each choice it requires (unless a child already takes one), each with what it requires in turn; an
  element declared with an abstract type names its first variant with `xsi:type`;
- a value for every required attribute, and text for an element whose type an empty text does not
  satisfy: the fixed value, else the default, else the first value the type takes - an enumerated value,
  a string its patterns match, a number counting up from the lowest its range allows, free text from the
  tag name - checked against every facet (enumeration, pattern, length, range). Each sampled value is new
  in the document, so unique and key fields never repeat one;
- every element a key selects holds its key fields, and every reference a keyref checks points at an
  element of the key: one already planned when the values can meet (the element itself, for a reference to
  its own key), else one planted along the key's selector, with what it requires in turn (its own
  references included).

```
dialecte fixture AAA_1 --package @dialecte/core/test
<?xml version="1.0" encoding="UTF-8"?>
<Root xmlns="http://dialecte.dev/XML/DEFAULT">
    <A aA="A">
        <AA_1 aAA_1="AA_1">
            <AAA_1 aAAA_1="aaa">
                <AAAA_1 aAAAA_1="AAAA_1"/>
            </AAA_1>
        </AA_1>
    </A>
</Root>
```

What is guaranteed, and how it is proven: the document is valid against the dialecte's full XSD -
structure, values, identity (unique and key) and references (keyref). The tests build the fixture of every
element of core's test dialecte and of scl and judge each with `xmllint --schema` on the real XSD.

What is not:

- The hooks have the last word on what they fill: an attribute a hook already set when the element was
  added (an id, a derived name) keeps the hook's value. A dialecte whose hooks fill a key or reference
  field differently from the plan could break a reference the plan made good; the tests catch it for the
  dialectes they cover.
- Only the first branch of a required choice, and the first variant of an abstract type, are taken; the
  fixture holds no optional content.
- A reference whose key is declared on another element than the keyref, a key reached only through `.//`
  or through any element, and a field reaching past the selected element are not planted: the command
  exits 1 naming the constraint, never with a document that breaks it.
- The document carries no record-id marks (`dev:db-id`): it is the plain export, as a user would get it.

- Ids are seeded and the clock is frozen: the same command and the same installed versions give the same
  bytes.
- `--out <file>` writes the document and prints one line (the path of the element, the bytes); `--json`
  answers `{ ok, packageName, tag, path, bytes, xml }` (`out` in place of `xml` with `--out`).
- Exit 1 with the reason when there is no fixture: an unknown tag (the closest tags named), a `--under`
  step its parent does not hold, an element only an endless chain of required children could hold, a
  value the fixture cannot make (the attribute named: a pattern construct it does not read, facets no
  value satisfies), a reference it cannot plant (the constraint named), or a write the engine refuses
  (its outcome, as `dialecte run` prints it). Exit 2: usage.
- The command does not run a schema validator itself: no XSD ships with it.
