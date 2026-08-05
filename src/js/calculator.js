/**
 * Calculadora de Liquidación de Tributos Aduaneros SUNAT
 * Implementa las fórmulas oficiales de tributación de importación en el Perú.
 */

export class TariffCalculator {
  /**
   * Realiza la liquidación de impuestos, desgravación por TLC y costo unitario
   * @param {Object} params 
   * @returns {Object}
   */
  static calculate(params) {
    const fob = parseFloat(params.fob) || 0;
    const flete = parseFloat(params.flete) || 0;
    const seguro = parseFloat(params.seguro) || 0;
    const baseAdValoremPct = parseFloat(params.adValoremPct) || 0;
    const iscPct = parseFloat(params.iscPct) || 0;
    const tipoPercepcionPct = parseFloat(params.percepcionPct) || 3.5;
    const paisOrigen = params.paisOrigen || 'NMF';
    const unidades = Math.max(1, parseInt(params.unidades) || 1);
    const tipoCambio = parseFloat(params.tipoCambio) || 3.75;
    const margenGananciaPct = parseFloat(params.margenGananciaPct) || 30;

    // 1. Desgravación Arancelaria por TLC
    let tieneTLC = false;
    let nombreTLC = 'Arancel Base NMF';
    let adValoremPct = baseAdValoremPct;

    if (paisOrigen !== 'NMF' && baseAdValoremPct > 0) {
      tieneTLC = true;
      adValoremPct = 0; // Desgravación 100% por acuerdo comercial
      const nombresTLC = {
        'CN': 'TLC Perú - China (Desgravación 100%)',
        'US': 'TLC Perú - EE.UU. (Desgravación 100%)',
        'EU': 'TLC Perú - Unión Europea (Desgravación 100%)',
        'CAN': 'Comunidad Andina - CAN (Arancel 0%)',
        'MX': 'Alianza del Pacífico - México (Desgravación 100%)',
        'JP': 'TLC Perú - Japón (Desgravación 100%)',
        'KR': 'TLC Perú - Corea del Sur (Desgravación 100%)'
      };
      nombreTLC = nombresTLC[paisOrigen] || 'Convenio Internacional (Arancel Preferencial 0%)';
    }

    // 2. Valor CIF (Base imponible primaria)
    const valorCIF = fob + flete + seguro;

    // 3. Ad-Valorem y Ahorro TLC
    const montoAdValorem = valorCIF * (adValoremPct / 100);
    const montoAdValoremSinTLC = valorCIF * (baseAdValoremPct / 100);
    const ahorroUSD = tieneTLC ? (montoAdValoremSinTLC - montoAdValorem) : 0;

    // 4. ISC (Impuesto Selectivo al Consumo)
    const baseISC = valorCIF + montoAdValorem;
    const montoISC = baseISC * (iscPct / 100);

    // 5. Base imponible para IGV e IPM
    const baseIGV_IPM = valorCIF + montoAdValorem + montoISC;

    // 6. IGV (16%) e IPM (2%)
    const montoIGV = baseIGV_IPM * 0.16;
    const montoIPM = baseIGV_IPM * 0.02;
    const subtotalTributosLeyes = montoAdValorem + montoISC + montoIGV + montoIPM;

    // 7. Percepción del IGV SUNAT
    const basePercepcion = baseIGV_IPM + montoIGV + montoIPM;
    const montoPercepcion = basePercepcion * (tipoPercepcionPct / 100);

    // 8. Totales finales
    const totalTributosSUNAT = subtotalTributosLeyes + montoPercepcion;
    const costoTotalLandedUSD = valorCIF + totalTributosSUNAT;

    // 9. Costos Unitarios y Precio Sugerido en Soles (S/.)
    const costoUnitarioUSD = costoTotalLandedUSD / unidades;
    const costoUnitarioPEN = costoUnitarioUSD * tipoCambio;
    const precioVentaSugeridoPEN = costoUnitarioPEN * (1 + (margenGananciaPct / 100));

    return {
      fob: fob.toFixed(2),
      flete: flete.toFixed(2),
      seguro: seguro.toFixed(2),
      valorCIF: valorCIF.toFixed(2),
      baseAdValoremPct,
      adValoremPct,
      tieneTLC,
      nombreTLC,
      ahorroUSD: ahorroUSD.toFixed(2),
      montoAdValorem: montoAdValorem.toFixed(2),
      iscPct,
      montoISC: montoISC.toFixed(2),
      montoIGV: montoIGV.toFixed(2),
      montoIPM: montoIPM.toFixed(2),
      subtotalTributos: subtotalTributosLeyes.toFixed(2),
      percepcionPct: tipoPercepcionPct,
      montoPercepcion: montoPercepcion.toFixed(2),
      totalTributosSUNAT: totalTributosSUNAT.toFixed(2),
      costoTotalLanded: costoTotalLandedUSD.toFixed(2),
      efectividadImpuestoPct: valorCIF > 0 ? ((totalTributosSUNAT / valorCIF) * 100).toFixed(1) : "0.0",
      unidades,
      tipoCambio: tipoCambio.toFixed(2),
      margenGananciaPct,
      costoUnitarioUSD: costoUnitarioUSD.toFixed(2),
      costoUnitarioPEN: costoUnitarioPEN.toFixed(2),
      precioVentaSugeridoPEN: precioVentaSugeridoPEN.toFixed(2)
    };
  }
}
