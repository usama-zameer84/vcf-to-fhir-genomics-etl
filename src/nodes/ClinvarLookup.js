const variants = $input.all().map(item => item.json);
const enriched = [];
const apiKey   = $env.NCBI_API_KEY ?? '';
const delay    = apiKey ? 120 : 400; // 10/sec with key, 3/sec without

for (const variant of variants) {
  await new Promise(r => setTimeout(r, delay));

  const term = (variant.variant_id && variant.variant_id !== 'null')
    ? `${variant.variant_id}[rs]`
    : `${variant.chrom}[chr]+${variant.pos}` +
      ((['GRCh38','hg38'].includes(variant.genome_build)) ? '[chrpos38]' : '[chrpos37]');

  let clinvar_uid           = null;
  let clinical_significance = 'not_in_clinvar';

  try {
    const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi` +
      `?db=clinvar&term=${encodeURIComponent(term)}&retmode=json&retmax=1` +
      (apiKey ? `&api_key=${apiKey}` : '');

    const searchRes = await this.helpers.httpRequest({ method: 'GET', url: searchUrl });
    const ids = searchRes.esearchresult?.idlist ?? [];
    clinvar_uid = ids.length > 0 ? ids[0] : null;

    if (clinvar_uid) {
      await new Promise(r => setTimeout(r, delay));

      const summaryUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi` +
        `?db=clinvar&id=${clinvar_uid}&retmode=json` +
        (apiKey ? `&api_key=${apiKey}` : '');

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