const m = require('../src');

const matrix = {
  segments: [{ key: 'a', label: 'A' }],
  directions: [{ key: 'd', label: 'D' }],
  lenses: [{ key: 'fit', label: 'Fit', polarity: 1 }]
};
const cell = (over = {}) => ({ segmentKey: 'a', directionKey: 'd', lensKey: 'fit', score: 4, confidence: 'high', basis: 'assumption', ...over });

describe('inputs the validators would refuse do not change or break the math', () => {
  it('reads confidence only from its own three keys', () => {
    for (const confidence of ['constructor', 'toString', '__proto__', 'hasOwnProperty', 42, null]) {
      const out = m.rollup(matrix, [cell({ confidence })]);
      expect(out.directions[0].confidence).toBe('low');
    }
    expect(m.rollup(matrix, [cell()]).directions[0].confidence).toBe('high');
  });

  it('treats a matrix missing an axis as empty instead of throwing', () => {
    for (const broken of [{}, { segments: null }, { directions: 'x', lenses: 3 }, null, undefined]) {
      expect(() => m.rollup(broken, [cell()])).not.toThrow();
      expect(() => m.gaps(broken, [cell()])).not.toThrow();
    }
    expect(m.rollup({}, []).directions).toEqual([]);
    expect(m.validateMatrixCell(null, cell()).ok).toBe(false);
  });

  it('ignores a scenario override whose score is off the scale', () => {
    for (const score of ['5', 7, 0, 2.5, NaN, null, undefined]) {
      const applied = m.applyScenario([cell({ score: 3 })], [cell({ score })]);
      const entry = applied.get(m.cellKey('a', 'd', 'fit'));
      expect(entry.source).toBe('base');
      expect(entry.score).toBe(3);
    }
    expect(m.applyScenario([], [cell({ score: 'high' })]).size).toBe(0);
  });

  it('never reports a NaN change in a diff', () => {
    const diff = m.diffCells([cell({ score: 3 })], [cell({ score: '4' })]);
    expect(diff.changes).toEqual([]);
    expect(diff.unchanged).toBe(1);
    expect(JSON.stringify(m.diffCells([cell({ score: NaN })], [cell({ score: 2 })]))).not.toMatch(/NaN/);
    expect(() => m.diffCells('x', 5)).not.toThrow();
  });
});
