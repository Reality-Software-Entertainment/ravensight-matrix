'use strict';

const { COMPARATORS } = require('./schema');

/** Below this many resolved predictions a hit rate is an anecdote. */
const MINIMUM = 5;

const round = value => Math.round(value * 1000) / 1000;

/**
 * Did the prediction come true? `value` is what happened; the comparator and
 * threshold are what was predicted.
 *
 * @param {'gte'|'lte'} comparator
 * @param {number} threshold
 * @param {number} value
 * @returns {boolean}
 */
function outcome(comparator, threshold, value) {
  if (!COMPARATORS.includes(comparator)) throw new TypeError(`Unknown comparator "${comparator}".`);
  return comparator === 'lte' ? value <= threshold : value >= threshold;
}

/**
 * How well the studio's stated probabilities matched what happened.
 *
 * Each entry is a resolved prediction: the probability the studio gave it and
 * whether it happened. `hitRate` is the share that came true. `brier` is the
 * mean of (probability minus outcome) squared, so 0 is perfect and 0.25 is
 * what always saying one half earns. Under five resolved predictions the
 * numbers are noise, so they are withheld and `tooFew` says so.
 *
 * @param {Array<{probability: number, happened: boolean}>} predictions
 * @param {{minimum?: number}} [options]
 * @returns {{n: number, hits: number, hitRate: number|null, brier: number|null, meanProbability: number|null, tooFew: boolean}}
 */
function calibrate(predictions, { minimum = MINIMUM } = {}) {
  const resolved = (predictions || []).filter(entry =>
    entry && typeof entry.probability === 'number' && typeof entry.happened === 'boolean');
  const n = resolved.length;
  const hits = resolved.filter(entry => entry.happened).length;
  if (n < minimum) return { n, hits, hitRate: null, brier: null, meanProbability: null, tooFew: true };
  const p = entry => Math.min(1, Math.max(0, entry.probability));
  const brier = resolved.reduce((sum, entry) => sum + (p(entry) - (entry.happened ? 1 : 0)) ** 2, 0) / n;
  const mean = resolved.reduce((sum, entry) => sum + p(entry), 0) / n;
  return { n, hits, hitRate: round(hits / n), brier: round(brier), meanProbability: round(mean), tooFew: false };
}

module.exports = { MINIMUM, outcome, calibrate };
