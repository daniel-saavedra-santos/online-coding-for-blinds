import torch
import torch.nn as nn
import pickle
import spacy
from tokenize import untokenize
from torchtext.legacy import data
from torchtext.legacy.data import Field
import random
from tokenize import tokenize, untokenize
import io
import keyword
from flask import Flask, request, Response
import flask
#import json
from flask_cors import CORS
import re
from tokenize import ENCODING, NEWLINE, ENDMARKER

app = Flask(__name__)
CORS(app)

# Mapeamento de tipos de token (seguindo a numeração do tokenize do Python)
TIPOS_DE_TOKEN = {
    "PALAVRA_CHAVE": 1,
    "IDENTIFICADOR": 2,
    "NUMERO": 3,
    "OPERADOR": 54,
    "DELIMITADOR": 55,
    "STRING": 56,
    "ESPACO": 57,  # Ignorado
    "COMENTARIO": 60,
    "COMENTARIO_MULTILINHA": 61,
}

# Regras de tokenização para a linguagem Égua
REGRAS = [
    (TIPOS_DE_TOKEN["COMENTARIO"], re.compile(r"//.*")),
    (TIPOS_DE_TOKEN["COMENTARIO_MULTILINHA"], re.compile(r"/\*[\s\S]*?\*/")),
    (TIPOS_DE_TOKEN["PALAVRA_CHAVE"], re.compile(r"\b(escreva|var|se|senao|enquanto|retorne|classe|função|novo|herda)\b")),
    (TIPOS_DE_TOKEN["IDENTIFICADOR"], re.compile(r"[a-zA-Z_à-úÀ-ÚçÇ][a-zA-Z0-9_à-úÀ-ÚçÇ]*")),
    (TIPOS_DE_TOKEN["NUMERO"], re.compile(r"\b\d+(\.\d+)?\b")),
    (TIPOS_DE_TOKEN["OPERADOR"], re.compile(r"[+\-*/=<>!.]+")),
    (TIPOS_DE_TOKEN["DELIMITADOR"], re.compile(r"[(){}[\];,]")),
    (TIPOS_DE_TOKEN["STRING"], re.compile(r'"(.*?)"|\'(.*?)\'')),
    (TIPOS_DE_TOKEN["ESPACO"], re.compile(r"\s+")),  # Ignorado
]

PALAVRAS_RESERVADAS = {
    "var", "escreva", "verdadeiro", "falso", "nulo", "e", "ou", "em", "se",
    "senão", "enquanto", "para", "faça", "escolha", "caso", "padrão", "tente",
    "pegue", "finalmente", "função", "mapear", "retorna", "aleatorio",
    "aleatorioEntre", "inteiro", "ordenar", "real", "tamanho", "texto",
    "importar", "tempo", "classe", "isto", "construtor", "herda", "super"
}

TIPO_IDENTIFICADOR = 2  # Tokens que representam identificadores (variáveis, funções, classes, etc.)
TIPO_PALAVRA_CHAVE = 1  # Tokens que representam palavras-chave da linguagem
TIPO_SINTAXE = 55       # Tokens de símbolos (parênteses, chaves, pontos, etc.)

def corrigir_strings(tokens):
    tokens_corrigidos = []
    for tipo, valor in tokens:
        if tipo == 56:  # Se for uma string
            if valor.startswith("''") and valor.endswith("''"):
                valor = '"' + valor[2:-2] + '"'
        tokens_corrigidos.append((tipo, valor))
    return tokens_corrigidos

def desfazer_tokenizacao(tokens):
    codigo = ""
    espaco_necessario = False

    for i, (tipo, valor) in enumerate(tokens):
        token_anterior = tokens[i - 1] if i > 0 else None

        # Adiciona espaço onde necessário
        if (
            token_anterior
            and token_anterior[0] in {1, 2, 3, 56}  # PALAVRA_CHAVE, IDENTIFICADOR, NUMERO, STRING
            and tipo in {1, 2, 3, 56}  # PALAVRA_CHAVE, IDENTIFICADOR, NUMERO, STRING
        ):
            codigo += " "

        # Adiciona o token atual ao código
        codigo += valor

        # Adiciona quebras de linha para melhorar a legibilidade
        if tipo == 55:  # DELIMITADOR
            if valor in ["{", "}"]:
                codigo += "\n"
            elif valor == ";":
                codigo += "\n"

    return codigo.strip()

def data_augment_tokens(codigo, mask_factor=0.3):
    tokens = []
    restante = codigo

    while restante:
        encontrado = False

        for tipo, regex in REGRAS:
            match = regex.match(restante)
            if match:
                if tipo not in (TIPOS_DE_TOKEN["ESPACO"], TIPOS_DE_TOKEN["COMENTARIO"], TIPOS_DE_TOKEN["COMENTARIO_MULTILINHA"]):
                    tokens.append((tipo, match.group(0)))
                restante = restante[len(match.group(0)):]
                encontrado = True
                break

        if not encontrado:
            raise ValueError(f"Token inválido encontrado: {restante[0]}")

    tokens.append((NEWLINE, ""))
    tokens.append((ENDMARKER, ""))

    """Aplica data augmentation nos tokens, alterando apenas variáveis."""
    
    variaveis = {}  # Dicionário para mapear variáveis renomeadas
    contador = 1

    # Identificar todas as variáveis candidatas para modificação
    identificadores_unicos = set(
        token[1] for token in tokens
        if token[0] == TIPO_IDENTIFICADOR  # Apenas identificadores
        and token[1] not in PALAVRAS_RESERVADAS  # Não alterar palavras reservadas
    )

    # Selecionar um subconjunto de variáveis para renomeação baseado no mask_factor
    num_mascaras = int(len(identificadores_unicos) * mask_factor)
    variaveis_para_mascarar = set(random.sample(identificadores_unicos, num_mascaras))

    # Criar novo vetor de tokens com as alterações
    novos_tokens = []
    contexto = None  # Guarda o contexto para saber se é uma classe ou método

    for i, (tipo, valor) in enumerate(tokens):
        if tipo == TIPO_PALAVRA_CHAVE and valor == "classe":
            contexto = "classe"
        elif tipo == TIPO_IDENTIFICADOR and i > 0 and tokens[i - 1][1] == "classe":
            contexto = "classe"
        elif tipo == TIPO_IDENTIFICADOR and tokens[i - 1][1] == "herda":
            contexto = "herda"
        elif tipo == TIPO_SINTAXE and valor == "{":
            contexto = None  # Saiu do cabeçalho da classe ou método

        if tipo == TIPO_IDENTIFICADOR and valor in variaveis_para_mascarar:
            # Apenas variáveis são alteradas, classes e métodos permanecem iguais
            if contexto is None:
                if valor not in variaveis:
                    variaveis[valor] = f"var_{contador}"
                    contador += 1
                novos_tokens.append((tipo, variaveis[valor]))
                continue

        novos_tokens.append((tipo, valor))

    return novos_tokens

# Função para carregar o vocabulário salvo
def load_vocab(path):
    with open(path, 'rb') as f:
        return pickle.load(f)

# Função para converter inglês para código Python
def eng_to_python(src):
    src = src.split(" ")  # Tokenizar a entrada manualmente
    translation, _ = translate_sentence(src, SRC, TRG, model, device)
    print("Código gerado:\n")
    # print(untokenize(translation[:-1]).decode('utf-8'))  # Exibir código gerado
    # return untokenize(translation[:-1]).decode('utf-8')
    print(desfazer_tokenizacao(translation[:-1]))
    return desfazer_tokenizacao(translation[:-1])

def translate_sentence(sentence, src_field, trg_field, model, device, max_len = 50000):
    
    model.eval()
        
    if isinstance(sentence, str):
        nlp = spacy.load('en')
        tokens = [token.text.lower() for token in nlp(sentence)]
    else:
        tokens = [token.lower() for token in sentence]

    tokens = [src_field.init_token] + tokens + [src_field.eos_token]
        
    src_indexes = [src_field.vocab.stoi[token] for token in tokens]

    src_tensor = torch.LongTensor(src_indexes).unsqueeze(0).to(device)
    
    src_mask = model.make_src_mask(src_tensor)
    
    with torch.no_grad():
        enc_src = model.encoder(src_tensor, src_mask)

    trg_indexes = [trg_field.vocab.stoi[trg_field.init_token]]

    for i in range(max_len):

        trg_tensor = torch.LongTensor(trg_indexes).unsqueeze(0).to(device)

        trg_mask = model.make_trg_mask(trg_tensor)
        
        with torch.no_grad():
            output, attention = model.decoder(trg_tensor, enc_src, trg_mask, src_mask)
        
        pred_token = output.argmax(2)[:,-1].item()
        
        trg_indexes.append(pred_token)

        if pred_token == trg_field.vocab.stoi[trg_field.eos_token]:
            break
    
    trg_tokens = [trg_field.vocab.itos[i] for i in trg_indexes]
    
    return trg_tokens[1:], attention

'''
def augment_tokenize_python_code(python_code_str, mask_factor=0.3):

    var_dict = {} # Dictionary that stores masked variables

    # certain reserved words that should not be treated as normal variables and
    # hence need to be skipped from our variable mask augmentations
    skip_list = ['range', 'enumerate', 'print', 'ord', 'int', 'float', 'zip'
                 'char', 'list', 'dict', 'tuple', 'set', 'len', 'sum', 'min', 'max']
    skip_list.extend(keyword.kwlist)

    var_counter = 1
    python_tokens = list(tokenize(io.BytesIO(python_code_str.encode('utf-8')).readline))
    tokenized_output = []

    for i in range(0, len(python_tokens)):
      if python_tokens[i].type == 1 and python_tokens[i].string not in skip_list:
        
        if i>0 and python_tokens[i-1].string in ['def', '.', 'import', 'raise', 'except', 'class']: # avoid masking modules, functions and error literals
          skip_list.append(python_tokens[i].string)
          tokenized_output.append((python_tokens[i].type, python_tokens[i].string))
        elif python_tokens[i].string in var_dict:  # if variable is already masked
          tokenized_output.append((python_tokens[i].type, var_dict[python_tokens[i].string]))
        elif random.uniform(0, 1) > 1-mask_factor: # randomly mask variables
          var_dict[python_tokens[i].string] = 'var_' + str(var_counter)
          var_counter+=1
          tokenized_output.append((python_tokens[i].type, var_dict[python_tokens[i].string]))
        else:
          skip_list.append(python_tokens[i].string)
          tokenized_output.append((python_tokens[i].type, python_tokens[i].string))
      
      else:
        tokenized_output.append((python_tokens[i].type, python_tokens[i].string))
    
    return tokenized_output
'''

class Seq2Seq(nn.Module):
    def __init__(self, 
                 encoder, 
                 decoder, 
                 src_pad_idx, 
                 trg_pad_idx, 
                 device):
        super().__init__()
        
        self.encoder = encoder
        self.decoder = decoder
        self.src_pad_idx = src_pad_idx
        self.trg_pad_idx = trg_pad_idx
        self.device = device
        
    def make_src_mask(self, src):
        
        #src = [batch size, src len]
        
        src_mask = (src != self.src_pad_idx).unsqueeze(1).unsqueeze(2)

        #src_mask = [batch size, 1, 1, src len]

        return src_mask
    
    def make_trg_mask(self, trg):
        
        #trg = [batch size, trg len]
        
        trg_pad_mask = (trg != self.trg_pad_idx).unsqueeze(1).unsqueeze(2)
        
        #trg_pad_mask = [batch size, 1, 1, trg len]
        
        trg_len = trg.shape[1]
        
        trg_sub_mask = torch.tril(torch.ones((trg_len, trg_len), device = self.device)).bool()
        
        #trg_sub_mask = [trg len, trg len]
            
        trg_mask = trg_pad_mask & trg_sub_mask
        
        #trg_mask = [batch size, 1, trg len, trg len]
        
        return trg_mask

    def forward(self, src, trg):
        
        #src = [batch size, src len]
        #trg = [batch size, trg len]
                
        src_mask = self.make_src_mask(src)
        trg_mask = self.make_trg_mask(trg)
        
        #src_mask = [batch size, 1, 1, src len]
        #trg_mask = [batch size, 1, trg len, trg len]
        
        enc_src = self.encoder(src, src_mask)
        
        #enc_src = [batch size, src len, hid dim]
                
        output, attention = self.decoder(trg, enc_src, trg_mask, src_mask)
        
        #output = [batch size, trg len, output dim]
        #attention = [batch size, n heads, trg len, src len]
        
        return output, attention
    
class Encoder(nn.Module):
    def __init__(self, 
                 input_dim, 
                 hid_dim, 
                 n_layers, 
                 n_heads, 
                 pf_dim,
                 dropout, 
                 device,
                 max_length = 1000):
        super().__init__()

        self.device = device
        
        self.tok_embedding = nn.Embedding(input_dim, hid_dim)
        self.pos_embedding = nn.Embedding(max_length, hid_dim)
        
        self.layers = nn.ModuleList([EncoderLayer(hid_dim, 
                                                  n_heads, 
                                                  pf_dim,
                                                  dropout, 
                                                  device) 
                                     for _ in range(n_layers)])
        
        self.dropout = nn.Dropout(dropout)
        
        self.scale = torch.sqrt(torch.FloatTensor([hid_dim])).to(device)
        
    def forward(self, src, src_mask):
        
        #src = [batch size, src len]
        #src_mask = [batch size, 1, 1, src len]
        
        batch_size = src.shape[0]
        src_len = src.shape[1]

        pos = torch.arange(0, src_len).unsqueeze(0).repeat(batch_size, 1).to(self.device)
        
        #pos = [batch size, src len]
        src = self.dropout((self.tok_embedding(src) * self.scale) + self.pos_embedding(pos))
        
        #src = [batch size, src len, hid dim]
        
        for layer in self.layers:
            src = layer(src, src_mask)
            
        #src = [batch size, src len, hid dim]
            
        return src

class EncoderLayer(nn.Module):
    def __init__(self, 
                 hid_dim, 
                 n_heads, 
                 pf_dim,  
                 dropout, 
                 device):
        super().__init__()
        
        self.self_attn_layer_norm = nn.LayerNorm(hid_dim)
        self.ff_layer_norm = nn.LayerNorm(hid_dim)
        self.self_attention = MultiHeadAttentionLayer(hid_dim, n_heads, dropout, device)
        self.positionwise_feedforward = PositionwiseFeedforwardLayer(hid_dim, 
                                                                     pf_dim, 
                                                                     dropout)
        self.dropout = nn.Dropout(dropout)
        
    def forward(self, src, src_mask):
        
        #src = [batch size, src len, hid dim]
        #src_mask = [batch size, 1, 1, src len] 
                
        #self attention
        _src, _ = self.self_attention(src, src, src, src_mask)
        
        #dropout, residual connection and layer norm
        src = self.self_attn_layer_norm(src + self.dropout(_src))
        
        #src = [batch size, src len, hid dim]
        
        #positionwise feedforward
        _src = self.positionwise_feedforward(src)
        
        #dropout, residual and layer norm
        src = self.ff_layer_norm(src + self.dropout(_src))
        
        #src = [batch size, src len, hid dim]
        
        return src
    
class Decoder(nn.Module):
    def __init__(self, 
                 output_dim, 
                 hid_dim, 
                 n_layers, 
                 n_heads, 
                 pf_dim, 
                 dropout, 
                 device,
                 max_length = 10000):
        super().__init__()
        
        self.device = device
        
        self.tok_embedding = nn.Embedding(output_dim, hid_dim)
        self.pos_embedding = nn.Embedding(max_length, hid_dim)
        
        self.layers = nn.ModuleList([DecoderLayer(hid_dim, 
                                                  n_heads, 
                                                  pf_dim, 
                                                  dropout, 
                                                  device)
                                     for _ in range(n_layers)])
        
        self.fc_out = nn.Linear(hid_dim, output_dim)
        
        self.dropout = nn.Dropout(dropout)
        
        self.scale = torch.sqrt(torch.FloatTensor([hid_dim])).to(device)
        
    def forward(self, trg, enc_src, trg_mask, src_mask):
        
        #trg = [batch size, trg len]
        #enc_src = [batch size, src len, hid dim]
        #trg_mask = [batch size, 1, trg len, trg len]
        #src_mask = [batch size, 1, 1, src len]
                
        batch_size = trg.shape[0]
        trg_len = trg.shape[1]
        
        pos = torch.arange(0, trg_len).unsqueeze(0).repeat(batch_size, 1).to(self.device)
                            
        #pos = [batch size, trg len]

        trg = self.dropout((self.tok_embedding(trg) * self.scale) + self.pos_embedding(pos))
                
        #trg = [batch size, trg len, hid dim]
        
        for layer in self.layers:
            trg, attention = layer(trg, enc_src, trg_mask, src_mask)
        
        #trg = [batch size, trg len, hid dim]
        #attention = [batch size, n heads, trg len, src len]
        
        output = self.fc_out(trg)
        
        #output = [batch size, trg len, output dim]
            
        return output, attention

class DecoderLayer(nn.Module):
    def __init__(self, 
                 hid_dim, 
                 n_heads, 
                 pf_dim, 
                 dropout, 
                 device):
        super().__init__()
        
        self.self_attn_layer_norm = nn.LayerNorm(hid_dim)
        self.enc_attn_layer_norm = nn.LayerNorm(hid_dim)
        self.ff_layer_norm = nn.LayerNorm(hid_dim)
        self.self_attention = MultiHeadAttentionLayer(hid_dim, n_heads, dropout, device)
        self.encoder_attention = MultiHeadAttentionLayer(hid_dim, n_heads, dropout, device)
        self.positionwise_feedforward = PositionwiseFeedforwardLayer(hid_dim, 
                                                                     pf_dim, 
                                                                     dropout)
        self.dropout = nn.Dropout(dropout)
        
    def forward(self, trg, enc_src, trg_mask, src_mask):
        
        #trg = [batch size, trg len, hid dim]
        #enc_src = [batch size, src len, hid dim]
        #trg_mask = [batch size, 1, trg len, trg len]
        #src_mask = [batch size, 1, 1, src len]
        
        #self attention
        _trg, _ = self.self_attention(trg, trg, trg, trg_mask)
        
        #dropout, residual connection and layer norm
        trg = self.self_attn_layer_norm(trg + self.dropout(_trg))
            
        #trg = [batch size, trg len, hid dim]
            
        #encoder attention
        _trg, attention = self.encoder_attention(trg, enc_src, enc_src, src_mask)
        # query, key, value
        
        #dropout, residual connection and layer norm
        trg = self.enc_attn_layer_norm(trg + self.dropout(_trg))
                    
        #trg = [batch size, trg len, hid dim]
        
        #positionwise feedforward
        _trg = self.positionwise_feedforward(trg)
        
        #dropout, residual and layer norm
        trg = self.ff_layer_norm(trg + self.dropout(_trg))
        
        #trg = [batch size, trg len, hid dim]
        #attention = [batch size, n heads, trg len, src len]
        
        return trg, attention
    
class MultiHeadAttentionLayer(nn.Module):
    def __init__(self, hid_dim, n_heads, dropout, device):
        super().__init__()
        
        assert hid_dim % n_heads == 0
        
        self.hid_dim = hid_dim
        self.n_heads = n_heads
        self.head_dim = hid_dim // n_heads
        
        self.fc_q = nn.Linear(hid_dim, hid_dim)
        self.fc_k = nn.Linear(hid_dim, hid_dim)
        self.fc_v = nn.Linear(hid_dim, hid_dim)
        
        self.fc_o = nn.Linear(hid_dim, hid_dim)
        
        self.dropout = nn.Dropout(dropout)
        
        self.scale = torch.sqrt(torch.FloatTensor([self.head_dim])).to(device)
        
    def forward(self, query, key, value, mask = None):
        
        batch_size = query.shape[0]
        
        #query = [batch size, query len, hid dim]
        #key = [batch size, key len, hid dim]
        #value = [batch size, value len, hid dim]
                
        Q = self.fc_q(query)
        K = self.fc_k(key)
        V = self.fc_v(value)
        
        #Q = [batch size, query len, hid dim]
        #K = [batch size, key len, hid dim]
        #V = [batch size, value len, hid dim]
                
        Q = Q.view(batch_size, -1, self.n_heads, self.head_dim).permute(0, 2, 1, 3)
        K = K.view(batch_size, -1, self.n_heads, self.head_dim).permute(0, 2, 1, 3)
        V = V.view(batch_size, -1, self.n_heads, self.head_dim).permute(0, 2, 1, 3)
        
        #Q = [batch size, n heads, query len, head dim]
        #K = [batch size, n heads, key len, head dim]
        #V = [batch size, n heads, value len, head dim]
                
        energy = torch.matmul(Q, K.permute(0, 1, 3, 2)) / self.scale
        
        #energy = [batch size, n heads, query len, key len]
        
        if mask is not None:
            energy = energy.masked_fill(mask == 0, -1e10)
        
        attention = torch.softmax(energy, dim = -1)
                
        #attention = [batch size, n heads, query len, key len]
                
        x = torch.matmul(self.dropout(attention), V)
        
        #x = [batch size, n heads, query len, head dim]
        
        x = x.permute(0, 2, 1, 3).contiguous()
        
        #x = [batch size, query len, n heads, head dim]
        
        x = x.view(batch_size, -1, self.hid_dim)
        
        #x = [batch size, query len, hid dim]
        
        x = self.fc_o(x)
        
        #x = [batch size, query len, hid dim]
        
        return x, attention
    
class PositionwiseFeedforwardLayer(nn.Module):
    def __init__(self, hid_dim, pf_dim, dropout):
        super().__init__()
        
        self.fc_1 = nn.Linear(hid_dim, pf_dim)
        self.fc_2 = nn.Linear(pf_dim, hid_dim)
        
        self.dropout = nn.Dropout(dropout)
        
    def forward(self, x):
        
        #x = [batch size, seq len, hid dim]
        
        x = self.dropout(torch.relu(self.fc_1(x)))
        
        #x = [batch size, seq len, pf dim]
        
        x = self.fc_2(x)
        
        #x = [batch size, seq len, hid dim]
        
        return x

# Recriar os campos Input e Output
Input = Field(tokenize='spacy', init_token='', eos_token='', lower=True)
Output = Field(tokenize=data_augment_tokens, init_token='', eos_token='', lower=False)

# Carregar vocabulários do disco
Input.vocab = load_vocab("../../models/transformer/src_vocab.pkl")  
Output.vocab = load_vocab("../../models/transformer/trg_vocab.pkl")

INPUT_DIM = len(Input.vocab)
OUTPUT_DIM = len(Output.vocab)
'''
HID_DIM = 256
ENC_LAYERS = 3
DEC_LAYERS = 3
ENC_HEADS = 16
DEC_HEADS = 16
ENC_PF_DIM = 512
DEC_PF_DIM = 512
ENC_DROPOUT = 0.1
DEC_DROPOUT = 0.1
'''

# Arquitetura
HID_DIM = 256          # mantém embeddings em 256, bom equilíbrio custo x desempenho
ENC_LAYERS = 2         # menos camadas → treino mais rápido
DEC_LAYERS = 2
ENC_HEADS = 4          # 4 heads já capturam bem dependências (16 é exagerado para esse caso)
DEC_HEADS = 4
ENC_PF_DIM = 512       # 2x HID_DIM é padrão
DEC_PF_DIM = 512
ENC_DROPOUT = 0.2      # aumenta regularização
DEC_DROPOUT = 0.2

# Configurar o dispositivo
device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')

enc = Encoder(INPUT_DIM, 
              HID_DIM, 
              ENC_LAYERS, 
              ENC_HEADS, 
              ENC_PF_DIM, 
              ENC_DROPOUT, 
              device)

dec = Decoder(OUTPUT_DIM, 
              HID_DIM, 
              DEC_LAYERS, 
              DEC_HEADS, 
              DEC_PF_DIM, 
              DEC_DROPOUT, 
              device)

SRC = Input
TRG = Output

# Definir índices de padding
SRC_PAD_IDX = Input.vocab.stoi[Input.pad_token]
TRG_PAD_IDX = Output.vocab.stoi[Output.pad_token]

# Criar o modelo e carregar pesos treinados
model = Seq2Seq(enc, dec, SRC_PAD_IDX, TRG_PAD_IDX, device).to(device)
model.load_state_dict(torch.load('../../models/transformer/model.pt', map_location=device))
model.eval()

# Exemplo de entrada
# src = "create a program to sum three numbers"


@app.route('/', methods=["POST"])
def transcribe():
    # Recebe os dados como texto simples
    received_data = request.data.decode('utf-8')  # Decodifica para string
    print(f"received data: {received_data}")
    
    # Cria a resposta
    return_data = eng_to_python(received_data)
    
    # Retorna a resposta como texto simples
    return Response(
        response=return_data,
        status=201,
        mimetype='text/plain'
    )

if __name__ == "__main__":
    app.run("localhost", 6969)