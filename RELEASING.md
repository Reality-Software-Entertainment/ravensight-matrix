# Releasing

The package is developed in Ravensight's own repository under
`packages/ravensight-matrix` and mirrored here.

1. Copy `src/`, `esm/`, `scripts/`, `__tests__/` and `README.md` from the
   Ravensight copy. `package.json` here keeps its repository fields and its
   `jest` dev dependency.
2. Bump `version` in `package.json` and `CORE_VERSION` in `src/version.js`
   together (a test checks they match), run `npm run build`, add a
   CHANGELOG entry.
3. `npm install && npm run check && npm test`.
4. Commit, then tag `vX.Y.Z` and push the tag. `publish.yml` publishes with
   provenance once `NPM_TRUSTED_PUBLISHING` is set; until then publish by
   hand with `npm publish --access public`.
