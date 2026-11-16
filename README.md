# NEXUS EQUALIZER

**NEXUS EQUALIZER é um equalizador, não um reprodutor de áudio.** Não possui player, playlists, biblioteca musical nem importação de arquivos.

## Versão Web

A versão Web é, neste estágio, uma interface de controle e prototipagem: permite ajustar 10 bandas, visualizar a curva, ativar/bypassar os ajustes, selecionar perfis e salvar configurações localmente no navegador.

**Limitação importante:** navegadores móveis não permitem que uma página web intercepte e equalize o áudio de outros aplicativos, como Spotify, YouTube, Instagram ou jogos. Esta interface Web não altera o áudio do sistema. A equalização real do áudio de outros aplicativos depende das integrações nativas de cada plataforma.

## Aplicativos nativos

- **Android:** controlador de equalização do áudio de saída, sujeito às APIs, ao fabricante e à validação em aparelhos reais.
- **iOS:** desenvolvimento da rota de áudio do sistema com iOS 27 Media Device Extension + Audio Server Plug-In. AUv3 é uma rota separada para aplicativos compatíveis.

Consulte [PRODUCT-REQUIREMENTS.md](PRODUCT-REQUIREMENTS.md), [native/README.md](native/README.md) e [native/ios/IOS27-SYSTEM-AUDIO-ROUTING.md](native/ios/IOS27-SYSTEM-AUDIO-ROUTING.md).

## Executar a interface Web

```sh
npm install
npm run dev
```

## Verificações

```sh
npm run build
```

A interface Web não deve ser apresentada como equalizador global. A compatibilidade e o processamento do áudio do sistema devem ser validados separadamente nos aplicativos nativos e em dispositivos físicos.
