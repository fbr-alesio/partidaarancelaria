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

    // Poblar dinámicamente fechas de consulta del sistema y cantidad real de subpartidas
    const todayStr = new Date().toLocaleDateString('es-PE');
    document.querySelectorAll('.dynamic-query-date').forEach(el => {
      el.textContent = todayStr;
    });
    const catalogBadge = document.getElementById('catalog-count-badge');
    if (catalogBadge && subpartidas.length > 0) {
      catalogBadge.textContent = subpartidas.length.toLocaleString();
    }

    initTreeView();
    initSearch();
    initCenterTabs();
    initCalculatorModal();
    initInPageCifCalculator();
    initComparatorModal();
    initReglas();
    initThemeToggle();
    initEditableExchangeRate();
    initCommandPalette();
    initCommandPaletteShortcut();
    initGlossary();
    initRecentSearches();
    initShareableLink();
    initEntityFilters();
    updateFavoritesBadge();
    initWorkspaceActions();

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
    updateAutocompleteDropdown(val);
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
    const val = selectAdValorem.value;
    document.querySelectorAll('.chip[data-rate-val]').forEach(c => {
      c.classList.toggle('active', c.dataset.rateVal === val);
    });
    renderSearchResults();
  });

  const chips = document.querySelectorAll('.chip[data-rate-val]');
  chips.forEach(chip => {
    chip.addEventListener('click', () => {
      chips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      if (selectAdValorem) {
        selectAdValorem.value = chip.dataset.rateVal;
      }
      renderSearchResults();
    });
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
  const savedTab = localStorage.getItem('arancel_active_tab');

  if (savedTab) {
    const tabToActivate = Array.from(tabs).find(t => t.dataset.centertab === savedTab);
    if (tabToActivate) {
      tabs.forEach(t => t.classList.remove('active'));
      tabToActivate.classList.add('active');
      document.querySelectorAll('.center-tab-content').forEach(c => c.classList.remove('active'));
      const targetContent = document.getElementById(savedTab);
      if (targetContent) targetContent.classList.add('active');
    }
  }

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetId = tab.dataset.centertab;
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      document.querySelectorAll('.center-tab-content').forEach(c => c.classList.remove('active'));
      const targetContent = document.getElementById(targetId);
      if (targetContent) targetContent.classList.add('active');
      localStorage.setItem('arancel_active_tab', targetId);
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
  const activeEntityChip = document.querySelector('.entity-chip.active[data-entity-val]');
  const entityVal = activeEntityChip ? activeEntityChip.dataset.entityVal : '';

  let results = [];
  // Activar y restaurar el panel de resultados al buscar
  if (query.trim()) {
    const tabGeneral = document.querySelector('.center-tab[data-centertab="tab-general"]');
    if (tabGeneral && !tabGeneral.classList.contains('active')) {
      tabGeneral.click();
    }
  }

  if (state.activeCapitulo) {
    results = state.searchEngine.search({ capitulo: state.activeCapitulo, adValorem });
  } else if (state.activeSeccion) {
    results = state.searchEngine.search({ seccion: state.activeSeccion, adValorem });
  } else if (!query.trim() && state.relatedItem) {
    results = state.searchEngine.search({ adValorem }).filter(item => item.partida4 === state.relatedItem.partida4);
  } else {
    results = state.searchEngine.search({ query, adValorem });
  }

  if (entityVal) {
    results = results.filter(item => {
      const entityInfo = state.searchEngine.resolveEntity(item);
      if (entityVal === 'LIBRE') return entityInfo.mercanciaRestringida !== 'Sí';
      return entityInfo.entidad_siglas === entityVal;
    });
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
  }
}

function updateActiveItemPanel(item) {
  const actionableButtons = [
    document.getElementById('btn-copy-active-code'),
    document.getElementById('btn-export-pdf'),
    document.getElementById('btn-cif-export-pdf'),
    document.getElementById('btn-cif-export-excel')
  ].filter(Boolean);
  const tlcList = document.querySelector('.tlc-badges-list');

  if (!item) {
    document.getElementById('active-code-display').textContent = '—';
    document.getElementById('active-desc-display').textContent = 'Selecciona una subpartida para consultar su ficha';
    document.getElementById('active-breadcrumb-display').textContent = 'Sin selección activa';
    const advEl = document.getElementById('active-adv-display');
    advEl.textContent = '—';
    advEl.className = 'pct';
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
  advEl.textContent = `${item.adValorem}%`;
  advEl.className = 'pct';

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
  syncCalculatorWithActiveItem(item);
  if (window.addRecentItemToHistory) window.addRecentItemToHistory(item);
  if (window.TabManager && window.TabManager.updateActiveTabCode) {
    window.TabManager.updateActiveTabCode(item.codigo10, fromSearch);
  }

  const btnCopy = document.getElementById('btn-copy-active-code');
  if (btnCopy) btnCopy.onclick = () => copyToClipboard(item.codigo10);

  const btnExportPdf = document.getElementById('btn-export-pdf');
  if (btnExportPdf) btnExportPdf.onclick = () => printSubheadingReport(item, entityInfo);

  const btnFavHero = document.getElementById('btn-fav-hero');
  if (btnFavHero) {
    const isFav = state.favorites.includes(item.codigo10);
    btnFavHero.textContent = isFav ? '⭐ Guardado' : '⭐ Guardar';
    btnFavHero.onclick = () => {
      toggleFavorite(item.codigo10);
      const nowFav = state.favorites.includes(item.codigo10);
      btnFavHero.textContent = nowFav ? '⭐ Guardado' : '⭐ Guardar';
      renderSearchResults();
    };
  }

  const btnCifPdf = document.getElementById('btn-cif-export-pdf');
  if (btnCifPdf) btnCifPdf.onclick = () => printSubheadingReport(item, entityInfo);

  const btnCifExcel = document.getElementById('btn-cif-export-excel');
  if (btnCifExcel) {
    btnCifExcel.onclick = () => {
      if (!state.activeItem) return;
      const activeEntity = state.searchEngine.resolveEntity(state.activeItem);
      const fob = parseFloat(document.getElementById('inpage-fob')?.value.replace(/,/g, '')) || 1000;
      const flete = parseFloat(document.getElementById('inpage-flete')?.value.replace(/,/g, '')) || 150;
      const seguro = parseFloat(document.getElementById('inpage-seguro')?.value.replace(/,/g, '')) || 20;
      const activeAdvOpt = document.querySelector('.rate-opt.selected[data-inpage-adv]');
      const activeAdv = activeAdvOpt ? parseFloat(activeAdvOpt.dataset.inpageAdv) : (state.activeItem.adValorem || 0);
      const iscPct = parseFloat(document.getElementById('inpage-isc')?.value) || 0;
      const activePercOpt = document.querySelector('.rate-opt.selected[data-inpage-perc]');
      const activePerc = activePercOpt ? parseFloat(activePercOpt.dataset.inpagePerc) : 3.5;
      const btnCertYes = document.getElementById('inpage-cert-yes');
      const isCertYes = btnCertYes ? btnCertYes.classList.contains('selected') : false;
      const inpagePaisSelect = document.getElementById('inpage-pais');
      const paisOrigen = inpagePaisSelect ? inpagePaisSelect.value : 'NMF';
      const unidades = parseInt(document.getElementById('inpage-unidades')?.value, 10) || 1;
      const tcVal = document.getElementById('sunat-tc-val')?.textContent || '3.750';
      const tipoCambio = parseFloat(tcVal.replace(/[^\d.]/g, '')) || 3.75;
      const margenPct = parseFloat(document.getElementById('inpage-margen')?.value) || 35;

      const calcRes = TariffCalculator.calculate({
        fob, flete, seguro,
        adValoremPct: activeAdv,
        iscPct,
        percepcionPct: activePerc,
        paisOrigen,
        tlcVerificado: isCertYes,
        unidades,
        tipoCambio,
        margenGananciaPct: margenPct
      });

      exportCalculatorToExcel(state.activeItem, activeEntity, calcRes);
    };
  }
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
  const fileName = `Proforma_PartidaArancelaria_${rawCode}_${new Date().toISOString().slice(0, 10)}.xls`;
  const isManual = state.isManualAdValorem ? 'Simulación Manual' : 'Oficial (Subpartida)';
  const queryDate = new Date().toLocaleDateString('es-PE');
  const queryTime = new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });

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
      <tr><th colspan="4" class="header-title">PROFORMA DE ESTIMACIÓN DE IMPORTACIÓN & LIQUIDACIÓN ADUANERA</th></tr>
      <!-- Fila 2 -->
      <tr><td colspan="2"><b>Subpartida Nacional:</b> ${item ? item.codigo10 : '8517.13.00.00'}</td><td colspan="2"><b>Fecha de Emisión:</b> ${queryDate} ${queryTime}</td></tr>
      <!-- Fila 3 -->
      <tr><td colspan="4"><b>Descripción Oficial:</b> ${item ? item.descripcionOficial : 'Mercancía de Importación'}</td></tr>
      <!-- Fila 4 -->
      <tr><td colspan="2"><b>Modo de Cálculo:</b> ${isManual}</td><td colspan="2"><b>Base Arancelaria:</b> Arancel 2022 (D.S. N.º 404-2021-EF)</td></tr>
      <!-- Fila 5 -->
      <tr><td colspan="2"><b>Entidad Reguladora:</b> ${entityInfo ? entityInfo.entidad_siglas : 'MTC / SUNAT'}</td><td colspan="2"><b>Tipo de Cambio Referencial:</b> S/ ${res.tipoCambio} (Fuente: SBS)</td></tr>
      <!-- Fila 6 -->
      <tr><td colspan="4"></td></tr>
      
      <!-- Fila 7 -->
      <tr><th colspan="4" class="section-header">1. VALOR EN ADUANA ESTIMADO (CIF)</th></tr>
      <!-- Fila 8 -->
      <tr><td>Valor FOB</td><td class="num-usd">${res.fob}</td><td>USD $</td><td>Declarado en Factura Comercial</td></tr>
      <!-- Fila 9 -->
      <tr><td>Flete Internacional</td><td class="num-usd">${res.flete}</td><td>USD $</td><td>Conocimiento de Embarque / B/L / AWB / Carta Porte</td></tr>
      <!-- Fila 10 -->
      <tr><td>Seguro Internacional</td><td class="num-usd">${res.seguro}</td><td>USD $</td><td>Póliza de Seguro / Tabla SUNAT</td></tr>
      <!-- Fila 11 -->
      <tr class="subtotal-row"><td>VALOR CIF ESTIMADO</td><td class="num-usd" x:fmla="=B8+B9+B10">${res.valorCIF}</td><td>USD $</td><td class="formula-cell">Fórmula: FOB + FLETE + SEGURO</td></tr>
      <!-- Fila 12 -->
      <tr><td colspan="4"></td></tr>

      <!-- Fila 13 -->
      <tr><th colspan="4" class="section-header">2. TRIBUTOS DE IMPORTACIÓN (COSTO ESTIMADO)</th></tr>
      <!-- Fila 14 -->
      <tr><td>Convenio Internacional</td><td>${res.nombreTLC}</td><td colspan="2"><b>${res.estadoTLC}</b></td></tr>
      <!-- Fila 15 -->
      <tr><td>Arancel Ad-Valorem NMF Base (%)</td><td class="num-pct">${((res.adValoremBase || 0)/100)}</td><td>% Base</td><td>Arancel General SUNAT 2022</td></tr>
      <!-- Fila 16 -->
      <tr><td>Arancel Ad-Valorem Aplicado (%)</td><td class="num-pct">${((res.adValoremAplicado || 0)/100)}</td><td>% Aplicado</td><td>${res.preferenciaAplicada ? 'Evaluación Preferencial' : 'Tasa Base Aplicada'}</td></tr>
      <!-- Fila 17 -->
      <tr><td>Monto Ad-Valorem (USD $)</td><td class="num-usd" x:fmla="=B11*B16">${res.montoAdValorem}</td><td>USD $</td><td class="formula-cell">Fórmula: CIF × %AdValoremAplicado</td></tr>
      <!-- Fila 18 -->
      <tr><td>ISC (Impuesto Selectivo Consumo)</td><td class="num-usd">${res.montoISC}</td><td>USD $</td><td>${res.iscPct !== 'No determinado' ? `Tasa: ${res.iscPct}%` : 'No determinado'}</td></tr>
      <!-- Fila 19 -->
      <tr><td>IGV (Impuesto General a Ventas - 15.5%)</td><td class="num-usd" x:fmla="=(B11+B17+B18)*0.155">${res.montoIGV}</td><td>USD $</td><td class="formula-cell">Fórmula: (CIF + AdValorem + ISC) × 15.5%</td></tr>
      <!-- Fila 20 -->
      <tr><td>IPM (Impuesto Promoción Municipal - 2.5%)</td><td class="num-usd" x:fmla="=(B11+B17+B18)*0.025">${res.montoIPM}</td><td>USD $</td><td class="formula-cell">Fórmula: (CIF + AdValorem + ISC) × 2.5%</td></tr>
      <!-- Fila 21 -->
      <tr class="subtotal-row"><td>Subtotal Tributos (Costo Estimado Importación)</td><td class="num-usd" x:fmla="=B17+B18+B19+B20">${res.subtotalTributos}</td><td>USD $</td><td class="formula-cell">Fórmula: AdValorem + ISC + IGV + IPM</td></tr>
      <!-- Fila 22 -->
      <tr><td colspan="4"></td></tr>

      <!-- Fila 23 -->
      <tr><th colspan="4" class="section-header">3. PAGO A CUENTA / RÉGIMEN DE PERCEPCIÓN IGV</th></tr>
      <!-- Fila 24 -->
      <tr><td>Percepción del IGV (%)</td><td class="num-pct">${((res.percepcionPct || 0)/100)}</td><td>% Percepción</td><td>Supuesto normativo seleccionado</td></tr>
      <!-- Fila 25 -->
      <tr><td>Monto Percepción IGV (USD $)</td><td class="num-usd" x:fmla="=(B11+B21)*B24">${res.montoPercepcion}</td><td>USD $</td><td class="formula-cell">Fórmula: (CIF + SubtotalTributos) × %Percepción</td></tr>
      <!-- Fila 26 -->
      <tr class="total-row"><td>DESEMBOLSO TOTAL ESTIMADO (USD $)</td><td class="num-usd" x:fmla="=B11+B21+B25">${res.desembolsoTotalUSD}</td><td>USD $</td><td class="formula-cell">Fórmula: CIF + Tributos + Percepción</td></tr>
      <!-- Fila 27 -->
      <tr><td colspan="4"></td></tr>

      <!-- Fila 28 -->
      <tr><th colspan="4" class="section-header">4. COMERCIALIZACIÓN & RENTABILIDAD EN SOLES (PEN)</th></tr>
      <!-- Fila 29 -->
      <tr><td>Desembolso Total Estimado (PEN)</td><td class="num-pen" x:fmla="=B26*B32">${res.desembolsoTotalPEN}</td><td>S/ PEN</td><td>Convertido a Tipo de Cambio SBS</td></tr>
      <!-- Fila 30 -->
      <tr><td>Unidades a Importar</td><td align="right">${res.unidades}</td><td>Unidades</td><td>Unidades físicas de la operación</td></tr>
      <!-- Fila 31 -->
      <tr><td>Costo Unitario de Importación (PEN)</td><td class="num-pen" x:fmla="=(B11+B21)*B32/B30">${res.costoUnitarioPEN}</td><td>S/ PEN / u</td><td class="formula-cell">Fórmula: CostoEstimadoPEN / Unidades</td></tr>
      <!-- Fila 32 -->
      <tr><td>Tipo de Cambio SBS</td><td class="num-rate">${res.tipoCambio}</td><td>S/ PEN</td><td>Preserva 3 decimales referenciales</td></tr>
      <!-- Fila 33 -->
      <tr><td>Margen sobre Costo (%)</td><td class="num-pct">${((res.margenSobreCostoPct || 35)/100)}</td><td>% Margen</td><td>Margen comercial aplicado sobre costo</td></tr>
      <!-- Fila 34 -->
      <tr class="total-row"><td>PRECIO DE VENTA ESTIMADO (PEN)</td><td class="num-pen" x:fmla="=B31*(1+B33)">${res.precioVentaEstimadoPEN}</td><td>S/ PEN / u</td><td class="formula-cell">Fórmula: CostoUnitarioPEN × (1 + %Margen)</td></tr>
      <!-- Fila 35 -->
      <tr><td colspan="4"></td></tr>

      <!-- Fila 36 -->
      <tr><td colspan="4" style="font-size:9pt; color:#475569; font-style:italic;">⚠️ <b>Aviso Legal:</b> Simulación referencial emitida por PartidaArancelaria. No constituye determinación oficial de tributos, clasificación arancelaria ni autorización de importación. Verifique información en fuentes oficiales (SUNAT / MINCETUR / VUCE).</td></tr>
    </table>
  </body>
  </html>`;

  const uri = 'data:application/vnd.ms-excel;base64,';
  const base64 = (s) => window.btoa(unescape(encodeURIComponent(s)));
  const link = document.createElement('a');
  link.href = uri + base64(excelTemplate);
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

function initInPageCifCalculator() {
  const btnTriggerModal = document.getElementById('btn-trigger-modal-calc');
  if (btnTriggerModal) {
    btnTriggerModal.onclick = () => {
      const modal = document.getElementById('modal-calc');
      if (modal) modal.classList.remove('hidden');
    };
  }

  let activeAdv = 0;
  let activePerc = 3.5;
  let isCertYes = true;

  const advOpts = document.querySelectorAll('.rate-opt[data-inpage-adv]');
  advOpts.forEach(opt => {
    opt.addEventListener('click', () => {
      advOpts.forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      activeAdv = parseFloat(opt.dataset.inpageAdv) || 0;
      recalculateInPage();
    });
  });

  const percOpts = document.querySelectorAll('.rate-opt[data-inpage-perc]');
  percOpts.forEach(opt => {
    opt.addEventListener('click', () => {
      percOpts.forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      activePerc = parseFloat(opt.dataset.inpagePerc) || 3.5;
      recalculateInPage();
    });
  });

  const btnCertYes = document.getElementById('inpage-cert-yes');
  const btnCertNo = document.getElementById('inpage-cert-no');
  const alertBanner = document.getElementById('inpage-cert-banner');

  if (btnCertYes && btnCertNo) {
    btnCertYes.addEventListener('click', () => {
      btnCertYes.classList.add('selected');
      btnCertNo.classList.remove('selected');
      isCertYes = true;

      // Al responder SÍ: activar evaluación preferencial
      activeAdv = 0;
      advOpts.forEach(o => o.classList.toggle('selected', o.dataset.inpageAdv === '0'));

      if (alertBanner) {
        alertBanner.className = 'alert-banner ok';
        alertBanner.innerHTML = 'SÍ: Se evalúa la preferencia arancelaria según el acuerdo comercial, subpartida, regla de origen y requisitos aplicables.';
      }
      recalculateInPage();
    });

    btnCertNo.addEventListener('click', () => {
      btnCertNo.classList.add('selected');
      btnCertYes.classList.remove('selected');
      isCertYes = false;

      // Al responder NO: continuar con el tratamiento arancelario general
      const baseRate = state.activeItem && state.activeItem.adValorem > 0 ? String(state.activeItem.adValorem) : '6';
      activeAdv = parseFloat(baseRate);
      advOpts.forEach(o => o.classList.toggle('selected', o.dataset.inpageAdv === baseRate));

      if (alertBanner) {
        alertBanner.className = 'alert-banner';
        alertBanner.innerHTML = 'NO: Se continuará el cálculo utilizando el tratamiento arancelario general, sin evaluar una preferencia comercial.';
      }
      recalculateInPage();
    });
  }

  const paisInput = document.getElementById('inpage-pais');
  if (paisInput) {
    paisInput.addEventListener('change', () => {
      const hasTlc = paisInput.value !== 'NMF';
      if (hasTlc && isCertYes) {
        activeAdv = 0;
        advOpts.forEach(o => o.classList.toggle('selected', o.dataset.inpageAdv === '0'));
      } else if (!hasTlc || !isCertYes) {
        const baseRate = state.activeItem && state.activeItem.adValorem > 0 ? String(state.activeItem.adValorem) : '6';
        activeAdv = parseFloat(baseRate);
        advOpts.forEach(o => o.classList.toggle('selected', o.dataset.inpageAdv === baseRate));
      }
      recalculateInPage();
    });
  }

  const inputs = ['inpage-fob', 'inpage-flete', 'inpage-seguro', 'inpage-isc', 'inpage-unidades', 'inpage-tc', 'inpage-margen'];
  inputs.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', recalculateInPage);
      el.addEventListener('change', recalculateInPage);
    }
  });

  function recalculateInPage() {
    const selectedAdvOpt = document.querySelector('.rate-opt.selected[data-inpage-adv]');
    if (selectedAdvOpt) {
      activeAdv = parseFloat(selectedAdvOpt.dataset.inpageAdv) || 0;
    }

    const fobStr = document.getElementById('inpage-fob')?.value || '4200';
    const fob = parseFloat(fobStr.replace(/,/g, '')) || 0;
    const fleteStr = document.getElementById('inpage-flete')?.value || '380';
    const flete = parseFloat(fleteStr.replace(/,/g, '')) || 0;
    const seguroStr = document.getElementById('inpage-seguro')?.value || '42';
    const seguro = parseFloat(seguroStr.replace(/,/g, '')) || 0;
    const iscPct = parseFloat(document.getElementById('inpage-isc')?.value) || 0;
    const paisOrigen = document.getElementById('inpage-pais')?.value || 'CN';
    const unidades = parseInt(document.getElementById('inpage-unidades')?.value) || 120;
    const tipoCambio = parseFloat(document.getElementById('inpage-tc')?.value) || 3.75;
    const margenPct = parseFloat(document.getElementById('inpage-margen')?.value) || 35;

    const res = TariffCalculator.calculate({
      fob, flete, seguro,
      adValoremPct: activeAdv,
      iscPct,
      percepcionPct: activePerc,
      paisOrigen,
      tlcVerificado: isCertYes,
      unidades,
      tipoCambio,
      margenGananciaPct: margenPct
    });

    const setText = (id, text) => {
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    };

    setText('res-fob-val', `USD ${res.fob}`);
    setText('res-flete-seg-val', `USD ${(parseFloat(res.flete) + parseFloat(res.seguro)).toFixed(2)}`);
    setText('res-cif-val', `USD ${res.valorCIF}`);
    const advLabelText = res.preferenciaAplicada
      ? `Ad Valorem (${res.adValoremPct}% TLC)`
      : `Ad Valorem (${res.adValoremPct}% NMF)`;
    setText('res-adv-label', advLabelText);
    setText('res-adv-val', `USD ${res.montoAdValorem}`);
    setText('res-igv-ipm-val', `USD ${(parseFloat(res.montoIGV) + parseFloat(res.montoIPM)).toFixed(2)}`);
    setText('res-isc-val', `USD ${res.montoISC}`);
    setText('res-percepcion-label', `Percepción SUNAT (${res.percepcionPct}%)`);
    setText('res-percepcion-val', `USD ${res.montoPercepcion}`);
    setText('res-landed-total', `S/. ${res.costoTotalLandedPEN}`);
    setText('res-unid-lbl', `${res.unidades}`);
    setText('res-costo-unid', `S/. ${res.costoUnitarioPEN}`);
    setText('res-venta-unid', `S/. ${res.precioVentaSugeridoPEN}`);

    const costUnit = parseFloat(res.costoUnitarioPEN.replace(/,/g, '')) || 0;
    const sellUnit = parseFloat(res.precioVentaSugeridoPEN.replace(/,/g, '')) || 0;
    const utilUnitPEN = (sellUnit - costUnit).toFixed(2);
    setText('res-util-unid', `S/. ${utilUnitPEN}`);
  }

  window.recalculateInPage = recalculateInPage;
  recalculateInPage();
}

function syncCalculatorWithActiveItem(item) {
  if (!item) return;

  const btnCertYes = document.getElementById('inpage-cert-yes');
  const isCertYes = btnCertYes ? btnCertYes.classList.contains('selected') : true;
  const inpagePaisSelect = document.getElementById('inpage-pais');
  const hasTlc = inpagePaisSelect ? inpagePaisSelect.value !== 'NMF' : true;

  const baseAdv = typeof item.adValorem === 'number' ? item.adValorem : parseFloat(item.adValorem) || 0;
  const targetAdv = (hasTlc && isCertYes) ? 0 : baseAdv;

  const advOpts = document.querySelectorAll('.rate-opt[data-inpage-adv]');
  advOpts.forEach(opt => {
    const val = parseFloat(opt.dataset.inpageAdv) || 0;
    if (val === targetAdv) {
      opt.classList.add('selected');
    } else {
      opt.classList.remove('selected');
    }
  });

  const iscInput = document.getElementById('inpage-isc');
  if (iscInput) {
    iscInput.value = item.isc || 0;
  }

  const modalAdvSelect = document.getElementById('calc-advalorem');
  if (modalAdvSelect) {
    modalAdvSelect.dataset.baseVal = String(baseAdv);
    modalAdvSelect.dataset.activeCode = item.codigo10;
    const certValInput = document.getElementById('calc-cert-origen-val');
    const isModalCertYes = certValInput ? certValInput.value === 'true' : true;
    modalAdvSelect.value = isModalCertYes ? "0" : String(baseAdv);
  }

  if (window.recalculateInPage) {
    window.recalculateInPage();
  }
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
          <strong>ℹ️ TRATAMIENTO NMF:</strong> NO: Se continuará el cálculo utilizando el tratamiento arancelario general (${res.baseAdValoremPct}%), sin evaluar una preferencia comercial para ${res.nombreTLC}.
        </div>
      ` : ''}

      ${paisOrigen !== 'NMF' && res.preferenciaAplicada ? `
        <div style="padding: 10px 12px; margin: 8px 0; background: #ecfdf5; border: 1.5px solid #10b981; border-radius: 6px; color: #065f46; font-size: 11px; line-height: 1.4;">
          <strong>SÍ:</strong> Se evalúa la preferencia arancelaria según el acuerdo comercial ${res.nombreTLC}, subpartida, regla de origen y requisitos aplicables.
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

  const radioOpts = document.querySelectorAll('.radio-opt[data-rgi-opt]');
  radioOpts.forEach(opt => {
    opt.addEventListener('click', () => {
      radioOpts.forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      const factorSelect = document.getElementById('rgi-p2-factor');
      if (factorSelect) {
        factorSelect.value = opt.dataset.rgiOpt;
      }
    });
  });
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
    container.innerHTML = `<div style="padding: 16px; text-align: center; color: var(--text-muted); font-family: var(--font-mono); font-size: 12px;">Sin resoluciones específicas registradas para esta búsqueda.</div>`;
    return;
  }

  container.innerHTML = resolutions.map(r => `
    <div class="res-item">
      <div class="res-num">${r.numero}</div>
      <div class="res-body">
        <div class="t">${r.producto}</div>
        <div class="d">${r.criterio}</div>
        <div style="margin-top: 8px; font-family: var(--font-mono); font-size: 11px; color: var(--brass); font-weight: 600;">
          Subpartida Asignada: ${r.codigo10}
        </div>
      </div>
      <div class="res-tag">${r.entidad}</div>
    </div>
  `).join('');
}

function renderNotasLegalesTab(item = state.activeItem) {
  const container = document.getElementById('legal-notes-container');
  if (!container) return;

  const capId = item ? item.capitulo : '84';
  const notes = state.searchEngine.getLegalNotes(capId);

  container.innerHTML = `
    <div class="accordion">
      <div class="acc-item">
        <div class="acc-head">
          <div><span class="k">Capítulo ${capId}</span><span class="t">${notes.capitulo} (Notas de Sección y Capítulo)</span></div>
          <div class="acc-chev">︿</div>
        </div>
        <div class="acc-body">
          <p style="margin-bottom: 8px;"><strong>📌 Nota de Sección (Sistema Armonizado):</strong> ${notes.notaSeccion}</p>
          <p><strong>📜 Nota Explicativa de Capítulo:</strong> ${notes.notaCapitulo}</p>
        </div>
      </div>
      <div class="acc-item">
        <div class="acc-head">
          <div><span class="k">Exclusiones</span><span class="t">Criterios Generales de Exclusión del Capítulo ${capId}</span></div>
          <div class="acc-chev">＋</div>
        </div>
        <div class="acc-body">
          Se excluyen de este Capítulo las preparaciones o mercancías reguladas expresamente por Capítulos de farmacia (Cap. 30), armas/explosivos (Cap. 93) o artículos de recreación/deporte (Cap. 95).
        </div>
      </div>
    </div>
  `;
}

function renderDynamicRgiTab(item = state.activeItem) {
  const container = document.getElementById('reglas-list-grid');
  if (!container) return;

  if (!item) {
    container.innerHTML = `
      <div style="padding: 20px; text-align: center; color: var(--text-muted); border: 1px dashed var(--border-color); border-radius: 8px; font-family: var(--font-mono); font-size: 12px;">
        🔍 Selecciona o busca una subpartida para consultar su <strong>Análisis Técnico Orientativo RGI</strong>.
      </div>
    `;
    return;
  }

  const code = item.codigo10 || '';
  const desc = state.searchEngine.getDisplayDescription(item);
  let ruleTitle = 'RGI 1 & 6 (Texto de la Subpartida Nacional)';
  let rationaleText = `Clasificación orientativa fundamentada bajo las Reglas Generales Interpretativas 1 y 6 del Sistema Armonizado. La mercancía se determina primeramente por el texto expreso de la partida y la subpartida nacional a 10 dígitos ${code}.`;
  let decisionFactor = 'Texto expreso de la subpartida a 10 dígitos en la Nomenclatura NANDINA 2022';
  let rgiSequence = 'RGI 1 ➔ RGI 6';

  if (code.startsWith('8517') || code.startsWith('8471') || code.startsWith('9504') || code.startsWith('8703')) {
    ruleTitle = 'RGI 1, 3a & 6 (Especificidad Técnica de la Función)';
    rationaleText = `Por aplicación de la RGI 3a, la partida con descripción técnica más específica (${item.partida4}) prevalece sobre partidas de alcance general. La subpartida nacional se determina por la RGI 6.`;
    decisionFactor = 'Función principal y especificidad de uso técnico';
    rgiSequence = 'RGI 1 ➔ RGI 3(a) ➔ RGI 6';
  } else if (code.startsWith('61') || code.startsWith('62') || code.startsWith('64') || code.startsWith('39') || code.startsWith('73')) {
    ruleTitle = 'RGI 3b (Carácter Esencial Multifactorial)';
    rationaleText = `En mercancías compuestas o juegos/surtidos, la RGI 3b determina la clasificación evaluando los factores de carácter esencial (función, valor, peso, naturaleza y uso principal del producto).`;
    decisionFactor = 'Evaluación multifactorial de carácter esencial (función, valor, peso y naturaleza)';
    rgiSequence = 'RGI 1 ➔ RGI 2 ➔ RGI 3(b) ➔ RGI 6';
  }

  container.innerHTML = `
    <div class="rgi-card" style="border-left: 4px solid var(--accent-gold); padding: 16px; background: var(--bg-hover); border-radius: 8px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <span style="font-family: var(--font-mono); font-size: 11px; color: var(--accent-gold); font-weight: 700;">Análisis Técnico Orientativo para ${code}</span>
        <span class="status-badge status-orientative" style="font-size: 10px;">${rgiSequence}</span>
      </div>
      <div class="rgi-h" style="font-size: 14px; font-weight: 700; color: var(--text-main); margin-bottom: 8px;">${ruleTitle}</div>
      <p style="font-size: 12px; color: var(--text-muted); line-height: 1.5; margin-bottom: 12px;">${rationaleText}</p>
      
      <div style="padding: 10px 12px; background: var(--bg-app); border: 1px solid var(--border-color); border-radius: 6px; font-size: 11px; margin-bottom: 10px;">
        <strong style="color: var(--text-faint); text-transform: uppercase; font-size: 10px;">Secuencia de Evaluación RGI:</strong><br>
        <span style="color: var(--accent-blue); font-family: var(--font-mono); display: inline-block; margin-top: 4px;">RGI 1 ➔ RGI 2 ➔ RGI 3 (3a / 3b / 3c) ➔ RGI 4 ➔ RGI 5 ➔ RGI 6</span>
      </div>

      <div style="padding: 10px 12px; background: var(--bg-app); border: 1px solid var(--border-color); border-radius: 6px; font-size: 11px;">
        <strong style="color: var(--text-faint); text-transform: uppercase; font-size: 10px;">Criterio Evaluado:</strong><br>
        <span style="color: var(--accent-gold); font-weight: 600; display: inline-block; margin-top: 4px;">${decisionFactor}</span>
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

function initDensityToggle() {
  const table = document.querySelector('table.data');
  if (table) table.classList.remove('density-compact');
  localStorage.removeItem('arancel_density');
}

function initEditableExchangeRate() {
  const badge = document.getElementById('sunat-tc-badge');
  const valDisplay = document.getElementById('sunat-tc-val');
  const modal = document.getElementById('modal-tc-edit');
  const input = document.getElementById('tc-input-value');
  const btnClose = document.getElementById('btn-close-tc-modal');
  const btnSave = document.getElementById('btn-save-tc');
  const btnReset = document.getElementById('btn-reset-tc');

  let officialTC = 3.750;

  fetch('https://api.apis.net.pe/v1/tipo-cambio-sunat')
    .then(r => r.json())
    .then(data => {
      if (data && data.precioVenta) {
        officialTC = parseFloat(data.precioVenta);
        updateTCDisplays();
      }
    })
    .catch(() => {
      officialTC = 3.750;
      updateTCDisplays();
    });

  function getEffectiveTC() {
    const custom = localStorage.getItem('arancel_custom_tc');
    if (custom && !isNaN(parseFloat(custom))) {
      return parseFloat(custom);
    }
    return officialTC;
  }

  function updateTCDisplays() {
    const custom = localStorage.getItem('arancel_custom_tc');
    const effective = getEffectiveTC();

    if (valDisplay) {
      if (custom) {
        valDisplay.innerHTML = `S/. ${effective.toFixed(3)} <span class="tc-edit-icon" title="Personalizado por usuario">✎ (Manual)</span>`;
      } else {
        valDisplay.innerHTML = `S/. ${effective.toFixed(3)} <span class="tc-edit-icon" title="Editar tipo de cambio">✎</span>`;
      }
    }

    const inpageTcInput = document.getElementById('inpage-tc');
    if (inpageTcInput) {
      inpageTcInput.value = effective.toFixed(3);
      inpageTcInput.dispatchEvent(new Event('input'));
    }
    const calcTcInput = document.getElementById('calc-tc');
    if (calcTcInput) {
      calcTcInput.value = effective.toFixed(3);
    }
  }

  if (badge) {
    badge.addEventListener('click', () => {
      if (input) input.value = getEffectiveTC().toFixed(3);
      if (modal) modal.classList.remove('hidden');
    });
  }

  if (btnClose) btnClose.onclick = () => modal.classList.add('hidden');

  if (btnSave) {
    btnSave.onclick = () => {
      const newVal = parseFloat(input.value);
      if (!isNaN(newVal) && newVal > 0) {
        localStorage.setItem('arancel_custom_tc', newVal.toString());
        updateTCDisplays();
        showToast(`T.C. actualizado a S/. ${newVal.toFixed(3)}`);
      }
      modal.classList.add('hidden');
    };
  }

  if (btnReset) {
    btnReset.onclick = () => {
      localStorage.removeItem('arancel_custom_tc');
      updateTCDisplays();
      showToast(`T.C. restablecido a SUNAT oficial (S/. ${officialTC.toFixed(3)})`);
      modal.classList.add('hidden');
    };
  }

  updateTCDisplays();
}

function initThemeToggle() {
  const btn = document.getElementById('btn-theme-toggle') || document.getElementById('modeToggle');

  const savedTheme = localStorage.getItem('arancel_theme');
  if (savedTheme === 'light') {
    document.body.classList.remove('theme-dark');
    document.body.classList.add('theme-light', 'light');
    if (btn) btn.innerHTML = '☾ Oscuro';
  } else {
    document.body.classList.remove('theme-light', 'light');
    document.body.classList.add('theme-dark');
    if (btn) btn.innerHTML = '☀ Claro';
  }

  if (!btn) return;

  const toggleTheme = () => {
    const isDark = document.body.classList.contains('theme-dark') || (!document.body.classList.contains('theme-light') && !document.body.classList.contains('light'));
    if (isDark) {
      document.body.classList.remove('theme-dark');
      document.body.classList.add('theme-light', 'light');
      btn.innerHTML = '☾ Oscuro';
      localStorage.setItem('arancel_theme', 'light');
    } else {
      document.body.classList.remove('theme-light', 'light');
      document.body.classList.add('theme-dark');
      btn.innerHTML = '☀ Claro';
      localStorage.setItem('arancel_theme', 'dark');
    }
  };

  btn.addEventListener('click', toggleTheme);
  window.toggleTheme = toggleTheme;
}

function initCommandPalette() {
  const modal = document.getElementById('modal-command-palette');
  const paletteInput = document.getElementById('palette-search-input');
  const paletteResults = document.getElementById('palette-results-list');
  const btnClose = document.getElementById('btn-close-palette-modal');
  const mainSearchInput = document.getElementById('main-search-input');

  if (!modal || !paletteInput || !paletteResults) return;

  let selectedIndex = 0;
  let currentResults = [];

  function openPalette(initialQuery = '') {
    modal.classList.remove('hidden');
    paletteInput.value = initialQuery || (mainSearchInput ? mainSearchInput.value : '');
    paletteInput.focus();
    paletteInput.select();
    updatePaletteResults();
  }

  function closePalette() {
    modal.classList.add('hidden');
  }

  // Permitir uso directo de mainSearchInput sin modal forzoso
  if (btnClose) btnClose.onclick = closePalette;

  paletteInput.addEventListener('input', () => {
    selectedIndex = 0;
    updatePaletteResults();
  });

  paletteInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closePalette();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (currentResults.length > 0) {
        selectedIndex = (selectedIndex + 1) % currentResults.length;
        renderPaletteSelection();
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (currentResults.length > 0) {
        selectedIndex = (selectedIndex - 1 + currentResults.length) % currentResults.length;
        renderPaletteSelection();
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (currentResults.length > 0 && currentResults[selectedIndex]) {
        selectPaletteItem(currentResults[selectedIndex]);
      }
    }
  });

  function updatePaletteResults() {
    const query = paletteInput.value.trim();
    currentResults = state.searchEngine ? state.searchEngine.search({ query }).slice(0, 30) : [];

    if (currentResults.length === 0) {
      paletteResults.innerHTML = `
        <div style="padding: 24px; text-align: center; color: var(--text-muted); font-family: var(--font-mono); font-size: 13px;">
          🔍 No se encontraron coincidencias para "${query}". Intenta con otro término o código NANDINA.
        </div>
      `;
      return;
    }

    paletteResults.innerHTML = currentResults.map((item, idx) => {
      const entityInfo = state.searchEngine.resolveEntity(item);
      const desc = state.searchEngine.getDisplayDescription(item);
      return `
        <div class="palette-item ${idx === selectedIndex ? 'selected' : ''}" data-idx="${idx}">
          <span class="palette-code">${item.codigo10}</span>
          <span class="palette-desc">${highlightText(desc, query)}</span>
          <div class="palette-tags">
            <span class="adv-badge adv-${item.adValorem}">${item.adValorem}%</span>
            <span class="adv-pill ${entityInfo.badge_class}" style="font-size: 10px; padding: 2px 6px;">${entityInfo.badge_icon} ${entityInfo.estado_regulacion}</span>
          </div>
        </div>
      `;
    }).join('');

    paletteResults.querySelectorAll('.palette-item').forEach(el => {
      el.addEventListener('click', () => {
        const idx = parseInt(el.dataset.idx);
        if (currentResults[idx]) {
          selectPaletteItem(currentResults[idx]);
        }
      });
    });
  }

  function renderPaletteSelection() {
    const items = paletteResults.querySelectorAll('.palette-item');
    items.forEach((item, idx) => {
      if (idx === selectedIndex) {
        item.classList.add('selected');
        item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      } else {
        item.classList.remove('selected');
      }
    });
  }

  function selectPaletteItem(item) {
    if (!item) return;
    state.activeItem = item;
    if (mainSearchInput) mainSearchInput.value = item.codigo10;
    updateActiveItemPanel(item);
    renderSearchResults();
    closePalette();

    // Activar pestaña General y desplazarse suavemente al panel principal Workbench
    const tabGeneral = document.querySelector('.stamp-tab[data-tab="tab-general"]');
    if (tabGeneral) tabGeneral.click();

    const heroCard = document.querySelector('.workbench') || document.getElementById('tab-general');
    if (heroCard) {
      heroCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  window.openCommandPalette = openPalette;
}

function initGlossary() {
  const container = document.getElementById('glossary-list-container');
  const filterInput = document.getElementById('glossary-search-input');
  const countBadge = document.getElementById('glossary-count-badge');
  if (!container || !filterInput) return;

  const terms = [
    // Incoterms 2020
    { term: 'EXW', tag: 'Incoterm', desc: 'Ex Works (En fábrica). El comprador asume todos los costos y riesgos desde el almacén del vendedor en origen.' },
    { term: 'FOB', tag: 'Incoterm', desc: 'Free On Board (Libre a bordo). El vendedor entrega la carga a bordo de la nave en el puerto de origen. Sin flete ni seguro.' },
    { term: 'CFR', tag: 'Incoterm', desc: 'Cost & Freight (Costo y flete). El vendedor paga el flete marítimo hasta el puerto de destino, pero el riesgo se transfiere en embarque.' },
    { term: 'CIF', tag: 'Incoterm', desc: 'Cost, Insurance & Freight. Valor en puerto peruano (FOB + Flete + Seguro). Base imponible para liquidación de tributos SUNAT.' },
    { term: 'DAP', tag: 'Incoterm', desc: 'Delivered at Place (Entregado en lugar). El vendedor entrega la carga en el destino convenido antes del despacho de importación.' },
    { term: 'DDP', tag: 'Incoterm', desc: 'Delivered Duty Paid (Entregado derechos pagados). El vendedor asume todos los gastos y tributos aduaneros hasta el almacén comprador.' },
    { term: 'FCA', tag: 'Incoterm', desc: 'Free Carrier (Libre transportista). El vendedor entrega la mercancía al transportista designado por el comprador en origen.' },

    // Documentos & Trámites Aduaneros SUNAT
    { term: 'DAM / DUA', tag: 'Documento', desc: 'Declaración Aduanera de Mercancías. Documento oficial tramitado por Agente de Aduana para despachar el cargamento ante SUNAT.' },
    { term: 'B/L', tag: 'Documento', desc: 'Bill of Lading. Conocimiento de embarque marítimo. Titulo valor que acredita la propiedad de la carga y contrato de transporte.' },
    { term: 'AWB', tag: 'Documento', desc: 'Air Waybill. Guía aérea de transporte internacional. Ampara el contrato de transporte de mercancías enviadas por avión.' },
    { term: 'Packing List', tag: 'Documento', desc: 'Lista de empaque. Desglose detallado del contenido, peso bruto, peso neto, marcas y número de bultos del lote.' },
    { term: 'Factura Comercial', tag: 'Documento', desc: 'Commercial Invoice. Documento contable emitido por el exportador que especifica precio de venta, valores e Incoterm.' },
    { term: 'Certificado de Origen', tag: 'Documento', desc: 'Documento oficial para acreditar procedencia y acogerse a la liberación arancelaria (0% Ad-Valorem por TLC).' },
    { term: 'Manifiesto de Carga', tag: 'Documento', desc: 'Documento expedido por la aerolínea/naviera con la relación completa de todos los bultos a bordo del medio de transporte.' },
    { term: 'Nota de Tarja', tag: 'Documento', desc: 'Certificado emitido al recibir la carga en almacén aduanero que valida la cantidad y estado físico de los bultos recibidos.' },

    // Impuestos & Tributación de Importación SUNAT
    { term: 'Ad-Valorem', tag: 'Tributo', desc: 'Arancel de importación (0%, 6% u 11%) cobrado por SUNAT sobre el Valor CIF según la subpartida NANDINA.' },
    { term: 'IGV', tag: 'Tributo', desc: 'Impuesto General a las Ventas (15.5%) aplicado sobre la suma de (Valor CIF + Ad-Valorem + ISC).' },
    { term: 'IPM', tag: 'Tributo', desc: 'Impuesto de Promoción Municipal (2.5%) aplicado sobre la misma base imponible del IGV (Suma IGV + IPM = 18%).' },
    { term: 'ISC', tag: 'Tributo', desc: 'Impuesto Selectivo al Consumo. Grava productos suntuarios, vehículos, bebidas alcohólicas o combustibles.' },
    { term: 'Percepción IGV', tag: 'Tributo', desc: 'Adelanto del IGV cobrado por SUNAT (3.5% para importadores habituales, 5% o 10% para nuevos o sin RUC activo).' },
    { term: 'Derecho Antidumping', tag: 'Tributo', desc: 'Derecho de protección comercial aplicado a productos importados con precios discriminatorios que dañan la industria nacional.' },
    { term: 'Tasa Despacho', tag: 'Tributo', desc: 'Tasa administrativa cobrada por SUNAT por el servicio de tramitación de la declaración de importación.' },

    // Regulación VUCE & Entidades Controladoras
    { term: 'VUCE', tag: 'Plataforma', desc: 'Ventanilla Única de Comercio Exterior. Portal electrónico del Estado para tramitar permisos de MTC, DIGESA, SENASA, etc.' },
    { term: 'MTC', tag: 'Entidad', desc: 'Ministerio de Transportes. Exige Certificado de Homologación e Internamiento Previo para celulares, tablets y transmisores.' },
    { term: 'DIGESA', tag: 'Entidad', desc: 'Dirección General de Salud Ambiental. Regula permisos sanitarios para alimentos procesados, bebidas, juguetes y útiles.' },
    { term: 'DIGEMID', tag: 'Entidad', desc: 'Dirección General de Medicamentos. Exige Registro Sanitario (NSO) para cosméticos, fármacos y dispositivos médicos.' },
    { term: 'SENASA', tag: 'Entidad', desc: 'Servicio Nacional de Sanidad Agraria. Otorga Permisos Fitosanitarios (PFI) o Zoosanitarios (PZI) para plantas y carnes.' },
    { term: 'SANIPES', tag: 'Entidad', desc: 'Organismo Nacional de Sanidad Pesquera. Emite autorizaciones e inspecciones sanitarias para productos acuícolas y marinos.' },
    { term: 'SUCAMEC', tag: 'Entidad', desc: 'Regula el internamiento de armas, municiones, pirotecnia, explosivos y sustancias químicas de uso controlado.' },

    // Nomenclatura & Clasificación Legal
    { term: 'NANDINA', tag: 'Nomenclatura', desc: 'Nomenclatura Arancelaria Común de los Países Miembros de la CAN basada en el Sistema Armonizado mundial.' },
    { term: 'Subpartida Nacional', tag: 'Nomenclatura', desc: 'Código de 10 dígitos (ej. 8517.13.00.00) usado en Perú para determinar tributos exactos y permisos exigibles.' },
    { term: 'RGI', tag: 'Nomenclatura', desc: 'Reglas Generales Interpretativas (RGI 1 a 6). Normas legales mundiales que determinan la clasificación arancelaria.' },
    { term: 'Resolución Vinculante', tag: 'SUNAT', desc: 'Dictamen de clasificación arancelaria emitido por SUNAT de cumplimiento obligatorio para resolver dudas técnicas.' },
    { term: 'Notas Legales', tag: 'Nomenclatura', desc: 'Textos jurídicos al inicio de Secciones y Capítulos del Arancel que delimitan qué productos se incluyen o excluyen.' },

    // Logística & Operatividad de Despacho
    { term: 'Levante Aduanero', tag: 'Trámite', desc: 'Autorización otorgada por SUNAT que permite al consignatario retirar y disponer legalmente de las mercancías.' },
    { term: 'Canal de Control', tag: 'SUNAT', desc: 'Verde (Levante directo sin revisión), Naranja (Revisión documental) o Rojo (Reconocimiento físico obligatorio de carga).' },
    { term: 'Depósito Temporal', tag: 'Almacén', desc: 'Local autorizado por SUNAT para ingresar y custodiar cargas internacionales mientras se tramita su despacho.' },
    { term: 'Landed Cost', tag: 'Costo', desc: 'Costo total real del producto en almacén (FOB + Flete + Seguro + Tributos + Almacenaje + Agente de Aduana).' }
  ];

  function renderTerms(filter = '') {
    const q = filter.trim().toLowerCase();
    const filtered = terms.filter(t => t.term.toLowerCase().includes(q) || t.desc.toLowerCase().includes(q) || t.tag.toLowerCase().includes(q));

    if (countBadge) countBadge.textContent = filtered.length;

    if (filtered.length === 0) {
      container.innerHTML = `<div style="font-size: 11px; color: var(--text-faint); padding: 12px; text-align: center; font-family: var(--font-mono);">Sin coincidencias para "${filter}"</div>`;
      return;
    }

    container.innerHTML = filtered.map(t => `
      <div class="glossary-card">
        <div class="glossary-card-head">
          <span class="glossary-card-term">${t.term}</span>
          <span class="glossary-card-tag">${t.tag}</span>
        </div>
        <div class="glossary-card-desc">${t.desc}</div>
      </div>
    `).join('');
  }

  filterInput.addEventListener('input', (e) => renderTerms(e.target.value));
  renderTerms('');
}

function getRecents() {
  try {
    return JSON.parse(localStorage.getItem('arancel_recents') || '[]');
  } catch (e) {
    return [];
  }
}

function addRecent(item) {
  if (!item || !item.codigo10) return;
  let recents = getRecents().filter(c => c !== item.codigo10);
  recents.unshift(item.codigo10);
  recents = recents.slice(0, 5);
  localStorage.setItem('arancel_recents', JSON.stringify(recents));
}

function renderRecentsDropdown() {
  const mainSearchInput = document.getElementById('main-search-input');
  const autocompleteContainer = document.getElementById('autocomplete-suggestions');

  if (!mainSearchInput || !autocompleteContainer) return;
  const recents = getRecents().slice(0, 5);

  if (recents.length === 0) {
    autocompleteContainer.classList.add('hidden');
    return;
  }

  autocompleteContainer.innerHTML = `
    <div style="padding: 8px 14px; font-family: var(--font-mono); font-size: 10.5px; text-transform: uppercase; letter-spacing: 1.2px; color: var(--brass); background: var(--panel-3); border-bottom: 1px solid var(--line); font-weight: 700;">
      🕒 BÚSQUEDAS RECIENTES (HISTORIAL OMNIBOX)
    </div>
    ${recents.map(code => {
      const item = state.dataset.subpartidas ? state.dataset.subpartidas.find(s => s.codigo10 === code) : null;
      const desc = item ? state.searchEngine.getDisplayDescription(item) : 'Subpartida aduanera consultada recientemente';
      return `
        <div class="recent-autocomplete-item" data-code="${code}" style="padding: 10px 14px; cursor: pointer; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--line-soft); transition: background 0.15s ease;">
          <div style="display: flex; align-items: center; gap: 12px; overflow: hidden;">
            <span style="font-size: 14px; color: var(--brass);">🕒</span>
            <div style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
              <span class="font-mono" style="font-weight: 700; color: var(--text); font-size: 13px;">${code}</span>
              <small style="display: block; color: var(--text-muted); font-size: 11px; overflow: hidden; text-overflow: ellipsis;">${desc}</small>
            </div>
          </div>
          <span style="font-size: 11px; color: var(--text-faint); white-space: nowrap;">Reciente ↵</span>
        </div>
      `;
    }).join('')}
  `;
  autocompleteContainer.classList.remove('hidden');

  autocompleteContainer.querySelectorAll('.recent-autocomplete-item').forEach(el => {
    el.addEventListener('click', () => {
      const code = el.dataset.code;
      mainSearchInput.value = code;
      autocompleteContainer.classList.add('hidden');
      const target = state.dataset.subpartidas ? state.dataset.subpartidas.find(s => s.codigo10 === code) : null;
      if (target) {
        state.activeItem = target;
        updateActiveItemPanel(target, true);
        renderSearchResults();
        showToastNotification(`Abriendo reciente ${code}`);
      }
    });
  });
}

function updateAutocompleteDropdown(query) {
  const container = document.getElementById('autocomplete-suggestions');
  if (!container) return;

  if (!query.trim()) {
    renderRecentsDropdown();
    return;
  }

  const matches = state.searchEngine ? state.searchEngine.search({ query }).slice(0, 6) : [];
  if (matches.length === 0) {
    container.classList.add('hidden');
    return;
  }

  container.innerHTML = `
    <div style="padding: 6px 12px; font-family: var(--font-mono); font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: var(--brass); background: var(--panel-3); border-bottom: 1px solid var(--line); font-weight: 700;">
      🔍 SUGERENCIAS EN VIVO (${matches.length})
    </div>
    ${matches.map(item => {
      const desc = state.searchEngine.getDisplayDescription(item);
      return `
        <div class="autocomplete-live-item" data-code="${item.codigo10}" style="padding: 10px 14px; cursor: pointer; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--line-soft); transition: background 0.15s ease;">
          <div style="overflow: hidden; flex: 1; margin-right: 10px;">
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 2px;">
              <span class="font-mono" style="font-weight: 700; color: var(--brass); font-size: 13px;">${item.codigo10}</span>
              <span class="adv-badge adv-${item.adValorem}" style="font-size: 9.5px;">${item.adValorem}%</span>
            </div>
            <small style="display: block; color: var(--text-muted); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${desc}</small>
          </div>
          <span style="font-size: 11px; color: var(--text-faint); white-space: nowrap;">Ver ↵</span>
        </div>
      `;
    }).join('')}
  `;
  container.classList.remove('hidden');

  container.querySelectorAll('.autocomplete-live-item').forEach(el => {
    el.addEventListener('click', () => {
      const code = el.dataset.code;
      const mainInput = document.getElementById('main-search-input');
      if (mainInput) mainInput.value = code;
      container.classList.add('hidden');
      const target = state.dataset.subpartidas ? state.dataset.subpartidas.find(s => s.codigo10 === code) : null;
      if (target) {
        state.activeItem = target;
        updateActiveItemPanel(target, true);
        renderSearchResults();
      }
    });
  });
}

function initRecentSearches() {
  const wrap = document.getElementById('recent-searches-wrap');
  if (wrap) wrap.classList.add('hidden');

  const mainSearchInput = document.getElementById('main-search-input');
  if (mainSearchInput) {
    mainSearchInput.addEventListener('focus', () => {
      if (!mainSearchInput.value.trim()) {
        renderRecentsDropdown();
      }
    });
  }

  window.addRecentItemToHistory = addRecent;
}

function renderFavoritesDrawer() {
  const drawer = document.getElementById('drawer-favorites');
  const container = document.getElementById('favorites-drawer-container');
  if (!container || !drawer) return;

  const favCodes = state.favorites || [];
  if (favCodes.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 40px 16px; color: var(--text-faint);">
        <div style="font-size: 32px; margin-bottom: 8px;">⭐</div>
        <p style="font-size: 13px; font-weight: 600; color: var(--text);">No tienes subpartidas guardadas</p>
        <p style="font-size: 11px; margin-top: 4px; line-height: 1.5;">Haz clic en el botón ⭐ Guardar en cualquier subpartida para agregarla a tu panel de favoritos.</p>
      </div>
    `;
    return;
  }

  const items = favCodes.map(code => {
    return state.dataset.subpartidas ? state.dataset.subpartidas.find(s => s.codigo10 === code) : null;
  }).filter(Boolean);

  container.innerHTML = items.map(item => {
    const entityInfo = state.searchEngine.resolveEntity(item);
    return `
      <div class="fav-drawer-card" data-code="${item.codigo10}" style="padding: 12px 14px; background: var(--ink) !important; border: 1px solid var(--line); border-radius: 6px; display: flex; align-items: center; justify-content: space-between; gap: 10px; cursor: pointer; transition: all 0.15s ease; opacity: 1 !important;">
        <div style="flex: 1; overflow: hidden;">
          <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px; flex-wrap: wrap;">
            <span class="font-mono" style="font-weight: 700; color: var(--brass); font-size: 13px;">${item.codigo10}</span>
            <span class="adv-badge adv-${item.adValorem}" style="font-size: 9.5px; padding: 1px 5px;">${item.adValorem}%</span>
            <span class="status-badge ${entityInfo.badge_class}" style="font-size: 9px; padding: 1px 5px;">${entityInfo.badge_icon} ${entityInfo.entidad_siglas}</span>
          </div>
          <div style="font-size: 11.5px; color: var(--text); line-height: 1.4; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;">${state.searchEngine.getDisplayDescription(item)}</div>
        </div>
        <button class="btn-mini-icon btn-remove-fav" data-code="${item.codigo10}" title="Quitar de guardados" style="padding: 4px 6px; font-size: 13px; color: var(--seal); background: transparent; border: none; cursor: pointer;">🗑️</button>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.fav-drawer-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.btn-remove-fav')) return;
      const code = card.dataset.code;
      const match = state.dataset.subpartidas.find(s => s.codigo10 === code);
      if (match) {
        state.activeItem = match;
        const mainInput = document.getElementById('main-search-input');
        if (mainInput) mainInput.value = match.codigo10;
        updateActiveItemPanel(match);
        renderSearchResults();
        showToastNotification(`Abriendo subpartida guardada ${match.codigo10}`);
      }
    });
  });

  container.querySelectorAll('.btn-remove-fav').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const code = btn.dataset.code;
      toggleFavorite(code);
      renderFavoritesDrawer();
    });
  });
}

function initShareableLink() {
  const btnShare = document.getElementById('btn-share-link');

  const urlParams = new URLSearchParams(window.location.search);
  const codeParam = urlParams.get('codigo') || urlParams.get('code');

  if (codeParam && state.dataset && state.dataset.subpartidas) {
    const match = state.dataset.subpartidas.find(s => s.codigo10 === codeParam || s.codigo10.replace(/\./g, '') === codeParam.replace(/\./g, ''));
    if (match) {
      state.activeItem = match;
      const mainSearchInput = document.getElementById('main-search-input');
      if (mainSearchInput) mainSearchInput.value = match.codigo10;
    }
  }

  if (btnShare) {
    btnShare.addEventListener('click', () => {
      if (!state.activeItem) return;
      const shareUrl = `${window.location.origin}${window.location.pathname}?codigo=${state.activeItem.codigo10}`;
      history.pushState(null, '', `?codigo=${state.activeItem.codigo10}`);

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(shareUrl).then(() => {
          showToastNotification(`🔗 Enlace directo de la subpartida ${state.activeItem.codigo10} copiado al portapapeles`);
        });
      } else {
        showToastNotification(`🔗 URL generada: ${shareUrl}`);
      }
    });
  }
}

function initEntityFilters() {
  const chips = document.querySelectorAll('.entity-chip[data-entity-val]');
  chips.forEach(chip => {
    chip.addEventListener('click', () => {
      chips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      renderSearchResults();
    });
  });
}

function initWorkspaceActions() {
  // Panel Lateral Drawer de Favoritos
  const btnFavorites = document.getElementById('btn-favorites');
  const btnCloseFavDrawer = document.getElementById('btn-close-favorites-drawer');
  const drawerFav = document.getElementById('drawer-favorites');

  const toggleFavDrawer = () => {
    if (!drawerFav) return;
    const isHidden = drawerFav.classList.contains('hidden');
    if (isHidden) {
      renderFavoritesDrawer();
      drawerFav.classList.remove('hidden');
    } else {
      drawerFav.classList.add('hidden');
    }
  };

  if (btnFavorites) btnFavorites.addEventListener('click', toggleFavDrawer);
  if (btnCloseFavDrawer && drawerFav) {
    btnCloseFavDrawer.addEventListener('click', () => drawerFav.classList.add('hidden'));
  }

  // 2. Gestor Dinámico de Pestañas Estilo Chrome (TabManager con Persistencia LocalStorage)
  const defaultTabs = [
    { id: 'tab-1', code: '8517.13.00.00' },
    { id: 'tab-2', code: '6402.19.00.00' },
    { id: 'tab-3', code: '8703.23.00.00' }
  ];

  let savedTabs = null;
  let savedActiveTabId = null;
  try {
    const rawTabs = localStorage.getItem('arancel_tabs');
    if (rawTabs) savedTabs = JSON.parse(rawTabs);
    savedActiveTabId = localStorage.getItem('arancel_active_tab_id');
  } catch (e) {
    console.warn('Error leyendo pestañas de localStorage:', e);
  }

  window.TabManager = {
    tabs: (savedTabs && Array.isArray(savedTabs) && savedTabs.length > 0) ? savedTabs : defaultTabs,
    activeTabId: (savedActiveTabId && savedTabs && savedTabs.some(t => t.id === savedActiveTabId)) ? savedActiveTabId : ((savedTabs && savedTabs[0]) ? savedTabs[0].id : 'tab-1'),

    saveState() {
      try {
        localStorage.setItem('arancel_tabs', JSON.stringify(this.tabs));
        localStorage.setItem('arancel_active_tab_id', this.activeTabId);
      } catch (e) {
        console.error('Error guardando estado de pestañas:', e);
      }
    },

    getTabTitle(t) {
      if (t.customName && t.customName.trim()) return t.customName.trim();
      if (t.code) return t.code;
      return '🔍 Nueva pestaña';
    },

    render() {
      const container = document.querySelector('.tabstrip');
      if (!container) return;

      container.innerHTML = `
        ${this.tabs.map(t => `
          <div class="apptab ${t.id === this.activeTabId ? 'active' : ''}" data-tab-id="${t.id}" title="Doble clic o clic en ✏️ para cambiar nombre">
            <span class="code" data-title-id="${t.id}">${this.getTabTitle(t)}</span>
            <span class="btn-edit-tab-name" data-edit-id="${t.id}" title="Cambiar nombre de pestaña">✏️</span>
            <span class="x" data-close-id="${t.id}">✕</span>
          </div>
        `).join('')}
        <div class="apptab new" title="Abrir nueva pestaña">+</div>
      `;

      container.querySelectorAll('.apptab[data-tab-id]').forEach(el => {
        const tabId = el.dataset.tabId;

        el.addEventListener('click', (e) => {
          if (e.target.dataset.closeId || e.target.dataset.editId || e.target.tagName === 'INPUT') return;
          if (this.activeTabId !== tabId) {
            this.switchTab(tabId);
          }
        });

        el.addEventListener('dblclick', (e) => {
          if (e.target.dataset.closeId) return;
          e.stopPropagation();
          e.preventDefault();
          this.editTabName(tabId, el);
        });

        const btnEdit = el.querySelector('.btn-edit-tab-name');
        if (btnEdit) {
          btnEdit.addEventListener('click', (e) => {
            e.stopPropagation();
            this.editTabName(tabId, el);
          });
        }
      });

      container.querySelectorAll('.x[data-close-id]').forEach(x => {
        x.addEventListener('click', (e) => {
          e.stopPropagation();
          this.closeTab(x.dataset.closeId);
        });
      });

      container.querySelector('.apptab.new')?.addEventListener('click', () => {
        this.newTab();
      });
    },

    editTabName(tabId, tabEl) {
      const tab = this.tabs.find(t => t.id === tabId);
      if (!tab) return;
      const codeSpan = tabEl.querySelector('.code');
      if (!codeSpan) return;

      if (codeSpan.querySelector('input')) return;

      const currentTitle = tab.customName || tab.code || '';
      codeSpan.innerHTML = `<input type="text" class="tab-rename-input" value="${currentTitle.replace(/"/g, '&quot;')}" style="background: var(--panel-2); color: var(--text); border: 1px solid var(--brass); border-radius: 3px; padding: 2px 6px; font-family: var(--font-mono); font-size: 12px; outline: none; width: 120px;" />`;

      const input = codeSpan.querySelector('input');
      if (input) {
        input.focus();
        input.select();

        let isSaved = false;
        const save = () => {
          if (isSaved) return;
          isSaved = true;
          const val = input.value.trim();
          if (val) {
            tab.customName = val;
          } else {
            delete tab.customName;
          }
          this.saveState();
          this.render();
        };

        input.addEventListener('blur', save);
        input.addEventListener('keydown', (evt) => {
          if (evt.key === 'Enter') {
            evt.preventDefault();
            save();
          } else if (evt.key === 'Escape') {
            evt.preventDefault();
            isSaved = true;
            this.render();
          }
        });
      }
    },

    switchTab(tabId) {
      const tab = this.tabs.find(t => t.id === tabId);
      if (!tab) return;
      this.activeTabId = tab.id;
      this.saveState();
      this.render();

      if (tab.code && state.dataset && state.dataset.subpartidas) {
        const match = state.dataset.subpartidas.find(s => s.codigo10 === tab.code || s.codigo10.replace(/\./g, '') === tab.code.replace(/\./g, ''));
        if (match) {
          state.activeItem = match;
          const mainSearchInput = document.getElementById('main-search-input');
          if (mainSearchInput) mainSearchInput.value = match.codigo10;
          updateActiveItemPanel(match);
          renderSearchResults();
          showToastNotification(`Pestaña activa: ${match.codigo10}`);
        }
      } else {
        const mainSearchInput = document.getElementById('main-search-input');
        if (mainSearchInput) { mainSearchInput.value = ''; mainSearchInput.focus(); }
      }
    },

    newTab(code = '') {
      const newId = `tab-${Date.now()}`;
      const newTabObj = { id: newId, code: code };
      this.tabs.push(newTabObj);
      this.activeTabId = newId;
      this.saveState();
      this.render();
      if (code) {
        this.switchTab(newId);
      } else {
        const mainSearchInput = document.getElementById('main-search-input');
        if (mainSearchInput) { mainSearchInput.value = ''; mainSearchInput.focus(); }
        showToastNotification('🔍 Nueva pestaña de búsqueda abierta');
      }
    },

    closeTab(tabId) {
      if (this.tabs.length <= 1) {
        showToastNotification('Debe haber al menos 1 pestaña abierta');
        return;
      }
      const idx = this.tabs.findIndex(t => t.id === tabId);
      this.tabs = this.tabs.filter(t => t.id !== tabId);
      if (this.activeTabId === tabId) {
        const nextTab = this.tabs[Math.max(0, idx - 1)];
        this.activeTabId = nextTab.id;
        this.saveState();
        this.switchTab(nextTab.id);
      } else {
        this.saveState();
        this.render();
      }
    },

    updateActiveTabCode(code, fromSearch = false) {
      if (!code) return;
      let active = this.tabs.find(t => t.id === this.activeTabId);

      if (!active) {
        this.newTab(code);
        return;
      }

      if (fromSearch && active.code && active.code !== code) {
        const existing = this.tabs.find(t => t.code === code);
        if (existing) {
          this.switchTab(existing.id);
        } else {
          this.newTab(code);
        }
        return;
      }

      active.code = code;
      delete active.customName;
      this.saveState();
      this.render();
    }
  };

  window.TabManager.render();

  // 3. Colapsar / Expandir Dock Derecho
  const dockCollapseBtn = document.querySelector('.dock-collapse');
  const dockPanel = document.querySelector('.panel-right-tech');
  if (dockCollapseBtn && dockPanel) {
    dockCollapseBtn.addEventListener('click', () => {
      const isHidden = dockPanel.style.display === 'none';
      dockPanel.style.display = isHidden ? 'block' : 'none';
      dockCollapseBtn.textContent = isHidden ? '»' : '«';
      showToastNotification(isHidden ? 'Dock derecho expandido' : 'Dock derecho colapsado');
    });
  }

  // 4. Calculadora CIF en Tiempo Real en Dock Derecho
  const dockFob = document.getElementById('dock-fob-val');
  const dockFlete = document.getElementById('dock-flete-val');
  const dockUnits = document.getElementById('dock-unidades-val');
  const dockMargen = document.getElementById('dock-margen-val');
  const dockCertYes = document.getElementById('dock-cert-yes');
  const dockCertNo = document.getElementById('dock-cert-no');
  const dockBtnPdf = document.getElementById('dock-btn-export-pdf');
  let dockCertIsYes = true;

  if (dockCertYes && dockCertNo) {
    dockCertYes.addEventListener('click', () => {
      dockCertYes.classList.add('selected');
      dockCertNo.classList.remove('selected');
      dockCertIsYes = true;
      recalcDock();
    });
    dockCertNo.addEventListener('click', () => {
      dockCertNo.classList.add('selected');
      dockCertYes.classList.remove('selected');
      dockCertIsYes = false;
      recalcDock();
    });
  }

  [dockFob, dockFlete, dockUnits, dockMargen].forEach(el => {
    if (el) {
      el.addEventListener('input', recalcDock);
      el.addEventListener('change', recalcDock);
    }
  });

  if (dockBtnPdf) {
    dockBtnPdf.addEventListener('click', () => {
      const modalCalc = document.getElementById('modal-calc');
      if (modalCalc) modalCalc.classList.remove('hidden');
      showToastNotification('📄 Abriendo generador de reporte A4 PDF');
    });
  }

  function recalcDock() {
    const fob = parseFloat(dockFob?.value) || 0;
    const fleteSeguro = parseFloat(dockFlete?.value) || 0;
    const unidades = Math.max(1, parseInt(dockUnits?.value) || 1);
    const margen = parseFloat(dockMargen?.value) || 30;
    const item = state.activeItem || { adValorem: 0 };
    const tcText = document.getElementById('sunat-tc-val')?.textContent || '3.750';
    const tc = parseFloat(tcText.replace(/[^0-9.]/g, '')) || 3.75;

    const res = TariffCalculator.calculate({
      fob, flete: fleteSeguro, seguro: 0,
      adValoremPct: item.adValorem || 0,
      iscPct: item.isc || 0,
      percepcionPct: 3.5,
      paisOrigen: 'CN',
      tlcVerificado: dockCertIsYes,
      unidades, tipoCambio: tc, margenGananciaPct: margen
    });

    const elTotal = document.getElementById('dock-costo-total-pen');
    const elUnitario = document.getElementById('dock-costo-unitario-pen');
    const elVenta = document.getElementById('dock-venta-sugerida-pen');
    const elUtil = document.getElementById('dock-utilidad-unitario-pen');

    if (elTotal) elTotal.textContent = `S/. ${(parseFloat(res.costoTotalLanded) * tc).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (elUnitario) elUnitario.textContent = `S/. ${res.costoUnitarioPEN}`;
    if (elVenta) elVenta.textContent = `S/. ${res.precioVentaSugeridoPEN}`;
    if (elUtil) {
      const utilUnit = (parseFloat(res.precioVentaSugeridoPEN) - parseFloat(res.costoUnitarioPEN)).toFixed(2);
      elUtil.textContent = `S/. ${utilUnit}`;
    }
  }

  recalcDock();
}

document.addEventListener('DOMContentLoaded', () => {
  initWorkspaceActions();
});


