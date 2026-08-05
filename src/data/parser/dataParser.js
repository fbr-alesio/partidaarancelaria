/**
 * Módulo Parser & Cargador de Datos del Arancel SUNAT
 * Permite validar, importar y actualizar la base de datos de subpartidas arancelarias
 * cuando la SUNAT u OMA emite un nuevo PDF/Excel o modificación por Decreto Supremo.
 */

export class ArancelParser {
  /**
   * Valida la estructura de un código de subpartida nacional SUNAT (10 dígitos)
   * Formato oficial: XXXX.XX.XX.XX (ej. 8517.13.00.00)
   * @param {string} codigo 
   * @returns {boolean}
   */
  static validarCodigo10(codigo) {
    if (!codigo) return false;
    const limpio = codigo.replace(/[\s.-]/g, '');
    return /^\d{10}$/.test(limpio);
  }

  /**
   * Formatea un string numérico de 10 dígitos al formato SUNAT (XXXX.XX.XX.XX)
   * @param {string} codigo 
   * @returns {string}
   */
  static formatearCodigo10(codigo) {
    const limpio = (codigo || '').replace(/[\s.-]/g, '');
    if (limpio.length !== 10) return codigo;
    return `${limpio.substring(0, 4)}.${limpio.substring(4, 6)}.${limpio.substring(6, 8)}.${limpio.substring(8, 10)}`;
  }

  /**
   * Procesa un array de objetos importados de PDF/Excel a la estructura JSON oficial del aplicativo
   * @param {Array<Object>} itemsRaw 
   * @returns {Array<Object>}
   */
  static parseRawDataset(itemsRaw) {
    return itemsRaw.map(item => {
      const codigoFormateado = this.formatearCodigo10(item.codigo || item.subpartida);
      const limpio = codigoFormateado.replace(/\./g, '');
      
      return {
        codigo10: codigoFormateado,
        codigo6: `${limpio.substring(0, 4)}.${limpio.substring(4, 6)}`,
        partida4: limpio.substring(0, 4),
        capitulo: limpio.substring(0, 2),
        seccion: item.seccion || "DESCONOCIDA",
        descripcionOficial: (item.descripcion || item.descripcionOficial || '').trim(),
        sinonimos: Array.isArray(item.sinonimos) ? item.sinonimos : (item.sinonimos || '').split(',').map(s => s.trim()).filter(Boolean),
        adValorem: parseFloat(item.adValorem ?? item.adv ?? 0),
        igv: parseFloat(item.igv ?? 16),
        ipm: parseFloat(item.ipm ?? 2),
        isc: parseFloat(item.isc ?? 0),
        unidadMedida: item.unidadMedida || "KILOGRAMO (kg)",
        entidadControl: item.entidadControl || "Sin restricción específica",
        restriccion: item.restriccion || "Sin restricciones",
        observaciones: item.observaciones || "Actualización por script Parser",
        rgiAplicada: item.rgiAplicada || "RGI 1 y RGI 6"
      };
    });
  }

  /**
   * Exporta la base de datos a un archivo JSON descargable
   * @param {Object} fullData 
   */
  static exportDataset(fullData) {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(fullData, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `Arancel_SUNAT_Backup_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  }
}
