const input = $input.first().json;

const location = input.headers?.location
  ?? input.headers?.Location
  ?? input.headers?.['content-location']
  ?? '';

const reportId = location.includes('DiagnosticReport/')
  ? location.split('DiagnosticReport/')[1].split('/')[0]
  : null;

const data = input.data ? JSON.parse(input.data) : input;
const sampleId = data.sample_id ?? input.sample_id;

const fhirUrl = reportId
  ? `https://usama-zameer84.github.io/fhir-report-viewer/?id=${reportId}`
  : `https://hapi.fhir.org/baseR4/DiagnosticReport?identifier=urn:lab:sample-id|${sampleId}`;

return [{ json: {
  ...input,
  fhir_server_report_id: reportId,
  fhir_html_url: fhirUrl
}}];