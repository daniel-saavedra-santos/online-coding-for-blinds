from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
import whisper
import uvicorn
import tempfile

app = FastAPI()

# --- Habilitar CORS ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Carrega modelo Whisper uma vez
model = whisper.load_model("turbo")

@app.post("/transcrever")
async def transcrever(audio: UploadFile = File(...)):
    # Salva áudio temporário
    with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp:
        tmp.write(await audio.read())
        tmp_path = tmp.name

    # Transcreve
    result = model.transcribe(tmp_path, language="pt")
    return {"transcricao": result["text"]}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=3000)
