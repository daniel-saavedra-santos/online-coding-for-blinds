<div align="center">
    <h1>
    Égua Assist <img src="https://cdn-icons-gif.flaticon.com/17122/17122493.gif" width="40px">
    </h1>
    <p>
    Implementação oficial da extensão da <a href="https://egua.dev/" target="_blank">IDE Égua</a><br>
    para suporte de codificação a deficientes visuais. Utiliza reconhecimento de voz<br>
    e Processamento de Linguagem Natural (PLN)
    </p>
    <p></p>
</div>
Projeto de aplicação web voltado ao ensino de algoritmos para deficientes visuais.


## Requisitos
- Python 3.9.21
- Torchtext 0.10.0
- Numpy 1.26.4
- PHP (versão mais recente)

Se estiver usando apenas a CPU ao invés de placas NVIDIA:
``` sh
# CPU only
pip install torch==1.9.0+cpu torchvision==0.10.0+cpu torchaudio==0.9.0 -f https://download.pytorch.org/whl/torch_stable.html
```

Para executar:
- Abra o projeto no VSCode
- Em dois terminais separados, digite
python ./app.py
- No outro
php -S localhost:8080