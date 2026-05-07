const err = $input.first().json;
return [{ json: {
  error_message: err.execution?.error?.message ?? 'Unknown error',
  error_node:    err.execution?.lastNodeExecuted ?? 'Unknown',
  workflow_name: err.workflow?.name ?? 'VCF ETL',
  execution_id:  String(err.execution?.id ?? 'N/A'),
  timestamp:     new Date().toISOString()
}}];