const express = require('express');
const multer = require('multer');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const app = express();
const port = 2000;
const upload = multer({ storage: multer.memoryStorage() });

// --- Habilitar CORS ---
app.use(cors({
  origin: 'http://localhost:8080', // seu frontend
  methods: ['GET','POST','OPTIONS'],
  allowedHeaders: ['Content-Type']
}));

// Verifica se a chave da API foi carregada corretamente.
if (!process.env.GOOGLE_API_KEY) {
    console.error("ERRO: A variável de ambiente GOOGLE_API_KEY não está definida.");
    console.error("Verifique se você tem um arquivo .env com o conteúdo: GOOGLE_API_KEY=SUA_CHAVE_AQUI");
    process.exit(1); // Encerra o processo se a chave não for encontrada.
}

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
//const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro-002' });

// --- CORREÇÃO APLICADA AQUI ---
// Trocamos 'gemini-1.5-pro-002' por 'gemini-1.5-pro-latest'.
// A biblioteca @google/generative-ai usa nomes de modelo genéricos.
const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

app.post('/transcribe', upload.single('audio'), async (req, res) => {
  if (!req.file) {
    return res.status(400).send('Nenhum arquivo de áudio enviado.');
  }

  try {
    console.log(`Recebido arquivo: ${req.file.originalname}, Tamanho: ${req.file.size} bytes, Tipo: ${req.file.mimetype}`);
    console.log('Enviando para a API Gemini para transcrição...');

    const audioPart = {
      inlineData: {
        data: req.file.buffer.toString('base64'),
        mimeType: req.file.mimetype,
      },
    };

    // Um prompt mais descritivo pode, às vezes, ajudar o modelo.
    const prompt = "Por favor, transcreva o seguinte áudio com precisão. Se no áudio existirem valores numéricos, escreva-os por extenso.";

    const result = await model.generateContent([prompt, audioPart]);
    const response = result.response;
    const text = response.text();

    console.log('Transcrição recebida:', text);
    
    res.send(text);

  } catch (error) {
    console.error('Erro ao chamar a API Gemini:', error);
    res.status(500).send('Erro na transcrição.');
  }
});

app.listen(port, () => {
  console.log(`Servidor rodando em http://localhost:${port}`);
  console.log('Aguardando requisições POST em /transcribe');
});

