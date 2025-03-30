<div align="center">
    <h1>
    Égua Assist <img src="https://cdn-icons-gif.flaticon.com/17122/17122493.gif" width="40px">
    </h1>
    <p>
    Implementação oficial da extensão da <a href="https://egua.dev/" target="_blank">IDE Égua</a><br>
    voltado ao ensino de lógica de programação para deficientes visuais.<br>
    Utiliza reconhecimento de voz e Processamento de Linguagem Natural (PLN).
    </p>
    <p></p>
</div>

## Requisitos
<div align="left">
    <ul>
        <li><a href="https://www.python.org/downloads/release/python-3921/">Python 3.9.21</a></li>
        <li><a href="https://download.pytorch.org/whl/torchtext/">torchtext-0.10.0-cp39-cp39</a></li>
        <li><a href="https://pypi.org/project/numpy/1.26.4/">Numpy 1.26.4</a></li>
        <li><a href="https://www.php.net/downloads.php">PHP (versão mais recente)</a></li>
    </ul>
</div>

Se estiver usando apenas a CPU ao invés de placas NVIDIA:
``` sh
# CPU only
pip install torch==1.9.0+cpu torchvision==0.10.0+cpu torchaudio==0.9.0 -f https://download.pytorch.org/whl/torch_stable.html
```

Para executar:
- Abra o projeto no VSCode;
- Abra dois terminais separados;
- No primeiro, digite:
``` sh
python ./app.py
```
- No outro, digite:
``` sh
php -S localhost:8080
```
