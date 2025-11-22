# rag_gemini_feedback_docs.py
# Requisitos: pip install google-generativeai faiss-cpu numpy flask flask-cors

import os
import json
import faiss
import numpy as np
import google.generativeai as genai
from flask import Flask, request, Response
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

# --- Configurações ---
API_KEY = os.getenv("GOOGLE_API_KEY")
genai.configure(api_key=API_KEY)

EMBEDDING_MODEL = "embedding-001"
GENERATION_MODEL = "gemini-2.0-flash"
INDEX_DIR = "../../faiss_indexes/gemini_explainer"
JSONL_PATH = "../../rag/RAG_token_parser_interpreter_examples.jsonl"
DOCS_PATH = "../../rag/docs.txt"

# --- Helpers ---
def gerar_embedding_texto(texto: str) -> np.ndarray:
    try:
        resp = genai.embed_content(model=EMBEDDING_MODEL, content=texto)
        return np.array(resp["embedding"], dtype=np.float32)
    except Exception as e:
        print(f"Erro ao gerar embedding: {e}")
        return np.zeros(768, dtype=np.float32)

def normalize(v: np.ndarray) -> np.ndarray:
    norm = np.linalg.norm(v)
    return v / norm if norm > 0 else v

def carregar_jsonl(path: str) -> list[dict]:
    if not os.path.exists(path):
        print(f"Aviso: {path} não encontrado.")
        return []
    exemplos = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            try:
                exemplos.append(json.loads(line))
            except Exception as e:
                print("Erro ao ler linha JSONL:", e)
    return exemplos

def carregar_docs(path: str) -> list[str]:
    if not os.path.exists(path):
        print(f"Aviso: {path} não encontrado.")
        return []
    with open(path, "r", encoding="utf-8") as f:
        texto = f.read()
    return [p.strip() for p in texto.split("\n\n") if p.strip()]

# --- Construção/persistência do índice FAISS ---
def construir_ou_carregar_indice():
    dim = 768
    index_path = os.path.join(INDEX_DIR, "index.faiss")
    meta_path = os.path.join(INDEX_DIR, "metadados.json")

    if os.path.exists(index_path) and os.path.exists(meta_path):
        print("Carregando índice FAISS existente...")
        index = faiss.read_index(index_path)
        with open(meta_path, "r", encoding="utf-8") as f:
            metadados = json.load(f)
        return index, metadados

    print("Construindo novo índice FAISS...")
    os.makedirs(INDEX_DIR, exist_ok=True)

    index = faiss.IndexFlatIP(dim)
    metadados = []

    # --- Carregar exemplos do JSONL ---
    exemplos_jsonl = carregar_jsonl(JSONL_PATH)
    for ex in exemplos_jsonl:
        texto_completo = (
            f"[Exemplo {ex.get('id','?')}]\n\n"
            f"Código:\n{ex.get('codigo','')}\n\n"
            f"Tokens:\n{ex.get('tokens','')}\n\n"
            f"AST:\n{ex.get('ast','')}\n\n"
            f"Saída/Erro do Interpretador:\n{ex.get('interpretador','')}"
        )
        emb = normalize(gerar_embedding_texto(texto_completo))
        index.add(np.array([emb]))
        metadados.append({"tipo": "jsonl", **ex})

    # --- Carregar documentação ---
    docs_chunks = carregar_docs(DOCS_PATH)
    for i, chunk in enumerate(docs_chunks):
        emb = normalize(gerar_embedding_texto(chunk))
        index.add(np.array([emb]))
        metadados.append({"tipo": "doc", "id": f"doc_{i}", "texto": chunk})

    faiss.write_index(index, index_path)
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(metadados, f, ensure_ascii=False, indent=2)

    print(f"Índice criado com {index.ntotal} vetores.")
    return index, metadados

index, metadados = construir_ou_carregar_indice()

# --- Função RAG pedagógica ---
# ALTERADO: A função agora aceita tokens e ast do usuário.

def gerar_feedback(
    codigo_usuario: str,
    tokens_usuario: str,
    ast_usuario: str,
    console_output: str,
    k: int = 3
) -> str:
    # Texto combinado do usuário
    texto_busca_usuario = (
        f"Código:\n{codigo_usuario}\n\n"
        f"Tokens:\n{tokens_usuario}\n\n"
        f"AST:\n{ast_usuario}\n\n"
        f"Saída/Erro do Interpretador:\n{console_output}"
    )
    emb_user = normalize(gerar_embedding_texto(texto_busca_usuario))

    similares = []
    if index.ntotal > 0:
        k_valido = min(k, index.ntotal)
        _, I = index.search(np.array([emb_user]), k=k_valido)
        similares = [metadados[i] for i in I[0]]

    # --- NOVO: garantir pelo menos 1 exemplo e 1 doc ---
    exemplo_extra = next((m for m in metadados if m["tipo"] == "jsonl"), None)
    doc_extra = next((m for m in metadados if m["tipo"] == "doc"), None)

    # Filtra duplicados para não repetir
    ids_existentes = {item.get("id") for item in similares}

    if exemplo_extra and exemplo_extra.get("id") not in ids_existentes:
        similares.append(exemplo_extra)
    if doc_extra and doc_extra.get("id") not in ids_existentes:
        similares.append(doc_extra)

    contexto = (
        "Você é um assistente pedagógico para a linguagem de programação 'Égua'.\n"
        "O usuário executou o seguinte código e obteve um output do console, junto com os tokens e a AST.\n"
        "Sua tarefa:\n"
        "- Se a execução foi bem-sucedida, confirme se a saída faz sentido e parabenize o usuário.\n"
        "- Se houve erro, explique em qual linha ocorreu, descreva o problema e sugira uma correção com base no código, tokens, AST e a saída do console.\n"
        "Responda de forma clara, objetiva e amigável.\n\n"
        "Materiais de referência recuperados:\n"
    )

    for item in similares:
        if item["tipo"] == "jsonl":
            contexto += (
                f"\n### Exemplo {item.get('id','?')} ###\n"
                f"Código:\n{item.get('codigo','')}\n\n"
                f"Tokens:\n{item.get('tokens','')}\n\n"
                f"AST:\n{item.get('ast','')}\n\n"
                f"Saída/Erro:\n{item.get('interpretador','')}\n"
            )
        elif item["tipo"] == "doc":
            contexto += (
                f"\n### Trecho da documentação (doc {item['id']}):\n"
                f"{item['texto']}\n"
            )

    contexto += (
        f"\n###\nCódigo do usuário:\n{codigo_usuario}\n"
        f"Tokens do usuário:\n{tokens_usuario}\n"
        f"AST do usuário:\n{ast_usuario}\n"
        f"Output do console:\n{console_output}\n\nResposta:"
    )

    try:
        model = genai.GenerativeModel(GENERATION_MODEL)
        response = model.generate_content(
            contexto,
            generation_config={
                "temperature": 0.2,
                "max_output_tokens": 400,
            },
        )
        return response.text.strip()
    except Exception as e:
        print(f"Erro na geração de feedback: {e}")
        return "Erro ao gerar feedback."



# --- Flask API ---
@app.route("/", methods=["POST"])
def receber_execucao():
    data = request.get_json()
    codigo_usuario = data.get("codigo", "")
    console_output = data.get("output", "")
    # ADICIONADO: Obter os tokens e a AST do request JSON.
    tokens_usuario = data.get("tokens", "")
    ast_usuario = data.get("ast", "")

    # ALTERADO: Passar os novos dados para a função de feedback.
    feedback = gerar_feedback(codigo_usuario, tokens_usuario, ast_usuario, console_output, k=3)
    # feedback = gerar_feedback(codigo_usuario, tokens_usuario, ast_usuario, console_output, k_exemplos=2, k_docs=1)

    return Response(
        response=feedback,
        status=201, # Usar 200 OK é mais comum para respostas bem-sucedidas que retornam conteúdo. 201 é para criação de recurso.
        mimetype="text/plain",
    )

if __name__ == "__main__":
    app.run("localhost", 5000)
