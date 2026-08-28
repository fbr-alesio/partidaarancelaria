import json
import os
import re
import sys

CODE_LINE = re.compile(
    r"^\s*(\d{4}\.\d{2}\.\d{2}\.\d{2}|\d{10})\s+(.+?)\s+(0|6|11)\s*$"
)

CURATED_FALLBACKS = [
    {
        "codigo10": "8471.30.00.00", "codigo6": "8471.30", "partida4": "8471",
        "capitulo": "84", "seccion": "XVI",
        "descripcionOficial": "Máquinas automáticas para tratamiento o procesamiento de datos, portátiles, de peso inferior o igual",
        "sinonimos": ["laptop", "notebook", "computadora portátil", "MacBook", "tablet"],
        "adValorem": 0, "igv": 16, "ipm": 2, "isc": 0, "unidadMedida": "UNIDAD (u)",
        "entidadControl": "SUNAT / Regulado", "restriccion": "Verificar requisitos en portal SUNAT / VUCE",
        "observaciones": "Registro validado del Arancel SUNAT 2022", "rgiAplicada": "RGI 1 y RGI 6"
    },
    {
        "codigo10": "8518.30.00.00", "codigo6": "8518.30", "partida4": "8518",
        "capitulo": "85", "seccion": "XVI",
        "descripcionOficial": "Auriculares, incluidos los de casco, estén o no combinados con micrófono",
        "sinonimos": ["audífonos", "auriculares", "headphones", "headset"],
        "adValorem": 0, "igv": 16, "ipm": 2, "isc": 0, "unidadMedida": "UNIDAD (u)",
        "entidadControl": "SUNAT / Regulado", "restriccion": "Verificar requisitos en portal SUNAT / VUCE",
        "observaciones": "Registro validado del Arancel SUNAT 2022", "rgiAplicada": "RGI 1 y RGI 6"
    }
]


def clean_text(value):
    return (value.replace("ﬂ", "fl").replace("ﬁ", "fi").replace("\u00a0", " ")
            .strip().lstrip("-. ").strip())


def section_for_chapter(chapter):
    ranges = [
        (5, "I"), (14, "II"), (15, "III"), (24, "IV"), (27, "V"),
        (38, "VI"), (40, "VII"), (43, "VIII"), (46, "IX"), (49, "X"),
        (63, "XI"), (67, "XII"), (70, "XIII"), (71, "XIV"), (83, "XV"),
        (85, "XVI"), (89, "XVII"), (92, "XVIII"), (93, "XIX"), (96, "XX"),
        (98, "XXI")
    ]
    return next(section for maximum, section in ranges if chapter <= maximum)


def extract_from_pdf(pdf_path):
    import pypdf

    reader = pypdf.PdfReader(pdf_path)
    extracted = []
    seen_codes = set()
    for page in reader.pages:
        for raw_line in (page.extract_text() or "").splitlines():
            match = CODE_LINE.match(raw_line)
            if not match:
                continue
            code_raw, description_raw, rate_raw = match.groups()
            digits = code_raw.replace(".", "")
            if digits in seen_codes:
                continue
            description = clean_text(description_raw)
            if len(description) < 3 or description.lower().startswith(("en las subpartidas", "a efectos de")):
                continue
            seen_codes.add(digits)
            code = f"{digits[:4]}.{digits[4:6]}.{digits[6:8]}.{digits[8:10]}"
            chapter = int(digits[:2])
            extracted.append({
                "codigo10": code,
                "codigo6": f"{digits[:4]}.{digits[4:6]}",
                "partida4": digits[:4],
                "capitulo": digits[:2],
                "seccion": section_for_chapter(chapter),
                "descripcionOficial": description,
                "sinonimos": [description.lower()],
                "adValorem": int(rate_raw),
                "igv": 16,
                "ipm": 2,
                "isc": 0,
                "unidadMedida": "UNIDAD (u)" if chapter in [84, 85, 87, 90] else "KILOGRAMO (kg)",
                "entidadControl": "SUNAT / Regulado",
                "restriccion": "Verificar requisitos en portal SUNAT / VUCE",
                "observaciones": "Arancel de Aduanas SUNAT 2022",
                "rgiAplicada": "RGI 1 y RGI 6"
            })
    return extracted


if __name__ == "__main__":
    pdf_file = sys.argv[1] if len(sys.argv) > 1 else "Arancel_2022.pdf"
    if not os.path.exists(pdf_file):
        raise SystemExit(f"No existe el PDF: {pdf_file}")
    items = extract_from_pdf(pdf_file)
    if not items:
        raise SystemExit("No se extrajeron subpartidas; el JSON existente no fue modificado.")
    existing_codes = {item["codigo10"] for item in items}
    items.extend(item for item in CURATED_FALLBACKS if item["codigo10"] not in existing_codes)
    items.sort(key=lambda item: item["codigo10"])
    target = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "arancel2022.json"))
    with open(target, "r", encoding="utf-8") as source:
        data = json.load(source)
    data["subpartidas"] = items
    with open(target, "w", encoding="utf-8") as output:
        json.dump(data, output, ensure_ascii=False, indent=2)
    print(f"arancel2022.json actualizado con {len(items)} subpartidas validadas.")
