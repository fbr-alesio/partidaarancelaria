import http.server
import socketserver
import os
import sys
import json
import urllib.request
import urllib.error
import traceback
import ssl

PORT = int(os.environ.get("PORT", sys.argv[1] if len(sys.argv) > 1 else 3001))
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

def load_api_key():
    """Load the key from the process or the private local configuration file."""
    key = os.environ.get("GEMINI_API_KEY", "").strip()
    if key:
        return key
    config_path = os.path.join(DIRECTORY, ".env.local")
    try:
        with open(config_path, "r", encoding="utf-8") as config_file:
            for line in config_file:
                name, separator, value = line.strip().partition("=")
                if separator and name == "GEMINI_API_KEY":
                    return value.strip().strip('"').strip("'")
    except FileNotFoundError:
        pass
    return ""

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def send_json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/api/exchange-rate":
            tc_data = self.fetch_sunat_exchange_rate()
            self.send_json(200, tc_data)
            return
        if self.path == "/" or self.path == "":
            self.path = "/index.html"
        self.directory = DIRECTORY
        return super().do_GET()

    def fetch_sunat_exchange_rate(self):
        """Obtiene el Tipo de Cambio Oficial SUNAT / SBS para importación."""
        urls = [
            "https://api.apis.net.pe/v1/tipo-cambio-sunat",
            "https://api.apis.net.pe/v2/sunat/tipo-cambio"
        ]
        ssl_context = ssl.create_default_context()
        if hasattr(ssl, "VERIFY_X509_STRICT"):
            ssl_context.verify_flags &= ~ssl.VERIFY_X509_STRICT

        for url in urls:
            try:
                req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
                with urllib.request.urlopen(req, timeout=5, context=ssl_context) as response:
                    data = json.loads(response.read())
                    compra = float(data.get("compra", 3.745))
                    venta = float(data.get("venta", 3.750))
                    fecha = str(data.get("fecha", ""))
                    return {
                        "source": "SUNAT / SBS Oficial",
                        "compra": compra,
                        "venta": venta,
                        "tipoCambioImportacion": venta,
                        "fecha": fecha,
                        "updated": True
                    }
            except Exception:
                continue

        return {
            "source": "SUNAT / SBS Oficial (Referencial)",
            "compra": 3.745,
            "venta": 3.750,
            "tipoCambioImportacion": 3.750,
            "fecha": "Hoy",
            "updated": False
        }

    def do_POST(self):
        if self.path != "/api/company-catalog":
            self.send_json(404, {"error": "Ruta no encontrada"})
            return
        api_key = load_api_key()
        if not api_key:
            self.send_json(503, {"error": "GEMINI_API_KEY no está configurada"})
            return
        try:
            length = min(int(self.headers.get("Content-Length", "0")), 8192)
            request_data = json.loads(self.rfile.read(length) or b"{}")
            company = str(request_data.get("company", "")).strip()[:160]
            mode = str(request_data.get("mode", "product")).strip().lower()
            if mode not in ("product", "company"):
                mode = "product"
            if not company:
                self.send_json(400, {"error": "Falta el nombre de la empresa"})
                return
            intent_instruction = "La consulta contiene señales explícitas de empresa o marca; identifica la entidad y sus mercancías físicas." if mode == "company" else "Interpreta primero la consulta como mercancía, objeto, animal, planta, alimento, material o maquinaria. Reconoce modismos y vocabulario comercial peruano (ej. casaca, chompa, polera, táper, tomatodo, pota, pisco, mototaxi, buzo, bvd, chancletas, calamina, balón de gas, etc.). Está prohibido reinterpretar una especie, raza, objeto o nombre común como marca comercial solo porque exista una marca con ese nombre."
            prompt = f"""Actúa como analista de comercio exterior especialista en el Arancel de Aduanas del Perú (NANDINA / SUNAT 2022). Interpreta esta consulta ingresada por un usuario peruano: {company!r}.
Modo solicitado: {mode}. {intent_instruction}
Primero determina la intención semántica teniendo en cuenta la terminología comercial del Perú. Si es un animal o planta peruana (ej. cuy, alpaca, lúcuma, maca, pota, palta), clasifica el producto descrito. Si es una prenda de vestir o artículo cotidiano peruano (ej. casaca, chompa, polera, bvd, táper, mototaxi), traduce la descripción al lenguaje técnico arancelario oficial de la OMA/NANDINA. Solo crea un catálogo empresarial en modo company. Si es ambigua, ofrece interpretaciones de mercancía distintas. Enumera solo mercancías físicas; excluye servicios, software y metadatos.
Para cada familia de producto propone únicamente la partida HS de 4 dígitos más probable. No inventes una subpartida nacional.
Devuelve exclusivamente JSON válido con esta forma:
{{"company":"nombre normalizado de la consulta","intent":"animal|plant|product|material|machinery|company|ambiguous","ambiguous":false,"alternatives":["otra interpretación"],"products":[{{"name":"familia de mercancía","hs_heading":"8481","reason":"explicación breve"}}]}}
Máximo 10 familias, ordenadas por relevancia. Si no hay evidencia suficiente, devuelve products vacío."""
            payload = {
                "contents": [{"role": "user", "parts": [{"text": prompt}]}],
                "generationConfig": {
                    "responseMimeType": "application/json",
                    "maxOutputTokens": 1536,
                    "temperature": 0.2
                }
            }
            gemini_request = urllib.request.Request(
                "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent",
                data=json.dumps(payload).encode("utf-8"),
                headers={"Content-Type": "application/json", "x-goog-api-key": api_key},
                method="POST"
            )
            ssl_context = ssl.create_default_context()
            # Python 3.14 enables strict X.509 checks that reject part of the
            # Windows CA chain even though the chain is otherwise trusted.
            if hasattr(ssl, "VERIFY_X509_STRICT"):
                ssl_context.verify_flags &= ~ssl.VERIFY_X509_STRICT
            with urllib.request.urlopen(gemini_request, timeout=30, context=ssl_context) as response:
                gemini_data = json.loads(response.read())
            text = gemini_data["candidates"][0]["content"]["parts"][0]["text"].strip()
            if text.startswith("```"):
                text = text.split("\n", 1)[1].rsplit("```", 1)[0].strip()
            result = json.loads(text)
            products = []
            for product in result.get("products", [])[:18]:
                heading = "".join(ch for ch in str(product.get("hs_heading", "")) if ch.isdigit())[:4]
                if len(heading) == 4:
                    products.append({"name": str(product.get("name", "Producto"))[:120], "code": heading, "reason": str(product.get("reason", ""))[:240]})
            alternatives = [str(value)[:120] for value in result.get("alternatives", [])[:6]]
            self.send_json(200, {
                "company": str(result.get("company") or company)[:160],
                "intent": str(result.get("intent") or mode)[:40],
                "ambiguous": bool(result.get("ambiguous")) or bool(alternatives),
                "alternatives": alternatives,
                "products": products,
                "source": "Gemini 3.6 + base NANDINA local"
            })
        except urllib.error.HTTPError as error:
            details = error.read().decode("utf-8", errors="ignore")[:500]
            self.send_json(error.code, {"error": "Gemini rechazó la solicitud", "details": details})
        except Exception as error:
            details = f"{type(error).__name__}: {error!r}; {traceback.format_exc().splitlines()[-1]}"
            self.send_json(500, {"error": "No se pudo analizar la empresa", "details": details[:500]})

if __name__ == "__main__":
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        print(f"Servidor PartidaArancelaria B2B corriendo en http://localhost:{PORT}")
        httpd.serve_forever()
