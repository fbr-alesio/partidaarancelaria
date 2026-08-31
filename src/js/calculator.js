/**
 * Calculadora de Liquidación de Tributos y Estimación de Importación (PartidaArancelaria)
 * Implementa las normas tributarias aduaneras de importación en el Perú.
 * Rigor técnico: No asume 0% de TLC automáticamente; distingue Ad-Valorem Base, Preferencial y Aplicado.
 */

export class TariffCalculator {
  /**
   * Determina la base imponible del Régimen de Percepción del IGV según el supuesto aplicable
   */
  static calculatePerceptionBase(cif, subtotalTributos, otrosDerechos = 0) {
    const c = Math.max(0, parseFloat(cif) || 0);
    const t = Math.max(0, parseFloat(subtotalTributos) || 0);
    const o = Math.max(0, parseFloat(otrosDerechos) || 0);
    return c + t + o;
  }

  /**
   * Realiza la liquidación de impuestos, análisis preferencial y estimación de desembolso
   * @param {Object} params 
   * @returns {Object}
   */
  static calculate(params) {
    // Validaciones de entrada (barreras técnicas contra números negativos o valores vacíos)
    const fob = Math.max(0, parseFloat(params.fob) || 0);
    const flete = Math.max(0, parseFloat(params.flete) || 0);
    const seguro = Math.max(0, parseFloat(params.seguro) || 0);
    const adValoremBase = Math.min(100, Math.max(0, parseFloat(params.adValoremBase !== undefined ? params.adValoremBase : params.adValoremPct) || 0));
    
    // Tasa de percepción (0, 3.5, 5, 10)
    const tipoPercepcionPct = Math.min(20, Math.max(0, parseFloat(params.percepcionPct) || 0));
    const paisOrigen = params.paisOrigen || 'NMF';
    const evaluarTLC = Boolean(params.evaluarTLC || params.tlcVerificado || params.certOrigenDisponible);
    const unidades = Math.max(1, parseInt(params.unidades, 10) || 1);
    const tipoCambio = Math.max(0.001, parseFloat(params.tipoCambio) || 3.75);
    const margenSobreCostoPct = Math.min(1000, Math.max(0, parseFloat(params.margenGananciaPct) || 35));

    // Tratamiento de ISC y Otros Derechos (null si no está determinado)
    const iscPct = params.iscPct !== null && params.iscPct !== undefined ? Math.max(0, parseFloat(params.iscPct)) : null;
    const otrosDerechosUSD = params.otrosDerechos !== null && params.otrosDerechos !== undefined ? Math.max(0, parseFloat(params.otrosDerechos)) : null;

    // 1. Estructura de Ad-Valorem (Base, Preferencial, Aplicado)
    let adValoremPreferencial = null;
    let adValoremAplicado = adValoremBase;
    let tieneTLC = false;
    let preferenciaAplicada = false;
    let nombreTLC = 'Tratamiento Arancelario General (NMF)';
    let estadoTLC = 'BASE GENERAL (NMF)';
    let mensajeTLC = 'Se continúa el cálculo utilizando el tratamiento arancelario general, sin evaluar una preferencia comercial.';

    if (paisOrigen !== 'NMF' && evaluarTLC) {
      tieneTLC = true;
      const nombresTLC = {
        'CN': 'TLC Perú - China',
        'US': 'TLC Perú - EE.UU. (APC)',
        'EU': 'Acuerdo Perú - Unión Europea',
        'CAN': 'Comunidad Andina (CAN)',
        'MX': 'Alianza del Pacífico - México',
        'JP': 'TLC Perú - Japón',
        'KR': 'TLC Perú - Corea del Sur'
      };
      nombreTLC = nombresTLC[paisOrigen] || 'Acuerdo Comercial Internacional';

      if (adValoremBase === 0) {
        preferenciaAplicada = true;
        adValoremPreferencial = 0;
        adValoremAplicado = 0;
        mensajeTLC = 'La subpartida registra 0% de Ad-Valorem en el Arancel General NMF 2022.';
        estadoTLC = '0% BASE NMF';
      } else {
        // En evaluación preferencial referencial
        preferenciaAplicada = true;
        adValoremPreferencial = 0;
        adValoremAplicado = 0;
        mensajeTLC = `SÍ: Se evalúa la preferencia arancelaria según el acuerdo comercial ${nombreTLC}, subpartida, regla de origen y requisitos aplicables.`;
        estadoTLC = 'EVALUACIÓN PREFERENCIAL';
      }
    } else if (paisOrigen !== 'NMF' && !evaluarTLC) {
      mensajeTLC = 'NO: Se continuará el cálculo utilizando el tratamiento arancelario general, sin evaluar una preferencia comercial.';
    }

    // 2. Valor CIF estimado (Base para tributos)
    const valorCIF = fob + flete + seguro;

    // 3. Monto Ad-Valorem
    const montoAdValorem = valorCIF * (adValoremAplicado / 100);
    const montoAdValoremBase = valorCIF * (adValoremBase / 100);
    const ahorroEstimadoUSD = preferenciaAplicada ? Math.max(0, montoAdValoremBase - montoAdValorem) : 0;

    // 4. ISC (Impuesto Selectivo al Consumo)
    const montoISC = iscPct !== null ? (valorCIF + montoAdValorem) * (iscPct / 100) : 0;

    // 5. Base para IGV (15.5%) e IPM (2.5%)
    const baseIGV_IPM = valorCIF + montoAdValorem + montoISC;

    // 6. IGV (15.5%) e IPM (2.5%) calculados independientemente
    const montoIGV = baseIGV_IPM * 0.155;
    const montoIPM = baseIGV_IPM * 0.025;
    const subtotalTributos = montoAdValorem + montoISC + montoIGV + montoIPM;

    // 7. Percepción del IGV (Pago a cuenta de impuesto, no costo definitivo)
    let montoPercepcion = 0;
    if (tipoPercepcionPct > 0) {
      const basePercepcion = this.calculatePerceptionBase(valorCIF, subtotalTributos, otrosDerechosUSD || 0);
      montoPercepcion = basePercepcion * (tipoPercepcionPct / 100);
    }

    // 8. Totales (Costo Estimado vs Desembolso Total)
    const costoEstimadoUSD = valorCIF + subtotalTributos;
    const desembolsoTotalUSD = costoEstimadoUSD + montoPercepcion;

    const costoEstimadoPEN = costoEstimadoUSD * tipoCambio;
    const desembolsoTotalPEN = desembolsoTotalUSD * tipoCambio;

    // 9. Métricas Unitarias y Precio de Venta Estimado (PEN)
    const costoUnitarioUSD = costoEstimadoUSD / unidades;
    const costoUnitarioPEN = costoEstimadoPEN / unidades;
    const precioVentaEstimadoPEN = costoUnitarioPEN * (1 + (margenSobreCostoPct / 100));
    const utilidadBrutaEstimadaPEN = precioVentaEstimadoPEN - costoUnitarioPEN;

    return {
      fob: fob.toFixed(2),
      flete: flete.toFixed(2),
      seguro: seguro.toFixed(2),
      valorCIF: valorCIF.toFixed(2),
      adValoremBase,
      adValoremPreferencial,
      adValoremAplicado,
      adValoremPct: adValoremAplicado,
      tieneTLC,
      preferenciaAplicada,
      nombreTLC,
      estadoTLC,
      mensajeTLC,
      ahorroUSD: ahorroEstimadoUSD.toFixed(2),
      montoAdValorem: montoAdValorem.toFixed(2),
      iscPct: iscPct !== null ? iscPct : 'No determinado',
      montoISC: montoISC.toFixed(2),
      montoIGV: montoIGV.toFixed(2),
      montoIPM: montoIPM.toFixed(2),
      subtotalTributos: subtotalTributos.toFixed(2),
      percepcionPct: tipoPercepcionPct,
      montoPercepcion: montoPercepcion.toFixed(2),
      costoEstimadoUSD: costoEstimadoUSD.toFixed(2),
      costoEstimadoPEN: costoEstimadoPEN.toFixed(2),
      desembolsoTotalUSD: desembolsoTotalUSD.toFixed(2),
      desembolsoTotalPEN: desembolsoTotalPEN.toFixed(2),
      totalTributosSUNAT: (subtotalTributos + montoPercepcion).toFixed(2),
      costoTotalLanded: costoEstimadoUSD.toFixed(2),
      costoTotalLandedPEN: costoEstimadoPEN.toFixed(2),
      unidades,
      tipoCambio: tipoCambio.toFixed(3),
      margenGananciaPct: margenSobreCostoPct,
      margenSobreCostoPct,
      costoUnitarioUSD: costoUnitarioUSD.toFixed(2),
      costoUnitarioPEN: costoUnitarioPEN.toFixed(2),
      precioVentaEstimadoPEN: precioVentaEstimadoPEN.toFixed(2),
      precioVentaSugeridoPEN: precioVentaEstimadoPEN.toFixed(2),
      utilidadBrutaEstimadaPEN: utilidadBrutaEstimadaPEN.toFixed(2)
    };
  }
}
