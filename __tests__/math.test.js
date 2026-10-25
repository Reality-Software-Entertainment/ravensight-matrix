const m = require('../src');

const shape = {
  segments: [{ key: 'core', label: 'Core', weight: 3 }, { key: 'lapsed', label: 'Lapsed' }],
  directions: [{ key: 'port', label: 'Port' }, { key: 'f2p', label: 'Free to play' }],
  lenses: m.DEFAULT_LENSES
};

const cell = (segmentKey, directionKey, lensKey, score, extra = {}) => ({
  segmentKey, directionKey, lensKey, score, confidence: 'med', basis: 'evidence', citations: [{ stance: 'supports' }], ...extra
});

const cells = [
  cell('core', 'port', 'fit', 4),
  cell('core', 'port', 'risk', 2, { confidence: 'low', basis: 'assumption', citations: [] }),
  cell('lapsed', 'port', 'fit', 2, { confidence: 'high', citations: [{ stance: 'contradicts' }] })
];

describe('rollup', () => {
  test('weights lenses inside a segment, then segments inside a direction, turning negative lenses around', () => {
    const result = m.rollup(shape, cells);
    expect(result.method).toBe('weighted-mean-v1');
    const [port, f2p] = result.directions;
    expect(port).toMatchObject({
      directionKey: 'port', score: 3.5, confidence: 'med', assumptionShare: 0.38, contested: 1, cells: 3, expected: 10
    });
    expect(port.segments).toEqual([
      { segmentKey: 'core', score: 4, confidence: 'med', assumptionShare: 0.5, contested: 0, cells: 2, expected: 5 },
      { segmentKey: 'lapsed', score: 2, confidence: 'high', assumptionShare: 0, contested: 1, cells: 1, expected: 5 }
    ]);
    expect(port.top).toEqual([
      { segmentKey: 'core', lensKey: 'fit', score: 4, effect: 0.38 },
      { segmentKey: 'core', lensKey: 'risk', score: 2, effect: 0.38 },
      { segmentKey: 'lapsed', lensKey: 'fit', score: 2, effect: -0.25 }
    ]);
    expect(f2p).toMatchObject({ score: null, confidence: null, assumptionShare: null, contested: 0, cells: 0, top: [] });
    expect(f2p.segments.every(segment => segment.score === null)).toBe(true);
    expect(result.ranking).toEqual(['port']);
  });

  test('a neutral cell moves nothing, ties rank by key, and top is capped', () => {
    const flat = [cell('core', 'port', 'fit', 3), cell('core', 'f2p', 'fit', 3), cell('lapsed', 'f2p', 'revenue', 5)];
    const result = m.rollup(shape, flat, { top: 1 });
    expect(result.directions[0].top).toEqual([]);
    expect(result.directions[1].top).toHaveLength(1);
    expect(m.rollup(shape, [cell('core', 'port', 'fit', 3), cell('core', 'f2p', 'fit', 3)]).ranking).toEqual(['f2p', 'port']);
  });

  test('unknown confidences count as low and missing weights count as one', () => {
    const plain = { segments: [{ key: 'a' }], directions: [{ key: 'd' }], lenses: [{ key: 'l', polarity: 1, weight: 0 }] };
    const result = m.rollup(plain, [{ segmentKey: 'a', directionKey: 'd', lensKey: 'l', score: 5, confidence: 'odd', basis: 'inference' }]);
    expect(result.directions[0]).toMatchObject({ score: 5, confidence: 'low', assumptionShare: 0 });
    expect(m.rollup(plain, undefined).ranking).toEqual([]);
  });

  test('helpers', () => {
    expect(m.oriented(5, -1)).toBe(1);
    expect(m.oriented(5, 1)).toBe(5);
    expect(m.confidenceLabel(1.49)).toBe('low');
    expect(m.confidenceLabel(2.49)).toBe('med');
    expect(m.confidenceLabel(2.5)).toBe('high');
    expect(m.coordinate('a', 'b', 'c')).toBe('a|b|c');
    expect(m.isContested({})).toBe(false);
    expect(m.isContested({ citations: [null, { stance: 'contradicts' }] })).toBe(true);
  });
});

describe('gaps', () => {
  test('overlapping counts, and items heaviest first, then by urgency, then by coordinates', () => {
    const result = m.gaps(shape, cells);
    expect(result).toMatchObject({ unscored: 17, assumptions: 1, lowConfidence: 1, contested: 1, total: 19 });
    expect(result.items[0]).toEqual({ segmentKey: 'core', directionKey: 'f2p', lensKey: 'feasibility', reason: 'missing', priority: 3 });
    expect(result.items[8]).toMatchObject({ segmentKey: 'core', directionKey: 'port', lensKey: 'risk', reason: 'assumption' });
    expect(result.items[18]).toMatchObject({ segmentKey: 'lapsed', directionKey: 'port', lensKey: 'fit', reason: 'contested', priority: 1 });
  });

  test('low confidence on a cited score is a gap, a confident one is not, and the list is capped', () => {
    const one = { segments: [{ key: 'a' }], directions: [{ key: 'd' }], lenses: [{ key: 'l', polarity: 1 }, { key: 'k', polarity: 1 }] };
    const result = m.gaps(one, [
      { segmentKey: 'a', directionKey: 'd', lensKey: 'l', score: 2, confidence: 'low', basis: 'evidence', citations: [{}] },
      { segmentKey: 'a', directionKey: 'd', lensKey: 'k', score: 2, confidence: 'high', basis: 'inference' }
    ], { limit: 0 });
    expect(result).toEqual({ unscored: 0, assumptions: 0, lowConfidence: 1, contested: 0, total: 1, items: [] });
    expect(m.GAP_REASONS).toEqual(['missing', 'contested', 'assumption', 'low_confidence']);
  });
});

describe('scenarios', () => {
  const scenario = { id: 'handheld', sensitivity: [{ lensKey: 'risk', delta: -1 }] };
  const overrides = [
    cell('lapsed', 'port', 'fit', 3, { basis: 'assumption', citations: [] }),
    cell('core', 'f2p', 'fit', 5)
  ];

  test('applyScenario: override, then sensitivity, then base, keyed segment.direction.lens', () => {
    const applied = m.applyScenario(cells, overrides, scenario);
    expect([...applied.entries()].map(([key, entry]) => [key, entry.score, entry.base, entry.source])).toEqual([
      ['core.port.fit', 4, 4, 'base'],
      ['core.port.risk', 1, 2, 'sensitivity'],
      ['lapsed.port.fit', 3, 2, 'override'],
      ['core.f2p.fit', 5, null, 'override']
    ]);
    expect(m.cellKey('a', 'b', 'c')).toBe('a.b.c');
    expect([...m.applyScenario(cells).values()].every(entry => entry.source === 'base')).toBe(true);
    expect([...m.applyScenario(cells, [], { sensitivity: 'nope' }).values()].every(entry => entry.source === 'base')).toBe(true);
  });

  test('a rule names every entry on an axis it leaves out, and clamps to 1 to 5', () => {
    const applied = m.applyScenario([cell('core', 'port', 'fit', 4), cell('lapsed', 'f2p', 'risk', 2)], [], {
      sensitivity: [{ delta: 3 }, { segmentKey: 'lapsed', delta: 'x' }]
    });
    expect([...applied.values()].map(entry => [entry.score, entry.source])).toEqual([[5, 'sensitivity'], [5, 'sensitivity']]);
  });

  test('diffCells says what moved, by how much and why, largest first', () => {
    expect(m.diffCells(cells, overrides, scenario)).toEqual({
      changes: [
        { key: 'core.port.risk', segmentKey: 'core', directionKey: 'port', lensKey: 'risk', before: 2, after: 1, delta: -1, reason: 'sensitivity' },
        { key: 'lapsed.port.fit', segmentKey: 'lapsed', directionKey: 'port', lensKey: 'fit', before: 2, after: 3, delta: 1, reason: 'override' },
        { key: 'core.f2p.fit', segmentKey: 'core', directionKey: 'f2p', lensKey: 'fit', before: null, after: 5, delta: null, reason: 'new' }
      ],
      unchanged: 1
    });
  });

  test('defaults: no cells, no overrides, no scenario; two new cells sort by key', () => {
    expect(m.applyScenario(null).size).toBe(0);
    expect(m.diffCells(cells)).toEqual({ changes: [], unchanged: 3 });
    expect(m.diff(shape, cells).changes).toEqual([]);
    const both = m.diffCells([], [cell('lapsed', 'port', 'fit', 2), cell('core', 'port', 'fit', 2)]);
    expect(both.changes.map(change => change.key)).toEqual(['core.port.fit', 'lapsed.port.fit']);
  });

  test('a clamped rule or an override at the same score is unchanged', () => {
    const top = [cell('core', 'port', 'fit', 5), cell('core', 'port', 'risk', 3)];
    expect(m.diffCells(top, [cell('core', 'port', 'risk', 3)], { sensitivity: [{ lensKey: 'fit', delta: 2 }] }))
      .toEqual({ changes: [], unchanged: 2 });
  });

  test('diff adds every direction\'s rollup and rank before and after', () => {
    const result = m.diff(shape, cells, overrides, scenario);
    expect(result.method).toBe('weighted-mean-v1');
    expect(result.changes).toHaveLength(3);
    expect(result.unchanged).toBe(1);
    expect(result.directions).toEqual([
      { directionKey: 'port', before: 3.5, after: 4.13, delta: 0.63, rankBefore: 1, rankAfter: 2 },
      { directionKey: 'f2p', before: null, after: 5, delta: null, rankBefore: null, rankAfter: 1 }
    ]);
    expect(result.rankingBefore).toEqual(['port']);
    expect(result.rankingAfter).toEqual(['f2p', 'port']);
    expect(m.scenarioRollup(shape, cells).directions[0]).toMatchObject({ before: 3.5, after: 3.5, delta: 0 });
  });
});

describe('calibration', () => {
  test('outcome compares with gte and lte only', () => {
    expect(m.outcome('gte', 0.2, 0.2)).toBe(true);
    expect(m.outcome('gte', 0.2, 0.1)).toBe(false);
    expect(m.outcome('lte', 10, 10)).toBe(true);
    expect(m.outcome('lte', 10, 11)).toBe(false);
    expect(() => m.outcome('gt', 1, 1)).toThrow(TypeError);
  });

  test('hits, hit rate, Brier score and mean probability', () => {
    expect(m.calibrate([
      { probability: 0.8, happened: true },
      { probability: 0.7, happened: true },
      { probability: 0.6, happened: false },
      { probability: 0.3, happened: false },
      { probability: 0.2, happened: true },
      { probability: 0.5 }
    ])).toEqual({ n: 5, hits: 3, hitRate: 0.6, brier: 0.244, meanProbability: 0.52, tooFew: false });
  });

  test('under five resolved predictions is too few to rate', () => {
    expect(m.calibrate([{ probability: 0.9, happened: true }]))
      .toEqual({ n: 1, hits: 1, hitRate: null, brier: null, meanProbability: null, tooFew: true });
    expect(m.calibrate(undefined)).toMatchObject({ n: 0, tooFew: true });
    expect(m.calibrate([{ probability: 1.5, happened: true }], { minimum: 1 })).toMatchObject({ tooFew: false, hitRate: 1, brier: 0, meanProbability: 1 });
    expect(m.CALIBRATION_MINIMUM).toBe(5);
  });
});

describe('purity', () => {
  test('nothing in the core reads a clock, randomness or I/O', () => {
    const fs = require('fs');
    const path = require('path');
    const dir = path.join(__dirname, '..', 'src');
    for (const file of fs.readdirSync(dir)) {
      const source = fs.readFileSync(path.join(dir, file), 'utf8');
      expect([file, /Date\.now|new Date|Math\.random|require\('(fs|http|https|net|child_process)'\)/.test(source)]).toEqual([file, false]);
    }
  });
});
