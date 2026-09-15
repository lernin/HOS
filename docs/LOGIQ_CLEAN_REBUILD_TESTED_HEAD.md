# Clean rebuild parity checkpoint

Step 2 parity harness reached green on code commit `dff7f46b454e5144c464206c0f2e0b6105ed8919` in GitHub Actions run `34945354948`.

The clean candidate route is still behaviorally the immutable v161 baseline; no mobile behavior has been reintroduced yet. The harness compares initial full-tree geometry, selected-node state, wrapped-label typography/geometry, drag-start dimensions, unrelated-node stability, and drag no-op return against `/logiq-v161-legacy/`.

Next implementation step: establish the smallest shared geometry/layout interface behind the clean candidate while keeping this parity harness green. No persistence, mobile adapter, merge, or production deployment belongs to that next checkpoint.
