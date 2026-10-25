/**
 * The ES module entry: a fresh build of src/, importable by Node and by a
 * browser bundler, answering exactly what the CommonJS entry answers.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const build = require('../scripts/build-esm');
const core = require('../src');

const ROOT = path.join(__dirname, '..');

test('the committed esm/index.mjs is a fresh build (run node scripts/build-esm.js if this fails)', () => {
  expect(fs.readFileSync(build.OUT, 'utf8')).toBe(build.render());
});

test('it imports nothing, so a bundler needs no CommonJS support', () => {
  const source = fs.readFileSync(build.OUT, 'utf8');
  expect(source).not.toMatch(/^\s*import\s/m);
  expect(source).not.toMatch(/require\('(?!\.\/)/);
});

test('the package maps import to the ES module and require to CommonJS', () => {
  const pkg = require('../package.json');
  expect(pkg.exports['.']).toEqual({ import: './esm/index.mjs', require: './src/index.js', default: './src/index.js' });
  expect(pkg.files).toEqual(expect.arrayContaining(['src', 'esm']));
});

test('Node imports it, and every export and every answer match the CommonJS entry', () => {
  const script = `
    import core, * as named from './esm/index.mjs';
    const shape = { segments: [{ key: 'a', weight: 2 }, { key: 'b' }], directions: [{ key: 'd' }], lenses: core.DEFAULT_LENSES };
    const cells = [{ segmentKey: 'a', directionKey: 'd', lensKey: 'fit', score: 4, confidence: 'high', basis: 'evidence', citations: [{}] }];
    console.log(JSON.stringify({
      keys: Object.keys(named).filter(key => key !== 'default').sort(),
      version: named.CORE_VERSION,
      rollup: named.rollup(shape, cells),
      diff: named.diffCells(cells, [], { sensitivity: [{ delta: 1 }] }),
      calibration: named.calibrate(Array(5).fill({ probability: 0.6, happened: true }))
    }));
  `;
  const out = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], { cwd: ROOT, encoding: 'utf8' }));
  const shape = { segments: [{ key: 'a', weight: 2 }, { key: 'b' }], directions: [{ key: 'd' }], lenses: core.DEFAULT_LENSES };
  const cells = [{ segmentKey: 'a', directionKey: 'd', lensKey: 'fit', score: 4, confidence: 'high', basis: 'evidence', citations: [{}] }];
  expect(out).toEqual(JSON.parse(JSON.stringify({
    keys: Object.keys(core).sort(),
    version: core.CORE_VERSION,
    rollup: core.rollup(shape, cells),
    diff: core.diffCells(cells, [], { sensitivity: [{ delta: 1 }] }),
    calibration: core.calibrate(Array(5).fill({ probability: 0.6, happened: true }))
  })));
});

test('--check passes on a fresh build and fails on a stale one', () => {
  const errors = jest.spyOn(console, 'error').mockImplementation(() => {});
  expect(build.main(['--check'])).toBe(0);
  const original = fs.readFileSync(build.OUT, 'utf8');
  try {
    fs.writeFileSync(build.OUT, `${original}// stale\n`);
    expect(build.main(['--check'])).toBe(1);
    expect(build.main([])).toBe(0);
    expect(fs.readFileSync(build.OUT, 'utf8')).toBe(original);
  } finally {
    fs.writeFileSync(build.OUT, original);
    errors.mockRestore();
  }
});
