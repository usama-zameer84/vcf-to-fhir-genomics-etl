# Examples

This directory contains real artifacts from a successful execution of the
**Clinical Genomics ETL — VCF to FHIR R4** workflow (n8n execution #100,
~5 s, run on 2026-08-19).

## Files

- **`sample-vcf-input.json`** — the JSON payload POSTed to the workflow's
  webhook. It carries `patient_id`, `sample_id`, `genome_build`, `lab_id`,
  and `vcf_content` (a minimal 3-variant VCF on chr1).
- **`sample-clinical-report.html`** — the HTML clinical report the workflow
  returned synchronously in the webhook response, with one row per variant
  enriched with ClinVar significance and a link to each ClinVar variation.

## Live FHIR resource

The same run also wrote a real FHIR R4 `DiagnosticReport` (with contained
`Observation` resources and a `Patient`) to the public HAPI FHIR server.
You can verify it live in any FHIR client:

https://hapi.fhir.org/baseR4/DiagnosticReport/137422205

The first variant in the sample (`chr1:69511`, rs121909193) was classified
**Pathogenic** by ClinVar in that run.

## Reproduce

```bash
curl -X POST https://n8n.reaperautomate.work/webhook/vcf-to-fhir-etl \
  -H 'Content-Type: application/json' \
  -d @examples/sample-vcf-input.json
```

The request returns the HTML report; a new FHIR resource is created on the
HAPI server each time.