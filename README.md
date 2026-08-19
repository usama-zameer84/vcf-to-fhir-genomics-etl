# Clinical Genomics ETL: VCF to FHIR R4 Pipeline

![Pipeline Status](https://img.shields.io/badge/Status-Active-brightgreen)
![FHIR Compliance](https://img.shields.io/badge/FHIR-R4_Genomics_Reporting-blue)
![n8n](https://img.shields.io/badge/n8n-Workflow-orange)
![License](https://img.shields.io/badge/License-MIT-green)

A scalable, automated ETL (Extract, Transform, Load) pipeline for ingesting
germline variant data from Variant Call Format (VCF) files, enriching each
variant against NCBI ClinVar, and posting a standards-compliant FHIR R4
`DiagnosticReport` (with contained `Observation` resources and a `Patient`)
to a public HAPI FHIR server — then returning a rendered HTML clinical report
synchronously to the caller.

The pipeline is built and runs on [n8n](https://n8n.io). The canonical
definition of the workflow is [`workflow.json`](./workflow.json) (14 nodes,
exported directly from the running instance). See a live run's artifacts in
[`examples/`](./examples/).

## Live demo

A successful execution (n8n execution #100, ~5 s) posted a real FHIR R4
`DiagnosticReport` to the public HAPI server. View it in any FHIR client:

> https://hapi.fhir.org/baseR4/DiagnosticReport/137422205

The first variant in that run, `chr1:69511` (rs121909193), was classified
**Pathogenic** by ClinVar. The exact input and the HTML report returned are
saved under [`examples/`](./examples/).

## Architecture Overview

The pipeline (13 functional nodes + 1 instruction sticky note) runs as a
single linear flow:

1. **Intake — VCF Webhook**: Receives a POST with `patient_id`, `sample_id`,
   `genome_build`, `lab_id`, and `vcf_content` (JSON body or binary upload).
2. **Validate Input**: Normalizes line endings, strips `##` meta lines,
   enforces required fields and an allowed `genome_build` list
   (`GRCh37` | `GRCh38` | `hg19` | `hg38`), and requires a `#CHROM` header.
3. **Parse VCF**: Splits each data line into chrom, pos, id, ref, alt, qual,
   filter, info; marks `pass` when `FILTER == PASS`.
4. **ClinVar Lookup**: For each variant, queries NCBI Entrez E-utilities
   (`esearch` + `esummary`) to resolve the ClinVar UID and clinical
   significance, respecting NCBI's anonymous rate limit (~3 req/s; faster
   with an `NCBI_API_KEY`).
5. **Aggregate Variants**: Combines the per-variant items into a single
   payload for the FHIR builder.
6. **Build FHIR Diagnostic Report**: Maps variants to LOINC codes
   (e.g. `69548-6` Genetic variant assessment, `69547-8` Ref allele,
   `69551-1` Alt allele, `81254-5` Exact start, `62374-4` Genome build,
   `53037-8` Clinical significance) and constructs an HL7 Genomics Reporting
   `DiagnosticReport` with contained `Observation` resources.
7. **Prepare Patient Payload / Submit Patient To FHIR**: Creates/updates the
   `Patient` resource on `hapi.fhir.org/baseR4` (idempotent via
   `ifNoneExist` on the lab identifier).
8. **Prepare Report Payload / Submit Report To FHIR**: POSTs the
   `DiagnosticReport` to `hapi.fhir.org/baseR4/DiagnosticReport`.
9. **Extract Report ID**: Parses the HAPI `Location` header to recover the
   server-assigned report ID.
10. **Format HTML Report**: Renders a stylized clinical report (variant
    table with ClinVar links and significance colors).
11. **Return HTTP Report**: Returns the HTML to the caller synchronously
    (`Content-Type: text/html`).

## Webhook input

POST JSON to `https://n8n.reaperautomate.work/webhook/vcf-to-fhir-etl`.

| Field          | Required | Description                                                        |
|----------------|----------|--------------------------------------------------------------------|
| `patient_id`   | yes      | Unique patient identifier (string)                                 |
| `sample_id`    | yes      | Unique sample identifier (string)                                  |
| `genome_build` | yes      | One of `GRCh37`, `GRCh38`, `hg19`, `hg38`                          |
| `lab_id`       | no       | Lab identifier (defaults to `UNKNOWN`)                             |
| `vcf_content`  | yes      | Raw VCF text including a `#CHROM` header line (or a binary upload)  |

### Example — JSON body

```bash
curl -X POST https://n8n.reaperautomate.work/webhook/vcf-to-fhir-etl \
  -H 'Content-Type: application/json' \
  -d @examples/sample-vcf-input.json
```

### Example — binary file upload (recommended for large VCFs)

```bash
curl -X POST https://n8n.reaperautomate.work/webhook/vcf-to-fhir-etl \
  -F 'patient_id=P001' -F 'sample_id=S001' -F 'genome_build=GRCh38' \
  -F 'vcf_content=@sample.vcf'
```

The request returns the HTML clinical report; a new `Patient` + `DiagnosticReport`
are written to `hapi.fhir.org/baseR4` on each run.

## Features

- **Standards-based**: Implements the HL7 FHIR R4 Genomics Reporting
  Implementation Guide (LOINC-coded `Observation`s inside a `DiagnosticReport`).
- **Real enrichment**: Each variant is annotated with its ClinVar UID and
  clinical significance via the NCBI E-utilities API.
- **Synchronous reporting**: The webhook response is a ready-to-read HTML
  clinical report with deep links into ClinVar and the HAPI FHIR server.
- **Input validation**: Rejects missing fields, disallowed genome builds,
  VCF without a `#CHROM` header, and non-VCF formats with clear errors.
- **Rate-limit aware**: Paces NCBI requests to the anonymous limit (or the
  higher keyed limit) to avoid dropped lookups.

## Repository Structure

```
workflow.json                      # Canonical workflow (14 nodes, live export)
examples/                          # Sample input + HTML report + README from a real run
  sample-vcf-input.json
  sample-clinical-report.html
assets/workflow-snapshot.png       # Canvas screenshot
Clinical_Genomics_ETL.workflow.ts  # n8n-as-code TypeScript view (generated)
src/nodes/                         # Extracted JS for individual nodes (generated)
```

> **Note:** `workflow.json` is the canonical source of truth — it is the exact
> export of the running n8n instance. The `Clinical_Genomics_ETL.workflow.ts`
> and `src/nodes/*.js` files are a generated n8n-as-code view and may lag
> behind `workflow.json`; trust `workflow.json` for the live node graph and
> connection logic.

## Deployment

Import `workflow.json` directly into an n8n workspace, or push the
TypeScript view with the n8n-as-code CLI:

```bash
npm install -g @n8n-as-code/cli
n8nac push Clinical_Genomics_ETL.workflow.ts
```

### Prerequisites

- An **n8n** deployment (v1.x+).
- An **NCBI API Key** (optional, but recommended to avoid the anonymous
  rate limit).
- A **FHIR R4 Server** (the live workflow uses the public HAPI FHIR server
  at `hapi.fhir.org/baseR4`).

## License

This project is open-source and available under the [MIT License](./LICENSE).