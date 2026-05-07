const allVariants = $input.first().json.variants;
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
  id: `var-${sample_id}-${idx}`,
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
      valueCodeableConcept: { text: `chr${v.chrom}` }
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
  id: `report-${sample_id}`,
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
  result: observations.map(o => ({ reference: `#${o.id}` })),
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