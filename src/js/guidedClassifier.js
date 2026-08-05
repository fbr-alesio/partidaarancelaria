/**
 * Asistente Guiado de Clasificación Arancelaria (Wizard RGI)
 * Sistema de árboles de decisión interactivos para determinar la subpartida nacional SUNAT
 * basándose en las Reglas Generales Interpretativas (RGI).
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
   * Resuelve la partida arancelaria final recomendada según las respuestas acumuladas
   * @param {Object} answers 
   * @returns {Object}
   */
  resolveClassification(answers) {
    const subCat = answers.sub_categoria;
    let targetQuery = "";
    let rgiJustificacion = "";

    switch (subCat) {
      case "celular":
        targetQuery = "8517.13.00.00";
        rgiJustificacion = "Clasificado en la Subpartida 8517.13 por aplicación estricta de la RGI 1 y RGI 6 (Aparatos de telefonía móvil e inalámbrica).";
        break;
      case "laptop":
        targetQuery = "8471.30.00.00";
        rgiJustificacion = "Clasificado en la Subpartida 8471.30 aplicando RGI 1 (Máquinas automáticas para procesamiento de datos portátiles, de peso <= 10 kg).";
        break;
      case "pc_escritorio":
        targetQuery = "8471.41.00.00";
        rgiJustificacion = "Clasificado en la Subpartida 8471.41 por tener CPU, teclado y pantalla en una misma envoltura.";
        break;
      case "monitor":
        targetQuery = "8528.52.00.00";
        rgiJustificacion = "Clasificado en la Subpartida 8528.52 (Monitores para computadoras de la partida 84.71).";
        break;
      case "televisor":
        targetQuery = "8528.72.00.00";
        rgiJustificacion = "Clasificado en la Subpartida 8528.72 (Televisores en color con sintonizador incorporarado).";
        break;
      case "polo_algodon":
        targetQuery = "6109.10.00.30";
        rgiJustificacion = "Clasificado en el Capítulo 61 (Prendas de vestir de punto) y Subpartida 6109.10 por ser 100% tejido de punto de algodón.";
        break;
      case "pantalon_jean":
        targetQuery = "6203.42.10.00";
        rgiJustificacion = "Clasificado en el Capítulo 62 (Prendas de vestir de tejido plano) y Subpartida 6203.42 por ser tela denim de algodón.";
        break;
      case "zapato_cuero":
        targetQuery = "6403.99.90.00";
        rgiJustificacion = "Clasificado en el Capítulo 64 por ser calzado con capellada de cuero natural (RGI 1 y Nota 1 del Cap. 64).";
        break;
      case "zapatillas_deporte":
        targetQuery = "6402.19.00.00";
        rgiJustificacion = "Clasificado en la Subpartida 6402.19 por ser calzado deportivo de parte superior de caucho/plástico.";
        break;
      case "cafe":
        targetQuery = "0901.21.00.00";
        rgiJustificacion = "Clasificado en el Capítulo 09 (Café, té, especias) según RGI 1.";
        break;
      case "arroz":
        targetQuery = "1006.30.00.00";
        rgiJustificacion = "Clasificado en el Capítulo 10 (Cereales) subpartida 1006.30 para arroz blanqueado/pulido.";
        break;
      case "ron":
        targetQuery = "2208.40.00.00";
        rgiJustificacion = "Clasificado en el Capítulo 22 (Licores y bebidas alcohólicas) subpartida 2208.40.";
        break;
      case "medicamentos":
        targetQuery = "3004.90.29.00";
        rgiJustificacion = "Clasificado en el Capítulo 30 (Productos farmacéuticos) por estar acondicionados para la venta al por menor.";
        break;
      case "cosmeticos":
        targetQuery = "3304.99.00.00";
        rgiJustificacion = "Clasificado en el Capítulo 33 (Preparaciones de belleza y cuidado de la piel).";
        break;
      case "auto_pasajeros":
        targetQuery = "8703.23.90.40";
        rgiJustificacion = "Clasificado en el Capítulo 87 (Vehículos automóviles) subpartida 8703.23 por cilindrada y tipo de motor.";
        break;
      case "motocicleta":
        targetQuery = "8711.20.00.00";
        rgiJustificacion = "Clasificado en la partida 8711 por ser vehículo automotor de 2 ruedas.";
        break;
      case "juguetes":
        targetQuery = "9503.00.99.00";
        rgiJustificacion = "Clasificado en el Capítulo 95 (Juguetes y artículos de recreación).";
        break;
      case "muebles_madera":
        targetQuery = "9403.60.00.00";
        rgiJustificacion = "Clasificado en la partida 9403 por ser mueble acabado de madera.";
        break;
      default:
        targetQuery = "3926.90.90.00";
        rgiJustificacion = "Clasificación genérica por defecto basada en RGI 4 (Analogía) o RGI 1.";
    }

    const matches = this.searchEngine.search({ query: targetQuery });
    return {
      partidaEncontrada: matches.length > 0 ? matches[0] : null,
      justificacionRGI: rgiJustificacion
    };
  }
}
