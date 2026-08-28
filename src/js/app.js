import { SearchEngine } from './searchEngine.js?v=2.3.0';
import { GuidedClassifier } from './guidedClassifier.js';
import { CompanyResolver } from './companyResolver.js';
import { TariffCalculator } from './calculator.js';

// Estado Global de la Aplicación (Enterprise Workbench V1.0)
const state = {
  searchEngine: null,
  guidedClassifier: null,
  companyResolver: null,
  dataset: null,
  activeItem: null,
  activeCapitulo: null,
  activeSeccion: null,
  activeCenterTab: 'tab-general',
  relatedItem: null,
  classificationHistory: [],
  tlcMarkup: null,
  favorites: JSON.parse(localStorage.getItem('arancel_favs') || '[]')
};

// Inicialización tras cargar el DOM
async function initializeApp() {
  try {
    const response = await fetch('./src/data/arancel2022.json');
    state.dataset = await response.json();
    state.searchEngine = new SearchEngine(state.dataset);
    state.guidedClassifier = new GuidedClassifier(state.searchEngine);
    state.companyResolver = new CompanyResolver(state.searchEngine);

    // Establecer primer elemento activo por defecto
    const subpartidas = state.dataset.subpartidas || [];
    if (subpartidas.length > 0) {
      state.activeItem = subpartidas[0];
    }

    initTreeView();
    initSearch();
    initCenterTabs();
    initCalculatorModal();
    initComparatorModal();
    initReglas();
    initThemeToggle();
    initCommandPaletteShortcut();
    updateFavoritesBadge();
    fetchSunatExchangeRate();

    // Renderizar Workbench inicial
    renderSearchResults();
    updateActiveItemPanel(state.activeItem);
  } catch (err) {
    console.error('Error al cargar la base de datos:', err);
    document.getElementById('results-count-text').textContent = 'Error al cargar los datos del arancel.';
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp, { once: true });
} else {
  initializeApp();
}

/* -------------------------------------------------------------
 * 1. PANEL IZQUIERDO: Navegador Jerárquico Árbol NANDINA (Modo Avanzado)
 * ------------------------------------------------------------- */
function initTreeView() {
  const container = document.getElementById('nandina-tree-container');
  const filterInput = document.getElementById('tree-filter-input');
  const btnCollapse = document.getElementById('btn-collapse-tree');

  if (!container || !state.dataset) return;

  renderTree('');

  filterInput.addEventListener('input', (e) => {
    renderTree(e.target.value.toLowerCase());
  });

  btnCollapse.addEventListener('click', () => {
    container.querySelectorAll('.tree-children').forEach(child => child.classList.remove('open'));
  });
}

function renderTree(filterText = '') {
  const container = document.getElementById('nandina-tree-container');
  const secciones = state.dataset.secciones || [];
  const capitulos = state.dataset.capitulos || {};
  const subpartidas = state.dataset.subpartidas || [];

  container.innerHTML = secciones.map(sec => {
    const secCaps = (sec.capitulos || []).filter(c => {
      const info = capitulos[c];
      if (!filterText) return true;
      return c.includes(filterText) || (info && info.nombre.toLowerCase().includes(filterText));
    });

    if (filterText && secCaps.length === 0) return '';

    return `
      <div class="tree-section-group">
        <div class="tree-node sec-node ${state.activeSeccion === sec.id ? 'active' : ''}" data-sec="${sec.id}">
          <span class="node-icon">📁</span>
          <span><strong>Sección ${sec.id}</strong> - ${sec.nombre.substring(0, 22)}...</span>
        </div>
        <div class="tree-children ${filterText || state.activeSeccion === sec.id ? 'open' : ''}" id="children-sec-${sec.id}">
          ${secCaps.map(cNum => {
            const capObj = capitulos[cNum] || { nombre: `Capítulo ${cNum}` };
            const capSubpartidas = subpartidas.filter(s => s.capitulo === cNum);
            const isCapActive = state.activeCapitulo === cNum;

            return `
              <div class="tree-node cap-node ${isCapActive ? 'active' : ''}" data-cap="${cNum}">
                <span class="node-icon">📂</span>
                <span><strong>Cap. ${cNum}:</strong> ${capObj.nombre.substring(0, 20)}...</span>
              </div>
              <div class="tree-children ${filterText || isCapActive ? 'open' : ''}" id="children-cap-${cNum}">
                ${capSubpartidas.map(sub => `
                  <div class="tree-node sub-node ${state.activeItem && state.activeItem.codigo10 === sub.codigo10 ? 'active' : ''}" data-code="${sub.codigo10}">
                    <span class="node-icon">📄</span>
                    <span>${sub.codigo10}</span>
                  </div>
                `).join('')}
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }).join('');

  // Clic en Sección: Solo expande/contrae acordeón en el árbol (sin alterar la tabla central)
  container.querySelectorAll('.sec-node').forEach(node => {
    node.addEventListener('click', () => {
      const child = container.querySelector(`#children-sec-${node.dataset.sec}`);
      if (child) child.classList.toggle('open');
    });
  });

  // Clic en Capítulo: Carga TODAS las subpartidas de este Capítulo en la tabla central
  container.querySelectorAll('.cap-node').forEach(node => {
    node.addEventListener('click', (e) => {
      const child = container.querySelector(`#children-cap-${node.dataset.cap}`);
      if (child) child.classList.toggle('open');

      container.querySelectorAll('.tree-node').forEach(n => n.classList.remove('active'));
      node.classList.add('active');

      state.activeCapitulo = node.dataset.cap;
      state.activeSeccion = null;
      state.relatedItem = null;
      state.classificationHistory = [];
      const searchInput = document.getElementById('main-search-input');
      if (searchInput) searchInput.value = '';

      const matches = state.searchEngine.search({ capitulo: node.dataset.cap });
      if (matches.length > 0) {
        state.activeItem = matches[0];
        updateActiveItemPanel(state.activeItem);
      }
      renderSearchResults();
    });
  });

  container.querySelectorAll('.sub-node').forEach(node => {
    node.addEventListener('click', (e) => {
      e.stopPropagation();
      container.querySelectorAll('.sub-node').forEach(n => n.classList.remove('active'));
      node.classList.add('active');

      const code = node.dataset.code;
      const matches = state.searchEngine.search({ query: code });
      if (matches.length > 0) {
        state.activeItem = matches[0];
        updateActiveItemPanel(state.activeItem);
      }
    });
  });
}

/* -------------------------------------------------------------
 * 2. PANEL CENTRAL: Buscador Inteligente, Resultados & Pestañas
 * ------------------------------------------------------------- */
function initSearch() {
  const searchInput = document.getElementById('main-search-input');
  const btnClear = document.getElementById('btn-clear-search');
  const autocompleteBox = document.getElementById('autocomplete-suggestions');
  const selectAdValorem = document.getElementById('filter-advalorem');

  if (!searchInput) return;

  searchInput.addEventListener('input', (e) => {
    const val = e.target.value;
    if (val.trim()) {
      btnClear.classList.remove('hidden');
      state.activeCapitulo = null;
      state.activeSeccion = null;
    } else {
      btnClear.classList.add('hidden');
    }
    renderSearchResults();
  });

  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      searchInput.value = '';
      state.classificationHistory = [];
      state.relatedItem = null;
      state.activeCapitulo = null;
      state.activeSeccion = null;
      btnClear.classList.add('hidden');
      autocompleteBox.classList.add('hidden');
      renderSearchResults();
    }
  });

  document.addEventListener('pointerdown', (event) => {
    if (event.target !== searchInput && !autocompleteBox.contains(event.target)) {
      autocompleteBox.classList.add('hidden');
    }
  });

  btnClear.addEventListener('click', () => {
    searchInput.value = '';
    state.classificationHistory = [];
    state.relatedItem = null;
    state.activeCapitulo = null;
    state.activeSeccion = null;
    btnClear.classList.add('hidden');
    autocompleteBox.classList.add('hidden');
    renderSearchResults();
  });

  selectAdValorem.addEventListener('change', () => {
    renderSearchResults();
  });

  const btnShowAll = document.getElementById('btn-show-all-results');
  btnShowAll.addEventListener('click', () => {
    state.activeCapitulo = null;
    state.activeSeccion = null;
    state.relatedItem = null;
    state.classificationHistory = [];
    searchInput.value = '';
    btnClear.classList.add('hidden');
    autocompleteBox.classList.add('hidden');
    renderSearchResults();
  });
}

function initCenterTabs() {
  const tabs = document.querySelectorAll('.center-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetId = tab.dataset.centertab;
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      document.querySelectorAll('.center-tab-content').forEach(c => c.classList.remove('active'));
      const targetContent = document.getElementById(targetId);
      if (targetContent) targetContent.classList.add('active');
    });
  });
}

function highlightText(text, query) {
  if (!query || query.trim().length === 0) return text;
  const words = query.trim().split(/\s+/).filter(w => w.length > 1);
  if (words.length === 0) return text;
  
  const escapedWords = words.map(word => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const regex = new RegExp(`(${escapedWords.join('|')})`, 'gi');
  return text.replace(regex, '<mark>$1</mark>');
}

function renderSearchResults() {
  const query = document.getElementById('main-search-input').value;
  const adValorem = document.getElementById('filter-advalorem').value;

  let results = [];
  if (state.activeCapitulo) {
    results = state.searchEngine.search({ capitulo: state.activeCapitulo, adValorem });
  } else if (state.activeSeccion) {
    results = state.searchEngine.search({ seccion: state.activeSeccion, adValorem });
  } else if (!query.trim() && state.relatedItem) {
    results = state.searchEngine.search({ adValorem }).filter(item => item.partida4 === state.relatedItem.partida4);
  } else {
    results = state.searchEngine.search({ query, adValorem });
  }

  const countText = document.getElementById('results-count-text');
  const btnShowAll = document.getElementById('btn-show-all-results');
  const aliasRule = query.trim() ? (state.searchEngine.getCommercialAlias(query) || {}) : {};

  if (state.activeCapitulo) {
    const capInfo = state.searchEngine.getCapituloInfo(state.activeCapitulo);
    const capTitle = capInfo ? capInfo.nombre : `Capítulo ${state.activeCapitulo}`;
    countText.innerHTML = `
      <div style="display: block; width: 100%; margin-bottom: 6px; font-size: 12px; color: var(--accent-blue); background: var(--accent-blue-bg); padding: 8px 12px; border-radius: 6px; border-left: 4px solid var(--accent-blue);">
        📂 <strong>Capítulo ${state.activeCapitulo}:</strong> ${capTitle}
      </div>
      <span>Mostrando ${results.length.toLocaleString()} ${results.length === 1 ? 'subpartida aduanera' : 'subpartidas aduaneras'} de este capítulo</span>
    `;
    btnShowAll.classList.remove('hidden');
  } else if (state.activeSeccion) {
    countText.innerHTML = `
      <div style="display: block; width: 100%; margin-bottom: 6px; font-size: 12px; color: var(--accent-blue); background: var(--accent-blue-bg); padding: 8px 12px; border-radius: 6px; border-left: 4px solid var(--accent-blue);">
        📁 <strong>Sección ${state.activeSeccion}:</strong> Navegación Jerárquica por Sección
      </div>
      <span>Mostrando ${results.length.toLocaleString()} ${results.length === 1 ? 'subpartida aduanera' : 'subpartidas aduaneras'} de esta sección</span>
    `;
    btnShowAll.classList.remove('hidden');
  } else if (!query.trim() && state.relatedItem) {
    countText.textContent = `${results.length.toLocaleString()} subpartidas relacionadas de la partida ${state.relatedItem.partida4}`;
    btnShowAll.classList.remove('hidden');
  } else if (aliasRule && aliasRule.officialTerm) {
    countText.innerHTML = `
      <div style="display: block; width: 100%; margin-bottom: 6px; font-size: 12px; color: var(--accent-blue); background: var(--accent-blue-bg); padding: 8px 12px; border-radius: 6px; border-left: 4px solid var(--accent-blue);">
        💡 <strong>Búsqueda Inteligente B2B:</strong> Mostrando resultados para término oficial SUNAT: <strong>${aliasRule.officialTerm}</strong> <span style="color: var(--text-muted);">(asociado a "${query}")</span>
      </div>
      <span>Mostrando ${results.length.toLocaleString()} ${results.length === 1 ? 'subpartida aduanera' : 'subpartidas aduaneras'}</span>
    `;
    btnShowAll.classList.add('hidden');
  } else {
    countText.textContent = `Mostrando ${results.length.toLocaleString()} ${results.length === 1 ? 'subpartida aduanera' : 'subpartidas aduaneras'}${query ? ` para "${query}"` : ''}`;
    btnShowAll.classList.add('hidden');
  }

  const guidance = document.getElementById('search-guidance');
  const classificationGuide = query.trim() ? state.searchEngine.getUniversalClassificationGuide(query, results) : null;

  if (query.trim() && results.length > 0) {
    const bestItem = results[0];
    const isExactCode = /^[\d.\s-]+$/.test(query.trim()) && query.replace(/\D/g, '').length >= 4;
    const matchLevel = isExactCode || results.length === 1 ? 'ALTO' : (results.length <= 10 ? 'MEDIO' : 'BAJO');
    const entityInfo = state.searchEngine.resolveEntity(bestItem);

    let matchReason = `Coincidencia técnica con la descripción oficial arancelaria y términos de la subpartida nacional ${bestItem.codigo10}.`;
    let missingInfo = 'Material constitutivo, función técnica principal, estado de presentación (completo o incompleto).';

    if (bestItem.capitulo === '84' || bestItem.capitulo === '85') {
      missingInfo = 'Potencia técnica, voltaje, si es unidad portátil o industrial, si incluye accesorios o estuche.';
    } else if (bestItem.capitulo === '61' || bestItem.capitulo === '62' || bestItem.capitulo === '64') {
      missingInfo = 'Composición exacta de fibra/material exterior (ej. 100% algodón, mezcla), tipo de confección (de punto o plano), uso para hombre/mujer.';
    }

    guidance.innerHTML = `
      <div class="most-probable-card">
        <div class="most-probable-header">
          <span class="most-probable-title">🎯 RESULTADO MÁS PROBABLE</span>
          <span class="match-level-badge match-level-${matchLevel.toLowerCase()}">Nivel de Coincidencia: ${matchLevel}</span>
        </div>
        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 6px;">
          <span style="font-family: var(--font-mono); font-size: 18px; font-weight: 700; color: var(--accent-blue); background: var(--accent-blue-bg); padding: 2px 8px; border-radius: 4px;">${bestItem.codigo10}</span>
          <span class="adv-pill adv-${bestItem.adValorem}">Ad-Valorem: ${bestItem.adValorem}%</span>
          <span class="status-badge ${entityInfo.mercanciaRestringida === 'Sí' ? 'status-verify' : 'status-confirmed'}">${entityInfo.badge_icon} ${entityInfo.estado_regulacion}</span>
        </div>
        <div style="font-size: 14px; font-weight: 700; color: var(--text-main); margin-bottom: 8px;">
          ${state.searchEngine.getDisplayDescription(bestItem)}
        </div>
        
        <div style="display: grid; gap: 6px; font-size: 12px; margin-top: 10px;">
          <div style="padding: 8px 10px; background: var(--bg-app); border-left: 3px solid var(--accent-blue); border-radius: 4px;">
            <strong style="color: var(--accent-blue);">💡 ¿Por qué podría corresponder?:</strong> ${matchReason}
          </div>
          <div style="padding: 8px 10px; background: var(--bg-app); border-left: 3px solid var(--accent-amber); border-radius: 4px;">
            <strong style="color: var(--accent-amber);">❓ Información que falta para confirmar:</strong> ${missingInfo}
          </div>
        </div>

        <div style="display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap;">
          <button type="button" class="btn-tech-action btn-primary-action btn-analyze-match" data-code="${bestItem.codigo10}">
            ⚖️ Analizar Clasificación
          </button>
          ${results.length >= 2 ? `
            <button type="button" class="btn-tech-action btn-secondary-action btn-compare-match">
              ⚖️ Comparar Candidatos (${results.length})
            </button>
          ` : ''}
          <a href="https://www.sunat.gob.pe/operatividadaduanera/" target="_blank" rel="noopener" class="btn-tech-action btn-secondary-action" style="text-decoration: none; display: inline-flex; align-items: center; gap: 4px;">
            🏛️ Ver Fuente Oficial ↗
          </a>
        </div>
      </div>
    `;
    guidance.classList.remove('hidden');

    guidance.querySelector('.btn-analyze-match')?.addEventListener('click', () => {
      document.querySelector('.center-tab[data-centertab="tab-rgi"]')?.click();
    });
    guidance.querySelector('.btn-compare-match')?.addEventListener('click', () => {
      openComparisonModal(results.slice(0, 4));
    });
  } else if (classificationGuide) {
    guidance.innerHTML = `
      <div class="classification-guide-header">
        <span class="classification-guide-kicker">${classificationGuide.kicker}</span>
        <strong>${classificationGuide.generalCode}</strong>
        ${state.classificationHistory.length ? `<button type="button" id="btn-guide-back" class="classification-guide-back">← Volver al nivel anterior</button>` : ''}
      </div>
      <div class="classification-guide-title">${classificationGuide.generalTitle}</div>
      ${classificationGuide.recommendationText ? `<div class="classification-recommendation">✓ ${classificationGuide.recommendationText}</div>` : ''}
      ${aliasRule && aliasRule.guidance ? `<p>${aliasRule.guidance}</p>` : ''}
      ${classificationGuide.question ? `<div class="classification-guide-question">${classificationGuide.question}</div>` : ''}
      <div class="classification-guide-options">
        ${classificationGuide.choices.map(choice => `
          <button type="button" class="classification-choice" data-guide-code="${choice.code}">
            <span><strong>${choice.label}${choice.recommended ? '<em class="recommended-badge">Mejor coincidencia</em>' : ''}</strong><small>${choice.detail}</small></span>
            <b>${choice.code}</b>
          </button>
        `).join('')}
      </div>
    `;
    guidance.classList.remove('hidden');
    guidance.querySelector('#btn-guide-back')?.addEventListener('click', () => {
      const previousQuery = state.classificationHistory.pop();
      if (previousQuery !== undefined) {
        document.getElementById('main-search-input').value = previousQuery;
        renderSearchResults();
      }
    });
    guidance.querySelectorAll('[data-guide-code]').forEach(button => {
      button.addEventListener('click', () => {
        const currentQuery = document.getElementById('main-search-input').value;
        if (currentQuery && currentQuery !== button.dataset.guideCode) state.classificationHistory.push(currentQuery);
        document.getElementById('main-search-input').value = button.dataset.guideCode;
        renderSearchResults();
      });
    });
  } else {
    guidance.classList.add('hidden');
    guidance.textContent = '';
  }

  const tableBody = document.getElementById('table-body');
  if (results.length === 0) {
    state.activeItem = null;
    updateActiveItemPanel(null);
    tableBody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align: center; padding: 20px; color: var(--text-muted);">
          🔍 No se encontraron coincidencias. Prueba un nombre comercial, una descripción o el código NANDINA.
        </td>
      </tr>
    `;
    return;
  }

  // Mantener siempre sincronizados resultados, ficha e impuestos.
  const activeIsVisible = results.some(item => state.activeItem && item.codigo10 === state.activeItem.codigo10);
  if (query.trim() && !activeIsVisible) {
    state.activeItem = results[0];
    updateActiveItemPanel(state.activeItem);
  }

  const displayResults = results.slice(0, 100);

  tableBody.innerHTML = displayResults.map(item => {
    const isSelected = state.activeItem && state.activeItem.codigo10 === item.codigo10;
    const isFav = state.favorites.includes(item.codigo10);
    const entityInfo = state.searchEngine.resolveEntity(item);

    return `
      <tr class="${isSelected ? 'active-row' : ''}" data-code="${item.codigo10}">
        <td>
          <span class="code-cell-text">${item.codigo10}</span>
        </td>
        <td>
          <div style="font-weight: 500;">${highlightText(state.searchEngine.getDisplayDescription(item), query)}</div>
        </td>
        <td style="text-align: center;">
          <span class="adv-badge adv-${item.adValorem}">${item.adValorem}%</span>
        </td>
        <td>
          <span class="adv-pill ${entityInfo.badge_class}" style="font-size: 10px; padding: 2px 7px; white-space: nowrap;">${entityInfo.badge_icon} ${entityInfo.estado_regulacion}</span>
          <div style="font-size: 10px; color: var(--text-muted); margin-top: 2px;">${entityInfo.entidad_siglas} · ${entityInfo.codigo_tramite_vuce}</div>
        </td>
        <td style="text-align: right;">
          <button class="btn-icon-action btn-copy-row" data-code="${item.codigo10}" title="Copiar Código">📋</button>
          <button class="btn-icon-action btn-fav-row" data-code="${item.codigo10}" title="Guardar">
            ${isFav ? '⭐' : '☆'}
          </button>
        </td>
      </tr>
    `;
  }).join('');

  // Event Listeners para selección de filas y acciones
  tableBody.querySelectorAll('tr').forEach(row => {
    row.addEventListener('click', (e) => {
      if (e.target.closest('.btn-icon-action')) return;
      const code = row.dataset.code;
      const matches = state.searchEngine.search({ query: code });
      if (matches.length > 0) {
        state.activeItem = matches[0];
        updateActiveItemPanel(state.activeItem);
        tableBody.querySelectorAll('tr').forEach(r => r.classList.remove('active-row'));
        row.classList.add('active-row');
        row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    });
  });

  tableBody.querySelectorAll('.btn-copy-row').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      copyToClipboard(btn.dataset.code);
    });
  });

  tableBody.querySelectorAll('.btn-fav-row').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFavorite(btn.dataset.code);
      renderSearchResults();
    });
  });
}

/* -------------------------------------------------------------
 * 3. PANEL DERECHO: Ficha Técnica Aduanera Activa & Árbol Sincronizado
 * ------------------------------------------------------------- */
function highlightAndExpandTreeItem(item) {
  if (!item) return;
  const container = document.getElementById('nandina-tree-container');
  if (!container) return;

  const targetSecId = `children-sec-${item.seccion}`;
  const capNum = String(item.capitulo).padStart(2, '0');
  const targetCapId = `children-cap-${capNum}`;

  container.querySelectorAll('.tree-children[id^="children-sec-"]').forEach(secChild => {
    if (secChild.id === targetSecId) {
      secChild.classList.add('open');
    } else {
      secChild.classList.remove('open');
    }
  });

  container.querySelectorAll('.tree-children[id^="children-cap-"]').forEach(capChild => {
    if (capChild.id === targetCapId) {
      capChild.classList.add('open');
    } else {
      capChild.classList.remove('open');
    }
  });

  container.querySelectorAll('.sub-node').forEach(node => node.classList.remove('active'));
  const activeNode = container.querySelector(`.sub-node[data-code="${item.codigo10}"]`);
  if (activeNode) {
    activeNode.classList.add('active');
    activeNode.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

function updateActiveItemPanel(item) {
  const actionableButtons = [
    document.getElementById('btn-copy-active-code'),
    document.getElementById('btn-export-pdf'),
    document.getElementById('btn-send-calc')
  ].filter(Boolean);
  const tlcList = document.querySelector('.tlc-badges-list');

  if (!item) {
    document.getElementById('active-code-display').textContent = '—';
    document.getElementById('active-desc-display').textContent = 'Selecciona una subpartida para consultar su ficha';
    document.getElementById('active-breadcrumb-display').textContent = 'Sin selección activa';
    const advEl = document.getElementById('active-adv-display');
    advEl.textContent = 'Ad-Valorem: —';
    advEl.className = 'subheading-adv-badge';
    document.getElementById('tech-adv-val').textContent = '—';
    document.getElementById('tech-isc-val').textContent = '—';
    document.getElementById('tech-total-rate').textContent = '—';
    document.getElementById('tech-entity-name').textContent = 'Sin información seleccionada';
    document.getElementById('tech-restriction-desc').textContent = 'Realiza una búsqueda y selecciona un resultado para ver requisitos y tributos.';
    if (tlcList) tlcList.innerHTML = '<span class="tlc-badge">Selecciona una subpartida para consultar acuerdos aplicables.</span>';
    actionableButtons.forEach(button => { button.disabled = true; });
    return;
  }

  highlightAndExpandTreeItem(item);
  actionableButtons.forEach(button => { button.disabled = false; });

  const entityInfo = state.searchEngine.resolveEntity(item);

  document.getElementById('active-code-display').textContent = item.codigo10;
  document.getElementById('active-desc-display').textContent = state.searchEngine.getDisplayDescription(item);

  const advEl = document.getElementById('active-adv-display');
  advEl.textContent = `Ad-Valorem: ${item.adValorem}%`;
  advEl.className = `subheading-adv-badge adv-${item.adValorem}`;

  const capituloInfo = state.searchEngine.getCapituloInfo(item.capitulo);
  document.getElementById('active-breadcrumb-display').textContent = 
    `Sección ${item.seccion} > Capítulo ${item.capitulo} (${capituloInfo ? capituloInfo.nombre : ''}) > Partida ${item.partida4} > Subpartida ${item.codigo10}`;

  document.getElementById('tech-adv-val').textContent = `${item.adValorem}%`;
  document.getElementById('tech-isc-val').textContent = `${item.isc || 0}%`;

  const totalBase = 18 + parseFloat(item.adValorem) + parseFloat(item.isc || 0);
  document.getElementById('tech-total-rate').textContent = `${totalBase}% (CIF + Tributos)`;

  document.getElementById('tech-entity-name').innerHTML = `
    <span class="adv-pill ${entityInfo.badge_class}" style="margin-right: 6px; font-size: 11px; padding: 2px 8px;">${entityInfo.badge_icon} ${entityInfo.estado_regulacion}</span>
    <strong>${entityInfo.entidad_siglas}</strong> · ${entityInfo.codigo_tramite_vuce}
  `;
  document.getElementById('tech-restriction-desc').innerHTML = `
    <strong style="color: var(--accent-blue);">📋 Documento Requerido:</strong> ${entityInfo.documento_requerido}<br>
    <small style="color: var(--text-secondary); display: inline-block; margin-top: 5px; line-height: 1.4;">${entityInfo.restriccion}</small>
  `;

  renderTlcModule(item);
  renderDynamicRgiTab(item);
  renderResolucionesTab(item.codigo10);
  renderNotasLegalesTab(item);
  renderChecklistTab(item);

  document.getElementById('btn-copy-active-code').onclick = () => copyToClipboard(item.codigo10);
  document.getElementById('btn-export-pdf').onclick = () => printSubheadingReport(item, entityInfo);
  document.getElementById('btn-send-calc').onclick = () => {
    const modal = document.getElementById('modal-calc');
    modal.classList.remove('hidden');
    const advSel = document.getElementById('calc-advalorem');
    if (advSel) {
      advSel.dataset.baseVal = String(item.adValorem);
      advSel.dataset.activeCode = item.codigo10;
    }
    document.getElementById('calc-isc').value = item.isc || 0;
    syncAdValoremWithTLC();
    calculateAndRender();
  };
}

function renderTlcModule(item) {
  const container = document.querySelector('.tlc-badges-list');
  if (!container) return;

  const baseAdv = parseFloat(item.adValorem) || 0;

  if (baseAdv === 0) {
    container.innerHTML = `
      <div class="tlc-badge" style="border-left: 3px solid var(--accent-blue); padding: 8px; font-size: 11px;">
        🌐 <strong>Arancel NMF (Nación Más Favorecida): 0% Base</strong>
        <p style="font-size: 10px; color: var(--text-muted); margin-top: 2px;">Esta mercancía ya tributa 0% Ad-Valorem general en el Arancel 2022.</p>
        <span class="status-badge status-confirmed">🟢 CONFIRMADO POR BASE/FUENTE</span>
      </div>
    `;
  } else {
    const acuerdos = [
      { code: 'CN', name: '🇨🇳 TLC Perú - China' },
      { code: 'US', name: '🇺🇸 TLC Perú - EE.UU. (APC)' },
      { code: 'EU', name: '🇪🇺 TLC Perú - Unión Europea' },
      { code: 'CAN', name: '🇨🇴 Comunidad Andina (CAN)' },
      { code: 'MX', name: '🇲🇽 Alianza del Pacífico (México)' }
    ];

    container.innerHTML = acuerdos.map(a => {
      const tlcInfo = state.searchEngine.getTlcAnalysis(item, a.code);
      const isVerified = a.code === 'CAN';
      return `
        <div class="tlc-badge" style="border-left: 3px solid ${isVerified ? 'var(--accent-green)' : 'var(--accent-amber)'}; padding: 6px 8px; margin-bottom: 6px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <strong>${a.name}</strong>
            <span class="status-badge ${isVerified ? 'status-confirmed' : 'status-verify'}">${isVerified ? '🟢 0% CAN' : '🟠 POR VERIFICAR'}</span>
          </div>
          <p style="font-size: 10px; color: var(--text-muted); margin-top: 2px; line-height: 1.3;">${tlcInfo.observaciones}</p>
          <small style="font-size: 9px; color: var(--accent-blue); display: block; margin-top: 2px;">Prueba: ${tlcInfo.pruebaOrigen}</small>
        </div>
      `;
    }).join('');
  }
}

function renderChecklistTab(item = state.activeItem) {
  const container = document.querySelector('.vuce-checklist-container');
  if (!container) return;

  const isRestricted = item && state.searchEngine.resolveEntity(item).mercanciaRestringida === 'Sí';
  const hasAdv = item && Number(item.adValorem) > 0;

  const categories = [
    {
      titulo: '📄 Documentación Comercial',
      docs: [
        { nombre: 'Factura Comercial (Commercial Invoice)', desc: 'Factura emitida por el proveedor con Incoterms (FOB/CIF) y montos.', estado: 'Obligatorio' },
        { nombre: 'Lista de Empaque (Packing List)', desc: 'Desglose de bultos, contenidos, pesos neto/bruto y volumen.', estado: 'Obligatorio' }
      ]
    },
    {
      titulo: '🚢 Documentación de Transporte',
      docs: [
        { nombre: 'Conocimiento de Embarque (B/L) / Guía Aérea (AWB)', desc: 'Contrato de transporte internacional consignado al importador.', estado: 'Obligatorio' }
      ]
    },
    {
      titulo: '📋 Documentación Aduanera',
      docs: [
        { nombre: 'Declaración de Mercancías (DAM / DUA)', desc: 'Declaración aduanera tramitada por agente de aduana.', estado: 'Obligatorio' },
        { nombre: 'Declaración Jurada de Valor (DJV)', desc: 'Sustento de transferencias al exterior ante SUNAT.', estado: 'Condicional' }
      ]
    },
    {
      titulo: '🌐 Documentación de Acuerdos Comerciales (TLC)',
      docs: [
        { nombre: 'Certificado de Origen / Declaración en Factura', desc: 'Acredita liberación preferencial del Ad-Valorem.', estado: hasAdv ? 'Por verificar' : 'No aplica' }
      ]
    },
    {
      titulo: '🛡️ Permisos y Mercancías Restringidas',
      docs: [
        { nombre: 'Permiso VUCE / Registro Sanitario / Homologación', desc: 'Autorización expedida por MTC, SENASA, DIGESA, DIGEMID o SUCAMEC.', estado: isRestricted ? 'Obligatorio' : 'No aplica' }
      ]
    }
  ];

  container.innerHTML = categories.map(cat => `
    <div style="margin-bottom: 12px; border: 1px solid var(--border-color); border-radius: 6px; padding: 10px; background: var(--bg-hover);">
      <h4 style="font-size: 12px; font-weight: 700; color: var(--accent-blue); margin-bottom: 8px;">${cat.titulo}</h4>
      <div style="display: grid; gap: 8px;">
        ${cat.docs.map(d => `
          <label class="vuce-check-item" style="background: var(--bg-app); border: 1px solid var(--border-color); padding: 8px 10px; border-radius: 6px; display: flex; align-items: center; gap: 8px;">
            <input type="checkbox" ${d.estado === 'Obligatorio' ? 'checked' : ''}>
            <span>
              <strong>${d.nombre}</strong>
              <small style="display: block; color: var(--text-muted); margin-top: 2px;">${d.desc}</small>
            </span>
            <span class="status-badge ${d.estado === 'Obligatorio' ? 'status-confirmed' : (d.estado === 'Condicional' ? 'status-orientative' : (d.estado === 'Por verificar' ? 'status-verify' : 'status-calculated'))}" style="margin-left: auto; white-space: nowrap;">${d.estado}</span>
          </label>
        `).join('')}
      </div>
    </div>
  `).join('');
}

function exportCalculatorToExcel(item, entityInfo, res) {
  if (!res) return;
  const rawCode = (item && item.codigo10) ? item.codigo10.replace(/\D/g, '') : '8517130000';
  const fileName = `Proforma_SUNAT_${rawCode}_${new Date().toISOString().slice(0, 10)}.xls`;
  
  const adValoremFormula = res.preferenciaAplicada ? "0" : "=B10*B14";

  const excelTemplate = `
  <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
  <head>
    <meta charset="UTF-8">
    <!--[if gte mso 9]>
    <xml>
      <x:ExcelWorkbook>
        <x:ExcelWorksheets>
          <x:ExcelWorksheet>
            <x:Name>Liquidación Aduanera</x:Name>
            <x:WorksheetOptions>
              <x:DisplayGridlines/>
            </x:WorksheetOptions>
          </x:ExcelWorksheet>
        </x:ExcelWorksheets>
      </x:ExcelWorkbook>
    </xml>
    <![endif]-->
    <style>
      th { background-color: #1e3a8a; color: #ffffff; font-weight: bold; text-align: center; border: 1pt solid #000000; font-family: Arial; font-size: 11pt; padding: 6px; }
      td { border: 0.5pt solid #cbd5e1; font-family: Arial; font-size: 10pt; padding: 5px; }
      .header-title { background-color: #1e3a8a; color: #ffffff; font-size: 14pt; font-weight: bold; text-align: center; }
      .section-header { background-color: #0284c7; color: #ffffff; font-weight: bold; font-size: 11pt; }
      .subtotal-row { background-color: #f1f5f9; font-weight: bold; }
      .total-row { background-color: #dcfce7; font-weight: bold; color: #166534; font-size: 11pt; }
      .formula-cell { background-color: #eff6ff; font-family: 'Courier New', monospace; font-size: 9pt; color: #1e40af; mso-number-format:"\\@"; }
      .num-usd { mso-number-format:"\\$#,##0.00"; text-align: right; }
      .num-pen { mso-number-format:"S/\\.#,##0.00"; text-align: right; }
      .num-rate { mso-number-format:"0.000"; text-align: right; }
      .num-pct { mso-number-format:"0.0%"; text-align: right; }
    </style>
  </head>
  <body>
    <table>
      <!-- Fila 1 -->
      <tr><th colspan="4" class="header-title">PROFORMA DE LIQUIDACIÓN ADUANERA & COSTO LANDED (SUNAT - PERÚ)</th></tr>
      <!-- Fila 2 -->
      <tr><td colspan="2"><b>Subpartida Nacional:</b> ${item ? item.codigo10 : '8517.13.00.00'}</td><td colspan="2"><b>Fecha de Emisión:</b> ${new Date().toLocaleDateString('es-PE')}</td></tr>
      <!-- Fila 3 -->
      <tr><td colspan="4"><b>Descripción Oficial:</b> ${item ? item.descripcionOficial : 'Mercancía de Importación'}</td></tr>
      <!-- Fila 4 -->
      <tr><td colspan="2"><b>Entidad Reguladora:</b> ${entityInfo ? entityInfo.entidad_siglas : 'SUNAT'}</td><td colspan="2"><b>Trámite VUCE:</b> ${entityInfo ? entityInfo.codigo_tramite_vuce : 'No requiere'}</td></tr>
      <!-- Fila 5 -->
      <tr><td colspan="4"></td></tr>
      
      <!-- Fila 6 -->
      <tr><th colspan="4" class="section-header">1. EMBARQUE INTERNACIONAL (VALOR CIF BASE)</th></tr>
      <!-- Fila 7 -->
      <tr><td>Valor FOB</td><td class="num-usd">${res.fob}</td><td>USD $</td><td>Declarado en Factura Comercial</td></tr>
      <!-- Fila 8 -->
      <tr><td>Flete Internacional</td><td class="num-usd">${res.flete}</td><td>USD $</td><td>Conocimiento de Embarque / B/L / AWB</td></tr>
      <!-- Fila 9 -->
      <tr><td>Seguro Internacional</td><td class="num-usd">${res.seguro}</td><td>USD $</td><td>Póliza o Tabla de Seguro SUNAT</td></tr>
      <!-- Fila 10 -->
      <tr class="subtotal-row"><td>VALOR CIF BASE</td><td class="num-usd" x:fmla="=B7+B8+B9">${res.valorCIF}</td><td>USD $</td><td class="formula-cell">Fórmula: FOB + FLETE + SEGURO</td></tr>
      <!-- Fila 11 -->
      <tr><td colspan="4"></td></tr>

      <!-- Fila 12 -->
      <tr><th colspan="4" class="section-header">2. TRIBUTOS Y LEYES DE IMPORTACIÓN SUNAT</th></tr>
      <!-- Fila 13 -->
      <tr><td>Convenio Internacional (TLC)</td><td>${res.nombreTLC}</td><td colspan="2"><b>${res.estadoTLC}</b></td></tr>
      <!-- Fila 14 -->
      <tr><td>Arancel Ad-Valorem NMF Base (%)</td><td class="num-pct">${(res.baseAdValoremPct/100)}</td><td>% Base</td><td>Arancel General SUNAT 2022</td></tr>
      <!-- Fila 15 -->
      <tr><td>Arancel Ad-Valorem Aplicado (USD)</td><td class="num-usd" x:fmla="${adValoremFormula}">${res.montoAdValorem}</td><td>USD $</td><td class="formula-cell">${res.preferenciaAplicada ? '0% Desgravado por TLC' : 'Fórmula: CIF × %AdValorem'}</td></tr>
      <!-- Fila 16 -->
      <tr><td>ISC (Impuesto Selectivo Consumo %)</td><td class="num-pct">${(res.iscPct/100)}</td><td>% ISC</td><td>Impuesto Selectivo Consumo</td></tr>
      <!-- Fila 17 -->
      <tr><td>ISC (Monto USD $)</td><td class="num-usd" x:fmla="=(B10+B15)*B16">${res.montoISC}</td><td>USD $</td><td class="formula-cell">Fórmula: (CIF + AdValorem) × %ISC</td></tr>
      <!-- Fila 18 -->
      <tr><td>IGV (Impuesto General a Ventas - 15.5%)</td><td class="num-usd" x:fmla="=(B10+B15+B17)*0.155">${res.montoIGV}</td><td>USD $</td><td class="formula-cell">Fórmula: (CIF + AdValorem + ISC) × 15.5%</td></tr>
      <!-- Fila 19 -->
      <tr><td>IPM (Impuesto Promoción Municipal - 2.5%)</td><td class="num-usd" x:fmla="=(B10+B15+B17)*0.025">${res.montoIPM}</td><td>USD $</td><td class="formula-cell">Fórmula: (CIF + AdValorem + ISC) × 2.5%</td></tr>
      <!-- Fila 20 -->
      <tr class="subtotal-row"><td>Subtotal Tributos de Ley</td><td class="num-usd" x:fmla="=B15+B17+B18+B19">${res.subtotalTributos}</td><td>USD $</td><td class="formula-cell">Fórmula: AdValorem + ISC + IGV + IPM</td></tr>
      <!-- Fila 21 -->
      <tr><td>Percepción del IGV SUNAT (%)</td><td class="num-pct">${(res.percepcionPct/100)}</td><td>% Percepción</td><td>Adelanto Percepción IGV</td></tr>
      <!-- Fila 22 -->
      <tr><td>Monto Percepción IGV (USD $)</td><td class="num-usd" x:fmla="=(B10+B20)*B21">${res.montoPercepcion}</td><td>USD $</td><td class="formula-cell">Fórmula: (CIF + SubtotalTributos) × %Percepción</td></tr>
      <!-- Fila 23 -->
      <tr class="total-row"><td>TOTAL TRIBUTOS A PAGAR SUNAT</td><td class="num-usd" x:fmla="=B20+B22">${res.totalTributosSUNAT}</td><td>USD $</td><td class="formula-cell">Fórmula: SubtotalTributos + Percepción</td></tr>
      <!-- Fila 24 -->
      <tr><td colspan="4"></td></tr>

      <!-- Fila 25 -->
      <tr><th colspan="4" class="section-header">3. ESTRUCTURA DE COSTOS & RENTABILIDAD EN SOLES (PEN)</th></tr>
      <!-- Fila 26 -->
      <tr><td>Costo Landed Total (CIF + Tributos)</td><td class="num-usd" x:fmla="=B10+B23">${res.costoTotalLanded}</td><td>USD $</td><td class="formula-cell">Fórmula: CIF + TotalTributos</td></tr>
      <!-- Fila 27 -->
      <tr><td>Unidades Importadas</td><td align="right">${res.unidades}</td><td>Unidades</td><td>Unidades físicas nacionalizadas</td></tr>
      <!-- Fila 28 -->
      <tr><td>Costo Unitario Nacionalizado (USD)</td><td class="num-usd" x:fmla="=B26/B27">${res.costoUnitarioUSD}</td><td>USD $ / u</td><td class="formula-cell">Fórmula: CostoLanded / Unidades</td></tr>
      <!-- Fila 29 -->
      <tr><td>Tipo de Cambio Oficial SUNAT / SBS</td><td class="num-rate">${res.tipoCambio}</td><td>S/. PEN</td><td>Preserva 3 decimales oficiales</td></tr>
      <!-- Fila 30 -->
      <tr class="subtotal-row"><td>Costo Unitario Nacionalizado (PEN)</td><td class="num-pen" x:fmla="=B28*B29">${res.costoUnitarioPEN}</td><td>S/. PEN / u</td><td class="formula-cell">Fórmula: CostoUSD × TipoCambio</td></tr>
      <!-- Fila 31 -->
      <tr><td>Margen de Ganancia Deseado (%)</td><td class="num-pct">${(res.margenGananciaPct/100)}</td><td>% Margen</td><td>Margen comercial sobre costo</td></tr>
      <!-- Fila 32 -->
      <tr class="total-row"><td>PRECIO DE VENTA SUGERIDO (PEN)</td><td class="num-pen" x:fmla="=B30*(1+B31)">${res.precioVentaSugeridoPEN}</td><td>S/. PEN / u</td><td class="formula-cell">Fórmula: CostoPEN × (1 + %Margen)</td></tr>
    </table>
  </body>
  </html>`;

  const blob = new Blob([excelTemplate], { type: 'application/vnd.ms-excel;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast(`📊 Proforma exportada exitosamente a Excel: ${fileName}`);
}

function printSubheadingReport(item, entityInfo, res = null) {
  const printWin = window.open('', '_blank');
  if (!printWin) {
    showToast('⚠️ Permitir ventanas emergentes para imprimir el informe PDF');
    return;
  }

  const currentDate = new Date().toLocaleDateString('es-PE', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  printWin.document.write(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <title>Informe de Clasificación y Proforma CIF - ${item.codigo10}</title>
      <style>
        @page { size: A4 portrait; margin: 12mm; }
        body { font-family: 'Inter', system-ui, -apple-system, sans-serif; padding: 24px; color: #0f172a; line-height: 1.4; background: #fff; }
        .header-bar { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #1e3a8a; padding-bottom: 14px; margin-bottom: 16px; }
        .brand { font-size: 20px; font-weight: 800; color: #1e3a8a; }
        .disclaimer-banner { background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; padding: 8px 12px; color: #b45309; font-size: 11px; margin-bottom: 14px; font-style: italic; }
        .code-box { font-family: monospace; font-size: 22px; font-weight: 800; color: #2563eb; }
        .item-desc { font-size: 14px; font-weight: 700; color: #1e293b; margin-top: 4px; margin-bottom: 12px; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 12px; }
        .box { border: 1px solid #cbd5e1; padding: 12px; border-radius: 6px; background: #f8fafc; }
        .title { font-weight: 800; font-size: 11px; text-transform: uppercase; color: #1e3a8a; letter-spacing: 0.5px; margin-bottom: 6px; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; }
        .row-item { display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 4px; }
        table.report-table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 11px; }
        table.report-table th { background: #1e3a8a; color: #fff; font-weight: 700; padding: 6px 8px; text-align: left; }
        table.report-table td { border: 1px solid #cbd5e1; padding: 6px 8px; }
        table.report-table tr:nth-child(even) { background: #f8fafc; }
        .highlight-box { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px; padding: 10px; margin-top: 12px; color: #1e40af; font-size: 11px; }
        @media print { .no-print { display: none !important; } }
      </style>
    </head>
    <body>
      <div class="header-bar">
        <div>
          <div class="brand">PartidaArancelaria B2B · Proforma CIF & Ficha Técnica</div>
          <div style="font-size: 11px; color: #64748b;">Clasificador Arancelario Inteligente para Perú · Base NANDINA 2022</div>
          <div style="font-size: 10px; color: #64748b; margin-top: 2px;">Emisión Oficial: ${currentDate}</div>
        </div>
        <div style="text-align: right;">
          <div class="code-box">${item.codigo10}</div>
          <small style="color: #64748b;">Subpartida Nacional (10 dígitos)</small>
        </div>
      </div>

      <div class="disclaimer-banner">
        ⚠️ <strong>Aviso Legal Importante:</strong> Este informe constituye una herramienta técnico-orientativa de apoyo a operaciones de comercio exterior en Perú. No reemplaza una Resolución de Clasificación Arancelaria emitida por SUNAT.
      </div>

      <div class="item-desc"><strong>Mercancía:</strong> ${item.descripcionOficial}</div>

      <div class="grid">
        <div class="box">
          <div class="title">💸 Impuestos & Aranceles Base SUNAT</div>
          <div class="row-item"><span>Arancel Ad-Valorem NMF Base:</span> <strong>${item.adValorem}%</strong></div>
          <div class="row-item"><span>IGV (Impuesto General a las Ventas):</span> <strong>15.5%</strong></div>
          <div class="row-item"><span>IPM (Impuesto Promoción Municipal):</span> <strong>2.5%</strong></div>
          <div class="row-item"><span>ISC (Impuesto Selectivo Consumo):</span> <strong>${item.isc || 0}%</strong></div>
        </div>

        <div class="box">
          <div class="title">🛡️ Entidad de Control & VUCE</div>
          <div class="row-item"><span>Entidad Competente:</span> <strong style="color: #2563eb;">${entityInfo.entidad_siglas}</strong></div>
          <div class="row-item"><span>Estado Regulación:</span> <strong>${entityInfo.estado_regulacion}</strong></div>
          <div class="row-item"><span>Trámite VUCE:</span> <strong>${entityInfo.codigo_tramite_vuce}</strong></div>
        </div>
      </div>

      ${res ? `
        <div style="margin-top: 14px;">
          <div class="title" style="font-size: 12px;">📊 PROFORMA DE LIQUIDACIÓN ADUANERA & COSTO LANDED</div>
          <table class="report-table">
            <thead>
              <tr><th>Concepto de Liquidación</th><th>Base / Fórmulas</th><th>Monto USD $</th><th>Comentarios / Estado</th></tr>
            </thead>
            <tbody>
              <tr><td>Valor CIF Base</td><td>FOB ($${res.fob}) + Flete ($${res.flete}) + Seguro ($${res.seguro})</td><td><strong>$${res.valorCIF}</strong></td><td>Base Imponible SUNAT</td></tr>
              <tr><td>Convenio Internacional</td><td>${res.nombreTLC}</td><td>${res.preferenciaAplicada ? '$0.00' : '$' + res.montoAdValorem}</td><td><strong>${res.estadoTLC}</strong></td></tr>
              <tr><td>ISC</td><td>(CIF + Ad-Valorem) × ${res.iscPct}%</td><td>$${res.montoISC}</td><td>Impuesto Selectivo Consumo</td></tr>
              <tr><td>IGV (15.5%)</td><td>(CIF + Ad-Valorem + ISC) × 15.5%</td><td>$${res.montoIGV}</td><td>Tasa Ley Actualizada</td></tr>
              <tr><td>IPM (2.5%)</td><td>(CIF + Ad-Valorem + ISC) × 2.5%</td><td>$${res.montoIPM}</td><td>Tasa Ley Actualizada</td></tr>
              <tr style="background:#f1f5f9; font-weight:700;"><td>Subtotal Tributos Ley</td><td>Ad-Valorem + ISC + IGV + IPM</td><td>$${res.subtotalTributos}</td><td>Tributos Básicos</td></tr>
              <tr><td>Percepción IGV SUNAT</td><td>Base Percepción × ${res.percepcionPct}%</td><td>$${res.montoPercepcion}</td><td>Adelanto IGV SUNAT</td></tr>
              <tr style="background:#dcfce7; font-weight:700; color:#166534;"><td>TOTAL TRIBUTOS A PAGAR</td><td>Subtotal Tributos + Percepción</td><td><strong>$${res.totalTributosSUNAT} USD</strong></td><td>Pago SUNAT</td></tr>
            </tbody>
          </table>

          <div class="grid" style="margin-top: 12px;">
            <div class="box" style="background:#eff6ff;">
              <div class="title" style="color:#1e40af;">📈 COMERCIALIZACIÓN EN SOLES (PEN)</div>
              <div class="row-item"><span>Costo Landed Total USD:</span> <strong>$${res.costoTotalLanded} USD</strong></div>
              <div class="row-item"><span>Unidades Importadas:</span> <strong>${res.unidades} u</strong></div>
              <div class="row-item"><span>Costo Unitario USD:</span> <strong>$${res.costoUnitarioUSD} USD/u</strong></div>
              <div class="row-item"><span>Tipo de Cambio SUNAT:</span> <strong>S/. ${res.tipoCambio} PEN</strong></div>
              <div class="row-item" style="font-weight:700; font-size:12px; color:#1e40af;"><span>Costo Unitario PEN:</span> <span>S/. ${res.costoUnitarioPEN} PEN</span></div>
              <div class="row-item" style="font-weight:700; font-size:12px; color:#166534; margin-top:4px; padding-top:4px; border-top:1px solid #bfdbfe;">
                <span>Precio Venta Sugerido (${res.margenGananciaPct}%):</span> <span>S/. ${res.precioVentaSugeridoPEN} PEN (inc. IGV)</span>
              </div>
            </div>

            <div class="box">
              <div class="title">⚖️ ANÁLISIS RGI & DESGRAVACIÓN</div>
              <p style="font-size: 11px; color: #334155; line-height: 1.4; margin: 0;">
                ${res.mensajeTLC}
              </p>
              ${res.preferenciaAplicada ? `<div style="margin-top:8px; font-weight:700; color:#166534; font-size:11px;">💰 Ahorro estimado por TLC: $${res.ahorroUSD} USD</div>` : ''}
            </div>
          </div>
        </div>
      ` : ''}

      <div style="margin-top: 24px; text-align: center;" class="no-print">
        <button onclick="window.print()" style="padding: 10px 24px; font-size: 13px; font-weight: 700; background: #1e3a8a; color: #fff; border: none; border-radius: 6px; cursor: pointer;">🖨️ Imprimir / Guardar como PDF</button>
      </div>
    </body>
    </html>
  `);
  printWin.document.close();
}

/* -------------------------------------------------------------
 * 4. Atajos, Modales y Utilidades
 * ------------------------------------------------------------- */
function initCommandPaletteShortcut() {
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      const input = document.getElementById('main-search-input');
      if (input) {
        input.focus();
        input.select();
      }
    }
  });
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    showToast(`📋 Código ${text} copiado al portapapeles`);
  }).catch(err => console.error(err));
}

function showToast(msg) {
  const toast = document.getElementById('toast-copy');
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 2200);
}

async function fetchSunatExchangeRate() {
  try {
    const res = await fetch('/api/exchange-rate');
    if (res.ok) {
      const data = await res.json();
      const tcVal = parseFloat(data.tipoCambioImportacion) || 3.75;
      state.sunatExchangeRate = tcVal;
      const badgeValEl = document.getElementById('sunat-tc-val');
      if (badgeValEl) badgeValEl.textContent = `S/. ${tcVal.toFixed(3)}`;
      const calcTcInput = document.getElementById('calc-tc');
      if (calcTcInput) calcTcInput.value = tcVal.toFixed(3);
    }
  } catch (err) {
    console.warn('No se pudo actualizar T.C. SUNAT en vivo:', err);
  }
}

function syncAdValoremWithTLC() {
  const adValoremSelect = document.getElementById('calc-advalorem');
  const paisSelect = document.getElementById('calc-pais');
  const certValInput = document.getElementById('calc-cert-origen-val');
  const adValoremLabel = document.querySelector('label[for="calc-advalorem"]');
  if (!adValoremSelect || !paisSelect) return;

  if (state.activeItem && (!adValoremSelect.dataset.baseVal || adValoremSelect.dataset.activeCode !== state.activeItem.codigo10)) {
    adValoremSelect.dataset.baseVal = String(state.activeItem.adValorem);
    adValoremSelect.dataset.activeCode = state.activeItem.codigo10;
  }

  const baseNmf = adValoremSelect.dataset.baseVal || (state.activeItem ? String(state.activeItem.adValorem) : "6");
  const hasTLC = paisSelect.value !== 'NMF';
  const isAcredited = certValInput ? certValInput.value === 'true' : true;

  if (hasTLC && isAcredited) {
    adValoremSelect.value = "0";
    adValoremSelect.disabled = true;
    if (adValoremLabel) adValoremLabel.innerHTML = '📊 Arancel Ad-Valorem (%): <span style="color:var(--accent-green); font-weight:700;">[0% Liberado por TLC]</span>';
  } else {
    adValoremSelect.disabled = false;
    adValoremSelect.value = baseNmf;
    if (adValoremLabel) adValoremLabel.innerHTML = '📊 Arancel Ad-Valorem (%):';
  }
}

function initCalculatorModal() {
  const modal = document.getElementById('modal-calc');
  const btnOpen = document.getElementById('btn-quick-calc');
  const btnClose = document.getElementById('btn-close-calc-modal');
  const form = document.getElementById('form-calculator');
  const paisSelect = document.getElementById('calc-pais');
  const certValInput = document.getElementById('calc-cert-origen-val');
  const btnYes = document.getElementById('btn-cert-yes');
  const btnNo = document.getElementById('btn-cert-no');

  const updateSwitchUI = (isYes) => {
    if (!certValInput || !btnYes || !btnNo) return;
    certValInput.value = isYes ? 'true' : 'false';
    if (isYes) {
      btnYes.style.background = 'var(--accent-green)';
      btnYes.style.color = '#ffffff';
      btnNo.style.background = 'transparent';
      btnNo.style.color = 'var(--text-muted)';
    } else {
      btnNo.style.background = '#f59e0b';
      btnNo.style.color = '#ffffff';
      btnYes.style.background = 'transparent';
      btnYes.style.color = 'var(--text-muted)';
    }
  };

  if (btnYes && btnNo) {
    btnYes.onclick = () => {
      updateSwitchUI(true);
      syncAdValoremWithTLC();
      if (!modal.classList.contains('hidden')) calculateAndRender();
    };
    btnNo.onclick = () => {
      updateSwitchUI(false);
      syncAdValoremWithTLC();
      if (!modal.classList.contains('hidden')) calculateAndRender();
    };
  }

  if (btnOpen) {
    btnOpen.onclick = () => {
      modal.classList.remove('hidden');
      if (state.activeItem) {
        const advSel = document.getElementById('calc-advalorem');
        if (advSel) {
          advSel.dataset.baseVal = String(state.activeItem.adValorem);
          advSel.dataset.activeCode = state.activeItem.codigo10;
        }
        document.getElementById('calc-isc').value = state.activeItem.isc || 0;
      }
      syncAdValoremWithTLC();
      calculateAndRender();
    };
  }
  if (btnClose) btnClose.onclick = () => modal.classList.add('hidden');

  if (paisSelect) {
    paisSelect.addEventListener('change', () => {
      const hasTLC = paisSelect.value !== 'NMF';
      updateSwitchUI(hasTLC);
      syncAdValoremWithTLC();
      if (!modal.classList.contains('hidden')) calculateAndRender();
    });
  }

  // Recálculo reactivo en tiempo real al escribir o modificar cualquier campo
  ['input', 'change'].forEach(evt => {
    form.addEventListener(evt, () => {
      syncAdValoremWithTLC();
      if (!modal.classList.contains('hidden')) calculateAndRender();
    });
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    calculateAndRender();
  });
}

function calculateAndRender() {
  const fob = parseFloat(document.getElementById('calc-fob').value) || 0;
  const flete = parseFloat(document.getElementById('calc-flete').value) || 0;
  const seguro = parseFloat(document.getElementById('calc-seguro').value) || 0;
  const adValoremSelect = document.getElementById('calc-advalorem');
  const baseNmf = adValoremSelect ? (adValoremSelect.dataset.baseVal || adValoremSelect.value) : 0;
  const adValoremPct = parseFloat(baseNmf) || 0;
  const iscPct = parseFloat(document.getElementById('calc-isc').value) || 0;
  const percepcionPct = parseFloat(document.getElementById('calc-percepcion').value) || 3.5;
  const paisOrigen = document.getElementById('calc-pais')?.value || 'NMF';
  const certValInput = document.getElementById('calc-cert-origen-val');
  const tlcVerificado = certValInput ? certValInput.value === 'true' : true;
  const unidades = parseInt(document.getElementById('calc-unidades')?.value) || 100;
  const tipoCambio = parseFloat(document.getElementById('calc-tc')?.value) || 3.75;
  const margenGananciaPct = parseFloat(document.getElementById('calc-margen')?.value) || 30;

  const res = TariffCalculator.calculate({
    fob, flete, seguro, adValoremPct, iscPct, percepcionPct,
    paisOrigen, tlcVerificado, unidades, tipoCambio, margenGananciaPct
  });

  const output = document.getElementById('calc-results-output');
  output.innerHTML = `
    <div style="padding: 14px; background: var(--bg-app); border: 1px solid var(--border-color); border-radius: 8px;">
      <h4 style="font-size: 13px; color: var(--accent-blue); margin-bottom: 8px;">📊 Resumen de Liquidación CIF:</h4>
      <div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px;">
        <span>Valor CIF Base:</span> <strong>$${res.valorCIF} USD</strong>
      </div>
      
      <div style="padding: 8px 10px; margin: 8px 0; background: var(--bg-hover); border-left: 3px solid ${res.preferenciaAplicada ? 'var(--accent-green)' : 'var(--accent-amber)'}; border-radius: 4px; font-size: 11px;">
        <strong>Convenio: ${res.nombreTLC}</strong>
        <p style="margin-top: 2px; color: var(--text-secondary); line-height: 1.3;">${res.mensajeTLC}</p>
        <div style="margin-top: 4px; display: flex; flex-wrap: wrap; gap: 6px; align-items: center;">
          <span class="status-badge ${res.preferenciaAplicada ? 'status-confirmed' : 'status-verify'}">${res.estadoTLC}</span>
          ${paisOrigen === 'CN' ? `<a href="http://check.ccpit.org" target="_blank" rel="noopener" style="font-size: 10px; color: var(--accent-blue); text-decoration: underline; font-weight: 600;">🔍 Verificar Certificado en CCPIT China (check.ccpit.org)</a>` : ''}
          ${paisOrigen === 'EU' ? `<span style="font-size: 10px; color: var(--text-muted);">📄 Requiere Formato EUR.1 / Exportador Autorizado</span>` : ''}
          ${paisOrigen === 'US' ? `<span style="font-size: 10px; color: var(--text-muted);">📄 Requiere Declaración de Origen APC EE.UU.</span>` : ''}
        </div>
      </div>

      ${paisOrigen !== 'NMF' && !res.preferenciaAplicada ? `
        <div style="padding: 10px 12px; margin: 8px 0; background: #fffbe0; border: 1.5px solid #f59e0b; border-radius: 6px; color: #92400e; font-size: 11px; line-height: 1.4;">
          <strong>⚠️ ALERTA PENALIZACIÓN ADUANERA:</strong> Al declarar <strong>[ NO ]</strong> en la posesión del Certificado de Origen emitido en origen, la SUNAT penalizará cobrando el <strong>Arancel Estándar NMF (${res.baseAdValoremPct}%)</strong> a pesar de existir un TLC vigente con ${res.nombreTLC}.
        </div>
      ` : ''}

      ${paisOrigen !== 'NMF' && res.preferenciaAplicada ? `
        <div style="padding: 10px 12px; margin: 8px 0; background: #ecfdf5; border: 1.5px solid #10b981; border-radius: 6px; color: #065f46; font-size: 11px; line-height: 1.4;">
          <strong>✅ CONVENIO VERIFICADO:</strong> Declarado <strong>[ SÍ ]</strong> con Certificado de Origen. Ad-Valorem desgravado a 0% generando un ahorro arancelario de <strong>$${res.ahorroUSD} USD</strong>.
        </div>
      ` : ''}

      <div style="display: grid; gap: 4px; font-size: 12px; margin-top: 8px;">
        <div style="display: flex; justify-content: space-between;"><span>Ad-Valorem (${res.adValoremPct}%):</span> <span>$${res.montoAdValorem} USD</span></div>
        <div style="display: flex; justify-content: space-between;"><span>IGV (15.5%) + IPM (2.5%):</span> <span>$${(parseFloat(res.montoIGV) + parseFloat(res.montoIPM)).toFixed(2)} USD</span></div>
        <div style="display: flex; justify-content: space-between;"><span>Percepción IGV (${res.percepcionPct}%):</span> <span>$${res.montoPercepcion} USD</span></div>
        <div style="display: flex; justify-content: space-between; font-weight: 700; color: var(--accent-green); margin-top: 4px; padding-top: 4px; border-top: 1px solid var(--border-color);">
          <span>TOTAL TRIBUTOS SUNAT:</span> <span>$${res.totalTributosSUNAT} USD</span>
        </div>
      </div>

      <div style="margin-top: 12px; padding-top: 10px; border-top: 1px dashed var(--border-color);">
        <h4 style="font-size: 12px; color: var(--text-muted); text-transform: uppercase; margin-bottom: 6px;">📐 Fórmulas Explícitas (BASE × TASA = RESULTADO):</h4>
        <div style="display: grid; gap: 4px; font-size: 11px; font-family: var(--font-mono);">
          ${res.formulas.map(f => `
            <div style="display: flex; justify-content: space-between; padding: 3px 6px; background: var(--bg-panel); border-radius: 4px;">
              <span>${f.concepto}: ${f.formula}</span>
              <strong>${f.resultado}</strong>
            </div>
          `).join('')}
        </div>
      </div>

      <div style="margin-top: 12px; padding-top: 10px; border-top: 1px dashed var(--border-color);">
        <h4 style="font-size: 13px; color: var(--accent-blue);">📈 Comercialización en Soles:</h4>
        <div style="display: flex; justify-content: space-between; font-size: 12px; margin-top: 4px;">
          <span>Costo Landed Total:</span> <strong>$${res.costoTotalLanded} USD</strong>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 12px;">
          <span>Costo Unitario Nacionalizado:</span> <strong>$${res.costoUnitarioUSD} USD / S/. ${res.costoUnitarioPEN} PEN</strong>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 12px; margin-top: 4px; padding: 6px 8px; background: var(--accent-blue-bg); border-radius: 4px; color: var(--accent-blue); font-weight: 700;">
          <span>Precio Venta Sugerido (${res.margenGananciaPct}% margen):</span> <span>S/. ${res.precioVentaSugeridoPEN} PEN (inc. IGV)</span>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 12px;">
        <button type="button" id="btn-print-calc-report" class="btn-primary-action" style="margin-top: 0; padding: 10px; font-size: 12px;">
          📄 Exportar Cotización a PDF
        </button>
        <button type="button" id="btn-export-calc-excel" class="btn-primary-action" style="margin-top: 0; padding: 10px; font-size: 12px; background: #15803d; border-color: #15803d;">
          📊 Exportar a Excel (Fórmulas)
        </button>
      </div>
    </div>
  `;

  output.querySelector('#btn-print-calc-report')?.addEventListener('click', () => {
    const item = state.activeItem || {
      codigo10: '8517.13.00.00',
      descripcionOficial: 'Mercancía de Importación',
      adValorem: res.adValoremPct,
      isc: res.iscPct,
      unidadMedida: 'UNIDAD (u)',
      seccion: 'XVI', capitulo: '85', partida4: '8517'
    };
    const entityInfo = state.searchEngine.resolveEntity(item);
    printSubheadingReport(item, entityInfo, res);
  });

  output.querySelector('#btn-export-calc-excel')?.addEventListener('click', () => {
    const item = state.activeItem || {
      codigo10: '8517.13.00.00',
      descripcionOficial: 'Mercancía de Importación',
      adValorem: res.adValoremPct,
      isc: res.iscPct,
      unidadMedida: 'UNIDAD (u)',
      seccion: 'XVI', capitulo: '85', partida4: '8517'
    };
    const entityInfo = state.searchEngine.resolveEntity(item);
    exportCalculatorToExcel(item, entityInfo, res);
  });
}

function initComparatorModal() {
  const modal = document.getElementById('modal-comparator');
  const btnClose = document.getElementById('btn-close-comparator-modal');
  if (btnClose) btnClose.onclick = () => modal.classList.add('hidden');
}

function openComparisonModal(choices = []) {
  const modal = document.getElementById('modal-comparator');
  const container = document.getElementById('comparator-matrix-content');
  if (!modal || !container) return;

  const items = choices.map(choice => {
    const code = choice.code || choice.codigo10;
    const matches = state.searchEngine.search({ query: code });
    return matches.length > 0 ? matches[0] : null;
  }).filter(Boolean);

  if (items.length < 2) {
    showToast('⚠️ Se requieren al menos 2 subpartidas para realizar una comparación lado a lado.');
    return;
  }

  container.innerHTML = `
    <div style="display: grid; grid-template-columns: repeat(${items.length}, 1fr); gap: 14px; overflow-x: auto;">
      ${items.map((item, index) => {
        const entityInfo = state.searchEngine.resolveEntity(item);
        const tlcInfo = state.searchEngine.getTlcAnalysis(item, 'CN');
        const isComplete = !item.descripcionOficial.toLowerCase().includes('partes') && !item.descripcionOficial.toLowerCase().includes('accesorios');
        const diffKey = isComplete ? 'Producto o unidad funcional completa' : 'Parte, repuesto o accesorio desmontado';
        const rationale = `RGI 1 y 6 — Clasificación por texto expreso de la subpartida nacional ${item.codigo10}.`;
        const neededInfo = isComplete ? 'Confirmar si se importa ensamblado y listo para funcionamiento.' : 'Confirmar si la mercancía se importa individualmente como pieza de repuesto.';

        return `
          <div style="border: 1.5px solid ${index === 0 ? 'var(--accent-blue)' : 'var(--border-color)'}; border-radius: 8px; padding: 14px; background: var(--bg-hover);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
              <span style="font-family: var(--font-mono); font-weight: 700; font-size: 15px; color: var(--accent-blue);">${item.codigo10}</span>
              <span class="status-badge ${index === 0 ? 'status-confirmed' : 'status-orientative'}">${index === 0 ? 'Opción Principal' : 'Alternativa'}</span>
            </div>
            <div style="font-weight: 700; font-size: 13px; margin-bottom: 10px; min-height: 38px;">${state.searchEngine.getDisplayDescription(item)}</div>

            <div style="display: grid; gap: 8px; font-size: 11px;">
              <div style="padding: 6px 8px; background: var(--bg-app); border-left: 3px solid var(--accent-blue); border-radius: 4px;">
                <strong>🔍 Diferencia Clave:</strong> ${diffKey}
              </div>
              <div style="padding: 6px 8px; background: var(--bg-app); border-left: 3px solid var(--accent-green); border-radius: 4px;">
                <strong>⚖️ Razón de Clasificación:</strong> ${rationale}
              </div>
              <div style="padding: 6px 8px; background: var(--bg-app); border-left: 3px solid var(--accent-amber); border-radius: 4px;">
                <strong>❓ Información Necesaria:</strong> ${neededInfo}
              </div>
            </div>

            <div style="margin-top: 12px; border-top: 1px solid var(--border-color); padding-top: 10px; display: grid; gap: 4px; font-size: 12px;">
              <div style="display: flex; justify-content: space-between;"><span>Ad-Valorem NMF:</span> <strong>${item.adValorem}%</strong></div>
              <div style="display: flex; justify-content: space-between;"><span>Entidad Reguladora:</span> <strong>${entityInfo.entidad_siglas}</strong></div>
              <div style="display: flex; justify-content: space-between;"><span>Estado Permiso:</span> <span class="status-badge ${entityInfo.mercanciaRestringida === 'Sí' ? 'status-verify' : 'status-confirmed'}">${entityInfo.estado_regulacion}</span></div>
              <div style="display: flex; justify-content: space-between;"><span>TLC Preferencia:</span> <span>${tlcInfo.preferencialRate}</span></div>
            </div>

            <button type="button" class="btn-primary-action select-comp-item" data-code="${item.codigo10}" style="width: 100%; margin-top: 12px;">
              🎯 Seleccionar Subpartida
            </button>
          </div>
        `;
      }).join('')}
    </div>
  `;

  modal.classList.remove('hidden');

  container.querySelectorAll('.select-comp-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const code = btn.dataset.code;
      const matches = state.searchEngine.search({ query: code });
      if (matches.length > 0) {
        state.activeItem = matches[0];
        updateActiveItemPanel(state.activeItem);
      }
      modal.classList.add('hidden');
    });
  });
}

function initReglas() {
  renderDynamicRgiTab(state.activeItem);
  renderResolucionesTab(state.activeItem ? state.activeItem.codigo10 : '');
  renderNotasLegalesTab(state.activeItem);
  initRgiWizard();
}

function initRgiWizard() {
  const modal = document.getElementById('modal-rgi-wizard');
  const btnOpen = document.getElementById('btn-open-rgi-wizard');
  const btnClose = document.getElementById('btn-close-rgi-modal');
  const btnRun = document.getElementById('btn-run-rgi-diagnosis');
  const output = document.getElementById('rgi-diagnosis-output');

  if (btnOpen) btnOpen.onclick = () => modal.classList.remove('hidden');
  if (btnClose) btnClose.onclick = () => modal.classList.add('hidden');

  if (btnRun) {
    btnRun.onclick = () => {
      const isSet = document.querySelector('input[name="rgi-p1"]:checked')?.value === 'rgi3b';
      const factor = document.getElementById('rgi-p2-factor')?.value || 'funcion';

      output.classList.remove('hidden');
      if (!isSet) {
        output.innerHTML = `
          <h4 style="color: var(--accent-blue); font-size: 13px; font-weight: 700;">⚖️ Análisis Técnico RGI 1 & 6 (Denominación Directa Específica)</h4>
          <p style="margin-top: 6px; font-size: 12px; color: var(--text-secondary); line-height: 1.5;">
            Por tratarse de un artículo individual con denominación técnica expresa en el arancel, la clasificación se rige estrictamente por la <strong>RGI 1 y RGI 6</strong>. Prevalece el texto de la subpartida nacional a 10 dígitos sobre cualquier interpretación general.
          </p>
        `;
      } else if (factor === 'funcion') {
        output.innerHTML = `
          <h4 style="color: var(--accent-blue); font-size: 13px; font-weight: 700;">⚖️ Análisis Técnico RGI 3b (Carácter Esencial por Función Principal)</h4>
          <p style="margin-top: 6px; font-size: 12px; color: var(--text-secondary); line-height: 1.5;">
            En cumplimiento de la <strong>Regla General Interpretativa 3b</strong>, los productos presentados en surtidos o juegos al por menor se clasifican atendiendo al componente que le confiere su <strong>función técnica determinante</strong>.
          </p>
        `;
      } else if (factor === 'materia') {
        output.innerHTML = `
          <h4 style="color: var(--accent-blue); font-size: 13px; font-weight: 700;">⚖️ Análisis Técnico RGI 3b (Materia Constitutiva Predominante)</h4>
          <p style="margin-top: 6px; font-size: 12px; color: var(--text-secondary); line-height: 1.5;">
            Clasificación asignada por el material o materia prima que le otorga el carácter esencial en volumen, peso exterior o superficie expuesta.
          </p>
        `;
      } else {
        output.innerHTML = `
          <h4 style="color: var(--accent-blue); font-size: 13px; font-weight: 700;">⚖️ Análisis Técnico RGI 3c (Último Orden Numérico)</h4>
          <p style="margin-top: 6px; font-size: 12px; color: var(--text-secondary); line-height: 1.5;">
            Al no ser posible determinar el carácter esencial por las Reglas 3a ni 3b, la <strong>RGI 3c</strong> exige clasificar en la <strong>última subpartida por orden numérico</strong> entre las susceptibles de tenerse en cuenta.
          </p>
        `;
      }
    };
  }
}

function renderResolucionesTab(query = '') {
  const container = document.getElementById('sunat-resolutions-list');
  if (!container) return;

  const resolutions = state.searchEngine.getSunatResolutions(query || (state.activeItem ? state.activeItem.codigo10 : ''));
  if (!resolutions.length) {
    container.innerHTML = `<div style="padding: 16px; text-align: center; color: var(--text-muted);">Sin resoluciones específicas registradas para esta búsqueda.</div>`;
    return;
  }

  container.innerHTML = resolutions.map(r => `
    <div style="padding: 14px; border: 1.5px solid var(--border-color); border-radius: 8px; background: var(--bg-app);">
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-color); padding-bottom: 6px;">
        <span style="font-weight: 700; color: var(--accent-blue); font-size: 13px;">📜 ${r.numero}</span>
        <span class="adv-pill adv-0" style="font-size: 10px;">${r.fecha}</span>
      </div>
      <div style="margin-top: 8px; font-weight: 700; color: var(--text-main); font-size: 13px;">${r.producto}</div>
      <div style="margin-top: 4px; font-size: 12px; color: var(--text-secondary); line-height: 1.4;">${r.criterio}</div>
      <div style="margin-top: 8px; display: flex; justify-content: space-between; align-items: center; font-size: 11px;">
        <span style="font-family: var(--font-mono); font-weight: 700; color: var(--accent-blue);">Subpartida Asignada: ${r.codigo10}</span>
        <span style="color: var(--text-muted);">${r.entidad}</span>
      </div>
    </div>
  `).join('');
}

function renderNotasLegalesTab(item = state.activeItem) {
  const container = document.getElementById('legal-notes-container');
  if (!container) return;

  const capId = item ? item.capitulo : '84';
  const notes = state.searchEngine.getLegalNotes(capId);

  container.innerHTML = `
    <div style="display: grid; gap: 10px;">
      <details open style="border: 1.5px solid var(--accent-blue); border-radius: 8px; background: var(--bg-app); padding: 14px;">
        <summary style="font-weight: 700; color: var(--accent-blue); cursor: pointer; font-size: 14px; outline: none;">
          📑 ${notes.capitulo} (Notas de Sección y Capítulo)
        </summary>
        <div style="margin-top: 10px; border-top: 1px solid var(--border-color); padding-top: 10px; display: grid; gap: 12px;">
          <div>
            <strong style="color: var(--text-main); font-size: 12px;">📌 Nota de Sección (Sistema Armonizado):</strong>
            <p style="margin-top: 4px; font-size: 12px; color: var(--text-secondary); line-height: 1.5;">${notes.notaSeccion}</p>
          </div>
          <div style="padding: 10px; background: var(--bg-panel); border: 1px solid var(--border-color); border-radius: 6px;">
            <strong style="color: var(--accent-blue); font-size: 12px;">📜 Nota Explicativa de Capítulo:</strong>
            <p style="margin-top: 4px; font-size: 12px; color: var(--text-main); line-height: 1.5;">${notes.notaCapitulo}</p>
          </div>
        </div>
      </details>

      <details style="border: 1px solid var(--border-color); border-radius: 8px; background: var(--bg-app); padding: 14px;">
        <summary style="font-weight: 600; color: var(--text-main); cursor: pointer; font-size: 13px; outline: none;">
          ⚖️ Criterios Generales de Exclusión del Capítulo ${capId}
        </summary>
        <div style="margin-top: 8px; font-size: 12px; color: var(--text-secondary); line-height: 1.5;">
          Se excluyen de este Capítulo las preparaciones o mercancías reguladas expresamente por Capítulos de farmacia (Cap. 30), armas/explosivos (Cap. 93) o artículos de recreación/deporte (Cap. 95).
        </div>
      </details>
    </div>
  `;
}

function renderDynamicRgiTab(item = state.activeItem) {
  const container = document.getElementById('reglas-list-grid');
  if (!container) return;

  if (!item) {
    container.innerHTML = `
      <div style="padding: 20px; text-align: center; color: var(--text-muted); border: 1px dashed var(--border-color); border-radius: 8px;">
        🔍 Selecciona o busca una subpartida en el workbench para consultar su <strong>Análisis Técnico RGI</strong>.
      </div>
    `;
    return;
  }

  const code = item.codigo10 || '';
  const desc = state.searchEngine.getDisplayDescription(item);
  let ruleTitle = 'Regla General Interpretativa 1 & 6 (Texto de la Subpartida)';
  let rationaleText = `Clasificación fundamentada bajo las RGI 1 y 6 del Arancel de Aduanas SUNAT 2022. La mercancía se determina por el texto expreso de la subpartida nacional a 10 dígitos ${code}.`;
  let decisionFactor = 'Denominación Específica en la Nomenclatura NANDINA';

  if (code.startsWith('8517') || code.startsWith('8471') || code.startsWith('9504') || code.startsWith('8703')) {
    ruleTitle = 'Regla General Interpretativa 1, 3a & 6 (Especificidad Técnica de la Función)';
    rationaleText = `Por aplicación de la RGI 3a, la partida con descripción técnica más específica (${item.partida4}) prevalece sobre partidas genéricas. La subpartida nacional a 10 dígitos se determina por la RGI 6.`;
    decisionFactor = 'Función Principal y Especificidad de Uso Técnico';
  } else if (code.startsWith('61') || code.startsWith('62') || code.startsWith('64') || code.startsWith('39') || code.startsWith('73')) {
    ruleTitle = 'Regla General Interpretativa 3b (Carácter Esencial & Materia Predominante)';
    rationaleText = `Clasificación asignada bajo la RGI 3b atendiendo a la materia constitutiva o material que le otorga el carácter esencial al producto en peso o superficie.`;
    decisionFactor = 'Composición del Material Constitutivo Predominante';
  }

  container.innerHTML = `
    <div style="padding: 16px; border: 1.5px solid var(--accent-blue); border-radius: 8px; background: var(--bg-app);">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; margin-bottom: 10px; border-bottom: 1px solid var(--border-color); padding-bottom: 8px;">
        <div>
          <span style="font-family: var(--font-mono); font-size: 16px; font-weight: 700; color: var(--accent-blue);">${code}</span>
          <div style="font-size: 13px; font-weight: 700; color: var(--text-main); margin-top: 2px;">${desc}</div>
        </div>
        <span class="status-badge status-orientative">Resultado Orientativo</span>
      </div>

      <div style="margin-top: 10px;">
        <h4 style="color: var(--accent-blue); font-size: 13px; font-weight: 700;">⚖️ ${ruleTitle}</h4>
        <p style="margin-top: 6px; font-size: 12px; color: var(--text-secondary); line-height: 1.5;">${rationaleText}</p>
      </div>

      <div style="margin-top: 12px; padding: 10px; background: var(--bg-panel); border: 1px solid var(--border-color); border-radius: 6px; font-size: 11px;">
        <strong style="color: var(--text-muted); text-transform: uppercase;">Criterio Técnico:</strong>
        <span style="color: var(--text-main); font-weight: 600; margin-left: 6px;">${decisionFactor}</span>
      </div>
    </div>
  `;
}

function toggleFavorite(codigo10) {
  const index = state.favorites.indexOf(codigo10);
  if (index >= 0) state.favorites.splice(index, 1);
  else state.favorites.push(codigo10);
  localStorage.setItem('arancel_favs', JSON.stringify(state.favorites));
  updateFavoritesBadge();
}

function updateFavoritesBadge() {
  const el = document.getElementById('fav-count');
  if (el) el.textContent = state.favorites.length;
}

function initThemeToggle() {
  const btn = document.getElementById('btn-theme-toggle');
  btn.addEventListener('click', () => {
    document.body.classList.toggle('theme-dark');
    document.body.classList.toggle('theme-light');
  });
}
