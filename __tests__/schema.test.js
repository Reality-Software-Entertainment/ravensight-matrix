const m = require('../src');

describe('the package surface', () => {
  test('names its version and method', () => {
    expect(m.CORE_VERSION).toBe('0.1.0');
    expect(m.METHOD).toBe('weighted-mean-v1');
    expect(require('../package.json').version).toBe(m.CORE_VERSION);
  });

  test('has no dependencies', () => {
    const pkg = require('../package.json');
    expect(pkg.dependencies).toBeUndefined();
    expect(pkg.license).toBe('MIT');
  });

  test('the README carries no em or en dashes', () => {
    const readme = require('fs').readFileSync(require('path').join(__dirname, '..', 'README.md'), 'utf8');
    expect(readme).not.toMatch(/[–—]/);
  });

  test('the default lenses and their polarity', () => {
    expect(m.DEFAULT_LENSES.map(lens => [lens.key, lens.polarity])).toEqual([
      ['fit', 1], ['revenue', 1], ['friction', -1], ['feasibility', 1], ['risk', -1]
    ]);
    expect(m.DEFAULT_LENSES.every(lens => m.validateLens(lens).ok)).toBe(true);
  });
});

describe('keys', () => {
  test.each([['core', true], ['a_1', true], ['A', false], ['has space', false], ['', false], ['x'.repeat(33), false], [3, false]])(
    '%p is a key: %p', (value, ok) => expect(m.isKey(value)).toBe(ok)
  );
});

describe('segments, directions and lenses', () => {
  test('a good segment, and every way to get one wrong', () => {
    expect(m.validateSegment({ key: 'core', label: 'Core', description: 'Daily players', weight: 2 })).toEqual({ ok: true, errors: [] });
    expect(m.validateSegment(null).ok).toBe(false);
    expect(m.validateSegment([]).ok).toBe(false);
    const bad = m.validateSegment({ key: 'Bad', label: '', description: 4, weight: 0 });
    expect(bad.ok).toBe(false);
    expect(bad.errors).toHaveLength(4);
    expect(m.validateSegment({ key: 'core' }).errors).toEqual(['label is required.']);
    expect(m.validateSegment({ key: 'core', label: 'x', weight: 101 }).ok).toBe(false);
    expect(m.validateSegment({ key: 'core', label: 'x', weight: Infinity }).ok).toBe(false);
    expect(m.validateSegment({ key: 'core', label: 'x'.repeat(81) }).ok).toBe(false);
    expect(m.validateSegment({ key: 'core', label: 'x', description: null }).ok).toBe(true);
  });

  test('directions take flat params', () => {
    expect(m.validateDirection({ key: 'f2p', label: 'Free to play', params: { price: 0, model: 'ads' } }).ok).toBe(true);
    expect(m.validateDirection({ key: 'f2p', label: 'Free', params: null }).ok).toBe(true);
    expect(m.validateDirection('nope').ok).toBe(false);
    expect(m.validateDirection({ key: 'f2p', label: 'Free', params: [] }).errors[0]).toContain('params must be');
    expect(m.validateDirection({ key: 'f2p', label: 'Free', params: { Bad: 1 } }).errors[0]).toContain('param name');
    expect(m.validateDirection({ key: 'f2p', label: 'Free', params: { a: { nested: true } } }).errors[0]).toContain('param "a"');
    expect(m.validateDirection({ key: 'f2p', label: 'Free', params: { a: NaN } }).ok).toBe(false);
    expect(m.validateDirection({ key: 'f2p', label: 'Free', params: { a: 'x'.repeat(201) } }).ok).toBe(false);
    const many = Object.fromEntries(Array.from({ length: 11 }, (_, i) => [`p${i}`, i]));
    expect(m.validateDirection({ key: 'f2p', label: 'Free', params: many }).errors).toContain('At most 10 params.');
  });

  test('lenses need a polarity', () => {
    expect(m.validateLens({ key: 'joy', label: 'Joy', polarity: 1 }).ok).toBe(true);
    expect(m.validateLens({ key: 'joy', label: 'Joy', polarity: 0 }).errors).toEqual(['polarity must be 1 or -1.']);
    expect(m.validateLens({ key: 'joy', label: 'Joy', polarity: 1, description: 'Would they smile' }).ok).toBe(true);
    expect(m.validateLens({ key: 'joy', label: 'Joy', polarity: 1, description: 'x'.repeat(501) }).ok).toBe(false);
    expect(m.validateLens(undefined).ok).toBe(false);
  });
});

describe('cells', () => {
  const good = { score: 4, confidence: 'med', basis: 'evidence', citations: [{ stance: 'supports' }] };

  test('a cited score on evidence is valid', () => {
    expect(m.validateCell(good)).toEqual({ ok: true, errors: [] });
    expect(m.validateCell({ ...good, citations: [{}] }).ok).toBe(true);
  });

  test('evidence needs a citation, an assumption does not, and inference follows the letter of the contract', () => {
    expect(m.validateCell({ ...good, citations: [] }).errors[0]).toContain('needs at least one citation');
    expect(m.validateCell({ ...good, citations: undefined }).ok).toBe(false);
    expect(m.validateCell({ ...good, basis: 'assumption', citations: null }).ok).toBe(true);
    expect(m.validateCell({ ...good, basis: 'inference', citations: [] }).ok).toBe(true);
  });

  test.each([0, 6, 2.5, '4', null])('score %p is refused', score => {
    expect(m.validateCell({ ...good, score }).ok).toBe(false);
  });

  test('every other field', () => {
    expect(m.validateCell(null).ok).toBe(false);
    expect(m.validateCell({ ...good, confidence: 'medium' }).ok).toBe(false);
    expect(m.validateCell({ ...good, basis: 'vibes' }).ok).toBe(false);
    expect(m.validateCell({ ...good, rationale: 'x'.repeat(1001) }).ok).toBe(false);
    expect(m.validateCell({ ...good, citations: 'one' }).errors).toEqual(['citations must be an array.']);
    expect(m.validateCell({ ...good, citations: Array(9).fill({}) }).errors).toContain('At most 8 citations.');
    expect(m.validateCell({ ...good, citations: ['x'] }).errors).toContain('Each citation must be an object.');
    expect(m.validateCell({ ...good, citations: [{ stance: 'maybe' }] }).ok).toBe(false);
  });

  test('coordinates must exist on the matrix', () => {
    const shape = { segments: [{ key: 'core' }], directions: [{ key: 'port' }], lenses: [{ key: 'fit' }] };
    expect(m.validateMatrixCell(shape, { ...good, segmentKey: 'core', directionKey: 'port', lensKey: 'fit' }).ok).toBe(true);
    const wrong = m.validateMatrixCell(shape, { ...good, segmentKey: 'x', directionKey: 'y', lensKey: 'z' });
    expect(wrong.errors).toHaveLength(3);
    expect(m.validateMatrixCell(shape, null).ok).toBe(false);
    expect(m.validateMatrixCell({}, { ...good, segmentKey: 'core', directionKey: 'port', lensKey: 'fit' }).errors).toHaveLength(3);
  });
});

describe('scenarios and sensitivity', () => {
  test('a scenario is a title, a description and a list of rules', () => {
    expect(m.validateScenario({
      title: 'Cheaper', description: 'Five under', sensitivity: [{ lensKey: 'friction', delta: -1 }, { segmentKey: 'core', directionKey: 'port', delta: 2 }]
    })).toEqual({ ok: true, errors: [] });
    expect(m.validateScenario({ title: 'Plain' }).ok).toBe(true);
    expect(m.validateSensitivity(null).ok).toBe(true);
    expect(m.validateSensitivity([]).ok).toBe(true);
    expect(m.validateSensitivity([{ lensKey: null, delta: 1 }]).ok).toBe(true);
  });

  test('every way to get one wrong', () => {
    expect(m.validateScenario(5).ok).toBe(false);
    expect(m.validateScenario({ title: '' }).ok).toBe(false);
    expect(m.validateScenario({ title: 'x'.repeat(121) }).ok).toBe(false);
    expect(m.validateScenario({ title: 'x', description: 'x'.repeat(1001) }).ok).toBe(false);
    expect(m.validateSensitivity({}).errors).toEqual(['sensitivity must be an array of rules.']);
    expect(m.validateSensitivity(Array(21).fill({ delta: 1 })).errors).toContain('At most 20 sensitivity rules.');
    expect(m.validateSensitivity(['x']).errors).toEqual(['Each sensitivity rule must be an object.']);
    expect(m.validateSensitivity([{ lensKey: 'Bad', delta: 1 }]).ok).toBe(false);
    for (const delta of [0, 5, -5, 1.5]) {
      expect(m.validateSensitivity([{ delta }]).ok).toBe(false);
    }
  });
});

describe('predictions', () => {
  test('valid and invalid', () => {
    expect(m.validatePrediction({ metric: 'd7_retention', comparator: 'gte', threshold: 0.2, probability: 0.6 }).ok).toBe(true);
    expect(m.validatePrediction({ metric: 'x', comparator: 'lte', threshold: 1, probability: 0.01 }).ok).toBe(true);
    expect(m.validatePrediction(null).ok).toBe(false);
    const bad = m.validatePrediction({ metric: 'D7', comparator: 'about', threshold: '1', probability: 1.2 });
    expect(bad.errors).toHaveLength(4);
    for (const probability of [0, 1, NaN]) {
      expect(m.validatePrediction({ metric: 'x', comparator: 'gte', threshold: 1, probability }).ok).toBe(false);
    }
    expect(m.validatePrediction({ metric: 'x', comparator: 'gt', threshold: 1, probability: 0.5 }).ok).toBe(false);
  });
});

describe('a whole matrix', () => {
  test('limits and unique keys per axis, and unique ids for scenarios', () => {
    const segment = key => ({ key, label: key });
    expect(m.validateMatrix({ segments: [segment('a')], directions: [], lenses: m.DEFAULT_LENSES }).ok).toBe(true);
    expect(m.validateMatrix({}).ok).toBe(true);
    expect(m.validateMatrix(null).ok).toBe(false);
    expect(m.validateMatrix({ segments: 'x' }).errors).toEqual(['segments must be an array.']);
    expect(m.validateMatrix({ segments: [segment('a'), segment('a')] }).errors).toEqual(['segments keys must be unique.']);
    expect(m.validateMatrix({ scenarios: [{ id: 's1', title: 'A' }, { id: 's2', title: 'B' }] }).ok).toBe(true);
    expect(m.validateMatrix({ scenarios: [{ id: 's1', title: 'A' }, { id: 's1', title: 'B' }] }).errors).toEqual(['scenarios ids must be unique.']);
    const thirteen = Array.from({ length: 13 }, (_, i) => segment(`s${i}`));
    expect(m.validateMatrix({ segments: thirteen }).errors).toContain('At most 12 segments.');
    expect(m.validateMatrix({ lenses: [{ key: 'x', label: 'X' }] }).errors[0]).toBe('lenses: polarity must be 1 or -1.');
  });
});
