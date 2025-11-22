# servidor_egua_gpt4all_hibrido.py
# Requisitos: pip install flask flask-cors gpt4all faiss-cpu sentence-transformers numpy

import os
import json
import faiss
import numpy as np
from gpt4all import GPT4All
from sentence_transformers import SentenceTransformer
from flask import Flask, request, Response
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

# -------------------------
# Configuração dos Modelos
# -------------------------
# Modelo de Geração (LLM)
MODEL_PATH = "/home/victor_santiago/Documentos/online-coding-for-blinds/models/phi-2.Q4_K_M.gguf"
if not os.path.exists(MODEL_PATH):
    raise FileNotFoundError(f"Arquivo do modelo LLM não encontrado em '{MODEL_PATH}'.")

print("Carregando o modelo GPT4All (LLM)...")
llm_model = GPT4All(MODEL_PATH)
print("Modelo GPT4All carregado.")

# Modelo de Embeddings (para RAG)
print("Carregando modelo de embeddings SentenceTransformers...")
embedder = SentenceTransformer("all-MiniLM-L6-v2")
EMB_DIM = embedder.get_sentence_embedding_dimension()
print(f"Modelo de embeddings carregado (dimensão {EMB_DIM}).")

# -------------------------
# Configurações do RAG
# -------------------------
INDEX_DIR = "../../faiss_indexes/phi2_constructor"
JSONL_PATH = "../../rag/RAG_exemplos_hibrido.jsonl"
DOCS_PATH = "../../rag/docs.txt"

# -------------------------
# Helpers e Construção do Índice RAG (Trazido do script RAG)
# -------------------------

def normalize(v: np.ndarray) -> np.ndarray:
    norm = np.linalg.norm(v)
    return v / norm if norm > 0 else v

def gerar_embedding(texto: str) -> np.ndarray:
    embedding = embedder.encode([texto])[0]
    return np.array(embedding, dtype=np.float32)

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
        print("Carregando índice RAG existente...")
        index = faiss.read_index(index_path)
        with open(meta_path, "r", encoding="utf-8") as f: metadados = json.load(f)
        return index, metadados

    print("Construindo novo índice RAG...")
    os.makedirs(INDEX_DIR, exist_ok=True)
    index = faiss.IndexFlatIP(EMB_DIM)
    metadados = []

    # Indexar exemplos do JSONL Híbrido
    exemplos_jsonl = carregar_jsonl(JSONL_PATH)
    for ex in exemplos_jsonl:
        # O texto para busca é o próprio JSON de entrada
        texto_busca = json.dumps(ex.get("json_input", {}))
        emb = normalize(gerar_embedding(texto_busca))
        index.add(np.array([emb]))
        metadados.append({"tipo": "jsonl", **ex})

    # Indexar documentação
    docs_chunks = carregar_docs(DOCS_PATH)
    for chunk in docs_chunks:
        emb = normalize(gerar_embedding(chunk))
        index.add(np.array([emb]))
        metadados.append({"tipo": "doc", "texto": chunk})

    faiss.write_index(index, index_path)
    with open(meta_path, "w", encoding="utf-8") as f: json.dump(metadados, f, ensure_ascii=False)
    print(f"Índice RAG criado com {index.ntotal} vetores.")
    return index, metadados

# Inicializa o sistema RAG
index, metadados = construir_ou_carregar_indice()

# ---------------------------------------------------------------------------------
# O PROMPT MESTRE (Base)
# ---------------------------------------------------------------------------------
SYSTEM_PROMPT = """
Você é um expert na linguagem de programação "Égua" e sua única tarefa é traduzir um objeto JSON para o código Égua correspondente.

### REGRAS GERAIS ###
1.  **Normalização de Nomes:** Nomes de variáveis devem ser normalizados: sem acentos, cedilha, e com espaços substituídos por underscores (_).
2.  **Strings:** Valores de texto devem sempre estar entre aspas duplas.
3.  **Saída Limpa:** Sua resposta deve ser APENAS o código Égua, sem explicações ou formatação extra.
4.  **Baseie-se Fortemente nos Exemplos:** Use os exemplos recuperados abaixo como sua principal fonte de inspiração para a estrutura e sintaxe do código.
---
"""

# --------------------------------
# Função de Geração Híbrida (RAG + Prompt)
# --------------------------------
def gerar_codigo_hibrido_rag(json_data: dict, k: int = 3) -> str:
    # 1. ETAPA DE RECUPERAÇÃO (RAG)
    texto_busca = json.dumps(json_data)
    emb_user = normalize(gerar_embedding(texto_busca))
    
    contexto_rag = "### CONTEXTO E EXEMPLOS RELEVANTES (Recuperados para te ajudar) ###\n"
    if index.ntotal > 0:
        k_valido = min(k, index.ntotal)
        _, I = index.search(np.array([emb_user]), k=k_valido)
        similares = [metadados[i] for i in I[0]]
        
        for item in similares:
            if item["tipo"] == "jsonl":
                contexto_rag += f"\n# Exemplo Similar:\n# JSON de Entrada:\n# {json.dumps(item.get('json_input'))}\n# Código Égua de Saída:\n{item.get('codigo_gerado')}\n"
            elif item["tipo"] == "doc":
                contexto_rag += f"\n# Documentação Relevante:\n# {item['texto']}\n"
    contexto_rag += "\n---\n"

    # 2. MONTAGEM DO PROMPT FINAL (Prompt Mestre + Contexto RAG)
    prompt_completo = (
        f"{SYSTEM_PROMPT}"
        f"{contexto_rag}"
        "Agora, traduza o seguinte JSON para código Égua:\n"
        f"{json.dumps(json_data, indent=2, ensure_ascii=False)}"
    )

    print("--- PROMPT AUMENTADO ENVIADO AO MODELO ---\n", prompt_completo)

    # 3. ETAPA DE GERAÇÃO
    try:
        response = llm_model.generate(
            prompt=prompt_completo,
            max_tokens=300,
            temp=0.1,
            top_p=0.9
        )
        codigo_limpo = response.strip().replace("`", "").replace("égua", "")
        return codigo_limpo
    except Exception as e:
        print(f"Erro na chamada do modelo GPT4All: {e}")
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

        codigo_gerado = gerar_codigo_hibrido_rag(json_data, k=3)
        
        return Response(response=codigo_gerado, status=200, mimetype='text/plain')
    
    except Exception as e:
        print(f"Erro crítico no endpoint: {e}")
        return Response("Erro interno no servidor.", status=500)

if __name__ == "__main__":
    app.run("localhost", 7200, debug=True)
