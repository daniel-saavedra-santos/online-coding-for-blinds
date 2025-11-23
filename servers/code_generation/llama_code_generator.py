# rag_gpt4all_code_generator.py
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
# Coloque o caminho para o seu modelo GGuf baixado
MODEL_PATH = "/home/victor_santiago/Documentos/online-coding-for-blinds/models/Llama-3.2-1B-Instruct-Q4_0.gguf"

if not os.path.exists(MODEL_PATH):
    raise FileNotFoundError(
        f"Arquivo do modelo não encontrado em '{MODEL_PATH}'. "
        "Baixe um modelo .gguf e ajuste o caminho."
    )

print("Carregando o modelo GPT4All para geração...")
llm_model = GPT4All(MODEL_PATH)
print("Modelo GPT4All carregado com sucesso.")

# --- Embeddings com SentenceTransformers (local e eficiente) ---
print("Carregando modelo de embeddings SentenceTransformers...")
embedder = SentenceTransformer("all-MiniLM-L6-v2")
EMB_DIM = embedder.get_sentence_embedding_dimension()
print(f"Modelo de embeddings carregado (dimensão {EMB_DIM}).")

# --- Configurações RAG ---
# ATENÇÃO: Mudando o diretório do índice para não misturar com o anterior
INDEX_DIR = "../../faiss_indexes/llama_generator" 
# ATENÇÃO: Apontando para o novo arquivo JSONL com exemplos de prompt -> código
JSONL_PATH = "../../rag/RAG_exemplos_codigo.jsonl"
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
    with open(path, "r", encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]

def carregar_docs(path: str) -> list[str]:
    if not os.path.exists(path):
        print(f"Aviso: Arquivo de documentação {path} não encontrado.")
        return []
    with open(path, "r", encoding="utf-8") as f:
        return [p.strip() for p in f.read().split("\n\n") if p.strip()]

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

    # MUDANÇA AQUI: O texto para embedding agora é prompt + código
    exemplos_jsonl = carregar_jsonl(JSONL_PATH)
    print(f"Gerando embeddings para {len(exemplos_jsonl)} exemplos de código...")
    for ex in exemplos_jsonl:
        texto_completo = f"Prompt do usuário: {ex.get('prompt', '')}\nCódigo Égua resultante: {ex.get('codigo', '')}"
        emb = normalize(gerar_embedding(texto_completo))
        index.add(np.array([emb]))
        metadados.append({"tipo": "jsonl", **ex})

    # Documentação (continua igual)
    docs_chunks = carregar_docs(DOCS_PATH)
    print(f"Gerando embeddings para {len(docs_chunks)} trechos da documentação...")
    for i, chunk in enumerate(docs_chunks):
        emb = normalize(gerar_embedding(chunk))
        index.add(np.array([emb]))
        metadados.append({"tipo": "doc", "id": f"doc_{i}", "texto": chunk})

    faiss.write_index(index, index_path)
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(metadados, f, ensure_ascii=False, indent=2)

    print(f"Índice criado com {index.ntotal} vetores.")
    return index, metadados

index, metadados = construir_ou_carregar_indice()

# --- MUDANÇA PRINCIPAL: Função RAG para GERAÇÃO DE CÓDIGO ---

def gerar_codigo_egua_local(
    prompt_usuario: str, codigo_atual: str, k: int = 5
) -> str:
    # MUDANÇA: O texto da busca agora combina o prompt com o código existente no editor
    texto_busca = f"Contexto do Código Atual:\n{codigo_atual}\n\nPrompt do Usuário:\n{prompt_usuario}"
    emb_user = normalize(gerar_embedding(texto_busca))

    similares = []
    if index.ntotal > 0:
        k_valido = min(k, index.ntotal)
        _, I = index.search(np.array([emb_user]), k=k_valido)
        similares = [metadados[i] for i in I[0]]

    # MUDANÇA: O prompt para o LLM foi completamente reescrito para gerar código
    contexto = (
        "Você é um assistente de programação especialista na linguagem 'Égua'.\n"
        "Sua tarefa é completar o código do usuário com base no prompt dele e no contexto do que já foi escrito.\n"
        "Responda APENAS com o próximo trecho de código Égua. Não adicione explicações, comentários ou qualquer texto extra.\n\n"
        "### REGRAS GERAIS ###\n"
        "1.  **Normalização de Nomes:** Nomes de variáveis devem ser normalizados: sem acentos, cedilha, e com espaços substituídos por underscores (_). Não coloque underscores no início ou no fim do nome das variáveis.\n"
        "2.  **Strings:** Valores de texto devem sempre estar entre aspas duplas.\n"
        "3.  **Saída Limpa:** Sua resposta deve ser APENAS o código Égua, sem explicações ou formatação extra.\n"
        "4.  **Números por extenso:** Transforme-os em valores numéricos.\n"
        "5.  **Baseie-se Fortemente nos Exemplos:** Use os exemplos recuperados abaixo como sua principal fonte de inspiração para a estrutura e sintaxe do código.\n"
        "6.  **Entradas inválidas:** Se a solicitação do usuário não fizer o menor sentido (no caso de geração de código), NÃO RETORNE NADA. Use esta condição para prevenção de erros.\n"
        "--- INFORMAÇÕES DE REFERÊNCIA RECUPERADAS ---\n"
    )

    for item in similares:
        if item["tipo"] == "jsonl":
            contexto += f"\n### Exemplo Similar ###\nPrompt: {item.get('prompt','')}\nCódigo: {item.get('codigo','')}\n---\n"
        elif item["tipo"] == "doc":
            contexto += f"\n### Documentação Relevante ###\n{item['texto']}\n---\n"
    
    contexto += (
        "\n--- SITUAÇÃO ATUAL DO USUÁRIO ---\n"
        f"Código no editor:\n```egu\n{codigo_atual}\n```\n\n"
        f"Instrução do usuário: '{prompt_usuario}'\n\n"
        "--- PRÓXIMO TRECHO DE CÓDIGO ---\n"
    )

    print("Gerando código com GPT4All...")
    try:
        resposta = llm_model.generate(
            prompt=contexto,
            max_tokens=256, # Tokens para código podem ser menores que para explicações
            temp=0.1,      # Temperatura baixa para respostas mais determinísticas
            top_p=0.9,
            n_batch=128
        )
        return resposta.strip()
    except Exception as e:
        print(f"Erro na geração de texto com GPT4All: {e}")
        return "// Desculpe, ocorreu um erro ao gerar o código."

# --- MUDANÇA: API Flask para receber prompt e código atual ---

@app.route("/gerar-codigo", methods=["POST"])
def gerar_codigo_endpoint():
    data = request.get_json()
    prompt = data.get("prompt", "")
    codigo_atual = data.get("codigo_atual", "")

    if not prompt:
        return Response("Erro: 'prompt' é obrigatório.", status=400, mimetype="text/plain")

    codigo_gerado = gerar_codigo_egua_local(prompt, codigo_atual, k=5)

    return Response(response=codigo_gerado, status=200, mimetype="text/plain; charset=utf-8")

if __name__ == "__main__":
    # Mudando a porta para evitar conflito com os outros servidores
    app.run("localhost", 4400)
