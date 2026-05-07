const data = $('Build FHIR Diagnostic Report').item.json;

return [{ json: {
  ...data,
  reportJson: JSON.stringify(data.diagnosticReport)
}}];