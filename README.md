# ravensight-matrix

The open core of the Ravensight strategy matrix: schema, scoring, gaps,
scenario diff and calibration, as pure functions with no dependencies.

A decision a studio makes lands on every player segment at once. A strategy
matrix lays those segments against the directions the studio could take (a
pivot, a price model, a port, open sourcing a tool) and scores every pair
through several lenses. Every score says how sure it is and what it rests on.
Scenarios branch the matrix and say why each cell moved. Decisions record
predictions, and calibration later says how often those predictions came
true.

This package holds the math only. It does no I/O, reads no clock and uses no
randomness, so a server and a browser given the same matrix compute the same
numbers.

## Install

```sh
npm install ravensight-matrix
```

Node 18 or later. CommonJS (`require`) and an ES module entry (`import`, `esm/index.mjs`), chosen through the `exports` map.

## The shape

- **Segments**, up to 12: who the decision lands on. `{ key, label, description?, weight? }`
- **Directions**, up to 10: what the studio could do. `{ key, label, description?, params? }`
- **Lenses**, up to 10: how each pair is judged. `{ key, label, polarity, weight? }`.
  Polarity is `1` when a high score is good (fit, revenue, feasibility) and
  `-1` when it is bad (friction, risk). `DEFAULT_LENSES` holds those five.
- **Cells**: one per segment, direction and lens.
  - `score` is an integer from 1 to 5.
  - `confidence` is `low`, `med` or `high`.
  - `basis` is `evidence` (needs at least one citation), `inference`
    (derived from cited records) or `assumption` (may cite nothing).
  - `citations` carry a `stance` of `supports` or `contradicts`.
- **Scenarios**, up to 20: a named branch `{ id, title, description,
  sensitivity }` with its own cells. `sensitivity` is a list of rules
  `{ segmentKey?, directionKey?, lensKey?, delta }`; a rule that leaves out an
  axis names every entry on it.

Keys match `/^[a-z0-9_]{1,32}$/`. Every validator returns `{ ok, errors }`
and never throws.

## Use

```js
const matrix = require('ravensight-matrix');

const shape = {
  segments: [{ key: 'core', label: 'Core players', weight: 3 }, { key: 'lapsed', label: 'Lapsed players' }],
  directions: [{ key: 'port', label: 'Port to handheld' }],
  lenses: matrix.DEFAULT_LENSES
};

const cells = [
  { segmentKey: 'core', directionKey: 'port', lensKey: 'fit', score: 4, confidence: 'med', basis: 'evidence', citations: [{ stance: 'supports' }] },
  { segmentKey: 'core', directionKey: 'port', lensKey: 'risk', score: 2, confidence: 'low', basis: 'assumption', citations: [] }
];

matrix.validateMatrixCell(shape, cells[0]); // { ok: true, errors: [] }
matrix.rollup(shape, cells);                // per direction, per segment, and a ranking
matrix.gaps(shape, cells);                  // what to look at next, heaviest first
```

### Rollup

`rollup(matrix, cells)` answers, for every direction, a score from 1 to 5
where higher is better on every lens once negative lenses are turned around.
Lenses are averaged by weight inside a segment, then segments by weight
inside the direction. Only filled cells count. Each rollup carries its
confidence, the share of it that rests on assumptions, how many cells are
contested (a citation contradicts them) and the cells that move it most.

### Gaps

`gaps(matrix, cells)` counts what is `unscored`, the `assumptions`, the
`lowConfidence` cells and the `contested` ones, and lists each coordinate
worth another look under its most urgent reason, heaviest segment and lens
first.

### Scenarios

`applyScenario(baseCells, scenarioCells, scenario)` decides each cell in a
fixed order: the scenario's own cell, then the base cell moved by the
scenario's rules (clamped to 1 to 5), then the base cell. Cells are keyed
`segment.direction.lens`. `diffCells(...)` answers `{ changes, unchanged }`,
each change with its `reason`: `override`, `sensitivity` or `new`.
`diff(matrix, baseCells, scenarioCells, scenario)` adds every direction's
rollup and rank before and after.

### Calibration

`outcome(comparator, threshold, value)` says whether a prediction came true;
the comparator is `gte` or `lte`. `calibrate(predictions)` takes
`{ probability, happened }` entries and answers `{ n, hits, hitRate, brier,
meanProbability, tooFew }`: the share that came true, the mean squared gap
between probability and outcome, and the mean probability given. Under five
resolved predictions it answers `tooFew: true` and no rates, because a rate
from three predictions is an anecdote.

## Versions

`CORE_VERSION` is this package's version and `METHOD` names the scoring
method (`weighted-mean-v1`). A hosted response that used this package carries
both, so a number can be traced to the math that made it.

## Contributing

Issues and pull requests are welcome. This package is developed inside
Ravensight and mirrored here, so an accepted change is applied there first and
then appears in this repository with the next release. Run `npm test` and
`npm run check` (the ES module entry must be a fresh build of `src/`) before
opening a pull request.

## License

MIT. See `LICENSE`.
