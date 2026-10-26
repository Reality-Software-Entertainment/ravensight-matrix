'use strict';

/**
 * The shape of a strategy matrix, and the validators that hold it.
 *
 * A matrix lays player segments against directions (a pivot, a price model,
 * a port) and scores each pair through several lenses (fit, revenue,
 * friction, feasibility, risk, or a lens of the studio's own). Every cell is
 * an integer score from 1 to 5 with a confidence and a basis.
 *
 * Pure: no I/O, no clock, no randomness. Every validator answers
 * `{ ok, errors }` and never throws, so a caller decides what a refusal
 * looks like.
 */

const LIMITS = Object.freeze({
  segments: 12,
  directions: 10,
  lenses: 10,
  scenarios: 20,
  citations: 8,
  predictions: 10,
  params: 10,
  shifts: 20,
  label: 80,
  description: 500,
  paramValue: 200,
  rationale: 1000,
  scenarioTitle: 120,
  scenarioDescription: 1000,
  maxWeight: 100,
  maxShift: 4
});

/** Keys are machine names: lowercase letters, digits and underscores. */
const KEY_PATTERN = /^[a-z0-9_]{1,32}$/;

const SCORE_MIN = 1;
const SCORE_MAX = 5;
/** The neutral score. A lens contributes nothing to a ranking at this value. */
const SCORE_MID = 3;

const CONFIDENCES = Object.freeze(['low', 'med', 'high']);
/**
 * Why a score is what it is.
 *  - evidence: the studio's own records say so, and at least one is cited.
 *  - inference: derived from cited records rather than read off them.
 *  - assumption: a belief nobody has checked yet; it may cite nothing.
 */
const BASES = Object.freeze(['evidence', 'inference', 'assumption']);
const STANCES = Object.freeze(['supports', 'contradicts']);
const COMPARATORS = Object.freeze(['gte', 'lte']);

/**
 * The lenses a new matrix starts with. Polarity says which way is good: a
 * high fit is good (+1), a high friction is bad (-1).
 */
const DEFAULT_LENSES = Object.freeze([
  Object.freeze({ key: 'fit', label: 'Fit', polarity: 1, weight: 1 }),
  Object.freeze({ key: 'revenue', label: 'Revenue', polarity: 1, weight: 1 }),
  Object.freeze({ key: 'friction', label: 'Friction', polarity: -1, weight: 1 }),
  Object.freeze({ key: 'feasibility', label: 'Feasibility', polarity: 1, weight: 1 }),
  Object.freeze({ key: 'risk', label: 'Risk', polarity: -1, weight: 1 })
]);

const result = errors => ({ ok: errors.length === 0, errors });
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const isKey = value => typeof value === 'string' && KEY_PATTERN.test(value);

function text(errors, value, field, max, required) {
  if (value === undefined || value === null) {
    if (required) errors.push(`${field} is required.`);
    return;
  }
  if (typeof value !== 'string' || (required && !value.trim()) || value.length > max) {
    errors.push(`${field} must be ${required ? '1' : '0'} to ${max} characters.`);
  }
}

function weight(errors, value, field) {
  if (value === undefined) return;
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > LIMITS.maxWeight) {
    errors.push(`${field} must be a number above 0 and at most ${LIMITS.maxWeight}.`);
  }
}

function keyed(errors, value, field) {
  if (!isKey(value)) errors.push(`${field} must be 1 to 32 lowercase letters, digits or underscores.`);
}

/** One player segment: who the decision lands on. */
function validateSegment(input) {
  const errors = [];
  if (!isObject(input)) return result(['A segment must be an object.']);
  keyed(errors, input.key, 'key');
  text(errors, input.label, 'label', LIMITS.label, true);
  text(errors, input.description, 'description', LIMITS.description, false);
  weight(errors, input.weight, 'weight');
  return result(errors);
}

/**
 * One direction: a move the studio could make. `params` are its knobs (a
 * price, a platform), flat strings and numbers only.
 */
function validateDirection(input) {
  const errors = [];
  if (!isObject(input)) return result(['A direction must be an object.']);
  keyed(errors, input.key, 'key');
  text(errors, input.label, 'label', LIMITS.label, true);
  text(errors, input.description, 'description', LIMITS.description, false);
  if (input.params !== undefined && input.params !== null) {
    if (!isObject(input.params)) {
      errors.push('params must be an object of names to strings or numbers.');
    } else {
      const entries = Object.entries(input.params);
      if (entries.length > LIMITS.params) errors.push(`At most ${LIMITS.params} params.`);
      for (const [name, value] of entries) {
        if (!isKey(name)) errors.push(`param name "${name}" must be a key.`);
        const fine = (typeof value === 'number' && Number.isFinite(value)) ||
          (typeof value === 'string' && value.length <= LIMITS.paramValue);
        if (!fine) errors.push(`param "${name}" must be a finite number or a string of at most ${LIMITS.paramValue} characters.`);
      }
    }
  }
  return result(errors);
}

/** One lens: a way of looking at every cell. */
function validateLens(input) {
  const errors = [];
  if (!isObject(input)) return result(['A lens must be an object.']);
  keyed(errors, input.key, 'key');
  text(errors, input.label, 'label', LIMITS.label, true);
  text(errors, input.description, 'description', LIMITS.description, false);
  if (input.polarity !== 1 && input.polarity !== -1) errors.push('polarity must be 1 or -1.');
  weight(errors, input.weight, 'weight');
  return result(errors);
}

/**
 * One cell's judgement. Coordinates are checked against a matrix by
 * `validateMatrixCell`; this checks the judgement alone.
 */
function validateCell(input) {
  const errors = [];
  if (!isObject(input)) return result(['A cell must be an object.']);
  if (!Number.isInteger(input.score) || input.score < SCORE_MIN || input.score > SCORE_MAX) {
    errors.push(`score must be an integer from ${SCORE_MIN} to ${SCORE_MAX}.`);
  }
  if (!CONFIDENCES.includes(input.confidence)) errors.push(`confidence must be one of: ${CONFIDENCES.join(', ')}.`);
  if (!BASES.includes(input.basis)) errors.push(`basis must be one of: ${BASES.join(', ')}.`);
  text(errors, input.rationale, 'rationale', LIMITS.rationale, false);
  const citations = input.citations === undefined || input.citations === null ? [] : input.citations;
  if (!Array.isArray(citations)) {
    errors.push('citations must be an array.');
  } else {
    if (citations.length > LIMITS.citations) errors.push(`At most ${LIMITS.citations} citations.`);
    for (const citation of citations) {
      if (!isObject(citation)) {
        errors.push('Each citation must be an object.');
      } else if (citation.stance !== undefined && !STANCES.includes(citation.stance)) {
        errors.push(`Each citation stance is one of: ${STANCES.join(', ')}.`);
      }
    }
    if (input.basis === 'evidence' && citations.length === 0) {
      errors.push('A score on evidence needs at least one citation. Cite a record, or call it an assumption.');
    }
  }
  return result(errors);
}

/** A cell's judgement plus coordinates that exist on this matrix. */
function validateMatrixCell(matrix, input) {
  const base = validateCell(input);
  const errors = [...base.errors];
  if (!isObject(input)) return base;
  const has = (list, key) => (list || []).some(entry => entry.key === key);
  if (!isObject(matrix)) return result(['A matrix must be an object.']);
  if (!has(matrix.segments, input.segmentKey)) errors.push(`No segment "${input.segmentKey}" on this matrix.`);
  if (!has(matrix.directions, input.directionKey)) errors.push(`No direction "${input.directionKey}" on this matrix.`);
  if (!has(matrix.lenses, input.lensKey)) errors.push(`No lens "${input.lensKey}" on this matrix.`);
  return result(errors);
}

/**
 * What a scenario changes before any cell is overridden: a list of rules,
 * each moving every cell it names by a whole number of points. A rule that
 * leaves out an axis names every entry on it, so `{ lensKey: 'risk',
 * delta: 1 }` raises risk everywhere.
 */
function validateSensitivity(input) {
  const errors = [];
  if (input === undefined || input === null) return result(errors);
  if (!Array.isArray(input)) return result(['sensitivity must be an array of rules.']);
  if (input.length > LIMITS.shifts) errors.push(`At most ${LIMITS.shifts} sensitivity rules.`);
  for (const rule of input) {
    if (!isObject(rule)) {
      errors.push('Each sensitivity rule must be an object.');
      continue;
    }
    for (const field of ['segmentKey', 'directionKey', 'lensKey']) {
      if (rule[field] !== undefined && rule[field] !== null) keyed(errors, rule[field], `rule ${field}`);
    }
    if (!Number.isInteger(rule.delta) || rule.delta === 0 || Math.abs(rule.delta) > LIMITS.maxShift) {
      errors.push(`Each rule delta is a nonzero integer from -${LIMITS.maxShift} to ${LIMITS.maxShift}.`);
    }
  }
  return result(errors);
}

/** One scenario: a named branch of the matrix. Its id is the host's. */
function validateScenario(input) {
  const errors = [];
  if (!isObject(input)) return result(['A scenario must be an object.']);
  text(errors, input.title, 'title', LIMITS.scenarioTitle, true);
  text(errors, input.description, 'description', LIMITS.scenarioDescription, false);
  errors.push(...validateSensitivity(input.sensitivity).errors);
  return result(errors);
}

/** One prediction a decision makes about what will happen. */
function validatePrediction(input) {
  const errors = [];
  if (!isObject(input)) return result(['A prediction must be an object.']);
  keyed(errors, input.metric, 'metric');
  if (!COMPARATORS.includes(input.comparator)) errors.push(`comparator must be one of: ${COMPARATORS.join(', ')}.`);
  if (typeof input.threshold !== 'number' || !Number.isFinite(input.threshold)) errors.push('threshold must be a finite number.');
  if (typeof input.probability !== 'number' || !(input.probability > 0 && input.probability < 1)) {
    errors.push('probability must be a number between 0 and 1.');
  }
  return result(errors);
}

/** A whole matrix's axes: limits, then unique keys per axis. */
function validateMatrix(input) {
  if (!isObject(input)) return result(['A matrix must be an object.']);
  const errors = [];
  const axes = [
    ['segments', validateSegment],
    ['directions', validateDirection],
    ['lenses', validateLens],
    ['scenarios', validateScenario]
  ];
  for (const [axis, check] of axes) {
    const list = input[axis] === undefined ? [] : input[axis];
    if (!Array.isArray(list)) {
      errors.push(`${axis} must be an array.`);
      continue;
    }
    if (list.length > LIMITS[axis]) errors.push(`At most ${LIMITS[axis]} ${axis}.`);
    for (const entry of list) errors.push(...check(entry).errors.map(message => `${axis}: ${message}`));
    // A scenario is identified by its id, every other axis entry by its key.
    const field = axis === 'scenarios' ? 'id' : 'key';
    const keys = list.filter(isObject).map(entry => entry[field]);
    if (new Set(keys).size !== keys.length) errors.push(`${axis} ${field}s must be unique.`);
  }
  return result(errors);
}

/** True for an integer score inside the scale. */
const isScore = value => Number.isInteger(value) && value >= SCORE_MIN && value <= SCORE_MAX;

/**
 * A matrix's axes as arrays, whatever was passed. The math reads the axes
 * through this so a matrix missing one is treated as empty instead of
 * throwing.
 */
function axesOf(matrix) {
  const list = value => (Array.isArray(value) ? value.filter(isObject) : []);
  const source = isObject(matrix) ? matrix : {};
  return { segments: list(source.segments), directions: list(source.directions), lenses: list(source.lenses) };
}

module.exports = {
  LIMITS,
  KEY_PATTERN,
  SCORE_MIN,
  SCORE_MAX,
  SCORE_MID,
  CONFIDENCES,
  BASES,
  STANCES,
  COMPARATORS,
  DEFAULT_LENSES,
  isKey,
  isScore,
  axesOf,
  validateSegment,
  validateDirection,
  validateLens,
  validateCell,
  validateMatrixCell,
  validateSensitivity,
  validateScenario,
  validatePrediction,
  validateMatrix
};
