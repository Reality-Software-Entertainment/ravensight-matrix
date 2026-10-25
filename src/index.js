'use strict';

/**
 * ravensight-matrix: the open core of the Ravensight strategy matrix.
 *
 * Schema, scoring, gaps, scenario diff and calibration as pure functions.
 * No I/O, no clock, no randomness, no dependencies, so a server and a
 * browser given the same matrix compute the same numbers.
 */

const schema = require('./schema');
const score = require('./score');
const { gaps, REASONS } = require('./gaps');
const scenario = require('./scenario');
const calibration = require('./calibration');
const { CORE_VERSION, METHOD } = require('./version');

module.exports = {
  CORE_VERSION,
  METHOD,
  ...schema,
  rollup: score.rollup,
  oriented: score.oriented,
  confidenceLabel: score.confidenceLabel,
  coordinate: score.coordinate,
  isContested: score.isContested,
  gaps,
  GAP_REASONS: REASONS,
  cellKey: scenario.cellKey,
  applyScenario: scenario.applyScenario,
  diffCells: scenario.diffCells,
  scenarioRollup: scenario.scenarioRollup,
  diff: scenario.diff,
  outcome: calibration.outcome,
  calibrate: calibration.calibrate,
  CALIBRATION_MINIMUM: calibration.MINIMUM
};
