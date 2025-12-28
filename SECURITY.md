# Security

This repository is a demo / assignment project and is not production-hardened.

## XLSX parsing (`xlsx`)

This project uses the `xlsx` npm package (`0.18.5`) to implement the spreadsheet tools required by `task.md`.
That version has published security advisories:

- CVE-2023-30533 (prototype pollution via crafted spreadsheets)
- CVE-2024-22363 (ReDoS / denial of service via crafted spreadsheets)

At the time of writing, the `xlsx` package on npm does not publish the patched versions referenced by those advisories.
Instead of accepting untrusted spreadsheets, this project mitigates the risk by design:

- The application only reads and writes the bundled workbook at `data/example.xlsx`.
- There is no upload endpoint and no runtime configuration for the workbook path.
- The XLSX layer only supports `Sheet1` and strictly validates A1 addresses and ranges.
- Ranges are capped by `MAX_RANGE_CELLS` in `src/lib/xlsx/range.ts`.

If you need to accept user-provided or remote XLSX files, do not reuse this XLSX layer as-is.
Replace `xlsx` with a maintained library (for example, `exceljs`) or another safe implementation before enabling uploads.

## Reporting

If you discover a security issue, please open an issue in the repo with details and reproduction steps.