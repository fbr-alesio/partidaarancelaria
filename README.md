# 📦 Clasificador & Buscador Inteligente de Partidas Arancelarias (SUNAT 2022)

Aplicación web moderna, rápida e intuitiva para buscar, clasificar y calcular impuestos aduaneros de importación/exportación según el **Arancel de Aduanas de la SUNAT (Perú / Nomenclatura NANDINA / VII Enmienda OMA)**.

---

## 🛠️ Guía Paso a Paso para Ejecutar en Visual Studio Code (VS Code)

Sigue estos sencillos pasos para abrir y ejecutar la aplicación en tu computadora utilizando **VS Code**:

### Método 1: Usando la extensión "Live Server" (Opción más fácil, sin comandos)

1. **Abre VS Code.**
2. En el menú superior, ve a **`Archivo` > `Abrir carpeta...`** (o presiona `Ctrl + K` `Ctrl + O`).
3. Navega a la siguiente ruta y selecciónala:
   `C:\Users\fabri\.gemini\antigravity\scratch\partidas-arancelarias-app`
4. En el panel izquierdo de archivos, haz clic en el archivo **`index.html`**.
5. Si tienes la extensión **Live Server** instalada en VS Code:
   - Haz clic derecho sobre `index.html` y selecciona **"Open with Live Server"**.
   - ¡Listo! Se abrirá automáticamente tu navegador web con la aplicación en vivo (`http://127.0.0.1:5500`).

---

### Método 2: Usando Node.js / Terminal Integrada de VS Code (Recomendado)

1. Abre la carpeta del proyecto en VS Code.
2. Abre la terminal integrada presionando **`Ctrl + Ñ`** (o en el menú `Terminal` > `Nueva terminal`).
3. Ejecuta el comando para instalar las dependencias de desarrollo (Vite):
   ```bash
   npm install
   ```
4. Inicia el servidor de desarrollo en tiempo real:
   ```bash
   npm run dev
   ```
5. Haz clic en el enlace local que aparecerá en la terminal (ejemplo: `http://localhost:5173`) para abrir la aplicación.

---

## 🌟 Características Principales del Aplicativo

1. **Búsqueda Semántica Inteligente:**
   - Busca por palabras clave en lenguaje comercial (ej: *"laptops"*, *"polos de algodón"*, *"zapatillas"*, *"café molido"*).
   - Busca directamente por código numérico de 10 dígitos (ej: `8517.13.00.00`, `8471.30.00.00`).
   - Sugerencias de autocompletado instantáneo.

2. **Asistente Guiado RGI (Wizard Interactivo):**
   - Árbol de decisión paso a paso para personas que no conocen la nomenclatura técnica.
   - Determina la partida recomendada aplicando las **Reglas Generales Interpretativas (RGI 1 a 6)** de la OMA.

3. **Simulador de Liquidación Aduanera (Calculadora CIF SUNAT):**
   - Ingresa FOB, Flete y Seguro.
   - Calcula automáticamente el Valor CIF, Ad-Valorem (0%, 6% o 11%), IGV (16%), IPM (2%) y Percepción del IGV (3.5%, 5% o 10%).

4. **Ficha Técnica Detallada:**
   - Visualiza la jerarquía completa del árbol arancelario (Sección -> Capítulo -> Partida 4d -> Subpartida 6d -> Subpartida Nacional 10d).
   - Identifica Entidades de Control Restringido (**MTC, DIGESA, SENASA, DIGEMID, PRODUCE**).
   - Opción para imprimir o guardar como PDF.

5. **Actualizaciones de la Base de Datos:**
   - Los datos se encuentran en `src/data/arancel2022.json`.
   - Cuando la SUNAT publique modificaciones de decretos o PDFs en el futuro, puedes usar el script `src/data/parser/dataParser.js` para actualizar los registros fácilmente.

---

## 📂 Estructura del Código en VS Code

```text
partidas-arancelarias-app/
├── index.html                 # Estructura principal y modales
├── package.json               # Configuración Vite / Scripts
├── README.md                  # Este manual de instrucciones
└── src/
    ├── styles/
    │   └── main.css           # Estilos Glassmorphism y Modo Oscuro/Claro
    ├── data/
    │   ├── arancel2022.json   # Base de datos arancelaria SUNAT (10 dígitos)
    │   └── parser/
    │       └── dataParser.js  # Módulo de importación/exportación y validación
    └── js/
        ├── app.js             # Controlador principal y gestión de eventos
        ├── searchEngine.js    # Motor de búsqueda y filtros
        ├── guidedClassifier.js# Asistente de clasificación por preguntas RGI
        └── calculator.js      # Calculadora aduanera oficial
```
