import { SearchEngine } from './searchEngine.js?v=2.3.0';
import { GuidedClassifier } from './guidedClassifier.js';
import { CompanyResolver } from './companyResolver.js';
import { TariffCalculator } from './calculator.js';

// Estado Global de la Aplicación (Enterprise Workbench)
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
 * 1. PANEL IZQUIERDO: Navegador Jerárquico Árbol NANDINA
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

  // Event Listeners para expansión y selección
  // Clic en Sección: Solo expande/contrae el acordeón del árbol (sin alterar la tabla principal)
  container.querySelectorAll('.sec-node').forEach(node => {
    node.addEventListener('click', () => {
      const child = container.querySelector(`#children-sec-${node.dataset.sec}`);
      if (child) child.classList.toggle('open');
    });
  });

  // Clic en Capítulo: Desglosa TODAS las subpartidas del capítulo en la tabla principal central
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
 * 2. PANEL CENTRAL: Búsqueda, Data Table y Pestañas Centrales
 * ------------------------------------------------------------- */
function initSearch() {
  const searchInput = document.getElementById('main-search-input');
  const btnClear = document.getElementById('btn-clear-search');
  const autocompleteBox = document.getElementById('autocomplete-suggestions');
  const selectAdValorem = document.getElementById('filter-advalorem');

  let debounceTimer = null;

  const triggerSearch = async (resolveCompany = false) => {
    const query = searchInput.value;
    let didCompanyLookup = false;
    if (query.trim()) state.relatedItem = null;
    btnClear.classList.toggle('hidden', query.length === 0);
    if (resolveCompany && query.trim() && !state.searchEngine.getBrandProfile(query)) {
      const localMatches = state.searchEngine.search({ query });
      if (localMatches.length === 0) {
        didCompanyLookup = true;
        document.getElementById('results-count-text').textContent = `Interpretando "${query}" con IA y validando contra NANDINA...`;
        try {
          await state.companyResolver.resolve(query);
        } catch (error) {
          console.warn('No se pudo consultar la fuente empresarial:', error);
        }
        if (searchInput.value !== query) return;
      }
    }
    renderSearchResults();
    if (resolveCompany && didCompanyLookup) autocompleteBox.classList.add('hidden');
    else renderAutocomplete(query);
  };

  searchInput.addEventListener('input', () => {
    state.classificationHistory = [];
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => triggerSearch(true), 650);
  });

  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      searchInput.value = '';
      state.classificationHistory = [];
      state.relatedItem = null;
      btnClear.classList.add('hidden');
      autocompleteBox.classList.add('hidden');
      renderSearchResults();
      searchInput.blur();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      clearTimeout(debounceTimer);
      autocompleteBox.classList.add('hidden');
      triggerSearch(true).finally(() => autocompleteBox.classList.add('hidden'));
    }
  });

  searchInput.addEventListener('blur', () => {
    setTimeout(() => autocompleteBox.classList.add('hidden'), 120);
  });

  document.addEventListener('pointerdown', (event) => {
    if (event.target !== searchInput && !autocompleteBox.contains(event.target)) {
      autocompleteBox.classList.add('hidden');
    }
  });

  document.addEventListener('scroll', () => {
    autocompleteBox.classList.add('hidden');
    if (document.activeElement === searchInput) searchInput.blur();
  }, { capture: true, passive: true });

  btnClear.addEventListener('click', () => {
    searchInput.value = '';
    state.classificationHistory = [];
    state.relatedItem = null;
    btnClear.classList.add('hidden');
    autocompleteBox.classList.add('hidden');
    renderSearchResults();
  });

  selectAdValorem.addEventListener('change', () => {
    renderSearchResults();
  });

  const btnShowAll = document.getElementById('btn-show-all-results');
  btnShowAll.addEventListener('click', () => {
    state.relatedItem = null;
    state.classificationHistory = [];
    searchInput.value = '';
    btnClear.classList.add('hidden');
    autocompleteBox.classList.add('hidden');
    renderSearchResults();
  });
}

function showRelatedItems(item) {
  if (!item) return;
  state.relatedItem = item;
  const searchInput = document.getElementById('main-search-input');
  searchInput.value = '';
  document.getElementById('btn-clear-search').classList.add('hidden');
  document.getElementById('autocomplete-suggestions').classList.add('hidden');
  renderSearchResults();
}

function renderAutocomplete(query) {
  const box = document.getElementById('autocomplete-suggestions');
  if (!query || query.length < 2) {
    box.classList.add('hidden');
    return;
  }

  const matches = state.searchEngine.search({ query }).slice(0, 5);
  if (matches.length === 0) {
    box.classList.add('hidden');
    return;
  }

  box.innerHTML = matches.map(item => `
    <div class="autocomplete-item" data-code="${item.codigo10}">
      <span>${state.searchEngine.getDisplayDescription(item).substring(0, 55)}...</span>
      <span class="code">${item.codigo10}</span>
    </div>
  `).join('');

  box.classList.remove('hidden');

  box.querySelectorAll('.autocomplete-item').forEach(el => {
    el.addEventListener('click', () => {
      const code = el.dataset.code;
      document.getElementById('main-search-input').value = code;
      box.classList.add('hidden');
      renderSearchResults();
    });
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
  if (classificationGuide) {
    guidance.innerHTML = `<strong>Orientación comercial:</strong> ${aliasRule.guidance}`;
    guidance.innerHTML = `
      <div class="classification-guide-header">
        <span class="classification-guide-kicker">${classificationGuide.kicker}</span>
        <strong>${classificationGuide.generalCode}</strong>
        ${state.classificationHistory.length ? `<button type="button" id="btn-guide-back" class="classification-guide-back">← ${state.searchEngine.getBrandProfile(state.classificationHistory.at(-1)) ? 'Volver al catálogo del fabricante' : (/^[\d.\s-]+$/.test(state.classificationHistory.at(-1)) ? 'Volver al nivel anterior' : 'Volver a partidas candidatas')}</button>` : ''}
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
      ${classificationGuide.choices && classificationGuide.choices.length >= 2 ? `
        <div style="margin-top: 10px; text-align: right;">
          <button type="button" id="btn-open-comparator" class="btn-compare-trigger">
            ⚖️ Comparar Opciones Dudosas Lado a Lado
          </button>
        </div>
      ` : ''}`;
    guidance.classList.remove('hidden');
    guidance.querySelector('#btn-guide-back')?.addEventListener('click', () => {
      const previousQuery = state.classificationHistory.pop();
      if (previousQuery !== undefined) {
        document.getElementById('main-search-input').value = previousQuery;
        renderSearchResults();
      }
    });
    guidance.querySelector('#btn-open-comparator')?.addEventListener('click', () => {
      openComparisonModal(classificationGuide.choices);
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
      if (e.target.closest('.btn-icon-action')) return; // ignorar clics en botones
      const code = row.dataset.code;
      const matches = state.searchEngine.search({ query: code });
      if (matches.length > 0) {
        state.activeItem = matches[0];
        updateActiveItemPanel(state.activeItem);
        
        // Resaltar visualmente la fila seleccionada sin borrar la búsqueda
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

  // 1. Abrir únicamente la Sección activa y recoger/cerrar todas las demás para mantener orden
  container.querySelectorAll('.tree-children[id^="children-sec-"]').forEach(secChild => {
    if (secChild.id === targetSecId) {
      secChild.classList.add('open');
    } else {
      secChild.classList.remove('open');
    }
  });

  // 2. Abrir únicamente el Capítulo activo y recoger los demás
  container.querySelectorAll('.tree-children[id^="children-cap-"]').forEach(capChild => {
    if (capChild.id === targetCapId) {
      capChild.classList.add('open');
    } else {
      capChild.classList.remove('open');
    }
  });

  // 3. Destacar el nodo de la subpartida activa en el árbol y hacer scroll suave
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
  if (tlcList && state.tlcMarkup === null) state.tlcMarkup = tlcList.innerHTML;

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

  // Sincronizar y desplegar automáticamente la carpeta en el árbol izquierdo
  highlightAndExpandTreeItem(item);

  actionableButtons.forEach(button => { button.disabled = false; });

  const entityInfo = state.searchEngine.resolveEntity(item);

  // Actualizar Header Central
  document.getElementById('active-code-display').textContent = item.codigo10;
  document.getElementById('active-desc-display').textContent = state.searchEngine.getDisplayDescription(item);

  const advEl = document.getElementById('active-adv-display');
  advEl.textContent = `Ad-Valorem: ${item.adValorem}%`;
  advEl.className = `subheading-adv-badge adv-${item.adValorem}`;

  const capituloInfo = state.searchEngine.getCapituloInfo(item.capitulo);
  document.getElementById('active-breadcrumb-display').textContent = 
    `Sección ${item.seccion} > Capítulo ${item.capitulo} (${capituloInfo ? capituloInfo.nombre : ''}) > Partida ${item.partida4} > Subpartida ${item.codigo10}`;

  // Actualizar Panel Derecho (Ficha Técnica)
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

  // Actualizar Módulo de Acuerdos Comerciales / TLCs dinámicamente
  renderTlcModule(item);

  // Actualizar Pestaña de Justificación Jurídica RGI Automática
  renderDynamicRgiTab(item);
  renderResolucionesTab(item.codigo10);
  renderNotasLegalesTab(item);

  // Event listener para copiar código activo
  document.getElementById('btn-copy-active-code').onclick = () => copyToClipboard(item.codigo10);

  // Event listener para exportar / imprimir Ficha Técnica segura
  document.getElementById('btn-export-pdf').onclick = () => printSubheadingReport(item, entityInfo);

  // Event listener para enviar a Calculadora CIF
  document.getElementById('btn-send-calc').onclick = () => {
    document.getElementById('modal-calc').classList.remove('hidden');
    document.getElementById('calc-advalorem').value = item.adValorem;
    document.getElementById('calc-isc').value = item.isc || 0;
    document.getElementById('calc-results-output').innerHTML = `<div class="calc-context"><strong>${item.codigo10}</strong> · ${state.searchEngine.getDisplayDescription(item)}</div>`;
  };
}

function renderTlcModule(item) {
  const container = document.querySelector('.tlc-badges-list');
  if (!container) return;

  const baseAdv = parseFloat(item.adValorem) || 0;

  if (baseAdv > 0) {
    container.innerHTML = `
      <div class="tlc-badge" style="border-left: 3px solid var(--accent-green);">
        🇨🇳 <strong>TLC Perú - China: 0%</strong> <span style="color: var(--accent-green); font-size: 10px;">(Ahorras ${baseAdv}% con Certificado de Origen)</span>
      </div>
      <div class="tlc-badge" style="border-left: 3px solid var(--accent-green);">
        🇺🇸 <strong>TLC Perú - EE.UU.: 0%</strong> <span style="color: var(--accent-green); font-size: 10px;">(Desgravado 100%)</span>
      </div>
      <div class="tlc-badge" style="border-left: 3px solid var(--accent-green);">
        🇪🇺 <strong>TLC Perú - UE: 0%</strong> <span style="color: var(--accent-green); font-size: 10px;">(Desgravado 100%)</span>
      </div>
      <div class="tlc-badge" style="border-left: 3px solid var(--accent-green);">
        🇲🇽 <strong>Alianza del Pacífico: 0%</strong> <span style="color: var(--accent-green); font-size: 10px;">(Preferencia 100%)</span>
      </div>
    `;
  } else {
    container.innerHTML = `
      <div class="tlc-badge" style="border-left: 3px solid var(--accent-blue);">
        🌐 <strong>Arancel NMF (Nación Más Favorecida): 0% Base</strong>
        <p style="font-size: 10px; color: var(--text-muted); margin-top: 2px;">Esta mercancía ya paga 0% de Ad-Valorem desde cualquier país del mundo sin requerir TLC.</p>
      </div>
    `;
  }
}

function printSubheadingReport(item, entityInfo, res = null) {
  const capituloInfo = state.searchEngine.getCapituloInfo(item.capitulo);
  const printWin = window.open('', '_blank');
  if (!printWin) {
    showToast('⚠️ Permitir ventanas emergentes para imprimir la Ficha Técnica');
    return;
  }

  const currentDate = new Date().toLocaleDateString('es-PE', { year: 'numeric', month: 'long', day: 'numeric' });

  printWin.document.write(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <title>Cotización Aduanera & Ficha Técnica - ${item.codigo10}</title>
      <style>
        body { font-family: 'Inter', system-ui, -apple-system, sans-serif; padding: 36px; color: #0f172a; line-height: 1.5; background: #fff; }
        .header-bar { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #2563eb; padding-bottom: 16px; margin-bottom: 24px; }
        .brand { font-size: 20px; font-weight: 800; color: #1e3a8a; }
        .date { font-size: 12px; color: #64748b; }
        .code-box { font-family: monospace; font-size: 26px; font-weight: 800; color: #2563eb; letter-spacing: 1px; }
        .item-desc { font-size: 16px; font-weight: 600; color: #1e293b; margin-top: 4px; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 20px; }
        .box { border: 1px solid #cbd5e1; padding: 18px; border-radius: 8px; background: #f8fafc; }
        .title { font-weight: 800; font-size: 12px; text-transform: uppercase; color: #475569; letter-spacing: 0.5px; margin-bottom: 10px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
        .row-item { display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 6px; }
        .highlight-box { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px; padding: 12px; margin-top: 14px; color: #1e40af; font-size: 13px; }
        .tlc-badge-print { background: #dcfce7; border: 1px solid #86efac; color: #166534; padding: 8px 12px; border-radius: 6px; font-size: 12px; font-weight: 700; margin-top: 10px; }
        .checklist-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 12px; margin-top: 8px; }
        .check-item { display: flex; align-items: center; gap: 6px; }
        @media print { .no-print { display: none; } }
      </style>
    </head>
    <body>
      <div class="header-bar">
        <div>
          <div class="brand">ArancelSmart B2B · Cotización Aduanera</div>
          <div class="date">Fecha de Emisión: ${currentDate} · SUNAT NANDINA 2022</div>
        </div>
        <div style="text-align: right;">
          <div class="code-box">${item.codigo10}</div>
          <small style="color: #64748b;">Subpartida Nacional</small>
        </div>
      </div>

      <div class="item-desc">${item.descripcionOficial}</div>

      <div class="grid">
        <div class="box">
          <div class="title">💸 Impuestos & Derechos SUNAT</div>
          <div class="row-item"><span>Arancel Ad-Valorem:</span> <strong>${item.adValorem}%</strong></div>
          <div class="row-item"><span>IGV (Impuesto General Ventas):</span> <strong>16%</strong></div>
          <div class="row-item"><span>IPM (Impuesto Promoción Municipal):</span> <strong>2%</strong></div>
          <div class="row-item"><span>ISC (Impuesto Selectivo Consumo):</span> <strong>${item.isc || 0}%</strong></div>
          <div class="row-item"><span>Unidad de Medida Oficial:</span> <strong>${item.unidadMedida || 'UNIDAD (u)'}</strong></div>
        </div>

        <div class="box">
          <div class="title">🛡️ Entidad Reguladora & VUCE</div>
          <div class="row-item"><span>Entidad de Control:</span> <strong style="color: #2563eb;">${entityInfo.entidad}</strong></div>
          <div class="row-item" style="flex-direction: column; align-items: flex-start; margin-top: 6px;">
            <span style="color: #64748b;">Requisito / Restricción:</span>
            <span style="font-weight: 600; margin-top: 2px;">${entityInfo.restriccion}</span>
          </div>
        </div>
      </div>

      ${res ? `
        <div class="box" style="margin-top: 20px; background: #ffffff; border-color: #2563eb;">
          <div class="title" style="color: #2563eb;">🧮 Liquidación CIF & Proyección de Rentabilidad</div>
          <div class="grid" style="margin-top: 10px;">
            <div>
              <div class="row-item"><span>Valor FOB:</span> <strong>$${res.fob} USD</strong></div>
              <div class="row-item"><span>Flete Internacional:</span> <strong>$${res.flete} USD</strong></div>
              <div class="row-item"><span>Seguro de Transporte:</span> <strong>$${res.seguro} USD</strong></div>
              <div class="row-item" style="border-top: 1px solid #cbd5e1; padding-top: 4px;"><span>Valor CIF Base:</span> <strong>$${res.valorCIF} USD</strong></div>
            </div>
            <div>
              <div class="row-item"><span>Tributos SUNAT (Adv+IGV+IPM):</span> <strong>$${res.subtotalTributos} USD</strong></div>
              <div class="row-item"><span>Percepción IGV (${res.percepcionPct}%):</span> <strong>$${res.montoPercepcion} USD</strong></div>
              <div class="row-item" style="border-top: 1px solid #cbd5e1; padding-top: 4px; font-weight: 800; color: #16a34a;"><span>TOTAL DERECHOS SUNAT:</span> <strong>$${res.totalTributosSUNAT} USD</strong></div>
            </div>
          </div>

          ${res.tieneTLC ? `
            <div class="tlc-badge-print">
              🎉 <strong>Desgravación Aplicada:</strong> ${res.nombreTLC} — ¡Ahorro obtenido de $${res.ahorroUSD} USD!
            </div>
          ` : ''}

          <div class="highlight-box">
            <strong>📈 Análisis Unitario de Comercialización:</strong><br>
            • Costo Landed Total Nacionalizado: <strong>$${res.costoTotalLanded} USD</strong> (${res.unidades} unidades a T.C. ${res.tipoCambio})<br>
            • Costo Unitario Nacionalizado: <strong>$${res.costoUnitarioUSD} USD / S/. ${res.costoUnitarioPEN} PEN</strong><br>
            • Precio de Venta Sugerido al Público: <strong style="color: #1d4ed8; font-size: 15px;">S/. ${res.precioVentaSugeridoPEN} PEN (con IGV)</strong> (con ${res.margenGananciaPct}% de margen)
          </div>
        </div>
      ` : ''}

      <div class="box" style="margin-top: 20px;">
        <div class="title">📋 Expediente de Importación Obligatorio (VUCE / SUNAT)</div>
        <div class="checklist-grid">
          <div class="check-item">☑ Bill of Lading (B/L) / Guía Aérea</div>
          <div class="check-item">☑ Factura Comercial (Commercial Invoice)</div>
          <div class="check-item">☑ Lista de Empaque (Packing List)</div>
          <div class="check-item">☑ Certificado de Origen (para TLC 0%)</div>
          <div class="check-item">☑ Permiso / Homologación VUCE</div>
          <div class="check-item">☑ Declaración Jurada de Valor (DJV)</div>
        </div>
      </div>

      <div style="margin-top: 30px; text-align: center;" class="no-print">
        <button onclick="window.print()" style="padding: 12px 28px; font-size: 14px; font-weight: 700; background: #2563eb; color: #fff; border: none; border-radius: 6px; cursor: pointer; box-shadow: 0 4px 12px rgba(37,99,235,0.3);">🖨️ Imprimir / Guardar en PDF</button>
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

function initCalculatorModal() {
  const modal = document.getElementById('modal-calc');
  const btnOpen = document.getElementById('btn-quick-calc');
  const btnClose = document.getElementById('btn-close-calc-modal');
  const form = document.getElementById('form-calculator');

  if (btnOpen) {
    btnOpen.onclick = () => {
      modal.classList.remove('hidden');
      if (state.activeItem) {
        document.getElementById('calc-advalorem').value = state.activeItem.adValorem;
        document.getElementById('calc-isc').value = state.activeItem.isc || 0;
        document.getElementById('calc-results-output').innerHTML = `<div class="calc-context"><strong>${state.activeItem.codigo10}</strong> · ${state.searchEngine.getDisplayDescription(state.activeItem)}</div>`;
      }
    };
  }
  if (btnClose) btnClose.onclick = () => modal.classList.add('hidden');

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    calculateAndRender();
  });
}

function calculateAndRender() {
  const fob = parseFloat(document.getElementById('calc-fob').value) || 0;
  const flete = parseFloat(document.getElementById('calc-flete').value) || 0;
  const seguro = parseFloat(document.getElementById('calc-seguro').value) || 0;
  const adValoremPct = parseFloat(document.getElementById('calc-advalorem').value) || 0;
  const iscPct = parseFloat(document.getElementById('calc-isc').value) || 0;
  const percepcionPct = parseFloat(document.getElementById('calc-percepcion').value) || 3.5;
  const paisOrigen = document.getElementById('calc-pais')?.value || 'NMF';
  const unidades = parseInt(document.getElementById('calc-unidades')?.value) || 100;
  const tipoCambio = parseFloat(document.getElementById('calc-tc')?.value) || 3.75;
  const margenGananciaPct = parseFloat(document.getElementById('calc-margen')?.value) || 30;

  const res = TariffCalculator.calculate({
    fob, flete, seguro, adValoremPct, iscPct, percepcionPct,
    paisOrigen, unidades, tipoCambio, margenGananciaPct
  });

  const output = document.getElementById('calc-results-output');
  output.innerHTML = `
    <div style="padding: 12px; background: var(--bg-app); border: 1px solid var(--border-color); border-radius: 6px;">
      <h4 style="font-size: 13px;">Resumen de Liquidación CIF:</h4>
      <div style="display: flex; justify-content: space-between; margin-top: 6px; font-size: 12px;">
        <span>Valor CIF:</span> <strong>$${res.valorCIF} USD</strong>
      </div>
      ${res.tieneTLC ? `
        <div style="padding: 6px 8px; margin: 6px 0; background: #dcfce7; border: 1px solid #86efac; border-radius: 4px; color: #166534; font-size: 11px;">
          🎉 <strong>${res.nombreTLC}:</strong> ¡Ahorro directo de $${res.ahorroUSD} USD! (Ad-Valorem 0%)
        </div>
      ` : `
        <div style="display: flex; justify-content: space-between; font-size: 12px;">
          <span>Ad-Valorem (${res.adValoremPct}%):</span> <span>$${res.montoAdValorem} USD</span>
        </div>
      `}
      <div style="display: flex; justify-content: space-between; font-size: 12px;">
        <span>IGV (16%) + IPM (2%):</span> <span>$${(parseFloat(res.montoIGV) + parseFloat(res.montoIPM)).toFixed(2)} USD</span>
      </div>
      <div style="display: flex; justify-content: space-between; font-size: 12px;">
        <span>Percepción IGV (${res.percepcionPct}%):</span> <span>$${res.montoPercepcion} USD</span>
      </div>
      <div style="display: flex; justify-content: space-between; margin-top: 8px; padding-top: 6px; border-top: 1px solid var(--border-color); font-weight: 700; color: var(--accent-green);">
        <span>TOTAL TRIBUTOS SUNAT:</span> <span>$${res.totalTributosSUNAT} USD</span>
      </div>

      <div style="margin-top: 12px; padding-top: 10px; border-top: 1px dashed var(--border-color);">
        <h4 style="font-size: 13px; color: var(--accent-blue);">📈 Simulador de Costo Unitario & Venta en Soles:</h4>
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

      <button type="button" id="btn-print-calc-report" class="btn-primary-action" style="width: 100%; margin-top: 12px;">
        📄 Exportar Cotización Completa a PDF
      </button>
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
          <h4 style="color: var(--accent-blue); font-size: 13px; font-weight: 700;">⚖️ Diagnóstico RGI 1 (Denominación Directa Especifica)</h4>
          <p style="margin-top: 6px; font-size: 12px; color: var(--text-secondary); line-height: 1.5;">
            Por tratarse de un artículo individual con denominación técnica expresa en el arancel, la clasificación se rige estrictamente por la <strong>RGI 1 y RGI 6</strong>. Prevalece el texto de la subpartida nacional a 10 dígitos sobre cualquier interpretación general.
          </p>
        `;
      } else if (factor === 'funcion') {
        output.innerHTML = `
          <h4 style="color: var(--accent-blue); font-size: 13px; font-weight: 700;">⚖️ Diagnóstico RGI 3b (Carácter Esencial por Función Principal)</h4>
          <p style="margin-top: 6px; font-size: 12px; color: var(--text-secondary); line-height: 1.5;">
            En cumplimiento de la <strong>Regla General Interpretativa 3b</strong>, los productos presentados en surtidos o juegos al por menor se clasifican atendiendo al componente que le confiere su <strong>función técnica determinante</strong>.
          </p>
          <div style="margin-top: 8px; font-size: 11px; font-weight: 700; color: var(--accent-green);">✓ Fundamento Legal: Criterio Vinculante OMA / SUNAT - RGI 3b</div>
        `;
      } else if (factor === 'materia') {
        output.innerHTML = `
          <h4 style="color: var(--accent-blue); font-size: 13px; font-weight: 700;">⚖️ Diagnóstico RGI 3b (Materia Constitutiva Predominante en Peso/Superficie)</h4>
          <p style="margin-top: 6px; font-size: 12px; color: var(--text-secondary); line-height: 1.5;">
            Clasificación asignada por el material o materia prima que le otorga el carácter esencial en volumen, peso exterior o superficie expuesta (ej. caucho, textil o plástico).
          </p>
        `;
      } else {
        output.innerHTML = `
          <h4 style="color: var(--accent-blue); font-size: 13px; font-weight: 700;">⚖️ Diagnóstico RGI 3c (Resolución por Último Orden Numérico)</h4>
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
            <strong style="color: var(--text-main); font-size: 12px;">📌 Nota de Sección (Vinculante):</strong>
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
        🔍 Selecciona o busca una subpartida en el workbench para consultar su <strong>Justificación Jurídica RGI Automática</strong>.
      </div>
    `;
    return;
  }

  const code = item.codigo10 || '';
  const desc = state.searchEngine.getDisplayDescription(item);
  let ruleTitle = 'Regla General Interpretativa 1 & 6 (Texto de la Subpartida)';
  let rationaleText = `Clasificación fundamentada bajo las RGI 1 y 6 del Arancel de Aduanas SUNAT 2022. La mercancía se determina directamente por el texto expreso de la subpartida nacional a 10 dígitos ${code}.`;
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
        <span class="adv-pill adv-0" style="white-space: nowrap;">Justificación Automática</span>
      </div>

      <div style="margin-top: 10px;">
        <h4 style="color: var(--accent-blue); font-size: 13px; font-weight: 700;">⚖️ ${ruleTitle}</h4>
        <p style="margin-top: 6px; font-size: 12px; color: var(--text-secondary); line-height: 1.5;">${rationaleText}</p>
      </div>

      <div style="margin-top: 12px; padding: 10px; background: var(--bg-panel); border: 1px solid var(--border-color); border-radius: 6px; font-size: 11px;">
        <strong style="color: var(--text-muted); text-transform: uppercase;">Criterio Técnico SUNAT:</strong>
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
    const isDark = document.body.classList.contains('theme-dark');
    btn.textContent = isDark ? '🌙 Modo Oscuro' : '☀️ Modo Claro';
  });
}

function initComparatorModal() {
  const modal = document.getElementById('modal-comparator');
  const btnClose = document.getElementById('btn-close-comparator-modal');

  if (btnClose && modal) {
    btnClose.addEventListener('click', () => modal.classList.add('hidden'));
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.add('hidden');
    });
  }
}

function openComparisonModal(choices = []) {
  const modal = document.getElementById('modal-comparator');
  const container = document.getElementById('comparator-matrix-content');
  if (!modal || !container || !choices.length) return;

  const itemsToCompare = choices.map(choice => {
    const matches = state.searchEngine.search({ query: choice.code });
    const item = matches[0] || null;
    return { choice, item };
  }).filter(entry => entry.item);

  if (itemsToCompare.length === 0) return;

  container.innerHTML = itemsToCompare.map(({ choice, item }) => {
    const entityInfo = state.searchEngine.resolveEntity(item);
    const isRecommended = Boolean(choice.recommended);

    return `
      <div class="comparator-col-card ${isRecommended ? 'recommended' : ''}">
        <div class="comparator-col-header">
          <span class="comparator-col-code">${item.codigo10}</span>
          ${isRecommended ? '<span class="recommended-badge" style="float:right">Recomendado</span>' : ''}
          <div class="comparator-col-title">${choice.label || state.searchEngine.getDisplayDescription(item)}</div>
        </div>

        <div class="comparator-col-body">
          <div class="comparator-attr-row">
            <span class="comparator-attr-label">Descripción Oficial NANDINA:</span>
            <span class="comparator-attr-value">${state.searchEngine.getDisplayDescription(item)}</span>
          </div>

          <div class="comparator-attr-row">
            <span class="comparator-attr-label">Arancel Ad-Valorem:</span>
            <span class="adv-pill adv-${item.adValorem}">${item.adValorem}%</span>
          </div>

          <div class="comparator-attr-row">
            <span class="comparator-attr-label">Tributos Totales (IGV+IPM+Adv):</span>
            <span class="comparator-attr-value">${18 + parseFloat(item.adValorem)}% (CIF)</span>
          </div>

          <div class="comparator-attr-row">
            <span class="comparator-attr-label">Entidad Reguladora SUNAT:</span>
            <span class="comparator-attr-value" style="color:var(--accent-blue)">${entityInfo.entidad}</span>
          </div>

          <div class="comparator-attr-row">
            <span class="comparator-attr-label">Requisito VUCE / Observación:</span>
            <small style="color:var(--text-muted)">${choice.detail || entityInfo.restriccion}</small>
          </div>
        </div>

        <div class="comparator-col-footer" style="margin-top:12px">
          <button type="button" class="btn-primary-action btn-select-comparator" data-select-code="${item.codigo10}" style="width:100%">
            ✓ Seleccionar esta Subpartida
          </button>
        </div>
      </div>
    `;
  }).join('');

  modal.classList.remove('hidden');

  container.querySelectorAll('.btn-select-comparator').forEach(btn => {
    btn.addEventListener('click', () => {
      const code = btn.dataset.selectCode;
      modal.classList.add('hidden');
      document.getElementById('main-search-input').value = code;
      renderSearchResults();
    });
  });
}
