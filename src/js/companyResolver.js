export class CompanyResolver {
  constructor(searchEngine) {
    this.searchEngine = searchEngine;
    this.cacheKey = 'arancelsmart_intent_catalog_v6';
  }

  normalize(text) { return this.searchEngine.normalizeText(text); }

  readCache() {
    try { return JSON.parse(localStorage.getItem(this.cacheKey) || '{}'); } catch { return {}; }
  }

  saveProfile(query, profile) {
    const cache = this.readCache();
    cache[this.normalize(query)] = profile;
    localStorage.setItem(this.cacheKey, JSON.stringify(cache));
  }

  async resolveWithGemini(query) {
    const mode = this.isExplicitCompanyQuery(query) ? 'company' : 'product';
    const response = await fetch('/api/company-catalog', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company: query, mode })
    });
    if (!response.ok) return null;
    const data = await response.json();
    const products = (data.products || []).filter(product =>
      this.searchEngine.subpartidas.some(item => item.codigo10.replace(/\D/g, '').startsWith(product.code))
    ).map(product => ({
      code: product.code,
      label: product.name,
      detail: product.reason || 'Partida candidata propuesta por Gemini; confirmar ficha técnica.'
    }));
    if (!products.length) return null;
    return {
      name: data.company || query, aliases: [this.normalize(query)], products,
      source: data.source || 'Gemini', ambiguous: Boolean(data.ambiguous),
      alternatives: data.alternatives || [], intent: data.intent || mode
    };
  }

  isExplicitCompanyQuery(query) {
    const normalized = this.normalize(query);
    return /\b(empresa|marca|fabricante|compania|corporacion|company|manufacturer|inc|corp|corporation|ltd|sac|co)\b/.test(normalized) || /\b(s\.?a\.?|s\.?a\.?c\.?)\b/i.test(String(query));
  }

  async resolve(query) {
    const normalized = this.normalize(query);
    if (!normalized || normalized.split(' ').length > 12 || /^[\d.\s-]+$/.test(query)) return null;
    const cached = this.readCache()[normalized];
    if (cached) {
      this.searchEngine.registerBrandProfile(cached);
      return cached;
    }

    try {
      const geminiProfile = await this.resolveWithGemini(query);
      if (geminiProfile) {
        this.searchEngine.registerBrandProfile(geminiProfile);
        this.saveProfile(query, geminiProfile);
        return geminiProfile;
      }
    } catch (error) {
      console.warn('Gemini no estuvo disponible; se usará la fuente pública alternativa.', error);
    }

    if (!this.isExplicitCompanyQuery(query)) return null;

    const searchUrl = new URL('https://www.wikidata.org/w/api.php');
    searchUrl.search = new URLSearchParams({ action: 'wbsearchentities', search: query, language: 'es', uselang: 'es', type: 'item', limit: '8', format: 'json', origin: '*' });
    const entityResponse = await fetch(searchUrl);
    if (!entityResponse.ok) throw new Error('No se pudo consultar el catálogo empresarial');
    const entityData = await entityResponse.json();
    const companyPattern = /empresa|compañ[ií]a|corporaci[oó]n|fabricante|marca|multinacional|industria|manufacturer|company|corporation|business/i;
    const entity = (entityData.search || []).find(item => companyPattern.test(item.description || ''));
    if (!entity) return null;

    const sparql = `SELECT DISTINCT ?kind ?kindLabel WHERE {
      { wd:${entity.id} wdt:P1056 ?kind. }
      UNION
      { ?product wdt:P176 wd:${entity.id}; wdt:P31 ?kind. }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "es,en". }
    } LIMIT 50`;
    const catalogUrl = `https://query.wikidata.org/sparql?query=${encodeURIComponent(sparql)}&format=json`;
    const catalogResponse = await fetch(catalogUrl, { headers: { Accept: 'application/sparql-results+json' } });
    if (!catalogResponse.ok) throw new Error('La fuente empresarial no respondió');
    const catalogData = await catalogResponse.json();
    const categoryRules = [
      { pattern: /tablet|tableta/, code: '847130', label: 'Tabletas y computadoras portátiles' },
      { pattern: /smartphone|telefono inteligente/, code: '851713', label: 'Teléfonos inteligentes' },
      { pattern: /telefono celular|telefono movil/, code: '851714', label: 'Otros teléfonos móviles' },
      { pattern: /headphone|auricular|audifono/, code: '851830', label: 'Auriculares y audífonos' },
      { pattern: /smartwatch|reloj inteligente/, code: '851762', label: 'Relojes y dispositivos inteligentes conectados' },
      { pattern: /televisor|television|smart tv/, code: '852872', label: 'Televisores' },
      { pattern: /monitor|pantalla/, code: '852852', label: 'Monitores y pantallas' },
      { pattern: /refrigerador|refrigeradora|frigorifico/, code: '8418', label: 'Refrigeradores y equipos de frío' },
      { pattern: /lavadora|washing machine/, code: '8450', label: 'Máquinas para lavar ropa' },
      { pattern: /microprocesador|processor/, code: '854231', label: 'Procesadores y circuitos integrados' },
      { pattern: /memoria informatica|solid state drive|unidad de estado solido|disco duro/, code: '847170', label: 'Unidades de memoria y almacenamiento' },
      { pattern: /reproductor de audio digital|digital audio player/, code: '851981', label: 'Reproductores de audio' },
      { pattern: /altavoz|speaker/, code: '851821', label: 'Altavoces' }
    ];
    const ignoredKinds = /marca|brand|serie de modelos|model series|articulo de lista|wikimedia|factor de forma|plato|modelo de casco|virtual reality headset model|modelo de objeto manufacturado|modelo de dispositivo electronico/i;
    const products = [];
    const usedCodes = new Set();
    (catalogData.results?.bindings || []).forEach(binding => {
      const originalLabel = binding.kindLabel?.value;
      if (!originalLabel || ignoredKinds.test(this.normalize(originalLabel))) return;
      const cleanedLabel = this.normalize(originalLabel)
        .replace(/^(modelo de|serie de|model of|model)\s+/, '')
        .replace(/\s+(modelo|model|series)$/, '').trim();
      const rule = categoryRules.find(candidate => candidate.pattern.test(cleanedLabel));
      let code = rule?.code || '';
      let label = rule?.label || originalLabel;
      if (!code) {
        const significantTokens = this.searchEngine.tokenize(cleanedLabel).filter(token => token.length > 4);
        const matches = this.searchEngine.search({ query: cleanedLabel });
        const match = matches.find(item => {
          const description = this.normalize(this.searchEngine.getDisplayDescription(item));
          return significantTokens.some(token => description.split(' ').includes(token));
        });
        if (!match) return;
        code = String(match.codigo6 || match.codigo10).replace(/\D/g, '').slice(0, 6);
      }
      if (!code || usedCodes.has(code)) return;
      usedCodes.add(code);
      products.push({ code, label, detail: `Categoría encontrada para ${entity.label}; confirmar modelo, material y función.` });
    });
    if (!products.length) return null;

    const profile = { name: entity.label || query, aliases: [normalized], source: 'Wikidata', products: products.slice(0, 18) };
    this.searchEngine.registerBrandProfile(profile);
    this.saveProfile(query, profile);
    return profile;
  }
}
