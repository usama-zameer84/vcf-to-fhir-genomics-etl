const input = $input.first().json;

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
  .split('\n')
  .filter(l => !l.startsWith('#') && l.trim());

const variants = lines
  .map((line, idx) => {
    const [chrom, pos, id, ref, alt, qual, filter, info] = line.split('\t');
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