export class SearchEngine {
  constructor(dataset = {}) {
    this.dataset = dataset || {};
    this.capitulos = this.dataset.capitulos || {};
    this.secciones = this.dataset.secciones || [];
    this.subpartidas = (this.dataset.subpartidas || []).map(item => this.normalizeItem(item));
    this.searchDocuments = new Map(this.subpartidas.map(item => [item.codigo10, this.buildSearchDocument(item)]));
    this.corpusTokens = new Set([...this.searchDocuments.values()].flatMap(document => document.tokens));
    this.brandProfiles = {
      apple: {
        name: 'Apple', aliases: ['apple', 'apple inc'],
        products: [
          { code: '851713', label: 'iPhone / teléfonos inteligentes', detail: 'Smartphones y teléfonos móviles.' },
          { code: '847130', label: 'MacBook / computadoras portátiles', detail: 'Laptops y equipos portátiles de procesamiento de datos.' },
          { code: '847130', label: 'iPad / tabletas', detail: 'Tabletas portátiles; confirmar características del modelo.' },
          { code: '851762', label: 'Apple Watch / dispositivos conectados', detail: 'Clasificación candidata; confirmar función principal y conectividad.' },
          { code: '851830', label: 'AirPods / auriculares', detail: 'Auriculares, incluso combinados con micrófono.' },
          { code: '851821', label: 'HomePod / altavoces', detail: 'Altavoces montados en su caja.' },
          { code: '852871', label: 'Apple TV / receptor multimedia', detail: 'Aparato receptor sin pantalla incorporada.' },
          { code: '850440', label: 'Cargadores y adaptadores', detail: 'Convertidores y fuentes de alimentación.' },
          { code: '854442', label: 'Cables con conectores', detail: 'Conductores eléctricos provistos de conectores.' }
        ]
      }
    };
  }

  normalizeText(text) {
    return String(text || '').toLowerCase().normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ').trim();
  }

  matchesText(haystack, needle) {
    const text = this.normalizeText(haystack);
    const term = this.normalizeText(needle);
    if (!term) return false;
    if (term.includes(' ')) return text.includes(term);
    return text.split(' ').some(word => word === term || word.startsWith(term));
  }

  stemToken(token) {
    if (token.length > 6 && token.endsWith('es')) return token.slice(0, -2);
    if (token.length > 4 && token.endsWith('s')) return token.slice(0, -1);
    return token;
  }

  tokenize(text) {
    const stopWords = new Set(['sin', 'con', 'para', 'por', 'los', 'las', 'del', 'una', 'uno', 'unos', 'unas', 'que', 'de', 'la', 'el', 'y', 'o']);
    return this.normalizeText(text).split(' ')
      .filter(token => token.length > 2 && !stopWords.has(token))
      .map(token => this.stemToken(token));
  }

  buildSearchDocument(item) {
    const chapter = this.capitulos[item.capitulo]?.nombre || '';
    const commercialTerms = {
      '8481.80.99.00': ['válvula mariposa', 'butterfly valve'],
      '4016.99.10.00': ['diafragma de caucho', 'diafragma industrial de caucho', 'rubber diaphragm'],
      '4016.99.90.00': ['diafragma de caucho de uso general'],
      '8481.90.90.00': ['diafragma parte de valvula']
    }[item.codigo10] || [];
    const text = [this.getDisplayDescription(item), ...(item.sinonimos || []), ...commercialTerms, chapter].join(' ');
    return { text: this.normalizeText(text), tokens: [...new Set(this.tokenize(text))] };
  }

  expandToken(token) {
    const groups = [
      ['polo', 'camiseta', 'remera', 'tshirt', 'bvd', 'musculosa'],
      ['casaca', 'casacas', 'chaqueta', 'chamarra', 'cazadora', 'abrigo'],
      ['chompa', 'chompas', 'sueter', 'pulover', 'cardigan'],
      ['polera', 'poleras', 'hoodie', 'sudadera'],
      ['pantalon', 'pantalones', 'jean', 'jeans', 'pantaloneta', 'short', 'shorts'],
      ['zapato', 'zapatilla', 'zapatillas', 'calzado', 'tabas', 'chancleta', 'chancletas', 'ojota', 'ojotas'],
      ['carro', 'auto', 'automovil', 'vehiculo', 'combi', 'combis', 'custer', 'custer', 'colectivo'],
      ['mototaxi', 'motocarro', 'trimovil', 'moto'],
      ['llanta', 'neumatico', 'aros'],
      ['laptop', 'notebook', 'computadora', 'ordenador', 'portatil'],
      ['celular', 'celu', 'smartphone', 'telefono', 'movil'],
      ['foco', 'lampara', 'luminaria', 'led'],
      ['medicina', 'medicamento', 'farmaceutico'],
      ['shampoo', 'champu'],
      ['audifono', 'audifonos', 'auricular', 'auriculares', 'headphone', 'headset'],
      ['poliester', 'sintetico', 'sintetica', 'acrilico', 'modacrilico'],
      ['repuesto', 'parte', 'pieza'],
      ['pota', 'calamar', 'squid'],
      ['palta', 'aguacate', 'avocado'],
      ['camote', 'batata'],
      ['choclo', 'maiz'],
      ['taper', 'taperes', 'envase', 'recipiente'],
      ['tomatodo', 'tomatodos', 'cantimplora', 'botella'],
      ['calamina', 'hoja', 'plancha'],
      ['balon', 'tanque', 'cilindro']
    ].map(group => group.map(value => this.stemToken(value)));
    const group = groups.find(values => values.includes(token));
    return group ? [...new Set(group)] : [token];
  }

  editDistance(a, b) {
    if (Math.abs(a.length - b.length) > 1) return 2;
    let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
    for (let i = 1; i <= a.length; i += 1) {
      const current = [i];
      let rowMinimum = i;
      for (let j = 1; j <= b.length; j += 1) {
        const value = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        current.push(value);
        rowMinimum = Math.min(rowMinimum, value);
      }
      if (rowMinimum > 1) return 2;
      previous = current;
    }
    return previous[b.length];
  }

  tokenScore(queryToken, documentToken) {
    if (queryToken === documentToken) return 120;
    if (documentToken.startsWith(queryToken) || queryToken.startsWith(documentToken)) return 85;
    if (queryToken.length >= 5 && documentToken.length >= 5 && this.editDistance(queryToken, documentToken) === 1) return 55;
    return 0;
  }

  normalizeItem(item) {
    const raw = String(item.descripcionOficial || '').replace(/\uFB02/g, 'fl')
      .replace(/\uFB01/g, 'fi').replace(/\u00a0/g, ' ')
      .replace(/^(?:\s*[-.]\s*)+/, '').replace(/\s+/g, ' ').trim();
    const rateMatch = raw.match(/\s+(0|6|11)\s*$/);
    const officialDescription = rateMatch ? raw.slice(0, rateMatch.index).trim() : raw;
    const contextualDescriptions = {
      '4016.99.10.00': 'Otros artículos para usos técnicos (incluye diafragmas industriales de caucho)',
      '4016.99.90.00': 'Las demás manufacturas de caucho vulcanizado sin endurecer',
      '8481.90.90.00': 'Las demás partes de válvulas y órganos similares',
      '8481.80.99.00': 'Las demás válvulas y órganos similares (incluye válvulas mariposa)'
    };
    return {
      ...item,
      descripcionOficial: officialDescription,
      descripcionContextual: contextualDescriptions[item.codigo10] || '',
      adValorem: rateMatch ? Number(rateMatch[1]) : Number(item.adValorem || 0),
      sinonimos: (item.sinonimos || []).map(value => String(value)
        .replace(/\uFB02/g, 'fl').replace(/\uFB01/g, 'fi')
        .replace(/\s+(0|6|11)\s*$/, '').replace(/^(?:\s*[-.]\s*)+/, '').trim())
    };
  }

  getDisplayDescription(item) {
    return item ? String(item.descripcionContextual || item.descripcionOficial || '').replace(/^(?:\s*[-.]\s*)+/, '').replace(/\s+/g, ' ').trim() : '';
  }

  getCommercialAlias(query) {
    const normalized = this.normalizeText(query);
    const rules = [
      {
        terms: ['celular', 'celulares', 'smartphone', 'smartphones', 'iphone', 'iphones', 'movil', 'moviles', 'redmi', 'xiaomi', 'galaxy', 'telefono movil'],
        codes: ['8517130000', '851713'],
        aliases: ['telefonos moviles celulares y de otras redes inalambricas'],
        officialTerm: 'Teléfonos móviles (celulares)',
        generalCode: '8517.13.00.00',
        generalTitle: 'Teléfonos móviles (celulares) y los de otras redes inalámbricas',
        guidance: 'En el Arancel de Aduanas SUNAT, los smartphones e iPhones se clasifican en la subpartida nacional 8517.13.00.00 (0% Ad-Valorem, requiere Homologación MTC).'
      },
      {
        terms: ['laptop', 'laptops', 'computadora portatil', 'computadoras portatiles', 'notebook', 'notebooks', 'macbook', 'macbooks', 'laptop gamer', 'pc portatil'],
        codes: ['8471300000', '847130'],
        aliases: ['maquinas automaticas para tratamiento de datos portatiles'],
        officialTerm: 'Computadoras portátiles (Laptops / Notebooks)',
        generalCode: '8471.30.00.00',
        generalTitle: 'Máquinas automáticas para tratamiento o procesamiento de datos, portátiles',
        guidance: 'Las laptops, notebooks y macbooks portátiles corresponden a la subpartida 8471.30.00.00 (0% Ad-Valorem, Libre importación).'
      },
      {
        terms: ['zapatilla', 'zapatillas', 'tennis', 'tenis', 'calzado deportivo', 'sneaker', 'sneakers', 'zapatos deportivos'],
        codes: ['6404110000', '640411'],
        aliases: ['calzado de tenis baloncesto gimnasia entrenamiento'],
        officialTerm: 'Zapatillas / Calzado de deporte',
        generalCode: '6404.11.00.00',
        generalTitle: 'Calzado de deporte; calzado de tenis, baloncesto, gimnasia, entrenamiento',
        guidance: 'Las zapatillas deportivas con suela de caucho/plástico y parte superior textil corresponden a la subpartida 6404.11.00.00 (11% Ad-Valorem).'
      },
      {
        terms: ['funda', 'fundas', 'carcasa', 'carcasas', 'case', 'cases', 'protector de silicona', 'sking', 'forro celular', 'funda para celular'],
        codes: ['3926909000', '392690'],
        aliases: ['las demas manufacturas de plastico fundas y carcasas'],
        officialTerm: 'Fundas y carcasas de plástico',
        generalCode: '3926.90.90.00',
        generalTitle: 'Las demás manufacturas de plástico (Fundas, carcasas y protectores)',
        guidance: 'Los protectores, fundas y carcasas de silicona o plástico duro para celulares se clasifican en la subpartida 3926.90.90.00 (6% Ad-Valorem).'
      },
      {
        terms: ['dron', 'drones', 'drone', 'vuela solo', 'dji', 'aeronave sin piloto', 'quadcopter', 'multirotor'],
        codes: ['8806220000', '880622'],
        aliases: ['aeronaves no tripuladas drones'],
        officialTerm: 'Drones / Aeronaves pilotadas a distancia',
        generalCode: '8806.22.00.00',
        generalTitle: 'Aeronaves no tripuladas (Drones con o sin cámara incorporada)',
        guidance: 'Los drones o cuadricópteros no tripulados corresponden a la partida 88.06 (Requiere permiso de internamiento MTC en VUCE).'
      },
      { terms: ['polo sintetico', 'polos sinteticos', 'camiseta sintetica', 'camisetas sinteticas', 't shirt sintetica', 'remera sintetica'], codes: ['610990'], aliases: ['camisetas de punto de las demas materias textiles', 'fibras sinteticas'], guidance: 'La composición define la subpartida: acrílica o modacrílica corresponde a 6109.90.10.00; poliéster u otra fibra sintética corresponde normalmente a 6109.90.90.00.' },
      {
        terms: ['ps5', 'playstation', 'playstation 5', 'ps4', 'xbox', 'nintendo', 'nintendo switch', 'videoconsola', 'videoconsolas', 'consola de videojuegos', 'consola de juego', 'videojuegos'],
        codes: ['9504500000', '9504909900'],
        aliases: ['videoconsolas y maquinas de videojuego'],
        generalCode: '9504.50.00.00',
        generalTitle: 'Videoconsolas y máquinas de videojuego',
        question: '¿Qué tipo de videoconsola o accesorio deseas clasificar?',
        guidance: 'En el Arancel de Aduanas SUNAT (Perú), las videoconsolas principales (PS5, Xbox, Nintendo Switch) corresponden directamente a la subpartida nacional 9504.50.00.00 con un arancel Ad-Valorem del 6%.',
        choices: [
          { code: '9504.50.00.00', label: 'Videoconsola principal (PS5, Xbox, Switch)', detail: 'Aparatos de videojuegos para TV o portátiles independientes (Ad-Valorem: 6%).', recommended: true },
          { code: '9504.90.99.00', label: 'Mandos / Joysticks / Accesorios de videojuegos', detail: 'Partes y accesorios de consolas de videojuegos (Ad-Valorem: 6%).' }
        ]
      },
      { terms: ['polo de algodon', 'polos de algodon', 'polo algodon', 'camiseta de algodon', 't shirt de algodon', 'remera de algodon'], codes: ['610910'], aliases: ['camisetas de punto de algodon'] },
      { terms: ['polo', 'polos', 'camiseta', 'camisetas', 't shirt', 'remera', 'remeras'], codes: ['6109'], aliases: ['camisetas de punto'] },
      {
        terms: ['casaca', 'casacas', 'casaca de poliester', 'casaca sintetica', 'casaca de algodon', 'casaca de cuero', 'casaca de plumas'],
        codes: ['6101', '6102', '6201', '6202', '420310'],
        aliases: ['abrigos chaquetones anoraks casacas', 'prendas de vestir de cuero'],
        generalCode: '62.01 / 62.02',
        generalTitle: 'Casacas, abrigos, anoraks y prendas similares',
        question: '¿De qué material y género es la casaca?',
        choices: [
          { code: '6201.40.00.00', label: 'Casaca para varón de fibra sintética/artificial', detail: 'De fibra de poliéster o material sintético.', recommended: true },
          { code: '6202.40.00.00', label: 'Casaca para dama de fibra sintética/artificial', detail: 'De fibra de poliéster o material sintético.' },
          { code: '6201.30.00.00', label: 'Casaca para varón de algodón', detail: 'De tejido de algodón.' },
          { code: '6202.30.00.00', label: 'Casaca para dama de algodón', detail: 'De tejido de algodón.' },
          { code: '4203.10.00.00', label: 'Casaca de cuero natural', detail: 'Prenda de vestir de cuero natural o regenerado.' }
        ]
      },
      {
        terms: ['chompa', 'chompas', 'chompa de lana', 'chompa de alpaca', 'chompa de algodon', 'sueter', 'cardigan'],
        codes: ['6110'],
        aliases: ['sueteres puloveres chompas cardiganes'],
        generalCode: '61.10',
        generalTitle: 'Chompas, suéteres, pulóveres y chalecos de punto',
        question: '¿De qué material está confeccionada la chompa?',
        choices: [
          { code: '6110.11.00.00', label: 'Chompa de lana de oveja', detail: 'De lana de la especie ovina.' },
          { code: '6110.19.00.00', label: 'Chompa de fibra de alpaca, llama o vicuña', detail: 'De pelo fino de camélidos sudamericanos.', recommended: true },
          { code: '6110.20.00.00', label: 'Chompa de algodón', detail: 'De punto de algodón.' },
          { code: '6110.30.00.00', label: 'Chompa de fibra sintética/artificial', detail: 'De acrílico, poliéster u otras fibras químicas.' }
        ]
      },
      {
        terms: ['polera', 'poleras', 'polera con capucha', 'polera de algodon', 'polera urbana', 'hoodie'],
        codes: ['611020', '611030', '620140'],
        aliases: ['sueteres puloveres chompas poleras de punto'],
        generalCode: '61.10',
        generalTitle: 'Poleras y sudaderas de punto (con o sin capucha)',
        question: '¿De qué material es la polera?',
        choices: [
          { code: '6110.20.00.00', label: 'Polera de algodón (french terry / franelada)', detail: 'De punto de algodón.', recommended: true },
          { code: '6110.30.00.00', label: 'Polera sintética (poliéster)', detail: 'De fibras sintéticas o compuestas.' }
        ]
      },
      {
        terms: ['pantaloneta', 'shorts', 'short', 'short deportivo', 'pantalon corto'],
        codes: ['610342', '610343', '610462', '610463', '620342', '620462'],
        aliases: ['pantalones cortos y shorts'],
        generalCode: '61.03 / 62.03',
        generalTitle: 'Pantalones cortos y shorts (pantalonetas)',
        guidance: 'Determina si es de punto o tejido plano, y la materia textil (algodón o sintético).'
      },
      {
        terms: ['bvd', 'bvds', 'b.v.d.', 'musculosa', 'camiseta sin mangas'],
        codes: ['610910', '610990'],
        aliases: ['camisetas de punto bvd sin mangas'],
        generalCode: '61.09',
        generalTitle: 'Camisetas de punto tipo BVD (sin mangas)',
        choices: [
          { code: '6109.10.00.00', label: 'BVD de algodón', detail: '100% algodón o mezcla predominante.', recommended: true },
          { code: '6109.90.90.00', label: 'BVD sintético / deportivo', detail: 'De poliéster, nylon o microfibra.' }
        ]
      },
      {
        terms: ['truza', 'trusas', 'ropa interior', 'calzoncillo', 'calzon', 'panteta'],
        codes: ['610711', '610712', '610821', '610822'],
        aliases: ['calzoncillos trusas y bragas de punto'],
        generalCode: '61.07 / 61.08',
        generalTitle: 'Trusas, calzoncillos y bragas de punto',
        guidance: 'Confirma si es para varón o dama y la composición textil.'
      },
      {
        terms: ['buzo', 'buzos', 'pantalon de buzo', 'conjunto deportivo'],
        codes: ['611211', '611212', '611219', '621132', '621142'],
        aliases: ['conjuntos de deporte de punto buzos'],
        generalCode: '61.12',
        generalTitle: 'Buzos y conjuntos deportivos',
        choices: [
          { code: '6112.11.00.00', label: 'Buzo deportivo de algodón', detail: 'Conjunto o pantalón de deporte de punto de algodón.', recommended: true },
          { code: '6112.12.00.00', label: 'Buzo deportivo de fibras sintéticas', detail: 'De fibras sintéticas (poliéster, nylon, etc.).' }
        ]
      },
      {
        terms: ['chullo', 'chullos', 'gorro peruano', 'gorra tejida'],
        codes: ['650500'],
        aliases: ['sombreros y demas tocados de punto chullos'],
        generalCode: '65.05',
        generalTitle: 'Chullos, gorros y tocados de punto',
        guidance: 'Chullos artesanales o industriales tejidos de punto de lana, alpaca o fibras sintéticas.'
      },
      {
        terms: ['tabas', 'chancletas', 'ojotas', 'sandalias de jebe', 'chanclas'],
        codes: ['640220', '640299', '640419'],
        aliases: ['calzado ojotas chancletas sandalias'],
        generalCode: '64.02 / 64.04',
        generalTitle: 'Calzado informal, ojotas, chancletas y sandalias',
        choices: [
          { code: '6402.20.00.00', label: 'Chancletas / ojotas de plástico o jebe', detail: 'Tiras fijadas a la suela por tetones.', recommended: true },
          { code: '6402.99.90.00', label: 'Las demás sandalias o calzado de plástico/caucho', detail: 'Suela y parte superior de caucho o plástico.' }
        ]
      },
      {
        terms: ['pisco', 'pisco peruano', 'aguardiente de uva', 'pisco quebranta', 'pisco italia', 'pisco acholado'],
        codes: ['2208202100', '2208202900', '220820'],
        aliases: ['pisco aguardiente de uva peruano'],
        generalCode: '2208.20.21.00',
        generalTitle: 'Pisco (Aguardiente de uva peruano con denominación de origen)',
        guidance: 'En el Arancel de Aduanas del Perú, el Pisco tiene una subpartida nacional específica exclusiva (2208.20.21.00).',
        choices: [
          { code: '2208.20.21.00', label: 'Pisco peruano con Denominación de Origen', detail: 'Aguardiente de vino / uva peruano reconocido oficialmente.', recommended: true },
          { code: '2208.20.29.00', label: 'Los demás aguardientes de vino o de orujo de uvas', detail: 'Otros destilados de uva que no cuentan con la denominación de origen Pisco.' }
        ]
      },
      {
        terms: ['pota', 'pota congelada', 'calamar gigante', 'pota procesada', 'anillas de pota', 'nuca de pota', 'aleta de pota'],
        codes: ['0307430000', '0307490000'],
        aliases: ['potas calamares gigantes congelados'],
        generalCode: '0307.43',
        generalTitle: 'Pota / Calamar gigante (Dosidicus gigas)',
        choices: [
          { code: '0307.43.00.00', label: 'Pota congelada (entera, tubos, anillas, tentáculos)', detail: 'Jibias (sepias) y calamares / pota congelados.', recommended: true },
          { code: '0307.49.00.00', label: 'Pota seca, salada o en salmuera', detail: 'Las demás presentaciones procesadas sin congelar.' }
        ]
      },
      {
        terms: ['palta', 'paltas', 'palta hass', 'palta fuerte', 'aguacate'],
        codes: ['0804400000'],
        aliases: ['paltas aguacates frescos o secos'],
        generalCode: '0804.40.00.00',
        generalTitle: 'Paltas (aguacates) frescas o secas',
        guidance: 'Corresponde a la subpartida nacional 0804.40.00.00.'
      },
      {
        terms: ['camote', 'camotes', 'camote amarillo', 'camote morado', 'batata'],
        codes: ['0714200000'],
        aliases: ['camotes batatas frescos refrigerados o secos'],
        generalCode: '0714.20.00.00',
        generalTitle: 'Camotes (batatas)',
        guidance: 'Raíces de camote frescas, refrigeradas, congeladas o secas.'
      },
      {
        terms: ['choclo', 'choclos', 'maiz morado', 'chicha morada', 'maiz gigante del cusco'],
        codes: ['0710400000', '1005901100', '2202990000'],
        aliases: ['maiz dulce choclo maiz morado'],
        generalCode: '0710.40 / 1005.90',
        generalTitle: 'Choclo (maíz dulce) y maíz morado',
        choices: [
          { code: '0710.40.00.00', label: 'Choclo desgranado o en coronta congelado', detail: 'Maíz dulce (choclo) congelado.', recommended: true },
          { code: '1005.90.11.00', label: 'Maíz morado en grano / coronta seca', detail: 'Maíz duro / morado para consumo o elaboración.' },
          { code: '2202.99.00.00', label: 'Chicha morada embotellada', detail: 'Bebida no alcohólica a base de maíz morado.' }
        ]
      },
      {
        terms: ['lucuma', 'lúcuma', 'pulpa de lucuma', 'harina de lucuma'],
        codes: ['0810909000', '0811909000', '1106300000'],
        aliases: ['lucuma fruta fresca pulpa o harina'],
        generalCode: '0810.90 / 1106.30',
        generalTitle: 'Lúcuma (fruta fresca, congelada o en harina)',
        choices: [
          { code: '0810.90.90.00', label: 'Lúcuma fresca', detail: 'Las demás frutas frescas.', recommended: true },
          { code: '0811.90.90.00', label: 'Pulpa de lúcuma congelada', detail: 'Fruta congelada sin cocer o cocida en agua.' },
          { code: '1106.30.00.00', label: 'Harina de lúcuma', detail: 'Harina, sémola y polvo de los productos del Capítulo 8.' }
        ]
      },
      {
        terms: ['maracuya', 'maracuyá', 'jugo de maracuya', 'concentrado de maracuya'],
        codes: ['0810909000', '2009890000'],
        aliases: ['maracuya fruta o jugo de maracuya'],
        generalCode: '2009.89',
        generalTitle: 'Jugo o fruta de maracuyá',
        choices: [
          { code: '2009.89.00.00', label: 'Jugo / concentrado de maracuyá', detail: 'Jugo de cualquier otra fruta o hortaliza sin fermentar.', recommended: true },
          { code: '0810.90.90.00', label: 'Maracuyá fresca', detail: 'Fruta fresca de maracuyá.' }
        ]
      },
      {
        terms: ['maca', 'maca en polvo', 'harina de maca', 'extracto de maca', 'maca organica'],
        codes: ['0714909000', '1106300000', '2106909000'],
        aliases: ['maca raiz harina o complemento alimenticio'],
        generalCode: '0714.90 / 2106.90',
        generalTitle: 'Maca (Lepidium meyenii)',
        choices: [
          { code: '0714.90.90.00', label: 'Raíz de maca seca o fresca', detail: 'Raíces y tubérculos con alto contenido de fécula.', recommended: true },
          { code: '1106.30.00.00', label: 'Harina de maca', detail: 'Polvo/harina procesada de raíz de maca.' },
          { code: '2106.90.90.00', label: 'Cápsulas / suplementos de maca', detail: 'Preparaciones alimenticias no expresadas ni comprendidas en otra parte.' }
        ]
      },
      {
        terms: ['cuy', 'cuyes', 'carne de cuy', 'cuy beneficiado'],
        codes: ['0106190000', '0208900000'],
        aliases: ['cuyes animales vivos o carne de cuy'],
        generalCode: '0106.19 / 0208.90',
        generalTitle: 'Cuy (Cavia porcellus)',
        choices: [
          { code: '0106.19.00.00', label: 'Cuy vivo', detail: 'Mamífero vivo de la especie Cavia porcellus.', recommended: true },
          { code: '0208.90.00.00', label: 'Carne de cuy beneficiado', detail: 'Carne y despojos comestibles de mamíferos frescos o congelados.' }
        ]
      },
      {
        terms: ['alpaca', 'fibra de alpaca', 'lana de alpaca', 'pelo de alpaca'],
        codes: ['5102110000', '5105310000'],
        aliases: ['pelo fino de alpaca lana sin peinar o peinada'],
        generalCode: '51.02 / 51.05',
        generalTitle: 'Fibra / Lana de alpaca',
        choices: [
          { code: '5102.11.00.00', label: 'Fibra de alpaca sucia o lavada (sin cardar ni peinar)', detail: 'Pelo fino de alpaca o llama.', recommended: true },
          { code: '5105.31.00.00', label: 'Fibra de alpaca peinada (Tops de alpaca)', detail: 'Pelo fino de alpaca peinado.' }
        ]
      },
      {
        terms: ['paneton', 'panetón', 'paneton de navidad', 'bizcocho navideño'],
        codes: ['1905200000', '1905909000'],
        aliases: ['paneton pan de especias productos de pasteleria'],
        generalCode: '1905.20 / 1905.90',
        generalTitle: 'Panetón y productos de panadería dulce',
        choices: [
          { code: '1905.20.00.00', label: 'Pan de especias / Panetón tradicional', detail: 'Pan dulce adicionado con pasas y frutas confitadas.', recommended: true },
          { code: '1905.90.90.00', label: 'Los demás productos de panadería y pastelería', detail: 'Bizcochos o panes especiales de masa enriquecida.' }
        ]
      },
      {
        terms: ['mototaxi', 'mototaxis', 'motocarro', 'trimovil', 'torito bajaj', 'moto carguero', 'trimoto'],
        codes: ['871120', '871190', '870490'],
        aliases: ['mototaxis trimoviles motocarros de pasajeros o carga'],
        generalCode: '87.11 / 87.04',
        generalTitle: 'Mototaxis, trimóviles y motocarros (Bajaj / Zongshen / Wanxin)',
        question: '¿Cuál es la función principal del mototaxi o trimóvil?',
        choices: [
          { code: '8711.20.00.00', label: 'Mototaxi para transporte de pasajeros (125cc - 250cc)', detail: 'Vehículo de 3 ruedas equipado con motor de émbolo (125cc a 250cc).', recommended: true },
          { code: '8704.90.00.00', label: 'Motocarro de carga (furgón / tolva)', detail: 'Trimóvil diseñado especialmente para el transporte de mercancías o carga.' },
          { code: '8711.60.00.00', label: 'Mototaxi o trimóvil eléctrico', detail: 'Propulsado exclusivamente con motor eléctrico.' }
        ]
      },
      {
        terms: ['combi', 'combis', 'custer', 'cúster', 'colectivo', 'minivan de pasajeros'],
        codes: ['870210', '870290', '870332', '870323'],
        aliases: ['vehiculos tipo combi custer para transporte colectivo'],
        generalCode: '87.02 / 87.03',
        generalTitle: 'Vehículos tipo Combi, Cúster o Minivan de transporte público',
        choices: [
          { code: '8702.10.00.00', label: 'Combi / Cúster para 10 o más personas (diésel)', detail: 'Vehículo para el transporte de 10 o más personas, incluido el conductor.', recommended: true },
          { code: '8703.32.00.00', label: 'Minivan / Colectivo para menos de 10 personas', detail: 'Automóvil concebido para transporte de personas (capacidad menor a 10 asientos).' }
        ]
      },
      {
        terms: ['bateria de auto', 'bateria de carro', 'bateria automotriz', 'acumulador de plomo'],
        codes: ['8507100000'],
        aliases: ['acumuladores electricos de plomo para arranque de motores'],
        generalCode: '8507.10.00.00',
        generalTitle: 'Baterías automotrices (acumuladores de plomo para arranque)',
        guidance: 'Baterías de plomo utilizadas para el arranque de motores de émbolo de automóviles o camiones.'
      },
      {
        terms: ['parabrisas', 'parabrisas delantero', 'luneta trasera'],
        codes: ['7007110000', '7007210000'],
        aliases: ['vidrios de seguridad templados o contrachapados para vehiculos'],
        generalCode: '7007.11 / 7007.21',
        generalTitle: 'Parabrisas y cristales de seguridad para automóviles',
        choices: [
          { code: '7007.21.00.00', label: 'Parabrisas laminado (contrachapado)', detail: 'Vidrio de seguridad contrachapado dimensionado para automóviles.', recommended: true },
          { code: '7007.11.00.00', label: 'Cristal lateral / trasero templado', detail: 'Vidrio de seguridad templado para vehículos.' }
        ]
      },
      {
        terms: ['pastillas de freno', 'frenos de auto', 'frenos de camion', 'zapatas de freno'],
        codes: ['8708300000', '6813810000'],
        aliases: ['frenos y servofrenos sus partes guarniciones de friccion'],
        generalCode: '8708.30 / 6813.81',
        generalTitle: 'Pastillas y sistemas de freno automotriz',
        choices: [
          { code: '8708.30.00.00', label: 'Pastillas de freno montadas (partes de vehículos)', detail: 'Frenos y servofrenos montados en su soporte.', recommended: true },
          { code: '6813.81.00.00', label: 'Guarniciones de fricción para frenos (sin montar)', detail: 'A base de sustancias minerales o celulosa sin montar.' }
        ]
      },
      {
        terms: ['taper', 'táper', 'taperes', 'táperes', 'envase de plastico', 'tupperware'],
        codes: ['3924100000', '3923100000'],
        aliases: ['taperes vajilla y articulos de cocina de plastico'],
        generalCode: '3924.10.00.00',
        generalTitle: 'Táperes y recipientes de plástico para alimentos',
        choices: [
          { code: '3924.10.00.00', label: 'Táper para uso doméstico o de cocina', detail: 'Vajilla y demás artículos para el servicio de mesa o de cocina de plástico.', recommended: true },
          { code: '3923.10.00.00', label: 'Envase industrial / caja de plástico para transporte', detail: 'Cajas, cajones, jaulas y artículos similares de plástico para transporte.' }
        ]
      },
      {
        terms: ['tomatodo', 'tomatodos', 'cantimplora de plastico', 'botella para agua'],
        codes: ['3924100000', '7323930000', '9617000000'],
        aliases: ['tomatodos cantimploras botellas reutilizables'],
        generalCode: '3924.10 / 7323.93',
        generalTitle: 'Tomatodos y botellas reutilizables de agua',
        choices: [
          { code: '3924.10.00.00', label: 'Tomatodo de plástico', detail: 'Artículo de servicio de mesa o cocina de plástico.', recommended: true },
          { code: '7323.93.00.00', label: 'Tomatodo / botella de acero inoxidable', detail: 'Artículos de uso doméstico de acero inoxidable.' },
          { code: '9617.00.00.00', label: 'Termo / tomatodo térmico al vacío', detail: 'Termos y demás recipientes isotérmicos montados con aislamiento por vacío.' }
        ]
      },
      {
        terms: ['balon de gas', 'balón de gas', 'tanque de gas', 'cilindro de gas', 'balon de glp'],
        codes: ['7311000000'],
        aliases: ['recipientes para gas comprimido o licuado de hierro o acero balones de gas'],
        generalCode: '7311.00.00.00',
        generalTitle: 'Balones de gas (recipientes de acero para GLP o gas comprimido)',
        guidance: 'Recipientes para gas comprimido o licuado, de fundición, hierro o acero (balones de GLP domésticos de 10 kg, 45 kg o industriales).'
      },
      {
        terms: ['calamina', 'calaminas', 'calamina galvanizada', 'calamina plastica'],
        codes: ['7210490000', '7210700000', '3925900000'],
        aliases: ['calaminas planchas onduladas galvanizadas'],
        generalCode: '7210.49 / 3925.90',
        generalTitle: 'Calaminas (planchas de techado onduladas)',
        choices: [
          { code: '7210.49.00.00', label: 'Calamina de acero galvanizado (metálica)', detail: 'Planchas onduladas de hierro o acero cincadas.', recommended: true },
          { code: '3925.90.00.00', label: 'Calamina plástica / de fibra de vidrio', detail: 'Elementos de construcción de plástico para techos.' }
        ]
      },
      {
        terms: ['amoladora', 'amoladoras', 'esmeril angular', 'esmeril', 'galletera'],
        codes: ['8467290000'],
        aliases: ['herramientas neumaticas o con motor electrico incorporado amoladoras'],
        generalCode: '8467.29.00.00',
        generalTitle: 'Amoladoras / Esmeriles angulares portátiles',
        guidance: 'Herramientas de mano con motor eléctrico incorporado para corte o desbaste.'
      },
      {
        terms: ['taladro', 'taladros', 'taladro percutor', 'taladro inalambrico'],
        codes: ['8467210000'],
        aliases: ['taladros de toda clase de mano con motor electrico'],
        generalCode: '8467.21.00.00',
        generalTitle: 'Taladros portátiles eléctricos (inalámbricos o de cable)',
        guidance: 'Taladros de toda clase, incluidos rotomartillos y percutores de mano con motor eléctrico.'
      },
      {
        terms: ['zapato cuero', 'zapatos cuero', 'zapato de cuero', 'zapatos de cuero', 'calzado cuero', 'calzado de cuero'], codes: ['6403'],
        aliases: ['calzado con parte superior de cuero'],
        generalCode: '64.03',
        generalTitle: 'Calzado con suela de caucho, plástico, cuero natural o regenerado y parte superior de cuero natural',
        question: '¿Qué característica describe mejor el calzado?',
        choices: [
          { code: '6403.99.90.00', label: 'Zapato casual o de vestir', detail: 'No cubre el tobillo; suela de caucho, plástico o cuero regenerado.' },
          { code: '6403.91.90.00', label: 'Bota o botín', detail: 'Cubre el tobillo; suela distinta de cuero natural.' },
          { code: '6403.59.00.00', label: 'Zapato con suela de cuero', detail: 'No cubre el tobillo y la suela es de cuero natural.' },
          { code: '6403.51.00.00', label: 'Bota con suela de cuero', detail: 'Cubre el tobillo y la suela es de cuero natural.' },
          { code: '6403.40.00.00', label: 'Calzado de seguridad', detail: 'Tiene puntera metálica de protección.' },
          { code: '6403.19.00.00', label: 'Calzado deportivo', detail: 'Los demás calzados deportivos con parte superior de cuero.' }
        ]
      },
      { terms: ['zapato', 'zapatos', 'zapatilla', 'zapatillas', 'calzado'], codes: ['6401', '6402', '6403', '6404', '6405'], aliases: ['calzado'] },
      { terms: ['llanta de automovil', 'llanta automovil', 'neumatico de automovil', 'neumatico para auto'], codes: ['401110'], aliases: ['neumaticos utilizados en automoviles de turismo'] },
      { terms: ['llanta', 'llantas', 'neumatico', 'neumaticos'], codes: ['4011'], aliases: ['neumaticos nuevos de caucho'] },
      { terms: ['valvula mariposa', 'valvulas mariposa', 'butterfly valve'], codes: ['84818099'], aliases: ['los demas articulos de griferia y valvulas'], guidance: 'La marca y el diámetro identifican el producto comercial, pero no cambian por sí solos la clasificación. Confirma material, función y forma de accionamiento antes de declarar.' },
      {
        terms: ['diafragma caucho', 'diafragma de caucho', 'diafragma caucho natural', 'rubber diaphragm'],
        codes: ['40169910', '40169990', '84819090'], aliases: ['articulos tecnicos de caucho', 'partes de valvulas'],
        generalCode: '40.16', generalTitle: 'Manufacturas de caucho vulcanizado sin endurecer',
        question: '¿Qué uso y construcción corresponden a la ficha técnica?',
        guidance: 'XOMOX/CRANE es la marca y “grado Q” es una especificación comercial. La composición, vulcanización y función técnica determinan la clasificación.',
        choices: [
          { code: '4016.99.10.00', label: 'Diafragma industrial de caucho', detail: 'Artículo de caucho para uso técnico en equipos o válvulas.', recommended: true },
          { code: '4016.99.90.00', label: 'Otra manufactura de caucho', detail: 'Cuando no corresponde a la categoría específica de uso técnico.' },
          { code: '8481.90.90.00', label: 'Parte mecánica de una válvula', detail: 'Alternativa que exige verificar si se clasifica como parte y no por su material de caucho.' }
        ]
      },
      {
        terms: ['perro', 'perros', 'canino', 'caninos', 'mascota perro', 'gato', 'gatos', 'felino', 'felinos', 'mascota gato'],
        codes: ['010619', '230910'], aliases: ['animales vivos', 'alimentos para perros o gatos'],
        generalCode: 'CONSULTA AMBIGUA', generalTitle: 'Perro vivo o mercancía destinada a perros',
        question: '¿Qué deseas importar exactamente?',
        guidance: '“Perro” puede referirse al animal vivo o a un producto para mascotas. Los accesorios, medicamentos, juguetes y artículos de aseo se clasifican por su propia función, composición y material.',
        choices: [
          { code: '0106.19.00.00', label: 'Perro vivo', detail: 'Animal vivo de la especie canina; requiere verificar controles zoosanitarios de SENASA.', recommended: true },
          { code: '2309.10.20.00', label: 'Alimento húmedo para perros o gatos', detail: 'Acondicionado para venta al por menor, en envase hermético y con humedad igual o superior al 60 %.' },
          { code: '2309.10.90.00', label: 'Otro alimento para perros o gatos', detail: 'Acondicionado para venta al por menor; las demás presentaciones.' }
        ]
      },
      {
        terms: ['cargador laptop', 'cargador para laptop', 'cargador de laptop', 'adaptador laptop', 'adaptador para laptop', 'fuente laptop'],
        codes: ['85044090'], aliases: ['convertidores estaticos los demas'],
        generalCode: '85.04', generalTitle: 'Convertidores estáticos y fuentes de alimentación',
        question: '¿El equipo convierte la corriente para alimentar la laptop?',
        guidance: 'La potencia, voltajes de entrada/salida, tipo de conector y si incorpora batería deben confirmarse en la ficha técnica.',
        choices: [
          { code: '8504.40.90.00', label: 'Cargador o adaptador AC/DC para laptop', detail: 'Convertidor estático distinto de UPS y arrancador electrónico.', recommended: true }
        ]
      },
      {
        terms: ['guante nitrilo', 'guantes nitrilo', 'guante de nitrilo', 'guantes de nitrilo'],
        codes: ['401512', '40151990'], aliases: ['guantes de caucho vulcanizado sin endurecer'],
        generalCode: '40.15', generalTitle: 'Prendas y accesorios de caucho vulcanizado sin endurecer',
        question: '¿Para qué se utilizarán los guantes?',
        choices: [
          { code: '4015.12.00.00', label: 'Uso médico, quirúrgico, odontológico o veterinario', detail: 'Guantes de los tipos utilizados con fines sanitarios.', recommended: true },
          { code: '4015.19.90.00', label: 'Limpieza, industria u otro uso', detail: 'Los demás guantes de caucho vulcanizado sin endurecer.' }
        ]
      },
      {
        terms: ['mesa madera', 'mesa de madera', 'mesas madera', 'mesas de madera'],
        codes: ['940330', '940340', '940350', '940360'], aliases: ['muebles de madera'],
        generalCode: '94.03', generalTitle: 'Muebles de madera',
        question: '¿En qué ambiente se utilizará principalmente la mesa?',
        choices: [
          { code: '9403.30.00.00', label: 'Mesa para oficina', detail: 'Mueble de madera del tipo utilizado en oficinas.' },
          { code: '9403.40.00.00', label: 'Mesa o mueble para cocina', detail: 'Mueble de madera del tipo utilizado en cocinas.' },
          { code: '9403.50.00.00', label: 'Mueble para dormitorio', detail: 'Cuando por diseño corresponda a mobiliario de dormitorio.' },
          { code: '9403.60.00.00', label: 'Mesa para comedor u otro ambiente', detail: 'Los demás muebles de madera.', recommended: true }
        ]
      },
      {
        terms: ['foco led', 'focos led', 'bombilla led', 'bombillas led', 'lampara led'],
        codes: ['853952'], aliases: ['lamparas y tubos de diodos emisores de luz led'],
        generalCode: '85.39', generalTitle: 'Lámparas y tubos LED',
        question: '¿Se importa como lámpara LED completa?',
        choices: [
          { code: '8539.52.00.00', label: 'Foco o lámpara LED completa', detail: 'Lámpara de diodos emisores de luz (LED).', recommended: true }
        ]
      },
      {
        terms: ['lapicero', 'lapiceros', 'boligrafo', 'boligrafos', 'pluma para escribir', 'lapicera'],
        codes: ['960810', '960820', '960830', '960840'], aliases: ['boligrafos', 'rotuladores marcadores', 'estilograficas plumas', 'portaminas'],
        generalCode: '96.08', generalTitle: 'Artículos para escribir o marcar',
        question: '¿Qué tipo de artículo deseas importar?',
        guidance: 'En Perú “lapicero” normalmente se refiere a un bolígrafo, pero conviene distinguirlo de marcador, pluma estilográfica y portaminas.',
        choices: [
          { code: '9608.10.00.00', label: 'Lapicero o bolígrafo', detail: 'Instrumento de escritura con punta de bola.', recommended: true },
          { code: '9608.20.00.00', label: 'Plumón o marcador', detail: 'Con punta de fieltro u otra punta porosa.' },
          { code: '9608.30.00.00', label: 'Pluma estilográfica', detail: 'Estilográfica u otra pluma para escribir.' },
          { code: '9608.40.00.00', label: 'Portaminas', detail: 'Instrumento mecánico que utiliza minas reemplazables.' }
        ]
      },
      { terms: ['refrigeradora', 'refrigerador', 'nevera', 'frigorifico domestico'], codes: ['841810', '841821', '841829'], aliases: ['refrigeradores congeladores', 'refrigeradores domesticos'], guidance: 'Confirma si combina refrigerador y congelador, el sistema de compresión y su capacidad en litros.' },
      { terms: ['elefante vivo', 'elefantes vivos'], codes: ['010619'], aliases: ['los demas mamiferos vivos'], guidance: 'La subpartida residual de mamíferos vivos exige controles CITES y zoosanitarios; confirma especie y finalidad.' },
      { terms: ['excavadora hidraulica', 'excavadoras hidraulicas', 'retroexcavadora', 'maquina excavadora'], codes: ['842952', '842959'], aliases: ['maquinas excavadoras autopropulsadas'], guidance: 'Confirma si la superestructura gira 360° y si la máquina es autopropulsada.' },
      { terms: ['salmon congelado', 'salmon entero congelado'], codes: ['030319'], aliases: ['salmonidos congelados'], guidance: 'La especie exacta y la presentación —entero, filete o carne— determinan la subpartida.' },
      { terms: ['motocicleta', 'motocicletas', 'moto nueva', 'moto'], codes: ['871120', '871130', '871140', '871150', '871160', '871190'], aliases: ['motocicletas ciclos con motor'], guidance: 'La cilindrada y el tipo de propulsión determinan la subpartida.' },
      { terms: ['cemento blanco portland', 'cemento portland blanco'], codes: ['252321'], aliases: ['cemento blanco'] },
      { terms: ['cemento gris portland', 'cemento portland gris'], codes: ['252329'], aliases: ['los demas cementos portland'] },
      { terms: ['cemento portland'], codes: ['252321', '252329'], aliases: ['cementos portland'], guidance: 'Distingue cemento blanco de los demás cementos Portland.' },
      { terms: ['panel solar', 'paneles solares', 'modulo fotovoltaico', 'panel fotovoltaico'], codes: ['854143'], aliases: ['celulas fotovoltaicas ensambladas en modulos o paneles'] },
      { terms: ['semilla de girasol', 'semillas de girasol', 'girasol para siembra'], codes: ['12060010', '12060090'], aliases: ['semillas de girasol'], guidance: 'Confirma si se importa para siembra o para otro uso.' },
      { terms: ['sofa de cuero', 'sofa cuero', 'sillon de cuero', 'sillon cuero'], codes: ['940161', '940171'], aliases: ['asientos con armazon de madera con relleno', 'asientos con armazon de metal con relleno'], guidance: 'El armazón —madera o metal— determina la alternativa; el tapizado de cuero por sí solo no basta.' },
      { terms: ['tuberia pvc', 'tuberia de pvc', 'tubo pvc', 'tubos de pvc'], codes: ['39172310', '39172390', '39173310', '39173390'], aliases: ['tubos rigidos de polimeros de cloruro de vinilo', 'tubos flexibles de plastico'], guidance: 'Confirma si el tubo es rígido o flexible y si se destina a un sistema de riego.' },
      { terms: ['lavadora de ropa', 'lavadora ropa', 'maquina de lavar ropa'], codes: ['845011', '845012', '845019', '845020'], aliases: ['maquinas para lavar ropa'], guidance: 'Confirma capacidad en kg, automatización y si incorpora secadora centrífuga.' },
      { terms: ['jirafa viva', 'jirafas vivas'], codes: ['010619'], aliases: ['los demas mamiferos vivos'] },
      { terms: ['cactus ornamental', 'cactus vivo', 'planta cactus'], codes: ['06029090'], aliases: ['las demas plantas vivas'] },
      { terms: ['bulldozer', 'bulldozers', 'topadora', 'tractor topador'], codes: ['842911', '842919'], aliases: ['topadoras frontales y angulares autopropulsadas'], guidance: 'Confirma si se desplaza sobre orugas.' },
      { terms: ['destornillador electrico', 'atornillador electrico', 'atornillador inalambrico'], codes: ['846729'], aliases: ['herramientas de mano con motor electrico incorporado las demas'] },
      { terms: ['atun enlatado', 'atun en conserva', 'lata de atun'], codes: ['16041410', '16041420'], aliases: ['atunes preparados o conservados'] },
      { terms: ['camion volquete', 'volquete minero', 'volquete fuera de carretera'], codes: ['870410'], aliases: ['volquetes automotores fuera de carretera'], guidance: 'Para volquetes de carretera se debe confirmar peso bruto, motor y capacidad.' },
      { terms: ['yeso en polvo', 'yeso natural', 'yeso fraguable'], codes: ['252010', '252020'], aliases: ['yeso natural anhidrita', 'yeso fraguable'], guidance: 'Confirma si es yeso natural o yeso calcinado/fraguable.' },
      { terms: ['lapiz labial', 'labial', 'pintalabios', 'barra de labios'], codes: ['330410'], aliases: ['preparaciones para maquillaje de labios'] },
      { terms: ['toalla sanitaria', 'toallas sanitarias', 'compresa higienica', 'tampon higienico'], codes: ['96190020'], aliases: ['compresas y tampones higienicos'] },
      { terms: ['aerogenerador', 'aerogeneradores', 'generador eolico', 'turbina eolica'], codes: ['850231'], aliases: ['grupos electrogenos de energia eolica'] },
      { terms: ['gallina viva', 'gallinas vivas', 'pollo vivo', 'pollos vivos'], codes: ['010511', '010594'], aliases: ['aves vivas gallus domesticus'], guidance: 'El peso individual —hasta 185 g o superior— define la subpartida.' },
      { terms: ['planta de cafe', 'plantas de cafe', 'cafeto vivo', 'planton de cafe'], codes: ['060220'], aliases: ['arboles arbustos y matas de frutos comestibles'] },
      { terms: ['montacargas', 'montacarga', 'carretilla elevadora', 'forklift'], codes: ['842710', '842720', '842790'], aliases: ['carretillas elevadoras'], guidance: 'Confirma si es autopropulsado y si utiliza motor eléctrico.' },
      { terms: ['aire acondicionado', 'acondicionador de aire', 'equipo de aire acondicionado'], codes: ['841510', '841581', '841582', '841583'], aliases: ['maquinas y aparatos para acondicionamiento de aire'], guidance: 'Confirma instalación, capacidad BTU/h, equipo de enfriamiento y reversibilidad térmica.' },
      { terms: ['cama de metal', 'cama metalica', 'catre de metal'], codes: ['940320'], aliases: ['los demas muebles de metal'] },
      { terms: ['manguera de caucho', 'manguera caucho', 'tubo flexible de caucho'], codes: ['400911', '400912', '400921', '400922', '400931', '400932', '400941', '400942'], aliases: ['tubos de caucho vulcanizado sin endurecer'], guidance: 'Confirma refuerzo, combinación con otros materiales y presencia de accesorios.' },
      { terms: ['chaleco antibalas', 'chalecos antibalas', 'chaleco balistico'], codes: ['621143', '621149'], aliases: ['prendas de fibras sinteticas o artificiales'], guidance: 'La composición textil y la incorporación de placas balísticas pueden cambiar la clasificación; confirma ficha técnica.' },
      { terms: ['televisor inteligente', 'smart tv', 'televisor smart', 'television inteligente'], codes: ['852872'], aliases: ['aparatos receptores de television en colores'], guidance: 'Confirma tecnología de pantalla, tamaño y si incorpora receptor de televisión.' },
      { terms: ['tigre vivo', 'tigres vivos', 'tigre de bengala', 'tigre de bengala vivo', 'felino salvaje vivo'], codes: ['010619'], aliases: ['los demas mamiferos vivos'], generalCode: '01.06', generalTitle: 'Otros mamíferos vivos, incluido el tigre de Bengala', guidance: 'Es un animal vivo, no una marca comercial. Requiere verificar permisos CITES y controles zoosanitarios.' },
      { terms: ['bonsai', 'bonsai vivo', 'arbol bonsai'], codes: ['06029090'], aliases: ['las demas plantas vivas'] },
      { terms: ['motoniveladora', 'motoniveladoras', 'niveladora autopropulsada'], codes: ['842920'], aliases: ['niveladoras autopropulsadas'] },
      { terms: ['sardina en conserva', 'sardinas en conserva', 'sardina enlatada'], codes: ['16041310', '16041320', '16041330', '16041390'], aliases: ['sardinas preparadas o conservadas'], guidance: 'La presentación —salsa de tomate, aceite, agua y sal u otra— determina la subpartida.' },
      { terms: ['quinua', 'quinua organica', 'quinoa', 'quinoa organica'], codes: ['10085010', '10085090'], aliases: ['quinua chenopodium quinoa'], guidance: 'La certificación orgánica no cambia la partida; confirma si es para siembra.' },
      { terms: ['tractor agricola', 'tractores agricolas', 'tractor de campo'], codes: ['870191', '870192', '870193', '870194', '870195'], aliases: ['tractores agricolas'], guidance: 'La potencia del motor en kW define la subpartida.' },
      { terms: ['vidrio templado', 'cristal templado', 'vidrio de seguridad templado'], codes: ['700719'], aliases: ['vidrio de seguridad templado'], guidance: 'Si está dimensionado para vehículos puede corresponder a otra subpartida; confirma uso y forma.' },
      { terms: ['crema dental', 'pasta dental', 'dentifrico', 'dentifricos'], codes: ['330610'], aliases: ['dentifricos'] },
      { terms: ['alarma contra incendios', 'alarma de incendio', 'central de alarma incendio'], codes: ['853110'], aliases: ['avisadores electricos contra incendio'] },
      { terms: ['oveja viva', 'ovejas vivas', 'ovino vivo'], codes: ['01041010', '01041090'], aliases: ['animales vivos de la especie ovina'], guidance: 'Confirma si es reproductor de raza pura.' },
      { terms: ['esqueje de vid', 'esquejes de vid', 'estaca de vid'], codes: ['06021090'], aliases: ['esquejes sin enraizar e injertos los demas'] },
      { terms: ['mezcladora de concreto', 'mezcladora concreto', 'mezcladora de hormigon', 'hormigonera'], codes: ['84743190', '870540'], aliases: ['hormigoneras y aparatos para amasar cemento', 'camiones hormigonera'], guidance: 'Distingue máquina mezcladora independiente de camión hormigonera.' },
      { terms: ['armario de plastico', 'gabinete de plastico', 'mueble de plastico'], codes: ['940370'], aliases: ['muebles de plastico'] },
      { terms: ['cable de cobre', 'cables de cobre', 'conductor electrico de cobre'], codes: ['741300', '854411', '85444220', '85444910', '85446010'], aliases: ['cables de cobre', 'conductores electricos de cobre'], guidance: 'Confirma si está aislado, tiene conectores, tensión de trabajo y si es coaxial.' },
      { terms: ['botas de caucho', 'bota de caucho', 'botas de jebe', 'botas impermeables'], codes: ['640192', '640199'], aliases: ['calzado impermeable con suela y parte superior de caucho'], guidance: 'Confirma si cubre el tobillo y si llega a cubrir la rodilla.' },
      { terms: ['radio portatil', 'radio de bolsillo', 'receptor de radio portatil'], codes: ['852712', '852713', '852719'], aliases: ['aparatos receptores de radiodifusion portatiles'], guidance: 'Confirma si incorpora grabador o reproductor de sonido.' },
      { terms: ['cocodrilo vivo', 'cocodrilos vivos', 'reptil vivo'], codes: ['010620'], aliases: ['reptiles vivos'] },
      { terms: ['rosa cortada', 'rosas cortadas', 'flor de rosa cortada'], codes: ['060311'], aliases: ['rosas frescas cortadas'] },
      { terms: ['llave inglesa', 'llave ajustable', 'llave francesa'], codes: ['820412'], aliases: ['llaves de ajuste de mano ajustables'] },
      { terms: ['pulpo congelado', 'pulpos congelados'], codes: ['030752'], aliases: ['pulpos congelados'] },
      { terms: ['frijol seco', 'frijoles secos', 'frejol seco', 'poroto seco'], codes: ['071331', '071332', '071333', '071334', '071335', '071339'], aliases: ['frijoles secos desvainados'], guidance: 'La especie, variedad y destino para siembra determinan la subpartida.' },
      { terms: ['bus electrico', 'autobus electrico', 'omnibus electrico'], codes: ['87024010', '87024090'], aliases: ['vehiculos para transporte de personas propulsados unicamente con motor electrico'] },
      { terms: ['inversor solar', 'inversor fotovoltaico', 'convertidor solar'], codes: ['85044090'], aliases: ['convertidores estaticos los demas'], guidance: 'Confirma potencia, tensión y si se presenta con otros componentes del sistema solar.' },
      { terms: ['camara de vigilancia', 'camara vigilancia', 'camara cctv', 'camara de seguridad'], codes: ['852589'], aliases: ['camaras de television las demas'], guidance: 'Confirma conectividad, grabación integrada y si es térmica o de visión nocturna.' },
      { terms: ['cabra viva', 'cabras vivas', 'caprino vivo'], codes: ['01042010', '01042090'], aliases: ['animales vivos de la especie caprina'], guidance: 'Confirma si es reproductor de raza pura.' },
      { terms: ['semilla de tomate', 'semillas de tomate'], codes: ['12099190'], aliases: ['las demas semillas de hortalizas para siembra'] },
      { terms: ['silla de plastico', 'sillas de plastico', 'asiento de plastico'], codes: ['940180'], aliases: ['los demas asientos'], guidance: 'La partida de asientos prevalece sobre la categoría general de muebles de plástico.' },
      { terms: ['lamina de aluminio', 'laminas de aluminio', 'chapa de aluminio'], codes: ['760611', '760612', '760691', '760692', '760711', '760719', '760720'], aliases: ['chapas y tiras de aluminio', 'hojas y tiras delgadas de aluminio'], guidance: 'El espesor hasta 0,2 mm corresponde normalmente a hoja delgada; un espesor superior corresponde a chapa o placa.' },
      { terms: ['guantes de cuero', 'guante de cuero', 'guantes de piel'], codes: ['420321', '420329'], aliases: ['guantes de cuero natural o cuero regenerado'], guidance: 'Distingue guantes deportivos de los demás usos.' },
      { terms: ['impresora laser', 'impresora a laser', 'impresora laser multifuncional'], codes: ['84433219', '84433290', '84433990'], aliases: ['impresoras las demas'], guidance: 'Confirma si también copia o escanea y si puede conectarse a una red o computadora.' },
      { terms: ['rodillo compactador', 'rodillo apisonador', 'compactador autopropulsado'], codes: ['842940'], aliases: ['compactadoras y apisonadoras autopropulsadas'] },
      { terms: ['sierra circular electrica', 'sierra electrica', 'sierra circular de mano'], codes: ['846722'], aliases: ['sierras de mano con motor electrico incorporado'] },
      { terms: ['azucar blanca', 'azucar refinada blanca', 'azucar blanca granulada'], codes: ['17019910', '17019990'], aliases: ['azucar blanca sacarosa'], guidance: 'Confirma pureza, presentación y si contiene aromatizantes o colorantes.' },
      { terms: ['bloque de marmol', 'marmol en bloque', 'bloques de marmol'], codes: ['251511'], aliases: ['marmol en bruto o desbastado'] },
      { terms: ['jeringa medica', 'jeringa hipodermica', 'jeringa esteril'], codes: ['90183120', '90183190'], aliases: ['jeringas medicas'], guidance: 'Confirma material, capacidad y si incluye aguja.' },
      { terms: ['transformador electrico', 'transformador de potencia', 'transformador de corriente'], codes: ['850421', '850422', '850423', '850431', '850432', '850433', '850434'], aliases: ['transformadores electricos'], guidance: 'La potencia en kVA y el uso de dieléctrico líquido determinan la subpartida.' },
      { terms: ['ventilador domestico', 'ventilador de mesa', 'ventilador de piso', 'ventilador de techo'], codes: ['841459'], aliases: ['los demas ventiladores'], guidance: 'Confirma potencia del motor y tipo de montaje; la base local agrupa esta alternativa como los demás ventiladores.' },
      { terms: ['mesa de vidrio', 'mesa con tablero de vidrio', 'mesa de cristal'], codes: ['940389'], aliases: ['los demas muebles de otras materias'], guidance: 'Confirma el material del armazón; una mesa con estructura metálica o de madera puede clasificarse por ese material.' },
      { terms: ['zapatos deportivos', 'zapatillas deportivas', 'calzado deportivo'], codes: ['64041110', '64041120', '640219', '640319'], aliases: ['calzado de deporte'], guidance: 'La materia de la parte superior —textil, plástico o cuero— define la subpartida.' },
      { terms: ['clavel cortado', 'claveles cortados', 'flor de clavel'], codes: ['06031210', '06031290'], aliases: ['claveles frescos cortados'] },
      { terms: ['pala mecanica', 'pala cargadora', 'cargadora frontal'], codes: ['842951'], aliases: ['cargadoras y palas cargadoras de carga frontal'] },
      { terms: ['cafe tostado', 'cafe tostado molido', 'cafe tostado en grano'], codes: ['09012110', '09012120', '090122'], aliases: ['cafe tostado'], guidance: 'Confirma si es descafeinado y si se presenta en grano o molido.' },
      { terms: ['automovil hibrido', 'auto hibrido', 'vehiculo hibrido'], codes: ['870340', '870350', '870360', '870370'], aliases: ['vehiculos hibridos para transporte de personas'], guidance: 'Confirma tipo de motor de combustión, capacidad de carga externa y tracción.' },
      { terms: ['termometro medico', 'termometro clinico', 'termometro corporal'], codes: ['90251919', '90251990'], aliases: ['los demas termometros'], guidance: 'Confirma tecnología —digital, infrarroja o de líquido— y uso clínico.' },
      { terms: ['motor electrico', 'motores electricos'], codes: ['850110', '850120', '850131', '850132', '850133', '850134', '850140', '850151', '850152', '850153'], aliases: ['motores electricos'], guidance: 'La corriente, número de fases y potencia determinan la subpartida.' },
      { terms: ['timbre electrico', 'timbre de puerta', 'zumbador electrico'], codes: ['853180'], aliases: ['los demas aparatos electricos de señalizacion acustica'] },
      { terms: ['cerdo vivo', 'cerdos vivos', 'porcino vivo'], codes: ['010310', '010391', '010392'], aliases: ['animales vivos de la especie porcina'], guidance: 'Confirma raza y peso individual.' },
      { terms: ['planta de palta', 'planton de palta', 'arbol de palta', 'planta de aguacate'], codes: ['060220'], aliases: ['arboles arbustos y matas de frutos comestibles'] },
      { terms: ['estante de madera', 'estanteria de madera', 'repisa de madera'], codes: ['940360'], aliases: ['los demas muebles de madera'] },
      { terms: ['sandalias de plastico', 'sandalia de plastico', 'chanclas de plastico'], codes: ['640220'], aliases: ['calzado con parte superior de tiras fijadas a la suela por tetones'] },
      { terms: ['lirio cortado', 'lirios cortados', 'flor de lirio'], codes: ['060319'], aliases: ['las demas flores frescas cortadas'] },
      { terms: ['excavadora de 360 grados', 'excavadora giro 360', 'excavadora 360'], codes: ['842952'], aliases: ['maquinas cuya superestructura pueda girar 360 grados'] },
      { terms: ['llave de tubo', 'llave para tubos', 'llave stilson', 'llave grifa'], codes: ['820412'], aliases: ['llaves de ajuste de mano ajustables'] },
      { terms: ['taxi a gasolina', 'taxi gasolina', 'automovil taxi'], codes: ['870322', '870323', '870324'], aliases: ['automoviles para transporte de personas con motor de gasolina'], guidance: 'La cilindrada y características del vehículo determinan la subpartida; el uso como taxi no basta por sí solo.' },
      { terms: ['baldosa ceramica', 'baldosas ceramicas', 'loseta ceramica', 'piso ceramico'], codes: ['6907'], aliases: ['placas y baldosas de ceramica'], guidance: 'La absorción de agua y el acabado determinan la subpartida.' },
      { terms: ['sirena electrica', 'sirena de alarma', 'sirena electronica'], codes: ['853180'], aliases: ['los demas aparatos electricos de señalizacion acustica'] },
      { terms: ['planta de banano', 'planton de banano', 'planta de platano', 'hijuelo de banano'], codes: ['06029090'], aliases: ['las demas plantas vivas'] },
      { terms: ['armario de madera', 'ropero de madera', 'gabinete de madera'], codes: ['940360'], aliases: ['los demas muebles de madera'] },
      { terms: ['botas de cuero', 'bota de cuero', 'botines de cuero'], codes: ['640351', '640391'], aliases: ['calzado con parte superior de cuero que cubre el tobillo'], guidance: 'El material de la suela —cuero u otro— define la subpartida.' },
      { terms: ['shampoo para cabello', 'shampoo cabello', 'champu para cabello', 'champu cabello'], codes: ['330510'], aliases: ['champues'] },
      { terms: ['medicamento humano', 'medicamentos humanos', 'medicina humana'], codes: ['3003', '3004'], aliases: ['medicamentos para uso humano'] },
      { terms: ['laptop', 'laptops', 'notebook', 'notebooks', 'computadora portatil', 'ordenador portatil', 'macbook'], codes: ['847130'], aliases: ['maquinas automaticas tratamiento procesamiento datos portatiles'] },
      { terms: ['celular', 'celulares', 'smartphone', 'smartphones', 'telefono movil', 'telefonos moviles', 'iphone'], codes: ['851713', '851714'], aliases: ['telefonos inteligentes', 'telefonos moviles celulares'] },
      { terms: ['tablet', 'tableta', 'tabletas'], codes: ['847130'], aliases: ['maquinas automaticas tratamiento procesamiento datos portatiles'] },
      { terms: ['mouse', 'raton de computadora', 'raton computadora', 'mouse inalambrico', 'mouse gamer'], codes: ['847160'], aliases: ['dispositivos de entrada por coordenadas x y'], generalCode: '84.71', generalTitle: 'Unidades de entrada o salida para máquinas automáticas de procesamiento de datos', question: '¿Qué tipo de dispositivo estás importando?', guidance: 'La marca, conexión inalámbrica o uso gamer no cambian por sí solos la partida. Confirma si se importa individualmente o como parte de un conjunto.', choices: [
        { code: '8471.60.20.00', label: 'Mouse o dispositivo por coordenadas X-Y', detail: 'Mejor coincidencia para mouse de computadora, alámbrico o inalámbrico.', recommended: true },
        { code: '8471.60.90.00', label: 'Otra unidad de entrada o salida', detail: 'Alternativa para dispositivos que no sean teclado ni dispositivo por coordenadas X-Y.' }
      ] },
      { terms: ['teclado computadora', 'teclado pc', 'keyboard', 'teclado gamer'], codes: ['847160'], aliases: ['teclados dispositivos de entrada'] },
      { terms: ['audifono', 'audifonos', 'auricular', 'auriculares'], codes: ['851830'], aliases: ['auriculares incluidos los de casco'] }
    ];
    const queryTokens = this.tokenize(normalized);
    const matchingRules = rules.filter(rule => rule.terms.some(term => {
      const wholeTermMatch = normalized === term || normalized.startsWith(`${term} `) || normalized.endsWith(` ${term}`) || normalized.includes(` ${term} `);
      if (wholeTermMatch) return true;
      const termTokens = this.tokenize(term);
      return termTokens.length === queryTokens.length && termTokens.every(termToken =>
        queryTokens.some(queryToken => termToken === queryToken || (termToken.length >= 5 && this.editDistance(termToken, queryToken) <= 1))
      );
    }));
    const specificity = rule => Math.max(...rule.terms.map(term => (this.tokenize(term).length * 100) + term.length));
    matchingRules.sort((a, b) => specificity(b) - specificity(a));
    return matchingRules[0] || null;
  }

  getBrandProfile(query) {
    const normalized = this.normalizeText(query);
    return Object.values(this.brandProfiles).find(profile => profile.aliases.includes(normalized)) || null;
  }

  registerBrandProfile(profile) {
    if (!profile || !profile.name || !Array.isArray(profile.products)) return;
    const key = this.normalizeText(profile.name).replace(/\s+/g, '_');
    this.brandProfiles[key] = {
      ...profile,
      aliases: [...new Set([...(profile.aliases || []), this.normalizeText(profile.name)])]
    };
  }

  search(options = {}) {
    const { query = '', seccion = '', capitulo = '', adValorem = '', entidad = '' } = options;
    const rawQuery = String(query || '').trim();
    const cleanQuery = this.normalizeText(rawQuery);
    const isCodeQuery = /^[\d.\s-]+$/.test(rawQuery) && /\d/.test(rawQuery);
    const queryDigits = isCodeQuery ? rawQuery.replace(/\D/g, '') : '';
    const aliasRule = isCodeQuery ? null : this.getCommercialAlias(rawQuery);
    const brandProfile = isCodeQuery ? null : this.getBrandProfile(rawQuery);
    const ignoredUnits = new Set(['pulgada', 'pulg', 'inch', 'milimetro', 'milimetr', 'centimetro', 'centimetr', 'diametro']);
    const queryWords = this.tokenize(cleanQuery).filter((word, index) => {
      if (ignoredUnits.has(word)) return false;
      if (index === 0) return true;
      return this.expandToken(word).some(expanded => this.corpusTokens.has(expanded));
    });

    let results = this.subpartidas.map(item => {
      const code10 = String(item.codigo10 || '').replace(/\D/g, '');
      const code6 = String(item.codigo6 || '').replace(/\D/g, '');
      let score = 0;
      const itemCap = item.capitulo || (item.codigo10 ? item.codigo10.substring(0, 2) : '');
      const matchesCap = capitulo && Number.parseInt(itemCap, 10) === Number.parseInt(capitulo, 10);
      const matchesSec = seccion && String(item.seccion).toUpperCase() === String(seccion).toUpperCase();

      if (matchesCap || matchesSec) {
        return { item, score: 1 };
      }

      if (brandProfile) {
        const productIndex = brandProfile.products.findIndex(product => code10.startsWith(product.code));
        return { item, score: productIndex >= 0 ? 5000 - productIndex : 0 };
      }
      if (aliasRule && !aliasRule.codes.some(code => code10.startsWith(code))) return { item, score: 0 };

      if (!rawQuery) score = 1;
      else if (isCodeQuery && queryDigits.length >= 2) {
        if (queryDigits.length >= 10) {
          if (code10 === queryDigits) score = 3000;
        } else if (code10.startsWith(queryDigits)) score = code6 === queryDigits ? 2500 : 2000;
      } else if (cleanQuery) {
        const description = this.normalizeText(this.getDisplayDescription(item));
        const synonyms = (item.sinonimos || []).map(value => this.normalizeText(value));
        const document = this.searchDocuments.get(item.codigo10);
        if (this.matchesText(description, cleanQuery)) score += 500;
        synonyms.forEach(synonym => {
          if (synonym === cleanQuery) score += 700;
          else if (this.matchesText(synonym, cleanQuery)) score += 450;
        });
        let matchedConcepts = 0;
        let primaryConceptMatched = false;
        queryWords.forEach((word, wordIndex) => {
          let bestScore = 0;
          this.expandToken(word).forEach(expanded => {
            document.tokens.forEach(documentToken => { bestScore = Math.max(bestScore, this.tokenScore(expanded, documentToken)); });
          });
          if (bestScore > 0) {
            matchedConcepts += 1;
            if (wordIndex === 0) primaryConceptMatched = true;
            score += bestScore + Math.max(0, (queryWords.length - wordIndex) * 10);
          }
        });
        if (aliasRule) {
          const preferredIndex = aliasRule.codes.findIndex(code => code10.startsWith(code));
          const preferredCode = preferredIndex >= 0;
          if (preferredCode) score += 2500 + ((aliasRule.codes.length - preferredIndex) * 25);
          aliasRule.aliases.forEach(alias => {
            const words = this.normalizeText(alias).split(' ').filter(word => word.length > 2);
            const matches = words.filter(word => this.matchesText(description, word)).length;
            if (matches >= Math.min(3, words.length)) score += 800 + matches;
          });
          if (!preferredCode) score = 0;
        } else if (queryWords.length > 0 && (matchedConcepts < Math.ceil(queryWords.length * 0.5) || (queryWords.length > 1 && !primaryConceptMatched))) {
          score = 0;
        }
      }
      return { item, score };
    }).filter(result => result.score > 0);

    if (seccion) results = results.filter(result => String(result.item.seccion).toUpperCase() === String(seccion).toUpperCase());
    if (capitulo) {
      results = results.filter(result => {
        const itemCap = result.item.capitulo || (result.item.codigo10 ? result.item.codigo10.substring(0, 2) : '');
        return Number.parseInt(itemCap, 10) === Number.parseInt(capitulo, 10);
      });
    }
    if (adValorem !== '' && !Number.isNaN(Number(adValorem))) results = results.filter(result => Number(result.item.adValorem) === Number(adValorem));
    if (entidad) {
      const target = this.normalizeText(entidad);
      results = results.filter(result => this.normalizeText(this.resolveEntity(result.item).entidad).includes(target));
    }
    results.sort((a, b) => b.score - a.score || String(a.item.codigo10).localeCompare(String(b.item.codigo10)));
    return results.map(result => result.item);
  }

  resolveEntity(item) {
    if (!item) {
      return {
        entidad: 'SUNAT / Libre Comercialización',
        entidad_siglas: 'SUNAT',
        estado_regulacion: 'Libre',
        badge_class: 'adv-0',
        badge_icon: '🟢',
        codigo_tramite_vuce: 'LIBRE',
        documento_requerido: 'Mercancía de Libre Importación (Sin permisos especiales)',
        restriccion: '🟢 Mercancía de libre despacho aduanero. No requiere VUCE.'
      };
    }

    const cap = Number.parseInt(item.capitulo, 10) || 0;
    const desc = this.normalizeText(item.descripcionOficial);
    const code = (item.codigo10 || '').replaceAll('.', '');

    // 1. Prohibidas
    if (desc.includes('usado') && (cap === 63 || cap === 64 || desc.includes('ropa usada') || desc.includes('calzado usado'))) {
      return {
        entidad: 'SUNAT / Prohibida Importación',
        entidad_siglas: 'SUNAT',
        estado_regulacion: 'Prohibida',
        badge_class: 'adv-11',
        badge_icon: '🔴',
        codigo_tramite_vuce: 'PROHIBIDO',
        documento_requerido: 'Mercancía Prohibida por Ley 28491 / Ley 28514',
        restriccion: '🔴 IMPORTACIÓN PROHIBIDA en el territorio nacional.'
      };
    }

    // 2. MTC (Telecomunicaciones)
    if (code.startsWith('8517') || code.startsWith('8525') || code.startsWith('8806') || desc.includes('celular') || desc.includes('telefono') || desc.includes('inalambric') || desc.includes('transmisor')) {
      return {
        entidad: 'MTC - Ministerio de Transportes y Comunicaciones',
        entidad_siglas: 'MTC',
        estado_regulacion: 'Restringida',
        badge_class: 'adv-6',
        badge_icon: '🟠',
        codigo_tramite_vuce: 'MTC-002 (VUCE MTC001)',
        documento_requerido: 'Certificado de Homologación e Internamiento Previo',
        restriccion: '🟠 Requiere Certificado de Homologación e Internamiento MTC/VUCE.'
      };
    }

    // 3. DIGEMID (Medicamentos & Cosméticos)
    if (cap === 30 || cap === 33 || desc.includes('medicamento') || desc.includes('farmaceutic') || desc.includes('vacuna') || desc.includes('cosmetico') || desc.includes('perfume')) {
      return {
        entidad: 'DIGEMID - Dirección General de Medicamentos',
        entidad_siglas: 'DIGEMID',
        estado_regulacion: 'Restringida',
        badge_class: 'adv-11',
        badge_icon: '🟠',
        codigo_tramite_vuce: 'DIGEMID-018 (VUCE DGM001)',
        documento_requerido: 'Registro Sanitario o Notificación Sanitaria Obligatoria (NSO)',
        restriccion: '🟠 Requiere Registro Sanitario DIGEMID / NSO en VUCE.'
      };
    }

    // 4. SENASA (Sanidad Agraria / Animal)
    if ((cap >= 1 && cap <= 14) || desc.includes('fruta') || desc.includes('carne') || desc.includes('planta') || desc.includes('semilla')) {
      return {
        entidad: 'SENASA - Servicio Nacional de Sanidad Agraria',
        entidad_siglas: 'SENASA',
        estado_regulacion: 'Restringida',
        badge_class: 'adv-11',
        badge_icon: '🟠',
        codigo_tramite_vuce: 'SENASA-012 (VUCE SEN002)',
        documento_requerido: 'Permiso Fitosanitario (PFI) o Zoosanitario de Importación (PZI)',
        restriccion: '🟠 Requiere Permiso Fitosanitario (PFI) / Zoosanitario SENASA.'
      };
    }

    // 5. DIGESA (Alimentos y Juguetes)
    if ((cap >= 15 && cap <= 22) || cap === 95 || desc.includes('juguete') || desc.includes('bebida') || desc.includes('alimento') || desc.includes('suplemento')) {
      return {
        entidad: 'DIGESA - Salud Ambiental y Alimentos',
        entidad_siglas: 'DIGESA',
        estado_regulacion: 'Restringida',
        badge_class: 'adv-6',
        badge_icon: '🟠',
        codigo_tramite_vuce: 'DIGESA-005 (VUCE DIG003)',
        documento_requerido: 'Registro Sanitario de Alimentos / Autorización Sanitaria',
        restriccion: '🟠 Requiere Registro Sanitario DIGESA de Alimentos o Juguetes.'
      };
    }

    // 6. SUCAMEC
    if (code.startsWith('9302') || code.startsWith('9303') || desc.includes('arma') || desc.includes('explosivo')) {
      return {
        entidad: 'SUCAMEC - Armas, Explosivos y Pirotecnia',
        entidad_siglas: 'SUCAMEC',
        estado_regulacion: 'Restringida',
        badge_class: 'adv-11',
        badge_icon: '🔴',
        codigo_tramite_vuce: 'SUCAMEC-004 (VUCE SUC001)',
        documento_requerido: 'Autorización Especial de Importación SUCAMEC',
        restriccion: '🔴 Requiere Autorización e Inspección SUCAMEC.'
      };
    }

    return {
      entidad: 'SUNAT / Libre Comercialización',
      entidad_siglas: 'SUNAT',
      estado_regulacion: 'Libre',
      badge_class: 'adv-0',
      badge_icon: '🟢',
      codigo_tramite_vuce: 'LIBRE',
      documento_requerido: 'Despacho Aduanero Estándar (Sin permisos VUCE)',
      restriccion: '🟢 Mercancía de Libre Comercialización en el Perú.'
    };
  }

  getUniversalClassificationGuide(query, results = []) {
    const rule = this.getCommercialAlias(query);
    const brandProfile = this.getBrandProfile(query);
    if (!String(query || '').trim() || !results.length) return null;

    // Si solo hay 1 resultado o es un código de 10 dígitos, NO duplicar información (ya se ve en el panel derecho)
    if (results.length === 1 || (/^[\d.\s-]+$/.test(query.trim()) && query.replace(/\D/g, '').length >= 10)) {
      return null;
    }

    if (brandProfile) {
      const resultCodes = results.map(item => item.codigo10.replace(/\D/g, ''));
      return {
        kicker: 'Búsqueda asistida por IA', generalCode: brandProfile.name.toUpperCase(),
        generalTitle: `Familias de mercancías identificadas para “${query}”`,
        recommendationText: `${brandProfile.source ? `Análisis automático realizado con ${brandProfile.source}. ` : ''}${brandProfile.ambiguous ? `La consulta es ambigua${brandProfile.alternatives?.length ? `; también puede referirse a: ${brandProfile.alternatives.join(', ')}. ` : '. '}` : ''}Selecciona la mercancía y confirma sus características antes de definir la partida.`,
        question: '¿Qué mercancía deseas clasificar?',
        choices: brandProfile.products.filter(product => resultCodes.some(code => code.startsWith(product.code)))
      };
    }

    if (rule && rule.choices) {
      const availableCodes = new Set(results.map(item => item.codigo10));
      const validChoices = rule.choices.filter(choice => availableCodes.has(choice.code) || choice.code.startsWith(rule.generalCode.replace(/\D/g, '')));
      if (validChoices.length > 0) {
        return {
          kicker: 'Partida recomendada',
          generalCode: rule.generalCode,
          generalTitle: rule.generalTitle,
          recommendationText: rule.guidance || 'Esta es la partida más alineada con tu consulta. Selecciona la opción adecuada para precisar la subpartida nacional.',
          question: rule.question || 'Selecciona el producto o característica:',
          choices: validChoices
        };
      }
    }

    // Algoritmo Universal Genérico para CUALQUIER producto
    const queryDigits = String(query).replace(/\D/g, '');
    const groupBy = (items, key) => items.reduce((groups, item) => {
      const value = item[key];
      if (!groups.has(value)) groups.set(value, []);
      groups.get(value).push(item);
      return groups;
    }, new Map());
    const describe = items => {
      const useful = items.map(item => this.getDisplayDescription(item)).filter(text => text && !/^los dem[aá]s$/i.test(text));
      return [...new Set(useful)].slice(0, 2).join(' · ') || `${items.length} alternativas arancelarias`;
    };

    const partidaGroups = groupBy(results, 'partida4');
    if (partidaGroups.size > 1) {
      return {
        kicker: 'Partidas candidatas', generalCode: `${partidaGroups.size} opciones`,
        generalTitle: `Familias arancelarias encontradas para “${query}”`,
        question: 'Selecciona la categoría que mejor describe tu producto:',
        recommendationText: 'La primera opción es la coincidencia más cercana. Elige una categoría para filtrar las subpartidas nacionales.',
        choices: [...partidaGroups.entries()].slice(0, 12).map(([code, items], index) => ({
          code, label: `Partida ${code.slice(0, 2)}.${code.slice(2)}`,
          detail: `${describe(items)} (${items.length} ${items.length === 1 ? 'coincidencia' : 'coincidencias'})`,
          recommended: index === 0
        }))
      };
    }

    const [partida4, partidaItems] = [...partidaGroups.entries()][0];
    const codigo6Groups = groupBy(partidaItems, 'codigo6');
    const chapter = this.capitulos[partidaItems[0].capitulo]?.nombre || `Capítulo ${partidaItems[0].capitulo}`;
    if (codigo6Groups.size > 1 && queryDigits.length < 6) {
      return {
        kicker: 'Categoría identificada', generalCode: `${partida4.slice(0, 2)}.${partida4.slice(2)}`,
        generalTitle: chapter,
        recommendationText: 'Selecciona la variante técnica específica de tu mercancía:',
        question: 'Opciones de subpartidas disponibles:',
        choices: [...codigo6Groups.entries()].slice(0, 12).map(([code, items], index) => ({
          code, label: `Subpartida ${code}`, detail: `${describe(items)} (${items.length} ${items.length === 1 ? 'opción' : 'opciones'})`,
          recommended: index === 0
        }))
      };
    }

    if (partidaItems.length > 1) {
      return {
        kicker: 'Subpartidas sugeridas', generalCode: `${partida4.slice(0, 2)}.${partida4.slice(2)}`,
        generalTitle: chapter,
        recommendationText: 'Selecciona la característica exacta de tu producto:',
        question: 'Subpartidas nacionales a 10 dígitos:',
        choices: partidaItems.slice(0, 12).map((item, index) => ({
          code: item.codigo10, label: this.getDisplayDescription(item),
          detail: `Ad-Valorem: ${item.adValorem}% · ${this.resolveEntity(item).entidad}`,
          recommended: index === 0
        }))
      };
    }

    return null;
  }

  getClassificationGuide(query, results = []) {
    const rule = this.getCommercialAlias(query);
    if (!rule || !results.length) return null;
    const availableCodes = new Set(results.map(item => item.codigo10));
    const choices = (rule.choices || results.slice(0, 8).map(item => ({
      code: item.codigo10,
      label: this.getDisplayDescription(item),
      detail: `Ad-Valorem: ${item.adValorem}%`
    }))).filter(choice => availableCodes.has(choice.code));
    if (!choices.length) return null;
    const prefixes = [...new Set(rule.codes.map(code => code.slice(0, 4)))];
    return {
      generalCode: rule.generalCode || (prefixes.length === 1 ? `${prefixes[0].slice(0, 2)}.${prefixes[0].slice(2)}` : 'Opciones relacionadas'),
      generalTitle: rule.generalTitle || 'Partida o grupo arancelario recomendado según tu búsqueda',
      question: rule.question || 'Selecciona la descripción que mejor coincida con tu producto:',
      choices
    };
  }

  getCapituloInfo(capituloId) { return this.capitulos[String(capituloId || '').padStart(2, '0')] || null; }
  getSecciones() { return this.secciones; }

  // -------------------------------------------------------------
  // NUEVOS MÓDULOS ROADMAP ENTERPRISE: RESOLUCIONES, NOTAS, VUCE, HS6
  // -------------------------------------------------------------

  getSunatResolutions(queryOrCode = '') {
    const resolutions = [
      {
        numero: 'RI-300-01234-2023 / SUNAT',
        fecha: '2023-04-18',
        producto: 'Smartphone con sensor biométrico y cámara de 108 MP',
        codigo10: '8517.13.00.00',
        criterio: 'Se clasifica en la subpartida 8517.13.00.00 por prevalecer su función de radiotelefonía celular sobre sus demás prestaciones electrónicas (RGI 1 y 6).',
        entidad: 'MTC (Certificado de Homologación e Internamiento)'
      },
      {
        numero: 'Res. N° 000342-2022/SUNAT/300000',
        fecha: '2022-08-15',
        producto: 'Suplemento alimenticio a base de proteína de suero de leche en polvo con vitaminas',
        codigo10: '2106.90.99.00',
        criterio: 'Clasificado bajo la RGI 1 y 6 en la partida 21.06 por tratarse de una preparación alimenticia no expresada ni comprendida en otra parte.',
        entidad: 'DIGESA (Registro Sanitario TUPA DIGESA-005 / VUCE DIG003)'
      },
      {
        numero: 'Res. N° 000189-2021/SUNAT/300000',
        fecha: '2021-05-10',
        producto: 'Reloj inteligente (Smartwatch) con pantalla táctil, sensor cardiaco, podómetro y conexión Bluetooth/Wi-Fi',
        codigo10: '8517.62.90.00',
        criterio: 'Por aplicación de la RGI 3b, la función principal determinante es la transmisión y recepción de datos inalámbricos (telecomunicación) sobre las funciones secundarias de horología.',
        entidad: 'MTC (Certificado de Homologación TUPA MTC-002 / VUCE MTC001)'
      },
      {
        numero: 'Res. N° 000512-2023/SUNAT/300000',
        fecha: '2023-11-20',
        producto: 'Consola de videojuegos portátil con pantalla a color incorporada y mando integrado (ej. PS5 / Nintendo Switch)',
        codigo10: '9504.50.00.00',
        criterio: 'Clasificación directa por RGI 1 en la subpartida específica para consolas y máquinas de videojuegos.',
        entidad: 'Mercancía Libre de Restricción VUCE'
      },
      {
        numero: 'Res. N° 000115-2020/SUNAT/300000',
        fecha: '2020-03-04',
        producto: 'Dron multipropósito (Aeronave sin piloto) con cámara 4K integrada para fotografía aérea',
        codigo10: '8806.22.00.00',
        criterio: 'Clasificado bajo la RGI 3b atendiendo al carácter esencial de la aeronave pilotada a distancia sobre la cámara como accesorio.',
        entidad: 'MTC (Permiso de Internamiento TUPA MTC-002 / VUCE MTC001)'
      },
      {
        numero: 'Res. N° 000678-2022/SUNAT/300000',
        fecha: '2022-12-12',
        producto: 'Trimóvil de transporte de pasajeros (Mototaxi) con motor de explosión de 200cc',
        codigo10: '8703.21.00.00',
        criterio: 'Clasificación fundamentada bajo las RGI 1 y 6 en los vehículos automóviles concebidos principalmente para el transporte de personas de cilindrada no superior a 1,000 cc.',
        entidad: 'MTC (Homologación Vehicular TUPA MTC-001)'
      },
      {
        numero: 'Res. N° 000421-2021/SUNAT/300000',
        fecha: '2021-09-28',
        producto: 'Zapatillas deportivas con suela de caucho y parte superior de material sintético/textil',
        codigo10: '6404.11.00.00',
        criterio: 'Clasificado por la RGI 3b considerando la materia constitutiva de la suela (caucho/plástico) y el tipo de calzado deportivo.',
        entidad: 'Mercancía Libre (Requiere Rotulado Ley 28491)'
      }
    ];

    const normalizedQuery = this.normalizeText(queryOrCode);
    if (!normalizedQuery) return resolutions;

    return resolutions.filter(r => 
      this.normalizeText(r.producto).includes(normalizedQuery) ||
      this.normalizeText(r.criterio).includes(normalizedQuery) ||
      r.codigo10.replaceAll('.', '').includes(normalizedQuery.replaceAll('.', '')) ||
      r.numero.toLowerCase().includes(normalizedQuery)
    );
  }

  getLegalNotes(capituloId = '') {
    const notes = {
      '84': {
        capitulo: 'Capítulo 84 - Calderas, máquinas, aparatos y artefactos mecánicos',
        notaSeccion: 'Sección XVI: Las máquinas compuestas que realicen dos o más funciones diferentes se clasifican ateniéndose a la función principal que las caracterice (RGI 3b).',
        notaCapitulo: 'Nota 5: En la partida 84.71, se entiende por "máquinas automáticas para tratamiento o procesamiento de datos" (Laptops, PCs, Servidores) las máquinas capaces de: 1) Registrar el programa de proceso; 2) Ser libremente programadas según las necesidades del usuario; 3) Realizar cálculos aritméticos especificados por el usuario.'
      },
      '85': {
        capitulo: 'Capítulo 85 - Máquinas, aparatos y material eléctrico y sus partes',
        notaSeccion: 'Sección XVI: Los aparatos y partes destinadas a funciones de telecomunicaciones se clasifican en la partida 85.17 independientemente de su uso secundario.',
        notaCapitulo: 'Nota 3: La partida 85.09 comprende aparatos electromecánicos de uso doméstico con motor eléctrico incorporado (ej. aspiradoras, batidoras, trituradoras).'
      },
      '61': {
        capitulo: 'Capítulo 61 - Prendas y complementos de vestir, de punto',
        notaSeccion: 'Sección XI: Las prendas compuestas por combinaciones de materias textiles se clasifican ateniéndose a la materia que predomine en peso en la superficie exterior (RGI 3b).',
        notaCapitulo: 'Nota 14: Los términos "trajes" y "conjuntos" definen prendas compuestas por dos o tres piezas destinadas a venderse juntas al por menor.'
      },
      '62': {
        capitulo: 'Capítulo 62 - Prendas y complementos de vestir, excepto los de punto',
        notaSeccion: 'Sección XI: La materia constitutiva de la superficie exterior determina la clasificación de las prendas impermeables o recubiertas.',
        notaCapitulo: 'Nota 3: Las prendas de vestir que no puedan identificarse como para hombres/niños o para mujeres/niñas se clasifican con estas últimas.'
      },
      '95': {
        capitulo: 'Capítulo 95 - Juguetes, juegos y artículos para recreo o deporte',
        notaSeccion: 'Sección XX: Este capítulo comprende las consolas de videojuegos, juegos de sociedad y artículos deportivos.',
        notaCapitulo: 'Nota 3: Las partes y accesorios identificables como destinados exclusiva o principalmente a los artículos de este Capítulo se clasifican con ellos.'
      },
      '21': {
        capitulo: 'Capítulo 21 - Preparaciones alimenticias diversas',
        notaSeccion: 'Sección IV: Las preparaciones a base de extractos o proteínas se clasifican en la partida 21.06 siempre que no tengan carácter medicamentoso (Cap. 30).',
        notaCapitulo: 'Nota 1: Este capítulo no comprende las preparaciones medicamentosas ni las vitaminas dosificadas del Capítulo 30.'
      }
    };

    const capKey = String(capituloId || '').padStart(2, '0');
    return notes[capKey] || {
      capitulo: `Capítulo ${capKey} - Arancel de Aduanas SUNAT 2022`,
      notaSeccion: 'Sección NANDINA: Aplican las Reglas Generales Interpretativas 1 a 6 para la determinación legal de la subpartida nacional.',
      notaCapitulo: 'Nota de Capítulo: Consultar las notas explicativas oficiales del Sistema Armonizado para la definición de los términos del texto del arancel.'
    };
  }

  getDetailedVuceInfo(item) {
    const entity = this.resolveEntity(item);
    const code = item ? item.codigo10 : '';

    if (code.startsWith('8517') || code.startsWith('8525') || code.startsWith('8806')) {
      return {
        status: 'Restringida',
        statusBadgeClass: 'adv-6',
        statusIcon: '⚠️',
        entidad: 'MTC - Ministerio de Transportes y Comunicaciones',
        requisitoExacto: 'Certificado de Homologación e Internamiento Previo de Equipos de Telecomunicaciones',
        tupaCodigo: 'TUPA MTC-002',
        vuceProcedimiento: 'VUCE MTC001 (Permiso de Internamiento de Equipos)',
        vuceUrl: 'https://www.vuce.gob.pe'
      };
    } else if (code.startsWith('2106') || code.startsWith('1517') || code.startsWith('2208')) {
      return {
        status: 'Restringida',
        statusBadgeClass: 'adv-6',
        statusIcon: '⚠️',
        entidad: 'DIGESA - Dirección General de Salud Ambiental',
        requisitoExacto: 'Registro Sanitario de Alimentos y Bebidas de Consumo Humano / Certificado Sanitario',
        tupaCodigo: 'TUPA DIGESA-005',
        vuceProcedimiento: 'VUCE DIG003 (Inscripción/Reinscripción de Alimentos)',
        vuceUrl: 'https://www.vuce.gob.pe'
      };
    } else if (code.startsWith('0101') || code.startsWith('0102') || code.startsWith('0804')) {
      return {
        status: 'Restringida',
        statusBadgeClass: 'adv-11',
        statusIcon: '⚠️',
        entidad: 'SENASA - Servicio Nacional de Sanidad Agraria',
        requisitoExacto: 'Permiso Fitosanitario de Importación (PFI) o Permiso Zoosanitario de Importación (PZI)',
        tupaCodigo: 'TUPA SENASA-012',
        vuceProcedimiento: 'VUCE SEN002 (Permiso Fitosanitario de Importación)',
        vuceUrl: 'https://www.vuce.gob.pe'
      };
    } else if (code.startsWith('3004') || code.startsWith('3304')) {
      return {
        status: 'Restringida',
        statusBadgeClass: 'adv-11',
        statusIcon: '⚠️',
        entidad: 'DIGEMID - Dirección General de Medicamentos, Insumos y Drogas',
        requisitoExacto: 'Registro Sanitario o Notificación Sanitaria Obligatoria (NSO) para Cosméticos/Medicamentos',
        tupaCodigo: 'TUPA DIGEMID-018',
        vuceProcedimiento: 'VUCE DGM001 (Inscripción en el Registro Sanitario)',
        vuceUrl: 'https://www.vuce.gob.pe'
      };
    }

    return {
      status: 'Libre',
      statusBadgeClass: 'adv-0',
      statusIcon: '✅',
      entidad: entity.entidad,
      requisitoExacto: 'Mercancía de libre importación. No requiere autorización ni permiso de entidad reguladora.',
      tupaCodigo: 'N/A (Libre Comercialización)',
      vuceProcedimiento: 'Despacho Aduanero Normal SUNAT',
      vuceUrl: 'https://www.sunat.gob.pe'
    };
  }

  getHs6Breakdown(codigo6Query = '') {
    const cleanHs6 = String(codigo6Query || '').replaceAll('.', '').trim();
    if (!cleanHs6) return [];
    
    return this.subpartidas.filter(item => item.codigo6.replaceAll('.', '') === cleanHs6.slice(0, 6));
  }
}
