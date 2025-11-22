# rag_phi2_feedback.py
# Requisitos:
#   pip install gpt4all faiss-cpu numpy flask flask-cors sentence-transformers

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

# --- Configurações ---
MODEL_PATH = "/home/victor_santiago/Documentos/online-coding-for-blinds/models/phi-2.Q4_K_M.gguf"

if not os.path.exists(MODEL_PATH):
    raise FileNotFoundError(
        f"Arquivo do modelo não encontrado em '{MODEL_PATH}'. "
        "Baixe um modelo .gguf e ajuste o caminho."
    )

print("Carregando o modelo GPT4All para geração (Phi-2)...")
llm_model = GPT4All(MODEL_PATH)
print("Modelo GPT4All carregado com sucesso.")

# --- Embeddings com SentenceTransformers ---
print("Carregando modelo de embeddings SentenceTransformers...")
embedder = SentenceTransformer("all-MiniLM-L6-v2")
EMB_DIM = embedder.get_sentence_embedding_dimension()
print(f"Modelo de embeddings carregado (dimensão {EMB_DIM}).")

# --- Configurações RAG ---
INDEX_DIR = "../../faiss_indexes/phi2_explainer"
JSONL_PATH = "../../rag/RAG_token_parser_interpreter_examples.jsonl"
DOCS_PATH = "../../rag/docs.txt"

# --- Helpers ---

def normalize(v: np.ndarray) -> np.ndarray:
    norm = np.linalg.norm(v)
    return v / norm if norm > 0 else v

def gerar_embedding(texto: str) -> np.ndarray:
    """Gera o embedding de um texto usando SentenceTransformers."""
    try:
        embedding = embedder.encode([texto])[0]
        return np.array(embedding, dtype=np.float32)
    except Exception as e:
        print(f"Erro ao gerar embedding: {e}")
        return np.zeros(EMB_DIM, dtype=np.float32)

def carregar_jsonl(path: str) -> list[dict]:
    if not os.path.exists(path):
        print(f"Aviso: Arquivo de exemplos {path} não encontrado.")
        return []
    exemplos = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            try:
                exemplos.append(json.loads(line))
            except Exception as e:
                print(f"Erro ao ler linha JSONL: {e}")
    return exemplos

def carregar_docs(path: str) -> list[str]:
    if not os.path.exists(path):
        print(f"Aviso: Arquivo de documentação {path} não encontrado.")
        return []
    with open(path, "r", encoding="utf-8") as f:
        texto = f.read()
    return [p.strip() for p in texto.split("\n\n") if p.strip()]

# --- Construção/Persistência do Índice FAISS ---

def construir_ou_carregar_indice():
    index_path = os.path.join(INDEX_DIR, "index.faiss")
    meta_path = os.path.join(INDEX_DIR, "metadados.json")

    if os.path.exists(index_path) and os.path.exists(meta_path):
        print("Carregando índice FAISS existente...")
        index = faiss.read_index(index_path)
        with open(meta_path, "r", encoding="utf-8") as f:
            metadados = json.load(f)
        return index, metadados

    print("Construindo novo índice FAISS com embeddings locais...")
    os.makedirs(INDEX_DIR, exist_ok=True)

    index = faiss.IndexFlatIP(EMB_DIM)
    metadados = []

    # Exemplos JSONL
    exemplos_jsonl = carregar_jsonl(JSONL_PATH)
    print(f"Gerando embeddings para {len(exemplos_jsonl)} exemplos...")
    for ex in exemplos_jsonl:
        # <-- CORREÇÃO 1: Usar todas as informações para construir o embedding do exemplo
        texto_completo = (
            f"Código:\n{ex.get('codigo', '')}\n\n"
            f"Tokens:\n{ex.get('tokens', '')}\n\n"
            f"AST:\n{ex.get('ast', '')}\n\n"
            f"Saída/Erro do Interpretador:\n{ex.get('interpretador', '')}"
        )
        emb = normalize(gerar_embedding(texto_completo))
        index.add(np.array([emb]))
        metadados.append({"tipo": "jsonl", **ex})

    # Documentação
    docs_chunks = carregar_docs(DOCS_PATH)
    print(f"Gerando embeddings para {len(docs_chunks)} trechos da documentação...")
    for i, chunk in enumerate(docs_chunks):
        emb = normalize(gerar_embedding(chunk))
        index.add(np.array([emb]))
        metadados.append({"tipo": "doc", "id": f"doc_{i}", "texto": chunk})

    print("Salvando índice e metadados no disco...")
    faiss.write_index(index, index_path)
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(metadados, f, ensure_ascii=False, indent=2)

    print(f"Índice criado com {index.ntotal} vetores.")
    return index, metadados

index, metadados = construir_ou_carregar_indice()

# --- Função RAG com Geração Local ---

def gerar_feedback_egua_local(
    codigo_usuario: str, tokens_usuario: str, ast_usuario: str, console_output: str, k: int = 3
) -> str:
    # <-- CORREÇÃO 2: Usar todas as informações do usuário para a busca
    texto_busca_usuario = (
        f"Código:\n{codigo_usuario}\n\n"
        f"Tokens:\n{tokens_usuario}\n\n"
        f"AST:\n{ast_usuario}\n\n"
        f"Saída/Erro do Interpretador:\n{console_output}"
    )
    emb_user = normalize(gerar_embedding(texto_busca_usuario))

    similares = []
    if index.ntotal > 0:
        k_valido = min(k, index.ntotal)
        _, I = index.search(np.array([emb_user]), k=k_valido)
        similares = [metadados[i] for i in I[0]]

    contexto = (
        "Você é um assistente pedagógico para a linguagem de programação 'Égua'.\n"
        "O usuário executou o seguinte código e obteve um output do console, junto com os tokens e a AST.\n"
        "Sua tarefa:\n"
        "- Se a execução foi bem-sucedida, confirme se a saída faz sentido e parabenize o usuário.\n"
        "- Se houve erro, explique em qual linha ocorreu, descreva o problema e sugira uma correção com base no código, tokens, AST e a saída do console.\n"
        "Responda de forma clara, objetiva e amigável.\n\n"
        "Materiais de referência recuperados:\n"
    )

    # <-- CORREÇÃO 3: Apresentar o contexto completo dos exemplos para o modelo
    for item in similares:
        if item["tipo"] == "jsonl":
            contexto += (
                f"\n### Exemplo Similar ###\n"
                f"Código: {item.get('codigo','')}\n"
                f"Tokens: {item.get('tokens','')}\n"
                f"AST: {item.get('ast','')}\n"
                f"Saída/Erro: {item.get('interpretador','')}\n---\n"
            )
        elif item["tipo"] == "doc":
            contexto += f"\n### Documentação Relevante ###\n{item['texto']}\n---\n"
    
    # <-- CORREÇÃO 4: Apresentar o contexto completo do usuário para o modelo
    contexto += (
        "\n--- DADOS DO USUÁRIO ---\n"
        f"Código do usuário:\n{codigo_usuario}\n"
        f"Tokens do usuário:\n{tokens_usuario}\n"
        f"AST do usuário:\n{ast_usuario}\n"
        f"Output do console:\n{console_output}\n\n"
        "--- FEEDBACK PEDAGÓGICO ---\n"
        "Resposta:"
    )

    print("Gerando feedback com GPT4All (Phi-2)...")
    try:
        resposta = llm_model.generate(
            prompt=contexto,
            max_tokens=400,
            temp=0.2,
            top_p=0.9,
            n_batch=128
        )
        return resposta.strip()
    except Exception as e:
        print(f"Erro na geração de texto com GPT4All: {e}")
        return "Desculpe, ocorreu um erro ao gerar o feedback localmente."

# --- API Flask ---

@app.route("/", methods=["POST"])
def receber_execucao():
    data = request.get_json()
    codigo_usuario = data.get("codigo", "")
    tokens_usuario = data.get("tokens", "")
    ast_usuario = data.get("ast", "")
    console_output = data.get("output", "")

    feedback = gerar_feedback_egua_local(
        codigo_usuario, tokens_usuario, ast_usuario, console_output, k=3
    )

    return Response(response=feedback, status=200, mimetype="text/plain; charset=utf-8")

if __name__ == "__main__":
    app.run("localhost", 5200)