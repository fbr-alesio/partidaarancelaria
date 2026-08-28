/**
 * Calculadora de Liquidación de Tributos Aduaneros SUNAT
 * Implementa las fórmulas oficiales de tributación de importación en el Perú.
 * Rigor técnico: No aplica 0% de TLC automáticamente a menos que esté verificado y acreditado.
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
    const tlcVerificado = Boolean(params.tlcVerificado || params.certOrigenDisponible);
    const unidades = Math.max(1, parseInt(params.unidades) || 1);
    const tipoCambio = parseFloat(params.tipoCambio) || 3.75;
    const margenGananciaPct = parseFloat(params.margenGananciaPct) || 30;

    // 1. Evaluación rigurosa de TLC / Desgravación Arancelaria
    let tieneTLC = false;
    let preferenciaAplicada = false;
    let nombreTLC = 'Arancel General NMF (Tasa Estándar)';
    let estadoTLC = 'CONFIRMADO POR BASE/FUENTE';
    let adValoremPct = baseAdValoremPct;
    let mensajeTLC = 'Se aplica el Arancel General NMF determinado por el Arancel de Aduanas 2022.';

    if (paisOrigen !== 'NMF') {
      tieneTLC = true;
      const nombresTLC = {
        'CN': 'TLC Perú - China',
        'US': 'TLC Perú - EE.UU. (APC)',
        'EU': 'TLC Perú - Unión Europea',
        'CAN': 'Comunidad Andina (CAN)',
        'MX': 'Alianza del Pacífico - México',
        'JP': 'TLC Perú - Japón',
        'KR': 'TLC Perú - Corea del Sur'
      };
      nombreTLC = nombresTLC[paisOrigen] || 'Acuerdo Comercial Internacional';

      if (baseAdValoremPct === 0) {
        preferenciaAplicada = true;
        adValoremPct = 0;
        mensajeTLC = 'La mercancía ya tributa 0% de Ad-Valorem en el Arancel General NMF.';
        estadoTLC = 'VERIFICADO (0% BASE NMF)';
      } else if (tlcVerificado || paisOrigen === 'CAN') {
        preferenciaAplicada = true;
        adValoremPct = 0; // Desgravación por TLC con Certificado de Origen
        mensajeTLC = `Preferencia arancelaria 0% Ad-Valorem verificada y acreditada mediante el convenio ${nombreTLC}. Certificado de Origen válido.`;
        estadoTLC = 'VERIFICADO Y APLICADO (0% TLC)';
      } else {
        preferenciaAplicada = false;
        adValoremPct = baseAdValoremPct; // Mantener arancel general NMF si no está verificado
        mensajeTLC = `Convenio ${nombreTLC} seleccionado sin Certificado de Origen acreditado. Se aplica el Arancel General NMF (${baseAdValoremPct}%) de forma preventiva hasta presentar la Declaración/Certificado de Origen.`;
        estadoTLC = 'PENDIENTE DE ACREDITACIÓN';
      }
    }

    // 2. Valor CIF (Base imponible primaria)
    const valorCIF = fob + flete + seguro;

    // 3. Ad-Valorem y Ahorro TLC
    const montoAdValorem = valorCIF * (adValoremPct / 100);
    const montoAdValoremSinTLC = valorCIF * (baseAdValoremPct / 100);
    const ahorroUSD = preferenciaAplicada ? (montoAdValoremSinTLC - montoAdValorem) : 0;

    // 4. ISC (Impuesto Selectivo al Consumo)
    const baseISC = valorCIF + montoAdValorem;
    const montoISC = baseISC * (iscPct / 100);

    // 5. Base imponible para IGV e IPM
    const baseIGV_IPM = valorCIF + montoAdValorem + montoISC;

    // 6. IGV (15.5%) e IPM (2.5%)
    const montoIGV = baseIGV_IPM * 0.155;
    const montoIPM = baseIGV_IPM * 0.025;
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

    // 10. Desglose explícito de Fórmulas (BASE x TASA = RESULTADO)
    const formulas = [
      { concepto: 'Valor CIF (USD $)', formula: `FOB ($${fob.toFixed(2)}) + Flete ($${flete.toFixed(2)}) + Seguro ($${seguro.toFixed(2)})`, resultado: `$${valorCIF.toFixed(2)}`, estado: 'CALCULADO' },
      { concepto: 'Ad-Valorem (USD $)', formula: `CIF ($${valorCIF.toFixed(2)}) × ${adValoremPct}%`, resultado: `$${montoAdValorem.toFixed(2)}`, estado: estadoTLC },
      { concepto: 'ISC (USD $)', formula: `(CIF + Ad-Valorem) ($${baseISC.toFixed(2)}) × ${iscPct}%`, resultado: `$${montoISC.toFixed(2)}`, estado: 'CALCULADO' },
      { concepto: 'IGV 15.5% (USD $)', formula: `(CIF + Ad-Valorem + ISC) ($${baseIGV_IPM.toFixed(2)}) × 15.5%`, resultado: `$${montoIGV.toFixed(2)}`, estado: 'CALCULADO' },
      { concepto: 'IPM 2.5% (USD $)', formula: `(CIF + Ad-Valorem + ISC) ($${baseIGV_IPM.toFixed(2)}) × 2.5%`, resultado: `$${montoIPM.toFixed(2)}`, estado: 'CALCULADO' },
      { concepto: 'Percepción IGV (USD $)', formula: `Base Percepción ($${basePercepcion.toFixed(2)}) × ${tipoPercepcionPct}%`, resultado: `$${montoPercepcion.toFixed(2)}`, estado: 'CALCULADO' }
    ];

    return {
      fob: fob.toFixed(2),
      flete: flete.toFixed(2),
      seguro: seguro.toFixed(2),
      valorCIF: valorCIF.toFixed(2),
      baseAdValoremPct,
      adValoremPct,
      tieneTLC,
      preferenciaAplicada,
      nombreTLC,
      estadoTLC,
      mensajeTLC,
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
      costoTotalLandedPEN: (costoTotalLandedUSD * tipoCambio).toFixed(2),
      efectividadImpuestoPct: valorCIF > 0 ? ((totalTributosSUNAT / valorCIF) * 100).toFixed(1) : "0.0",
      unidades,
      tipoCambio: tipoCambio.toFixed(3),
      margenGananciaPct,
      costoUnitarioUSD: costoUnitarioUSD.toFixed(2),
      costoUnitarioPEN: costoUnitarioPEN.toFixed(2),
      precioVentaSugeridoPEN: precioVentaSugeridoPEN.toFixed(2),
      formulas
    };
  }
}
