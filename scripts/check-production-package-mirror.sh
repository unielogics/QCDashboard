#!/usr/bin/env bash
# The Production Package workspace is copied byte-for-byte between QCDashboard
# and QCRep (there is no shared package). This fails when the copies drift.
set -euo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
rep="${QCREP_DIR:-$here/../QCRep}"
if [ ! -d "$rep/src/production-package" ]; then echo "QCRep checkout not found at $rep (set QCREP_DIR)"; exit 2; fi
status=0
diff -r "$here/src/production-package" "$rep/src/production-package" || status=1
diff "$here/src/app/production-package.css" "$rep/src/app/production-package.css" || status=1
if [ $status -eq 0 ]; then echo "production-package mirror: identical"; else echo "production-package mirror: DRIFT — copy the tree to the other repo"; fi
exit $status
