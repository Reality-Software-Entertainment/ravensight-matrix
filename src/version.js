'use strict';

/** The version of this core. Every hosted response carries it. */
const CORE_VERSION = '0.1.0';

/**
 * The scoring method's name. A rollup is a weighted mean: lenses by their
 * weight inside a segment, then segments by theirs inside a direction, with
 * negative lenses turned around so that 5 is always the better end.
 */
const METHOD = 'weighted-mean-v1';

module.exports = { CORE_VERSION, METHOD };
