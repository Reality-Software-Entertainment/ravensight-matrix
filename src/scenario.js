'use strict';

const { SCORE_MIN, SCORE_MAX } = require('./schema');
const { rollup, round } = require('./score');
const { METHOD } = require('./version');

/** `segment.direction.lens`: the one identity of a cell inside a scenario. */
const cellKey = (segmentKey, directionKey, lensKey) => `${segmentKey}.${directionKey}.${lensKey}`;

const clamp = score => Math.min(SCORE_MAX, Math.max(SCORE_MIN, Math.round(score)));

function indexByKey(cells) {
  const map = new Map();
  for (const cell of cells || []) map.set(cellKey(cell.segmentKey, cell.directionKey, cell.lensKey), cell);
  return map;
}

/** Does one sensitivity rule name this cell? An omitted axis matches any. */
const ruleMatches = (rule, segmentKey, directionKey, lensKey) =>
  (!rule.segmentKey || rule.segmentKey === segmentKey) &&
  (!rule.directionKey || rule.directionKey === directionKey) &&
  (!rule.lensKey || rule.lensKey === lensKey);

/**
 * The cells a scenario sees.
 *
 * Each cell is decided in a fixed order: the scenario's own override for that
 * cell when it has one, otherwise the base cell moved by every sensitivity
 * rule that names it (clamped to 1 to 5), otherwise the base cell as it is. A
 * rule that a clamp cancels out leaves the cell as `base`.
 *
 * @param {Object[]} baseCells - the base matrix's cells
 * @param {Object[]} [scenarioCells] - this scenario's own overrides
 * @param {{sensitivity?: Array<{segmentKey?: string, directionKey?: string, lensKey?: string, delta: number}>}} [scenario]
 * @returns {Map<string, {cell: Object, score: number, base: number|null, source: 'override'|'sensitivity'|'base'}>}
 */
function applyScenario(baseCells, scenarioCells = [], scenario = null) {
  const base = indexByKey(baseCells);
  const overrides = indexByKey(scenarioCells);
  const rules = Array.isArray(scenario && scenario.sensitivity) ? scenario.sensitivity : [];
  const out = new Map();
  for (const key of new Set([...base.keys(), ...overrides.keys()])) {
    const baseCell = base.get(key) || null;
    const override = overrides.get(key);
    if (override) {
      out.set(key, { cell: override, score: override.score, base: baseCell ? baseCell.score : null, source: 'override' });
      continue;
    }
    const shift = rules
      .filter(rule => ruleMatches(rule, baseCell.segmentKey, baseCell.directionKey, baseCell.lensKey))
      .reduce((sum, rule) => sum + (Number(rule.delta) || 0), 0);
    const score = shift ? clamp(baseCell.score + shift) : baseCell.score;
    out.set(key, {
      cell: score === baseCell.score ? baseCell : { ...baseCell, score },
      score,
      base: baseCell.score,
      source: score === baseCell.score ? 'base' : 'sensitivity'
    });
  }
  return out;
}

/**
 * What a scenario changed, and why each cell moved.
 *
 * Only cells whose score differs from the base, or that the base never
 * scored, are listed, with a reason: `override` (rescored in the scenario),
 * `sensitivity` (moved by a scenario rule) or `new` (scored only in the
 * scenario). Largest move first, then by key, so the order never shuffles.
 *
 * @returns {{changes: Object[], unchanged: number}}
 */
function diffCells(baseCells, scenarioCells = [], scenario = null) {
  const changes = [];
  let unchanged = 0;
  for (const [key, entry] of applyScenario(baseCells, scenarioCells, scenario)) {
    const { segmentKey, directionKey, lensKey } = entry.cell;
    if (entry.base === null) {
      changes.push({ key, segmentKey, directionKey, lensKey, before: null, after: entry.score, delta: null, reason: 'new' });
      continue;
    }
    const delta = entry.score - entry.base;
    if (!delta) {
      unchanged += 1;
      continue;
    }
    changes.push({ key, segmentKey, directionKey, lensKey, before: entry.base, after: entry.score, delta, reason: entry.source });
  }
  changes.sort((a, b) => Math.abs(b.delta || 0) - Math.abs(a.delta || 0) || a.key.localeCompare(b.key));
  return { changes, unchanged };
}

/**
 * Every direction's rollup before and after a scenario, and its rank.
 */
function scenarioRollup(matrix, baseCells, scenarioCells = [], scenario = null) {
  const effective = [...applyScenario(baseCells, scenarioCells, scenario).values()].map(entry => entry.cell);
  const before = rollup(matrix, baseCells);
  const after = rollup(matrix, effective);
  const rank = (ranking, key) => {
    const position = ranking.indexOf(key);
    return position === -1 ? null : position + 1;
  };
  return {
    directions: before.directions.map((was, position) => {
      const now = after.directions[position];
      return {
        directionKey: was.directionKey,
        before: was.score,
        after: now.score,
        delta: was.score === null || now.score === null ? null : round(now.score - was.score),
        rankBefore: rank(before.ranking, was.directionKey),
        rankAfter: rank(after.ranking, was.directionKey)
      };
    }),
    rankingBefore: before.ranking,
    rankingAfter: after.ranking
  };
}

/** The whole diff a server answers: the cell changes plus the rollups. */
function diff(matrix, baseCells, scenarioCells = [], scenario = null) {
  return {
    method: METHOD,
    ...diffCells(baseCells, scenarioCells, scenario),
    ...scenarioRollup(matrix, baseCells, scenarioCells, scenario)
  };
}

module.exports = { cellKey, applyScenario, diffCells, scenarioRollup, diff };
