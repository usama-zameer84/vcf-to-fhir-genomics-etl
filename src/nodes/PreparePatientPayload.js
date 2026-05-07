const data = $input.first().json;

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
        ifNoneExist: `identifier=urn:lab:patient-id|${data.patient_id}`
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