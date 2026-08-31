// scratch/validar-sinonimos.js
//
// Valida que todos los códigos usados en src/data/sinonimos.json existan
// realmente en src/data/arancel2022.json. Si encuentra un código huérfano,
// sugiere candidatos reales que comparten la misma partida (primeros 6 dígitos).
//
// Uso:
//   node scratch/validar-sinonimos.js
//

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ARANCEL_PATH = path.resolve(__dirname, '../src/data/arancel2022.json');
const SINONIMOS_PATH = path.resolve(__dirname, '../src/data/sinonimos.json');

const POSSIBLE_CODE_FIELDS = ['codigo10', 'codigo', 'code', 'subpartida', 'partida'];

function loadJson(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8'));
  } catch (err) {
    console.error(`✗ No se pudo leer ${filePath}`);
    console.error(`  ${err.message}`);
    process.exit(1);
  }
}

function detectCodeField(sampleRecord) {
  for (const field of POSSIBLE_CODE_FIELDS) {
    if (sampleRecord && typeof sampleRecord[field] === 'string') return field;
  }
  return null;
}

function hs6(code) {
  return code.replace(/\./g, '').slice(0, 6);
}

function main() {
  const arancelRaw = loadJson(ARANCEL_PATH);
  const arancel = Array.isArray(arancelRaw) ? arancelRaw : (arancelRaw.subpartidas || []);
  const sinonimos = loadJson(SINONIMOS_PATH);

  if (!Array.isArray(arancel) || arancel.length === 0) {
    console.error('✗ arancel2022.json está vacío o no se pudieron extraer las subpartidas.');
    process.exit(1);
  }

  const codeField = detectCodeField(arancel[0]);
  if (!codeField) {
    console.error(
      `✗ No se detectó un campo de código reconocible en arancel2022.json.\n` +
      `  Campos probados: ${POSSIBLE_CODE_FIELDS.join(', ')}`
    );
    process.exit(1);
  }

  console.log(`→ Campo de código detectado en arancel2022.json: "${codeField}"`);
  console.log(`→ ${arancel.length} subpartidas cargadas.\n`);

  const validCodes = new Set(arancel.map(r => r[codeField]));

  const byHs6 = new Map();
  for (const record of arancel) {
    const key = hs6(record[codeField]);
    if (!byHs6.has(key)) byHs6.set(key, []);
    byHs6.get(key).push(record[codeField]);
  }

  const sinonimoCodes = Object.keys(sinonimos);
  const orphans = [];
  let validCount = 0;

  for (const code of sinonimoCodes) {
    if (validCodes.has(code)) {
      validCount++;
      continue;
    }
    const candidatos = byHs6.get(hs6(code)) || [];
    orphans.push({ code, aliases: sinonimos[code], candidatos });
  }

  console.log(`✓ Códigos válidos: ${validCount} / ${sinonimoCodes.length}`);

  if (orphans.length === 0) {
    console.log('\n✓ Todos los códigos de sinonimos.json existen en arancel2022.json. Nada que corregir.');
    process.exit(0);
  }

  console.log(`\n✗ ${orphans.length} código(s) huérfano(s) encontrados:\n`);

  for (const { code, aliases, candidatos } of orphans) {
    console.log(`  · ${code}  (alias: ${aliases.join(', ')})`);
    if (candidatos.length > 0) {
      console.log(`    → Candidatos reales con la misma partida: ${candidatos.join(', ')}`);
    } else {
      console.log(`    → No se encontró ninguna subpartida con esa partida (primeros 6 dígitos) en tu dataset.`);
    }
    console.log('');
  }

  console.log('Corrige cada entrada de sinonimos.json con el candidato correcto y vuelve a correr este script.');
  process.exit(1);
}

main();
