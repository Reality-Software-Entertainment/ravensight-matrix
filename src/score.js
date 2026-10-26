'use strict';

const { SCORE_MIN, SCORE_MAX, SCORE_MID, axesOf } = require('./schema');
const { METHOD } = require('./version');

/** Confidence as a number, so it can be averaged, and back. */
const CONFIDENCE_VALUE = Object.freeze({ low: 1, med: 2, high: 3 });

/** A confidence's number, reading only the three own keys; anything else is low. */
const confidenceValue = key =>
  typeof key === 'string' && Object.prototype.hasOwnProperty.call(CONFIDENCE_VALUE, key) ? CONFIDENCE_VALUE[key] : 1;

/** @param {number} value @returns {'low'|'med'|'high'} */
function confidenceLabel(value) {
  if (!Number.isFinite(value) || value < 1.5) return 'low';
  if (value < 2.5) return 'med';
  return 'high';
}

/** Two decimals: a mean of integers 1 to 5 is not more precise than that. */
const round = value => Math.round(value * 100) / 100;

/** A weight as the matrix states it, or 1. */
const weightOf = entry => (typeof entry.weight === 'number' && entry.weight > 0 ? entry.weight : 1);

/** Where a cell sits, as one string. */
const coordinate = (segmentKey, directionKey, lensKey) => `${segmentKey}|${directionKey}|${lensKey}`;

/** @param {Object[]} cells @returns {Map<string, Object>} */
function indexCells(cells) {
  const index = new Map();
  for (const cell of cells || []) {
    index.set(coordinate(cell.segmentKey, cell.directionKey, cell.lensKey), cell);
  }
  return index;
}

/**
 * A score turned so that the high end is always good: a friction of 5 reads
 * as 1, a fit of 5 stays 5.
 */
const oriented = (score, polarity) => (polarity === -1 ? SCORE_MIN + SCORE_MAX - score : score);

/** True when any citation on the cell argues against it. */
const isContested = cell => (cell.citations || []).some(citation => citation && citation.stance === 'contradicts');

/**
 * Every filled cell of one direction, with the share of the direction's
 * rollup it carries. A segment's lenses split that segment's share by lens
 * weight; segments split the direction by segment weight. Only filled cells
 * count, so an empty lens neither drags a score down nor props it up.
 */
function weightedCells(matrix, index, direction) {
  const axes = axesOf(matrix);
  const segments = [];
  for (const segment of axes.segments) {
    const present = axes.lenses
      .map(lens => ({ lens, cell: index.get(coordinate(segment.key, direction.key, lens.key)) }))
      .filter(entry => entry.cell);
    if (present.length) segments.push({ segment, present });
  }
  const segmentTotal = segments.reduce((sum, entry) => sum + weightOf(entry.segment), 0);
  const parts = [];
  for (const { segment, present } of segments) {
    const lensTotal = present.reduce((sum, entry) => sum + weightOf(entry.lens), 0);
    for (const { lens, cell } of present) {
      parts.push({
        segment,
        lens,
        cell,
        share: (weightOf(segment) / segmentTotal) * (weightOf(lens) / lensTotal),
        value: oriented(cell.score, lens.polarity)
      });
    }
  }
  return parts;
}

/** The numbers every rollup carries, from its weighted parts. */
function summarise(parts) {
  if (!parts.length) {
    return { score: null, confidence: null, assumptionShare: null, contested: 0, cells: 0 };
  }
  const sum = pick => parts.reduce((total, part) => total + part.share * pick(part), 0);
  return {
    score: round(sum(part => part.value)),
    confidence: confidenceLabel(sum(part => confidenceValue(part.cell.confidence))),
    assumptionShare: round(sum(part => (part.cell.basis === 'assumption' ? 1 : 0))),
    contested: parts.filter(part => isContested(part.cell)).length,
    cells: parts.length
  };
}

/**
 * Roll the matrix up: per direction, per segment within it, and a ranking.
 *
 * Each direction answers its score (1 to 5, higher is better on every lens
 * once negative lenses are turned around), the confidence it carries, how
 * much of it rests on assumptions, how many of its cells are contested, and
 * the cells that move it most. `top` cells are ranked by how far they pull
 * from the neutral 3, times the share they carry.
 *
 * @param {{segments: Object[], directions: Object[], lenses: Object[]}} matrix
 * @param {Object[]} cells
 * @param {{top?: number}} [options]
 */
function rollup(matrix, cells, { top = 3 } = {}) {
  const index = indexCells(cells);
  const axes = axesOf(matrix);
  const expected = axes.segments.length * axes.lenses.length;

  const directions = axes.directions.map(direction => {
    const parts = weightedCells(matrix, index, direction);
    const segments = axes.segments.map(segment => {
      const own = parts.filter(part => part.segment.key === segment.key);
      const total = own.reduce((sum, part) => sum + part.share, 0);
      // Re-normalised inside the segment, so a segment's own score does not
      // depend on how many other segments were filled.
      const local = own.map(part => ({ ...part, share: part.share / total }));
      return { segmentKey: segment.key, ...summarise(local), expected: axes.lenses.length };
    });
    const contributions = parts
      .map(part => ({
        segmentKey: part.segment.key,
        lensKey: part.lens.key,
        score: part.cell.score,
        effect: round(part.share * (part.value - SCORE_MID))
      }))
      .filter(part => part.effect !== 0)
      .sort((a, b) => Math.abs(b.effect) - Math.abs(a.effect) ||
        a.segmentKey.localeCompare(b.segmentKey) || a.lensKey.localeCompare(b.lensKey))
      .slice(0, top);
    return {
      directionKey: direction.key,
      ...summarise(parts),
      expected,
      segments,
      top: contributions
    };
  });

  const ranking = directions
    .filter(direction => direction.score !== null)
    .sort((a, b) => b.score - a.score || a.directionKey.localeCompare(b.directionKey))
    .map(direction => direction.directionKey);

  return { method: METHOD, directions, ranking };
}

module.exports = {
  CONFIDENCE_VALUE,
  confidenceLabel,
  coordinate,
  indexCells,
  oriented,
  isContested,
  rollup,
  round
};
