import { workflow, node, links } from '@n8n-as-code/transformer';

// <workflow-map>
// Workflow : Clinical Genomics ETL — VCF to FHIR R4
// Nodes   : 14  |  Connections: 13
//
// NODE INDEX
// ──────────────────────────────────────────────────────────────────
// Property name                    Node type (short)         Flags
// VcfWebhook                         webhook
// ValidateInput                      code
// ParseVcf                           code
// ClinvarLookup                      code
// AggregateVariants                  aggregate
// BuildFhirDiagnosticReport          code
// PreparePatientPayload              code
// SubmitPatientToFhir                httpRequest                [onError→regular]
// PrepareReportPayload               code
// SubmitReportToFhir                 httpRequest
// ExtractReportId                    code
// FormatHtmlReport                   code
// ReturnHttpReport                   respondToWebhook
// ErrorTrigger                       errorTrigger
// FormatErrorDetails                 code
//
// ROUTING MAP
// ──────────────────────────────────────────────────────────────────
// VcfWebhook
//    → ValidateInput
//      → ParseVcf
//        → ClinvarLookup
//          → AggregateVariants
//            → BuildFhirDiagnosticReport
//              → PreparePatientPayload
//                → SubmitPatientToFhir
//                  → PrepareReportPayload
//                    → SubmitReportToFhir
//                      → ExtractReportId
//                        → FormatHtmlReport
//                          → ReturnHttpReport
// ErrorTrigger
//    → FormatErrorDetails
// </workflow-map>

// =====================================================================
// WORKFLOW METADATA
// =====================================================================

@workflow({
    id: 'pPjrwVH7uiHG2AWp',
    name: 'Clinical Genomics ETL — VCF to FHIR R4',
    active: true,
    isArchived: false,
    settings: { executionOrder: 'v1', availableInMCP: true, callerPolicy: 'workflowsFromSameOwner' },
})
export class ClinicalGenomicsEtlVcfToFhirR4Workflow {
    // =====================================================================
    // NODE CONFIGURATION
    // =====================================================================

    @node({
        id: '6c20db62-8096-4115-bb1a-10a2fe79d02d',
        webhookId: 'vcf-to-fhir-intake-new',
        name: 'VCF Webhook',
        type: 'n8n-nodes-base.webhook',
        version: 2,
        position: [-16, 592],
    })
    VcfWebhook = {
        httpMethod: 'POST',
        path: 'vcf-to-fhir-etl',
        responseMode: 'responseNode',
        options: {
            binaryPropertyName: 'vcf_content',
        },
    };

    @node({
        id: '7f2b3140-4ac9-433d-89dc-91fc5f6de84a',
        name: 'Validate Input',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [208, 592],
    })
    ValidateInput = {
        jsCode: `const input = $input.first();
const body  = input.json.body ?? input.json;

let vcfContent = null;
const binaryKey = Object.keys(input.binary ?? {}).find(k => k.startsWith('vcf_content'));

if (binaryKey) {
  const buffer = await this.helpers.getBinaryDataBuffer(0, binaryKey);
  vcfContent = buffer.toString('utf-8');
} else if (body.vcf_content) {
  vcfContent = body.vcf_content;
} else {
  throw new Error('Validation failed: no vcf_content provided (binary or JSON)');
}

const patient_id   = body.patient_id;
const sample_id    = body.sample_id;
const genome_build = body.genome_build;
const lab_id       = body.lab_id ?? 'UNKNOWN';

for (const [k, v] of Object.entries({ patient_id, sample_id, genome_build })) {
  if (!v) throw new Error(\`Validation failed: missing field '\${k}'\`);
}

const allowed = ['GRCh37', 'GRCh38', 'hg19', 'hg38'];
if (!allowed.includes(genome_build))
  throw new Error(\`Invalid genome_build: \${genome_build}. Allowed: \${allowed.join(', ')}\`);

vcfContent = vcfContent
  .replace(/\\r\\n/g, '\\n').replace(/\\r/g, '\\n')
  .split('\\n')
  .filter(l => !l.startsWith('##') && l.trim() !== '')
  .join('\\n');

if (!vcfContent.includes('#CHROM'))
  throw new Error('Invalid VCF: missing #CHROM header');

return [{ json: {
  patient_id,
  sample_id,
  genome_build,
  lab_id,
  vcf_content: vcfContent,
  validated_at: new Date().toISOString()
}}];
`,
    };

    @node({
        id: '1802e0c3-a503-4ae4-8c0a-80222e1b8ee1',
        name: 'Parse VCF',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [432, 592],
    })
    ParseVcf = {
        jsCode: `const input = $input.first().json;

let rawVcf = input.vcf_content;

if (!rawVcf || typeof rawVcf !== 'string' || !rawVcf.includes('#CHROM')) {
  const binary = $input.first().binary ?? {};
  if (binary.vcf_content) {
    rawVcf = Buffer.from(binary.vcf_content.data, 'base64').toString('utf-8');
  }
}

if (!rawVcf || !rawVcf.includes('#CHROM')) {
  throw new Error('No valid variants found in VCF content [line 29]');
}

const lines = rawVcf
  .split('\\n')
  .filter(l => !l.startsWith('#') && l.trim());

const variants = lines
  .map((line, idx) => {
    const [chrom, pos, id, ref, alt, qual, filter, info] = line.split('\\t');
    return {
      patient_id:     input.patient_id,
      sample_id:      input.sample_id,
      genome_build:   input.genome_build,
      lab_id:         input.lab_id ?? 'UNKNOWN',
      validated_at:   input.validated_at,
      variant_index:  idx,
      chrom:          (chrom ?? '').replace('chr', ''),
      pos:            parseInt(pos ?? '0'),
      variant_id:     id === '.' ? null : id,
      ref:            ref ?? '',
      alt:            alt ?? '',
      qual:           qual === '.' ? null : parseFloat(qual ?? '0'),
      filter:         filter ?? 'UNKNOWN',
      info:           info ?? '',
      pass:           (filter ?? '').trim() === 'PASS',
    };
  });

if (variants.length === 0) {
  throw new Error('No valid variants found in VCF content [line 29]');
}

return variants.map(v => ({ json: v }));
`,
    };

    @node({
        id: 'e8eae21a-0652-4247-8516-83d62fdec871',
        name: 'ClinVar Lookup',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [656, 592],
    })
    ClinvarLookup = {
        jsCode: `const variants = $input.all().map(item => item.json);
const enriched = [];
const apiKey   = $env.NCBI_API_KEY ?? '';
const delay    = apiKey ? 120 : 400; // 10/sec with key, 3/sec without

for (const variant of variants) {
  await new Promise(r => setTimeout(r, delay));

  const term = (variant.variant_id && variant.variant_id !== 'null')
    ? \`\${variant.variant_id}[rs]\`
    : \`\${variant.chrom}[chr]+\${variant.pos}\` +
      ((['GRCh38','hg38'].includes(variant.genome_build)) ? '[chrpos38]' : '[chrpos37]');

  let clinvar_uid           = null;
  let clinical_significance = 'not_in_clinvar';

  try {
    const searchUrl = \`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi\` +
      \`?db=clinvar&term=\${encodeURIComponent(term)}&retmode=json&retmax=1\` +
      (apiKey ? \`&api_key=\${apiKey}\` : '');

    const searchRes = await this.helpers.httpRequest({ method: 'GET', url: searchUrl });
    const ids = searchRes.esearchresult?.idlist ?? [];
    clinvar_uid = ids.length > 0 ? ids[0] : null;

    if (clinvar_uid) {
      await new Promise(r => setTimeout(r, delay));

      const summaryUrl = \`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi\` +
        \`?db=clinvar&id=\${clinvar_uid}&retmode=json\` +
        (apiKey ? \`&api_key=\${apiKey}\` : '');

      const summaryRes = await this.helpers.httpRequest({ method: 'GET', url: summaryUrl });
      const sig = summaryRes.result?.[clinvar_uid]?.clinical_significance?.description
                  ?? 'uncertain_significance';
      clinical_significance = sig.toLowerCase().replace(/ /g, '_');
    }
  } catch(e) {
    clinical_significance = 'lookup_error';
  }

  enriched.push({ json: { ...variant, clinvar_uid, clinical_significance } });
}

return enriched;
`,
    };

    @node({
        id: '76244ab3-2eda-419f-8a5f-70438f602f3c',
        name: 'Aggregate Variants',
        type: 'n8n-nodes-base.aggregate',
        version: 1,
        position: [880, 592],
    })
    AggregateVariants = {
        aggregate: 'aggregateAllItemData',
        destinationFieldName: 'variants',
        options: {},
    };

    @node({
        id: 'abf987c4-8b2f-4e2b-bf50-1e0587d387d3',
        name: 'Build FHIR Diagnostic Report',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [1104, 592],
    })
    BuildFhirDiagnosticReport = {
        jsCode: `const allVariants = $input.first().json.variants;
const first = allVariants[0];
const { patient_id, sample_id, genome_build, lab_id, validated_at } = first;

const LOINC = {
  VARIANT_ASSESSMENT: '69548-6',
  REF_ALLELE:         '69547-8',
  ALT_ALLELE:         '69551-1',
  EXACT_START:        '81254-5',
  GENOME_BUILD:       '62374-4',
  CHROM:              '47999-8',
  CLIN_SIG:           '53037-8'
};

const buildCode = ['GRCh38','hg38'].includes(genome_build)
  ? 'LA26806-2'
  : 'LA14029-5';

const patientRef = {
  type: "Patient",
  identifier: {
    system: "urn:lab:patient-id",
    value: patient_id
  },
  display: patient_id
};

const observations = allVariants.map((v, idx) => ({
  resourceType: 'Observation',
  id: \`var-\${sample_id}-\${idx}\`,
  meta: {
    profile: ['http://hl7.org/fhir/uv/genomics-reporting/StructureDefinition/variant']
  },
  status: v.filter === 'PASS' ? 'final' : 'preliminary',
  category: [{
    coding: [{
      system: 'http://terminology.hl7.org/CodeSystem/observation-category',
      code: 'laboratory'
    }]
  }],
  code: {
    coding: [{
      system: 'http://loinc.org',
      code: LOINC.VARIANT_ASSESSMENT,
      display: 'Genetic variant assessment'
    }]
  },
  subject: patientRef,
  valueCodeableConcept: {
    coding: [{ system: 'http://loinc.org', code: 'LA9633-4', display: 'Present' }]
  },
  component: [
    {
      code: { coding: [{ system: 'http://loinc.org', code: LOINC.GENOME_BUILD }] },
      valueCodeableConcept: { coding: [{ system: 'http://loinc.org', code: buildCode }] }
    },
    {
      code: { coding: [{ system: 'http://loinc.org', code: LOINC.CHROM }] },
      valueCodeableConcept: { text: \`chr\${v.chrom}\` }
    },
    {
      code: { coding: [{ system: 'http://loinc.org', code: LOINC.EXACT_START }] },
      valueRange: { low: { value: v.pos } }
    },
    {
      code: { coding: [{ system: 'http://loinc.org', code: LOINC.REF_ALLELE }] },
      valueString: v.ref
    },
    {
      code: { coding: [{ system: 'http://loinc.org', code: LOINC.ALT_ALLELE }] },
      valueString: v.alt
    },
    ...(v.clinical_significance && v.clinical_significance !== 'not_in_clinvar'
      ? [{
          code: { coding: [{ system: 'http://loinc.org', code: LOINC.CLIN_SIG }] },
          valueCodeableConcept: { text: v.clinical_significance }
        }]
      : [])
  ]
}));

const diagnosticReport = {
  resourceType: 'DiagnosticReport',
  id: \`report-\${sample_id}\`,
  identifier: [{
    system: "urn:lab:sample-id",
    value: sample_id
  }],
  meta: {
    profile: ['http://hl7.org/fhir/uv/genomics-reporting/StructureDefinition/genomics-report']
  },
  status: 'final',
  category: [{
    coding: [{
      system: 'http://terminology.hl7.org/CodeSystem/v2-0074',
      code: 'GE',
      display: 'Genetics'
    }]
  }],
  code: {
    coding: [{
      system: 'http://loinc.org',
      code: '81247-9',
      display: 'Master HL7 genetic variant reporting panel'
    }]
  },
  subject: patientRef,
  issued: new Date().toISOString(),
  result: observations.map(o => ({ reference: \`#\${o.id}\` })),
  contained: observations
};

const pathogenic = allVariants.filter(v =>
  ['pathogenic','likely_pathogenic'].includes(v.clinical_significance)
).length;

return [{ json: {
  diagnosticReport,
  patient_id, sample_id, lab_id, genome_build, validated_at,
  observation_count: observations.length,
  pass_count:        allVariants.filter(v => v.filter === 'PASS').length,
  pathogenic_count:  pathogenic
}}];
`,
    };

    @node({
        id: 'ae82c109-6a2a-4d82-b792-8578e512075c',
        name: 'Prepare Patient Payload',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [1328, 592],
    })
    PreparePatientPayload = {
        jsCode: `const data = $input.first().json;

const bundle = {
  resourceType: "Bundle",
  type: "transaction",
  entry: [
    {
      resource: {
        resourceType: "Patient",
        identifier: [{ system: "urn:lab:patient-id", value: data.patient_id }],
        name: [{ text: data.patient_id }]
      },
      request: {
        method: "POST",
        url: "Patient",
        ifNoneExist: \`identifier=urn:lab:patient-id|\${data.patient_id}\`
      }
    },
    {
      resource: data.diagnosticReport,
      request: {
        method: "POST",
        url: "DiagnosticReport"
      }
    }
  ]
};

return [{ json: {
  ...data,
  bundleString: JSON.stringify(bundle)
}}];
`,
    };

    @node({
        id: '0edc6383-057b-41fe-a41f-9e554f86d12f',
        name: 'Submit Patient To FHIR',
        type: 'n8n-nodes-base.httpRequest',
        version: 4.4,
        position: [1552, 592],
        onError: 'continueRegularOutput',
    })
    SubmitPatientToFhir = {
        method: 'POST',
        url: 'https://hapi.fhir.org/baseR4/Patient',
        sendHeaders: true,
        headerParameters: {
            parameters: [
                {
                    name: 'Content-Type',
                    value: 'application/fhir+json',
                },
            ],
        },
        sendBody: true,
        specifyBody: 'json',
        jsonBody: `={
  "resourceType": "Patient",
  "identifier": [{"system": "urn:lab:patient-id", "value": "{{ $json.patient_id }}"}],
  "name": [{"text": "{{ $json.patient_id }}"}]
}
`,
        options: {},
    };

    @node({
        id: '26131463-9a49-454e-be3d-857953e70355',
        name: 'Prepare Report Payload',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [1776, 592],
    })
    PrepareReportPayload = {
        jsCode: `const data = $('Build FHIR Diagnostic Report').item.json;

return [{ json: {
  ...data,
  reportJson: JSON.stringify(data.diagnosticReport)
}}];
`,
    };

    @node({
        id: '68586381-730b-40b6-9c7a-f62b7c496d77',
        name: 'Submit Report To FHIR',
        type: 'n8n-nodes-base.httpRequest',
        version: 4.4,
        position: [2000, 592],
        alwaysOutputData: false,
        executeOnce: false,
    })
    SubmitReportToFhir = {
        method: 'POST',
        url: 'https://hapi.fhir.org/baseR4/DiagnosticReport',
        sendHeaders: true,
        headerParameters: {
            parameters: [
                {
                    name: 'Content-Type',
                    value: 'application/fhir+json',
                },
            ],
        },
        sendBody: true,
        contentType: 'raw',
        rawContentType: 'application/fhir+json',
        body: `={{ $json.reportJson }}
`,
        options: {
            response: {
                response: {
                    fullResponse: true,
                },
            },
        },
    };

    @node({
        id: '9e70ccc4-d38f-4f71-b68f-7f6ca23c6740',
        name: 'Extract Report ID',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [2224, 592],
    })
    ExtractReportId = {
        jsCode: `const input = $input.first().json;

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
  ? \`https://usama-zameer84.github.io/fhir-report-viewer/?id=\${reportId}\`
  : \`https://hapi.fhir.org/baseR4/DiagnosticReport?identifier=urn:lab:sample-id|\${sampleId}\`;

return [{ json: {
  ...input,
  fhir_server_report_id: reportId,
  fhir_html_url: fhirUrl
}}];
`,
    };

    @node({
        id: 'new-html-report-node-id-1234',
        name: 'Format HTML Report',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [2896, 592],
    })
    FormatHtmlReport = {
        jsCode: `const fhirData = $('Extract Report ID').item.json;
const diagData = $('Build FHIR Diagnostic Report').item.json;
const variants = $('Aggregate Variants').item.json.variants;

const pathogenicCount = diagData.pathogenic_count;
const passCount = diagData.pass_count;
const totalCount = diagData.observation_count;
const sampleId = diagData.sample_id;
const patientId = diagData.patient_id;
const genomeBuild = diagData.genome_build;
const reportUrl = fhirData.fhir_server_report_id ? \`https://hapi.fhir.org/baseR4/DiagnosticReport/\${fhirData.fhir_server_report_id}\` : '#';

const variantRows = variants.map((v, i) => {
  const isPathogenic = ['pathogenic', 'likely_pathogenic'].includes(v.clinical_significance);
  const sigStyle = isPathogenic ? 'color: #fc8181; font-weight: bold;' : 'color: #a0aec0;';
  return \`<tr>
    <td>\${i+1}</td>
    <td>chr\${v.chrom}:\${v.pos}</td>
    <td>\${v.ref} &rarr; \${v.alt}</td>
    <td style="\${sigStyle}">\${v.clinical_significance.replace(/_/g, ' ')}</td>
    <td>\${v.filter}</td>
    <td>\${v.clinvar_uid ? \`<a href="https://www.ncbi.nlm.nih.gov/clinvar/variation/\${v.clinvar_uid}/" target="_blank" style="color:#63b3ed;">\${v.clinvar_uid}</a>\` : 'N/A'}</td>
  </tr>\`;
}).join('');

const html = \`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>VCF to FHIR Clinical Report — \${sampleId}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
           background: #0f1117; color: #e2e8f0; padding: 2rem; }
    .container { max-width: 1100px; margin: 0 auto; }
    header { background: linear-gradient(135deg, #1a1f2e, #2d3748);
             border: 1px solid #4a5568; border-radius: 12px;
             padding: 2rem; margin-bottom: 2rem; }
    header h1 { font-size: 1.8rem; color: #68d391; margin-bottom: 0.5rem; }
    .meta { display: flex; gap: 2rem; flex-wrap: wrap; margin-top: 1rem; }
    .meta-item { background: #2d3748; padding: 0.5rem 1rem;
                 border-radius: 8px; font-size: 0.85rem; }
    .meta-item span { color: #a0aec0; }
    .highlight { color: #f6ad55; font-weight: bold; }
    .alert { color: #fc8181; font-weight: bold; }
    section { background: #1a1f2e; border: 1px solid #2d3748;
              border-radius: 12px; padding: 1.5rem; margin-bottom: 1.5rem; }
    section h2 { font-size: 1.2rem; color: #63b3ed; margin-bottom: 1rem;
                 padding-bottom: 0.5rem; border-bottom: 1px solid #2d3748; }
    table { width: 100%; border-collapse: collapse; font-size: 0.88rem; }
    th { background: #2d3748; color: #a0aec0; text-align: left;
         padding: 0.6rem 0.8rem; font-weight: 600; text-transform: uppercase;
         font-size: 0.75rem; letter-spacing: 0.05em; }
    td { padding: 0.6rem 0.8rem; border-bottom: 1px solid #2d3748; }
    tr:last-child td { border-bottom: none; }
    tr:hover td { background: #2d3748; }
    a { color: #63b3ed; text-decoration: none; }
    a:hover { text-decoration: underline; }
    footer { text-align: center; color: #4a5568; font-size: 0.8rem; margin-top: 2rem; }
  </style>
</head>
<body>
<div class="container">
  <header>
    <h1>Clinical Genomics ETL Report</h1>
    <div class="meta">
      <div class="meta-item"><span>Patient ID: </span><span class="highlight">\${patientId}</span></div>
      <div class="meta-item"><span>Sample ID: </span><span class="highlight">\${sampleId}</span></div>
      <div class="meta-item"><span>Genome Build: </span>\${genomeBuild}</div>
      <div class="meta-item"><span>FHIR Report: </span><a href="\${reportUrl}" target="_blank">View on HAPI</a></div>
      <div class="meta-item"><span>Generated: </span>\${new Date().toLocaleString()}</div>
    </div>
  </header>

  <section>
    <h2>Variant Summary</h2>
    <div class="meta" style="margin-top: 0;">
      <div class="meta-item"><span>Total Variants: </span>\${totalCount}</div>
      <div class="meta-item"><span>Quality PASS: </span>\${passCount}</div>
      <div class="meta-item"><span class="\${pathogenicCount > 0 ? 'alert' : ''}">Pathogenic/LP: </span><span class="\${pathogenicCount > 0 ? 'alert' : ''}">\${pathogenicCount}</span></div>
    </div>
  </section>

  <section>
    <h2>Variant Details (ClinVar Enriched)</h2>
    <table>
      <thead><tr><th>#</th><th>Position</th><th>Mutation</th><th>Significance</th><th>Filter</th><th>ClinVar UID</th></tr></thead>
      <tbody>
        \${variantRows}
      </tbody>
    </table>
  </section>

  <footer>Generated by VCF to FHIR ETL Pipeline · n8n · \${new Date().getFullYear()}</footer>
</div>
</body>
</html>\`;

return [{ json: { html } }];
`,
    };

    @node({
        id: '88a705fe-d4a6-4603-9bb8-ff4b8e1104c8',
        name: 'Return HTTP Report',
        type: 'n8n-nodes-base.respondToWebhook',
        version: 1.1,
        position: [3120, 592],
    })
    ReturnHttpReport = {
        respondWith: 'text',
        responseBody: '={{ $json.html }}',
        options: {
            responseCode: 200,
            responseHeaders: {
                entries: [
                    {
                        name: 'Content-Type',
                        value: 'text/html; charset=utf-8',
                    },
                ],
            },
        },
    };

    @node({
        id: '6a021263-c01c-4e68-9787-5c5d070da98e',
        name: 'Error Trigger',
        type: 'n8n-nodes-base.errorTrigger',
        version: 1,
        position: [-16, 816],
    })
    ErrorTrigger = {};

    @node({
        id: '7f011154-9d93-4e36-8b27-8213f46b1111',
        name: 'Format Error Details',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [208, 816],
    })
    FormatErrorDetails = {
        jsCode: `const err = $input.first().json;
return [{ json: {
  error_message: err.execution?.error?.message ?? 'Unknown error',
  error_node:    err.execution?.lastNodeExecuted ?? 'Unknown',
  workflow_name: err.workflow?.name ?? 'VCF ETL',
  execution_id:  String(err.execution?.id ?? 'N/A'),
  timestamp:     new Date().toISOString()
}}];`,
    };

    // =====================================================================
    // ROUTING AND CONNECTIONS
    // =====================================================================

    @links()
    defineRouting() {
        this.VcfWebhook.out(0).to(this.ValidateInput.in(0));
        this.ValidateInput.out(0).to(this.ParseVcf.in(0));
        this.ParseVcf.out(0).to(this.ClinvarLookup.in(0));
        this.ClinvarLookup.out(0).to(this.AggregateVariants.in(0));
        this.AggregateVariants.out(0).to(this.BuildFhirDiagnosticReport.in(0));
        this.BuildFhirDiagnosticReport.out(0).to(this.PreparePatientPayload.in(0));
        this.PreparePatientPayload.out(0).to(this.SubmitPatientToFhir.in(0));
        this.SubmitPatientToFhir.out(0).to(this.PrepareReportPayload.in(0));
        this.PrepareReportPayload.out(0).to(this.SubmitReportToFhir.in(0));
        this.SubmitReportToFhir.out(0).to(this.ExtractReportId.in(0));
        this.ExtractReportId.out(0).to(this.FormatHtmlReport.in(0));
        this.FormatHtmlReport.out(0).to(this.ReturnHttpReport.in(0));
        this.ErrorTrigger.out(0).to(this.FormatErrorDetails.in(0));
    }
}