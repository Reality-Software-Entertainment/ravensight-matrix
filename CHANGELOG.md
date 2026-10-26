# Changelog

## 0.1.0

First public release: schema and limits, the weighted mean rollup with
confidence and assumption share, gaps, scenario application and diff, and
calibration (hit rate and Brier score). CommonJS and ES module entries.
The math ignores input the validators would refuse: confidence is read only
from its own three keys, a matrix missing an axis is treated as empty, and a
scenario cell whose score is off the scale is skipped, so no result is NaN.
