from flask import Flask, request, jsonify, Response
from flask_cors import CORS
from deep_translator import GoogleTranslator

app = Flask(__name__)
CORS(app)

# Rota que aceita o texto em Português
@app.route('/converter-extenso', methods=['POST'])
def converter_extenso():
    # 1. Receber o texto do Frontend (JavaScript)
    data = request.get_json()
    texto_pt = data.get('texto', '')

    if not texto_pt:
        return jsonify({"error": "Texto não fornecido"}), 400

    try:
        # 2. Tradução (pt -> en)
        tradutor = GoogleTranslator(source="pt", target="en")
        texto_traduzido = tradutor.translate(texto_pt)

        # 4. Retornar o resultado para o JavaScript
        return jsonify({
            "translated_en": texto_traduzido
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run("localhost", 5050, debug=True)