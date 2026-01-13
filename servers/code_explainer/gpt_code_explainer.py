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

# --- Configurações ---
# Para maior segurança, considere usar variáveis de ambiente (os.getenv)
API_KEY = os.getenv("OPENAI_API_KEY")
client = OpenAI(api_key=API_KEY)

EMBEDDING_MODEL = "text-embedding-3-small"
GENERATION_MODEL = "gpt-4o-mini"
INDEX_DIR = "../../faiss_indexes/gpt_explainer"
JSONL_PATH = "../../rag/RAG_token_parser_interpreter_examples.jsonl"
DOCS_PATH = "../../rag/docs.txt"

# --- Helpers (Funções Auxiliares) ---

def gerar_embedding(texto: str) -> np.ndarray:
    """Gera o embedding de um texto usando o modelo da OpenAI."""
    try:
        resp = client.embeddings.create(input=texto, model=EMBEDDING_MODEL)
        # Dimensão do text-embedding-3-small é 1536
        return np.array(resp.data[0].embedding, dtype=np.float32)
    except Exception as e:
        print(f"Erro ao gerar embedding: {e}")
        return np.zeros(1536, dtype=np.float32)

def carregar_jsonl(path: str) -> list[dict]:
    """Carrega dados de um arquivo .jsonl."""
    if not os.path.exists(path):
        print(f"Aviso: Arquivo de exemplos {path} não encontrado.")
        return []
    exemplos = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            try:
                exemplos.append(json.loads(line))
            except json.JSONDecodeError as e:
                print(f"Erro ao ler linha JSONL: {e}")
    return exemplos

def carregar_docs(path: str) -> list[str]:
    """Carrega e divide a documentação em blocos."""
    if not os.path.exists(path):
        print(f"Aviso: Arquivo de documentação {path} não encontrado.")
        return []
    with open(path, "r", encoding="utf-8") as f:
        texto = f.read()
    return [p.strip() for p in texto.split("\n\n") if p.strip()]

# --- Construção e Persistência do Índice FAISS ---

def construir_ou_carregar_indice():
    """
    Carrega o índice FAISS e os metadados do disco se existirem.
    Caso contrário, constrói a partir dos arquivos de dados e salva em disco.
    """
    dim = 1536
    index_path = os.path.join(INDEX_DIR, "index.faiss")
    meta_path = os.path.join(INDEX_DIR, "metadados.json")

    if os.path.exists(index_path) and os.path.exists(meta_path):
        print("Carregando índice FAISS (OpenAI) existente do disco...")
        index = faiss.read_index(index_path)
        with open(meta_path, "r", encoding="utf-8") as f:
            metadados = json.load(f)
        return index, metadados

    print("Construindo novo índice FAISS com embeddings da OpenAI...")
    os.makedirs(INDEX_DIR, exist_ok=True)

    index = faiss.IndexFlatL2(dim)
    metadados = []

    # 1. Carregar e processar exemplos do JSONL
    exemplos_jsonl = carregar_jsonl(JSONL_PATH)
    for ex in exemplos_jsonl:
        # A indexação aqui já estava correta, usando todos os campos.
        texto_completo = (
            f"Código de exemplo:\n{ex.get('codigo', '')}\n\n"
            f"Tokens gerados:\n{ex.get('tokens', '')}\n\n"
            f"AST gerada:\n{ex.get('ast', '')}\n\n"
            f"Saída/Erro do Interpretador:\n{ex.get('interpretador', '')}"
        )
        emb = gerar_embedding(texto_completo)
        index.add(np.array([emb]))
        metadados.append({"tipo": "jsonl", **ex})

    # 2. Carregar e processar documentação
    docs_chunks = carregar_docs(DOCS_PATH)
    for i, chunk in enumerate(docs_chunks):
        emb = gerar_embedding(chunk)
        index.add(np.array([emb]))
        metadados.append({"tipo": "doc", "id": f"doc_{i}", "texto": chunk})

    # 3. Salvar o índice e os metadados em disco
    faiss.write_index(index, index_path)
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(metadados, f, ensure_ascii=False, indent=2)

    print(f"Índice criado e salvo com {index.ntotal} vetores.")
    return index, metadados

index, metadados = construir_ou_carregar_indice()

# --- Função RAG Pedagógica ---

def gerar_feedback_egua(
    codigo_usuario: str,
    tokens_usuario: str,
    ast_usuario: str,
    console_output: str,
    k: int = 3
) -> str:
    # 1. A busca semântica já estava correta, usando todos os campos do usuário.
    texto_busca_usuario = (
        f"Código do usuário:\n{codigo_usuario}\n\n"
        f"Tokens:\n{tokens_usuario}\n\n"
        f"AST:\n{ast_usuario}\n\n"
        f"Saída/Erro no console:\n{console_output}"
    )
    emb_user = gerar_embedding(texto_busca_usuario)

    # 2. Recupera os k documentos mais similares do índice FAISS
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

    # <-- CORREÇÃO 1: Apresentar o contexto completo dos exemplos para o modelo
    for item in similares:
        if item["tipo"] == "jsonl":
            contexto += (
                f"\n### Exemplo de Código Similar ###\n"
                f"Código: {item.get('codigo','')}\n"
                f"Tokens: {item.get('tokens','')}\n"
                f"AST: {item.get('ast','')}\n"
                f"Saída/Erro Esperado: {item.get('interpretador','')}\n---\n"
            )
        elif item["tipo"] == "doc":
            contexto += (
                f"\n### Trecho da Documentação Oficial ###\n"
                f"{item['texto']}\n---\n"
            )

    # <-- CORREÇÃO 2: Apresentar o contexto completo do usuário para o modelo
    contexto += (
        "\n--- DADOS DO USUÁRIO ---\n"
        f"Código do usuário:\n{codigo_usuario}\n"
        f"Tokens do usuário:\n{tokens_usuario}\n"
        f"AST do usuário:\n{ast_usuario}\n"
        f"Output do console:\n{console_output}\n\n"
        "--- FEEDBACK PEDAGÓGICO ---\n"
        "Resposta:"
    )

    # 4. Gera o feedback usando o modelo GPT
    try:
        resposta = client.chat.completions.create(
            model=GENERATION_MODEL,
            messages=[{"role": "user", "content": contexto}],
            temperature=0.2,
            max_tokens=500
        )
        return resposta.choices[0].message.content.strip()
    except Exception as e:
        print(f"Erro na chamada da API da OpenAI: {e}")
        return "Desculpe, ocorreu um erro ao tentar gerar o feedback."


# --- Flask API ---
@app.route("/", methods=["POST"])
def receber_execucao():
    data = request.get_json()
    if not data:
        return Response("Erro: Nenhum dado JSON recebido.", status=400, mimetype="text/plain")
        
    codigo_usuario = data.get("codigo", "")
    tokens_usuario = data.get("tokens", "")
    ast_usuario = data.get("ast", "")
    console_output = data.get("output", "")

    feedback = gerar_feedback_egua(
        codigo_usuario, tokens_usuario, ast_usuario, console_output, k=3
    )

    return Response(
        response=feedback,
        status=200,
        mimetype="text/plain; charset=utf-8",
    )

if __name__ == "__main__":
    app.run("localhost", 5100)
