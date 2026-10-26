'use strict';

const { coordinate, indexCells, isContested } = require('./score');
const { axesOf } = require('./schema');

/**
 * Why a cell is worth another look, most urgent first.
 *  - missing: nobody has scored it.
 *  - contested: a cited record argues against the score.
 *  - assumption: the score rests on nothing the studio has recorded.
 *  - low_confidence: scored, and still unsure.
 */
const REASONS = Object.freeze(['missing', 'contested', 'assumption', 'low_confidence']);

const weightOf = entry => (typeof entry.weight === 'number' && entry.weight > 0 ? entry.weight : 1);

function reasonFor(cell) {
  if (!cell) return 'missing';
  if (isContested(cell)) return 'contested';
  if (cell.basis === 'assumption') return 'assumption';
  if (cell.confidence === 'low') return 'low_confidence';
  return null;
}

/**
 * The cells a studio should look at next.
 *
 * The four counts overlap (a contested assumption counts as both):
 * `unscored`, `assumptions`, `lowConfidence` and `contested`. `items` gives
 * each coordinate its single most urgent reason, heaviest first: priority is
 * the segment's weight times the lens's weight, ties broken by urgency and
 * then by coordinates, so the order is stable.
 *
 * @param {{segments: Object[], directions: Object[], lenses: Object[]}} matrix
 * @param {Object[]} cells
 * @param {{limit?: number}} [options]
 */
function gaps(matrix, cells, { limit = 50 } = {}) {
  const index = indexCells(cells);
  const counts = { unscored: 0, assumptions: 0, lowConfidence: 0, contested: 0 };
  const items = [];
  const axes = axesOf(matrix);
  for (const direction of axes.directions) {
    for (const segment of axes.segments) {
      for (const lens of axes.lenses) {
        const cell = index.get(coordinate(segment.key, direction.key, lens.key));
        if (!cell) counts.unscored += 1;
        else {
          if (cell.basis === 'assumption') counts.assumptions += 1;
          if (cell.confidence === 'low') counts.lowConfidence += 1;
          if (isContested(cell)) counts.contested += 1;
        }
        const reason = reasonFor(cell);
        if (!reason) continue;
        items.push({
          segmentKey: segment.key,
          directionKey: direction.key,
          lensKey: lens.key,
          reason,
          priority: weightOf(segment) * weightOf(lens)
        });
      }
    }
  }
  items.sort((a, b) => b.priority - a.priority ||
    REASONS.indexOf(a.reason) - REASONS.indexOf(b.reason) ||
    a.directionKey.localeCompare(b.directionKey) ||
    a.segmentKey.localeCompare(b.segmentKey) ||
    a.lensKey.localeCompare(b.lensKey));
  return { ...counts, total: items.length, items: items.slice(0, limit) };
}

module.exports = { REASONS, gaps };
