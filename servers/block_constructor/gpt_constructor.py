# servidor_egua_gpt_rag.py
# Requisitos: pip install openai flask flask-cors faiss-cpu numpy

import os
import json
import faiss
import numpy as np
from openai import OpenAI
from flask import Flask, request, Response
from flask_cors import CORS
from dotenv import load_dotenv

# Carrega as variáveis do arquivo .env que está na raiz do projeto
load_dotenv()

app = Flask(__name__)
CORS(app)

# -------------------------
# Configuração OpenAI
# -------------------------
API_KEY = os.getenv("OPENAI_API_KEY")
client = OpenAI(api_key=API_KEY)

# Modelos específicos para cada tarefa
EMBEDDING_MODEL = "text-embedding-3-small"
GENERATION_MODEL = "gpt-4o-mini"
EMB_DIM = 1536  # Dimensão do text-embedding-3-small

# -------------------------
# Configurações do RAG
# -------------------------
INDEX_DIR = "../../faiss_indexes/gpt_constructor"
JSONL_PATH = "../../rag/RAG_exemplos_hibrido.jsonl"
DOCS_PATH = "../../rag/docs.txt"

# -------------------------
# Helpers e Construção do Índice RAG
# -------------------------

def gerar_embedding(texto: str) -> np.ndarray:
    """Gera o embedding de um texto usando a API da OpenAI."""
    try:
        texto = texto.replace("\n", " ")
        if not texto.strip():
            return np.zeros(EMB_DIM, dtype=np.float32)
        resp = client.embeddings.create(input=[texto], model=EMBEDDING_MODEL)
        return np.array(resp.data[0].embedding, dtype=np.float32)
    except Exception as e:
        print(f"Erro ao gerar embedding com OpenAI: {e}")
        return np.zeros(EMB_DIM, dtype=np.float32)

def carregar_jsonl(path: str) -> list[dict]:
    if not os.path.exists(path): return []
    with open(path, "r", encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]

def carregar_docs(path: str) -> list[str]:
    if not os.path.exists(path): return []
    with open(path, "r", encoding="utf-8") as f:
        return [p.strip() for p in f.read().split("\n\n") if p.strip()]

def construir_ou_carregar_indice():
    index_path = os.path.join(INDEX_DIR, "index.faiss")
    meta_path = os.path.join(INDEX_DIR, "metadados.json")

    if os.path.exists(index_path) and os.path.exists(meta_path):
        print("Carregando índice RAG (OpenAI) existente...")
        index = faiss.read_index(index_path)
        with open(meta_path, "r", encoding="utf-8") as f: metadados = json.load(f)
        return index, metadados

    print("Construindo novo índice RAG com embeddings da OpenAI...")
    os.makedirs(INDEX_DIR, exist_ok=True)
    index = faiss.IndexFlatL2(EMB_DIM)  # L2 é o padrão para embeddings da OpenAI
    metadados = []

    # Indexar exemplos do JSONL
    exemplos_jsonl = carregar_jsonl(JSONL_PATH)
    print(f"Indexando {len(exemplos_jsonl)} exemplos de código...")
    for ex in exemplos_jsonl:
        texto_busca = json.dumps(ex.get("json_input", {}))
        emb = gerar_embedding(texto_busca)
        index.add(np.array([emb]))
        metadados.append({"tipo": "jsonl", **ex})

    # Indexar documentação
    docs_chunks = carregar_docs(DOCS_PATH)
    print(f"Indexando {len(docs_chunks)} trechos da documentação...")
    for chunk in docs_chunks:
        emb = gerar_embedding(chunk)
        index.add(np.array([emb]))
        metadados.append({"tipo": "doc", "texto": chunk})

    faiss.write_index(index, index_path)
    with open(meta_path, "w", encoding="utf-8") as f: json.dump(metadados, f, ensure_ascii=False)
    print(f"Índice RAG criado com {index.ntotal} vetores.")
    return index, metadados

# Inicializa o sistema RAG
index, metadados = construir_ou_carregar_indice()

# ---------------------------------------------------------------------------------
# PROMPT MESTRE MODIFICADO PARA USAR RAG
# ---------------------------------------------------------------------------------
SYSTEM_PROMPT = """
Você é um expert na linguagem de programação "Égua" e sua única tarefa é traduzir um objeto JSON para o código Égua correspondente.

### REGRAS GERAIS ###
1.  **Normalização de Nomes:** Nomes de variáveis devem ser normalizados: sem acentos, cedilha, e com espaços substituídos por underscores (_). Não coloque underscores no início ou no fim do nome das variáveis.
2.  **Strings:** Valores de texto devem sempre estar entre aspas duplas.
3.  **Saída Limpa:** Sua resposta deve ser APENAS o código Égua, sem explicações ou formatação extra.
4.  **Números por extenso:** Transforme-os em valores numéricos.
5.  **Baseie-se Fortemente nos Exemplos:** Use os exemplos recuperados abaixo como sua principal fonte de inspiração para a estrutura e sintaxe do código.

---
"""

# --------------------------------
# Função de Geração Híbrida (RAG + Prompt)
# --------------------------------
def gerar_codigo_hibrido_com_gpt(json_data: dict, k: int = 5) -> str:
    # 1. ETAPA DE RECUPERAÇÃO (RAG)
    texto_busca = json.dumps(json_data)
    emb_user = gerar_embedding(texto_busca)
    
    contexto_rag = "### CONTEXTO E EXEMPLOS RELEVANTES RECUPERADOS ###\n"
    if index.ntotal > 0:
        k_valido = min(k, index.ntotal)
        _, I = index.search(np.array([emb_user]), k=k_valido)
        similares = [metadados[i] for i in I[0]]
        
        for item in similares:
            if item["tipo"] == "jsonl":
                contexto_rag += f"\n# Exemplo Similar:\n# JSON de Entrada: {json.dumps(item.get('json_input'))}\n# Código Égua de Saída:\n{item.get('codigo_gerado')}\n"
            elif item["tipo"] == "doc":
                contexto_rag += f"\n# Documentação Relevante:\n# {item['texto']}\n"
    contexto_rag += "\n---\n"

    # 2. MONTAGEM DO PROMPT FINAL
    user_prompt = (
        f"{contexto_rag}"
        "Agora, com base nas regras e nos exemplos acima, traduza o seguinte JSON para código Égua:\n"
        f"{json.dumps(json_data, indent=2, ensure_ascii=False)}"
    )

    # 3. ETAPA DE GERAÇÃO
    try:
        response = client.chat.completions.create(
            model=GENERATION_MODEL,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.0
        )
        codigo_limpo = response.choices[0].message.content.strip()
        return codigo_limpo
    except Exception as e:
        print(f"Erro na chamada da API OpenAI: {e}")
        return f"// Erro ao gerar código: {e}"

# -------------------------
# Endpoint Flask
# -------------------------
@app.route('/gerar-codigo', methods=["POST"])
def gerar_codigo_endpoint():
    try:
        json_data = request.get_json(force=True)
        if not json_data.get("acao"):
            return Response("Erro: A chave 'acao' é obrigatória no JSON.", status=400)

        codigo_gerado = gerar_codigo_hibrido_com_gpt(json_data)
        
        return Response(response=codigo_gerado, status=200, mimetype='text/plain')
    
    except Exception as e:
        print(f"Erro crítico no endpoint: {e}")
        return Response("Erro interno no servidor.", status=500)

if __name__ == "__main__":
    app.run("localhost", 7100, debug=True)