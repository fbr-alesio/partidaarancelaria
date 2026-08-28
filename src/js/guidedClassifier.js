/**
 * Asistente Guiado de Clasificación Arancelaria (Wizard RGI)
 * Análisis Técnico paso a paso basado en las Reglas Generales para la Interpretación (RGI 1 a RGI 6).
 */

export class GuidedClassifier {
  constructor(searchEngine) {
    this.searchEngine = searchEngine;
    this.currentStep = 0;
    this.answers = {};
  }

  getQuestionsTree() {
    return [
      {
        id: "reino_categoria",
        titulo: "Paso 1: ¿A qué categoría general pertenece tu producto?",
        subtitulo: "Selecciona el sector industrial o la materia constitutiva principal.",
        opciones: [
          { label: "Tecnología, Máquinas, Celulares y Aparatos Eléctricos", icon: "💻", value: "tecnologia" },
          { label: "Ropa, Textiles, Zapatos y Accesorios de Vestir", icon: "👕", value: "textil_calzado" },
          { label: "Alimentos, Bebidas, Frutas, Café y Productos Agrícolas", icon: "☕", value: "alimentos_agri" },
          { label: "Salud, Cosméticos, Medicamentos y Químicos", icon: "💊", value: "salud_quimicos" },
          { label: "Vehículos, Autos, Motos y repuestos", icon: "🚗", value: "vehiculos" },
          { label: "Juguetes, Muebles y Artículos del hogar", icon: "🧸", value: "varios" }
        ]
      },
      {
        id: "sub_categoria",
        titulo: "Paso 2: Especifica la función o tipo exacto del producto",
        subtitulo: "Dependiendo de tu elección anterior, selecciona la opción que mejor describa la mercancía.",
        getOpciones: (answers) => {
          const cat = answers.reino_categoria;
          if (cat === "tecnologia") {
            return [
              { label: "Teléfono Móvil / Celular / Smartphone", value: "celular" },
              { label: "Computadora Portátil / Laptop / Tablet", value: "laptop" },
              { label: "Computadora de Escritorio / PC / All-in-One", value: "pc_escritorio" },
              { label: "Monitor o Pantalla para Computadora", value: "monitor" },
              { label: "Televisor / Smart TV", value: "televisor" }
            ];
          } else if (cat === "textil_calzado") {
            return [
              { label: "Polos / Camisetas (T-shirts) de Algodón de Punto", value: "polo_algodon" },
              { label: "Pantalón Jean / Mezclilla (Denim) de Algodón", value: "pantalon_jean" },
              { label: "Zapatos / Mocasines de Cuero Natural", value: "zapato_cuero" },
              { label: "Zapatillas Deportivas Sintéticas / Caucho", value: "zapatillas_deporte" }
            ];
          } else if (cat === "alimentos_agri") {
            return [
              { label: "Café en grano o molido (Tostado o verde)", value: "cafe" },
              { label: "Arroz Blanco / Pulido procesado", value: "arroz" },
              { label: "Ron y Bebidas Alcohólicas de Caña", value: "ron" }
            ];
          } else if (cat === "salud_quimicos") {
            return [
              { label: "Medicamentos acondicionados para la venta (Paracetamol, Pastillas, Jarabes)", value: "medicamentos" },
              { label: "Cosméticos, Cremas faciales o Bloqueadores solares", value: "cosmeticos" }
            ];
          } else if (cat === "vehiculos") {
            return [
              { label: "Automóvil de pasajeros / Camioneta SUV a gasolina", value: "auto_pasajeros" },
              { label: "Motocicleta / Scooter (50cc - 250cc)", value: "motocicleta" }
            ];
          } else {
            return [
              { label: "Juguetes de plástico o peluches", value: "juguetes" },
              { label: "Muebles de madera para hogar u oficina", value: "muebles_madera" },
              { label: "Manufacturas / Artículos diversos de Plástico", value: "manufactura_plastico" }
            ];
          }
        }
      },
      {
        id: "estado_procesamiento",
        titulo: "Paso 3: ¿Cuál es el estado o condicionamiento del producto?",
        subtitulo: "Las normas aduaneras varían según si el producto viene acondicionado para venta directa o es materia prima.",
        opciones: [
          { label: "Nuevo, completo y listo para venta al por menor", value: "nuevo_final" },
          { label: "Materia prima / En granel / Para procesamiento", value: "materia_prima" }
        ]
      }
    ];
  }

  /**
   * Resuelve el Análisis Técnico de Clasificación según las Reglas Generales Interpretativas (RGI 1 a 6)
   * @param {Object} answers 
   * @returns {Object}
   */
  resolveClassification(answers) {
    const subCat = answers.sub_categoria;
    let targetQuery = "";
    let rgiAnalisis = [];
    let nivelConfianza = "ORIENTATIVO";

    switch (subCat) {
      case "celular":
        targetQuery = "8517.13.00.00";
        rgiAnalisis = [
          "Nivel Partida (85.17): RGI 1 — Clasificado por el texto expreso de la partida 85.17 para aparatos de telefonía.",
          "Nivel Subpartida (8517.13): RGI 6 — Comparación a nivel de 6 dígitos entre subpartidas del mismo nivel (8517.13 vs 8517.14 vs 8517.18).",
          "Nivel Nacional (8517.13.00.00): RGI 6 — Apertura nacional a 10 dígitos para teléfonos inteligentes."
        ];
        break;

      case "laptop":
        targetQuery = "8471.30.00.00";
        rgiAnalisis = [
          "Nivel Partida (84.71): RGI 1 — Máquinas automáticas para procesamiento de datos.",
          "Nivel Subpartida (8471.30): RGI 6 — Máquinas portátiles de peso <= 10 kg compuestas por CPU, teclado y pantalla.",
          "Nivel Nacional (8471.30.00.00): Subpartida nacional sin aperturas adicionales."
        ];
        break;

      case "pc_escritorio":
        targetQuery = "8471.41.00.00";
        rgiAnalisis = [
          "Nivel Partida (84.71): RGI 1 — Máquinas automáticas para procesamiento de datos.",
          "Nivel Subpartida (8471.41): RGI 6 — Que contengan en la misma envoltura una unidad central de proceso, una de entrada y una de salida."
        ];
        break;

      case "monitor":
        targetQuery = "8528.52.00.00";
        rgiAnalisis = [
          "Nivel Partida (85.28): RGI 1 — Monitores y proyectores.",
          "Nivel Subpartida (8528.52): RGI 6 — Monitores de los tipos utilizados exclusivamente con computadoras de la partida 84.71."
        ];
        break;

      case "televisor":
        targetQuery = "8528.72.00.00";
        rgiAnalisis = [
          "Nivel Partida (85.28): RGI 1 — Aparatos receptores de televisión.",
          "Nivel Subpartida (8528.72): RGI 6 — Receptores en color con sintonizador incorporado."
        ];
        break;

      case "polo_algodon":
        targetQuery = "6109.10.00.30";
        rgiAnalisis = [
          "Nivel Capítulo (Cap. 61): RGI 1 — Prendas de vestir de tejido de punto.",
          "Nivel Partida (61.09): RGI 1 — Camisetas ('t-shirts') y camisetas de tirantes de punto.",
          "Nivel Subpartida (6109.10): RGI 6 — De algodón.",
          "Nivel Nacional (6109.10.00.30): RGI 6 — Desagregación nacional para prendas de vestir."
        ];
        break;

      case "pantalon_jean":
        targetQuery = "6203.42.10.00";
        rgiAnalisis = [
          "Nivel Capítulo (Cap. 62): RGI 1 — Prendas de vestir de tejido plano (no punto).",
          "Nivel Partida (62.03): RGI 1 — Trajes, pantalones y shorts para hombres o niños.",
          "Nivel Subpartida (6203.42): RGI 6 — De algodón.",
          "Nivel Nacional (6203.42.10.00): RGI 6 — Pantalones largos de tejido de mezclilla ('denim')."
        ];
        break;

      case "zapato_cuero":
        targetQuery = "6403.99.90.00";
        rgiAnalisis = [
          "Nivel Capítulo (Cap. 64): RGI 1 y Nota 1 del Cap. 64 — Calzado con parte superior (capellada) de cuero natural.",
          "Nivel Partida (64.03): RGI 1 — Calzado con suela de caucho, plástico o cuero natural y parte superior de cuero natural.",
          "Nivel Subpartida (6403.99): RGI 6 — Los demás calzados."
        ];
        break;

      case "zapatillas_deporte":
        targetQuery = "6402.19.00.00";
        rgiAnalisis = [
          "Nivel Capítulo (Cap. 64): RGI 1 — Calzado con suela y parte superior de caucho o plástico.",
          "Nivel Partida (64.02): RGI 1 — Calzado deportivo.",
          "Nivel Subpartida (6402.19): RGI 6 — Los demás calzados de deporte."
        ];
        break;

      case "cafe":
        targetQuery = "0901.21.00.00";
        rgiAnalisis = [
          "Nivel Capítulo (Cap. 09): RGI 1 — Café, té, yerba mate y especias.",
          "Nivel Partida (09.01): RGI 1 — Café, incluso tostado o descafeinado.",
          "Nivel Subpartida (0901.21): RGI 6 — Tostado, sin descafeinar."
        ];
        break;

      case "arroz":
        targetQuery = "1006.30.00.00";
        rgiAnalisis = [
          "Nivel Capítulo (Cap. 10): RGI 1 — Cereales.",
          "Nivel Partida (10.06): RGI 1 — Arroz.",
          "Nivel Subpartida (1006.30): RGI 6 — Arroz blanqueado o pulido."
        ];
        break;

      case "ron":
        targetQuery = "2208.40.00.00";
        rgiAnalisis = [
          "Nivel Capítulo (Cap. 22): RGI 1 — Bebidas, líquidos alcohólicos y vinagre.",
          "Nivel Partida (22.08): RGI 1 — Alcohol etílico sin desnaturalizar, aguardientes y licores.",
          "Nivel Subpartida (2208.40): RGI 6 — Ron y demás aguardientes procedentes de la destilación de productos de caña de azúcar."
        ];
        break;

      case "medicamentos":
        targetQuery = "3004.90.29.00";
        rgiAnalisis = [
          "Nivel Capítulo (Cap. 30): RGI 1 — Productos farmacéuticos.",
          "Nivel Partida (30.04): RGI 1 — Medicamentos constituidos por productos mezclados o sin mezclar preparados para usos terapéuticos, acondicionados para la venta al por menor.",
          "Nivel Subpartida (3004.90): RGI 6 — Los demás."
        ];
        break;

      case "cosmeticos":
        targetQuery = "3304.99.00.00";
        rgiAnalisis = [
          "Nivel Capítulo (Cap. 33): RGI 1 — Aceites esenciales y preparaciones de perfumería o cosmética.",
          "Nivel Partida (33.04): RGI 1 — Preparaciones de belleza, maquillaje y para el cuidado de la piel.",
          "Nivel Subpartida (3304.99): RGI 6 — Las demás."
        ];
        break;

      case "auto_pasajeros":
        targetQuery = "8703.23.90.40";
        rgiAnalisis = [
          "Nivel Capítulo (Cap. 87): RGI 1 — Vehículos automóviles, tractores, velocípedos y demás vehículos terrestres.",
          "Nivel Partida (87.03): RGI 1 — Automóviles de turismo y demás vehículos proyectados principalmente para el transporte de personas.",
          "Nivel Subpartida (8703.23): RGI 6 — De cilindrada superior a 1,500 cm³ pero inferior o igual a 3,000 cm³."
        ];
        break;

      case "motocicleta":
        targetQuery = "8711.20.00.00";
        rgiAnalisis = [
          "Nivel Capítulo (Cap. 87): RGI 1 — Vehículos automóviles.",
          "Nivel Partida (87.11): RGI 1 — Motocicletas (incluidos los ciclomotores).",
          "Nivel Subpartida (8711.20): RGI 6 — Con motor de émbolo de cilindrada superior a 50 cm³ pero inferior o igual a 250 cm³."
        ];
        break;

      case "juguetes":
        targetQuery = "9503.00.99.00";
        rgiAnalisis = [
          "Nivel Capítulo (Cap. 95): RGI 1 — Juguetes, juegos y artículos para recreo o deporte.",
          "Nivel Partida (95.03): RGI 1 — Triciclos, patinetes, coches de pedal y juguetes similares; modelos reducidos y rompecabezas.",
          "Nivel Subpartida (9503.00): RGI 6 — Apertura única a nivel de subpartida."
        ];
        break;

      case "muebles_madera":
        targetQuery = "9403.60.00.00";
        rgiAnalisis = [
          "Nivel Capítulo (Cap. 94): RGI 1 — Muebles, mobiliario médico-quirúrgico, aparatos de alumbrado.",
          "Nivel Partida (94.03): RGI 1 — Los demás muebles y sus partes.",
          "Nivel Subpartida (9403.60): RGI 6 — Los demás muebles de madera."
        ];
        break;

      default:
        targetQuery = "";
        rgiAnalisis = [
          "Información insuficiente para determinar una clasificación con seguridad."
        ];
        nivelConfianza = "INFORMACIÓN INSUFICIENTES";
    }

    const matches = targetQuery ? this.searchEngine.search({ query: targetQuery }) : [];
    return {
      partidaEncontrada: matches.length > 0 ? matches[0] : null,
      rgiAnalisis: rgiAnalisis,
      justificacionRGI: rgiAnalisis.join(" | "),
      nivelConfianza: nivelConfianza,
      disclaimer: "Este análisis constituye una herramienta de apoyo técnico-orientativa y no reemplaza una Resolución de Clasificación Arancelaria emitida por SUNAT."
    };
  }
}
