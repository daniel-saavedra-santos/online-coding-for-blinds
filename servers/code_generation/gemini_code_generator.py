# rag_gemini_assistente_codigo.py
# Requisitos: pip install google-generativeai faiss-cpu numpy flask flask-cors

import os
import json
import faiss
import numpy as np
import google.generativeai as genai
from google.generativeai.types import HarmCategory, HarmBlockThreshold
from flask import Flask, request, Response
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

# --- Configurações ---
# É mais seguro usar variáveis de ambiente, mas para teste direto, pode colocar a chave aqui.
API_KEY = os.getenv("GOOGLE_API_KEY")
genai.configure(api_key=API_KEY)

EMBEDDING_MODEL = "embedding-001"
GENERATION_MODEL = "gemini-2.0-flash"
INDEX_DIR = "../../faiss_indexes/gemini_generator"
JSONL_PATH = "../../rag/RAG_exemplos_codigo.jsonl"
DOCS_PATH = "../../rag/docs.txt"

# --- Funções Auxiliares (Helpers) ---

def gerar_embedding_texto(texto: str) -> np.ndarray:
    """Gera embedding usando a API do Gemini."""
    try:
        resp = genai.embed_content(model=EMBEDDING_MODEL, content=texto)
        return np.array(resp['embedding'], dtype=np.float32)
    except Exception as e:
        print(f"Erro ao gerar embedding: {e}")
        return np.zeros(768, dtype=np.float32)

def normalize(v: np.ndarray) -> np.ndarray:
    """Normaliza vetor para usar com similaridade de cosseno (produto interno)."""
    norm = np.linalg.norm(v)
    return v / norm if norm > 0 else v

def carregar_jsonl(path: str) -> list[dict]:
    """Carrega exemplos de um arquivo JSONL."""
    if not os.path.exists(path):
        print(f"Aviso: Arquivo de exemplos '{path}' não encontrado.")
        return []
    exemplos = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            try:
                exemplos.append(json.loads(line))
            except json.JSONDecodeError:
                print(f"Aviso: Linha mal formatada no JSONL foi ignorada: {line}")
    return exemplos

def carregar_docs(path: str) -> list[str]:
    """Carrega a documentação e a divide em trechos."""
    if not os.path.exists(path):
        print(f"Aviso: Arquivo de documentação '{path}' não encontrado.")
        return []
    with open(path, "r", encoding="utf-8") as f:
        texto = f.read()
    # Divide a documentação por parágrafos (ou seções separadas por linhas em branco)
    return [p.strip() for p in texto.split("\n\n") if p.strip()]

# --- Construção e Persistência do Índice FAISS ---

def construir_ou_carregar_indice():
    dim = 768  # Dimensão do embedding-001
    index_path = os.path.join(INDEX_DIR, "index.faiss")
    meta_path = os.path.join(INDEX_DIR, "metadados.json")

    if os.path.exists(index_path) and os.path.exists(meta_path):
        print("Carregando índice FAISS existente do disco...")
        index = faiss.read_index(index_path)
        with open(meta_path, "r", encoding="utf-8") as f:
            metadados = json.load(f)
        print(f"Índice carregado com {index.ntotal} vetores.")
        return index, metadados

    print("Construindo novo índice FAISS...")
    os.makedirs(INDEX_DIR, exist_ok=True)

    index = faiss.IndexFlatIP(dim)  # IP (Inner Product) para vetores normalizados
    metadados = []

    # 1. Carregar e indexar exemplos do JSONL
    exemplos_jsonl = carregar_jsonl(JSONL_PATH)
    print(f"Indexando {len(exemplos_jsonl)} exemplos de código...")
    for ex in exemplos_jsonl:
        texto_completo = f"Prompt do usuário: {ex.get('prompt', '')}\nCódigo Égua resultante: {ex.get('codigo', '')}"
        emb = normalize(gerar_embedding_texto(texto_completo))
        index.add(np.array([emb]))
        metadados.append({"tipo": "jsonl", **ex})

    # 2. Carregar e indexar documentação
    docs_chunks = carregar_docs(DOCS_PATH)
    print(f"Indexando {len(docs_chunks)} trechos da documentação...")
    for i, chunk in enumerate(docs_chunks):
        emb = normalize(gerar_embedding_texto(chunk))
        index.add(np.array([emb]))
        metadados.append({"tipo": "doc", "id": f"doc_{i}", "texto": chunk})

    # Salvar para uso futuro
    faiss.write_index(index, index_path)
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(metadados, f, ensure_ascii=False, indent=2)

    print(f"Índice criado e salvo com {index.ntotal} vetores.")
    return index, metadados

# --- Inicialização do RAG ---
index, metadados = construir_ou_carregar_indice()

# --- Função RAG principal ---

def gerar_codigo_com_rag(prompt_usuario: str, codigo_atual: str, k: int = 5) -> str:
    # 1. Combinar prompt e contexto do editor para uma busca mais rica
    texto_busca = (
        f"Contexto do Código Atual:\n{codigo_atual}\n\n"
        f"Prompt do Usuário:\n{prompt_usuario}"
    )
    emb_user = normalize(gerar_embedding_texto(texto_busca))

    # 2. Recuperar k documentos e exemplos mais similares
    documentos_relevantes = []
    if index.ntotal > 0:
        k_valido = min(k, index.ntotal)
        _, I = index.search(np.array([emb_user]), k=k_valido)
        documentos_relevantes = [metadados[i] for i in I[0]]
    else:
        print("Aviso: O índice FAISS está vazio. Pulando a etapa de recuperação.")

    # 3. Montar o prompt final para o modelo generativo
    prompt_final = (
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

    # Adicionar contexto recuperado
    docs_text = "\n".join([item['texto'] for item in documentos_relevantes if item['tipo'] == 'doc'])
    if docs_text:
        prompt_final += f"Trechos da Documentação:\n{docs_text}\n\n"

    exemplos_text = "\n".join([f"Prompt: {item['prompt']}\nCódigo: {item['codigo']}" for item in documentos_relevantes if item['tipo'] == 'jsonl'])
    if exemplos_text:
        prompt_final += f"Exemplos Similares:\n{exemplos_text}\n\n"
        
    prompt_final += (
        "--- SITUAÇÃO ATUAL DO USUÁRIO ---\n"
        f"Código no editor:\n```egu\n{codigo_atual}\n```\n\n"
        f"Instrução do usuário: '{prompt_usuario}'\n\n"
        "--- PRÓXIMO TRECHO DE CÓDIGO ---\n"
    )

    # 4. Gerar o código com o Gemini
    model = genai.GenerativeModel(GENERATION_MODEL)
    try:
        response = model.generate_content(
            prompt_final,
            generation_config={"temperature": 0.0, "max_output_tokens": 256},
            safety_settings={
                HarmCategory.HARM_CATEGORY_HATE_SPEECH: HarmBlockThreshold.BLOCK_NONE,
                HarmCategory.HARM_CATEGORY_HARASSMENT: HarmBlockThreshold.BLOCK_NONE,
                HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT: HarmBlockThreshold.BLOCK_NONE,
                HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT: HarmBlockThreshold.BLOCK_NONE,
            }
        )
        return response.text.strip()
    except Exception as e:
        print(f"Erro na geração de conteúdo: {e}")
        return "// Erro ao gerar código."

# --- API Flask ---

@app.route('/gerar-codigo', methods=["POST"])
def gerar_codigo_endpoint():
    try:
        data = request.get_json()
        if not data:
            return Response("Erro: Requisição sem corpo JSON.", status=400, mimetype='text/plain')
            
        prompt = data.get("prompt")
        codigo_atual = data.get("codigo_atual", "") # Default para string vazia se não for fornecido

        if not prompt:
            return Response("Erro: A chave 'prompt' é obrigatória no JSON.", status=400, mimetype='text/plain')
            
        print(f"Prompt recebido: '{prompt}'")
        print(f"Código atual no editor:\n---\n{codigo_atual}\n---")
        
        codigo_gerado = gerar_codigo_com_rag(prompt, codigo_atual, k=5)
        
        return Response(response=codigo_gerado, status=200, mimetype='text/plain')

    except Exception as e:
        print(f"Erro inesperado no endpoint: {e}")
        return Response("Ocorreu um erro interno no servidor.", status=500, mimetype='text/plain')

if __name__ == "__main__":
    app.run("localhost", 4000)