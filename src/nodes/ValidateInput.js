const input = $input.first();
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
  if (!v) throw new Error(`Validation failed: missing field '${k}'`);
}

const allowed = ['GRCh37', 'GRCh38', 'hg19', 'hg38'];
if (!allowed.includes(genome_build))
  throw new Error(`Invalid genome_build: ${genome_build}. Allowed: ${allowed.join(', ')}`);

vcfContent = vcfContent
  .replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  .split('\n')
  .filter(l => !l.startsWith('##') && l.trim() !== '')
  .join('\n');

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