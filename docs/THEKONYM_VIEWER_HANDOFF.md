# Thekonym viewer

The Lab password now opens every Lab entry, including the first-entry Thekonym viewer. There is no separate email sign-in and no viewer button above the password form. Direct viewer links also require the same Lab password.

The live viewer reads through the narrowly scoped `lab_thekonym_read` RPC, which verifies the existing password server-side and returns only Thekonym records. The password is no longer embedded in the frontend. Raw table permissions, unrelated data, and legacy write endpoints are not broadened. The earlier verified-reader grant is retained but is not needed by this UI.

Every copy makes a fresh password-checked read. Requests use POST and no-store and are not served from the service worker. Search, definitions, confidences, fields, and notes retain the previous layout.

Validation: production build and 12 tests pass; staging and production password checks verify catalogue/detail access and reject incorrect passwords. Migration record is in the Procedia repository. Ashley explicitly approved this correction and redeployment.
