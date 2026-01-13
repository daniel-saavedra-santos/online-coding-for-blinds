# rag_openai_assistente_codigo.py
# Requisitos: pip install openai faiss-cpu numpy flask flask-cors

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
# É mais seguro usar variáveis de ambiente.
API_KEY = os.getenv("OPENAI_API_KEY")
client = OpenAI(api_key=API_KEY)

EMBEDDING_MODEL = "text-embedding-3-small"
GENERATION_MODEL = "gpt-4o-mini"
INDEX_DIR = "../../faiss_indexes/gpt_generator"
JSONL_PATH = "../../rag/RAG_exemplos_codigo.jsonl"
DOCS_PATH = "../../rag/docs.txt"

# --- Funções Auxiliares (Helpers) ---

def gerar_embedding(texto: str) -> np.ndarray:
    """Gera embedding usando a API da OpenAI."""
    try:
        texto = texto.replace("\n", " ") # Modelo da OpenAI funciona melhor sem quebras de linha
        resp = client.embeddings.create(input=[texto], model=EMBEDDING_MODEL)
        return np.array(resp.data[0].embedding, dtype=np.float32)
    except Exception as e:
        print(f"Erro ao gerar embedding: {e}")
        # Dimensão do text-embedding-3-small é 1536
        return np.zeros(1536, dtype=np.float32)

def carregar_jsonl(path: str) -> list[dict]:
    """Carrega exemplos de um arquivo JSONL."""
    if not os.path.exists(path):
        print(f"Aviso: Arquivo de exemplos '{path}' não encontrado.")
        return []
    with open(path, "r", encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]

def carregar_docs(path: str) -> list[str]:
    """Carrega a documentação e a divide em trechos."""
    if not os.path.exists(path):
        print(f"Aviso: Arquivo de documentação '{path}' não encontrado.")
        return []
    with open(path, "r", encoding="utf-8") as f:
        return [p.strip() for p in f.read().split("\n\n") if p.strip()]

# --- Construção e Persistência do Índice FAISS ---

def construir_ou_carregar_indice():
    dim = 1536  # Dimensão do text-embedding-3-small
    index_path = os.path.join(INDEX_DIR, "index.faiss")
    meta_path = os.path.join(INDEX_DIR, "metadados.json")

    if os.path.exists(index_path) and os.path.exists(meta_path):
        print("Carregando índice FAISS (OpenAI) existente do disco...")
        index = faiss.read_index(index_path)
        with open(meta_path, "r", encoding="utf-8") as f:
            metadados = json.load(f)
        print(f"Índice carregado com {index.ntotal} vetores.")
        return index, metadados

    print("Construindo novo índice FAISS com embeddings da OpenAI...")
    os.makedirs(INDEX_DIR, exist_ok=True)

    index = faiss.IndexFlatL2(dim) # L2 (distância Euclidiana) é padrão para OpenAI
    metadados = []

    # 1. Indexar exemplos do JSONL
    exemplos_jsonl = carregar_jsonl(JSONL_PATH)
    print(f"Indexando {len(exemplos_jsonl)} exemplos de código...")
    for ex in exemplos_jsonl:
        texto = f"Prompt: {ex.get('prompt', '')}\nCódigo: {ex.get('codigo', '')}"
        emb = gerar_embedding(texto)
        index.add(np.array([emb]))
        metadados.append({"tipo": "jsonl", **ex})

    # 2. Indexar documentação
    docs_chunks = carregar_docs(DOCS_PATH)
    print(f"Indexando {len(docs_chunks)} trechos da documentação...")
    for i, chunk in enumerate(docs_chunks):
        emb = gerar_embedding(chunk)
        index.add(np.array([emb]))
        metadados.append({"tipo": "doc", "id": f"doc_{i}", "texto": chunk})

    faiss.write_index(index, index_path)
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(metadados, f, ensure_ascii=False, indent=2)

    print(f"Índice criado e salvo com {index.ntotal} vetores.")
    return index, metadados

# --- Inicialização do RAG ---
index, metadados = construir_ou_carregar_indice()

# --- Função RAG principal ---

def gerar_codigo_com_rag_openai(prompt_usuario: str, codigo_atual: str, k: int = 5) -> str:
    # 1. Combinar prompt e contexto do editor para a busca
    texto_busca = f"Código atual: {codigo_atual}\n\nInstrução do usuário: {prompt_usuario}"
    emb_user = gerar_embedding(texto_busca)

    # 2. Recuperar k documentos e exemplos mais similares
    if index.ntotal == 0:
        print("Aviso: Índice FAISS vazio.")
        return "// Erro: o índice de busca está vazio."

    k_valido = min(k, index.ntotal)
    _, I = index.search(np.array([emb_user]), k=k_valido)
    documentos_relevantes = [metadados[i] for i in I[0]]

    # 3. Montar o prompt para o modelo de chat
    system_prompt = (
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
    
    contexto_recuperado = "--- INFORMAÇÕES DE REFERÊNCIA ---\n"
    docs_text = "\n".join([item['texto'] for item in documentos_relevantes if item['tipo'] == 'doc'])
    if docs_text:
        contexto_recuperado += f"Documentação Relevante:\n{docs_text}\n\n"

    exemplos_text = "\n".join([f"Exemplo:\nPrompt: {item['prompt']}\nCódigo: {item['codigo']}" for item in documentos_relevantes if item['tipo'] == 'jsonl'])
    if exemplos_text:
        contexto_recuperado += f"Exemplos Similares:\n{exemplos_text}\n\n"

    user_prompt = (
        f"{contexto_recuperado}"
        "--- SITUAÇÃO ATUAL DO USUÁRIO ---\n"
        f"Código no editor:\n```egu\n{codigo_atual}\n```\n\n"
        f"Instrução: '{prompt_usuario}'\n\n"
        "--- PRÓXIMO TRECHO DE CÓDIGO ---"
    )

    # 4. Gerar o código com o modelo da OpenAI
    try:
        response = client.chat.completions.create(
            model=GENERATION_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.0,
            max_tokens=256
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        print(f"Erro na geração de conteúdo com OpenAI: {e}")
        return "// Erro ao gerar código."

# --- API Flask ---

@app.route('/gerar-codigo', methods=["POST"])
def gerar_codigo_endpoint():
    try:
        data = request.get_json()
        prompt = data.get("prompt")
        codigo_atual = data.get("codigo_atual", "")

        if not prompt:
            return Response("Erro: 'prompt' é obrigatório.", status=400)
            
        print(f"Prompt recebido: '{prompt}'")
        print(f"Código atual:\n---\n{codigo_atual}\n---")
        
        codigo_gerado = gerar_codigo_com_rag_openai(prompt, codigo_atual, k=5)
        
        return Response(response=codigo_gerado, status=200, mimetype='text/plain')

    except Exception as e:
        print(f"Erro no endpoint: {e}")
        return Response("Erro interno no servidor.", status=500)

if __name__ == "__main__":
    # O Flask usa a porta 5000 por padrão, mas você pode mudar se precisar
    app.run("localhost", 4100)