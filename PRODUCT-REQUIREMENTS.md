# NEXUS EQUALIZER: requisito central do produto

## O que o produto precisa fazer

NEXUS EQUALIZER deve ser concebido como um **equalizador do áudio que já está tocando no dispositivo**, e não como um player de música.

O usuário abre qualquer aplicativo de áudio/vídeo e o NEXUS aplica a equalização à saída de áudio do dispositivo, sem precisar:
- importar arquivos;
- escolher músicas dentro do NEXUS;
- criar playlists;
- encaminhar manualmente arquivos para um player interno;
- manter uma segunda reprodução em paralelo.

Exemplos de uso pretendido: Spotify, YouTube, navegador, redes sociais, jogos, players locais e outros aplicativos que reproduzam som.

## Regra de produto

Não apresentar importação de música, biblioteca musical ou player interno como solução principal para equalização global. A interface deve deixar claro qual saída está efetivamente sendo processada e nunca simular um estado global ativo.

## Realidade das plataformas

### Android
A implementação atual tenta usar `android.media.audiofx.Equalizer(0, 0)` para o mix global de saída. A documentação oficial do Android marca a conexão de efeitos insert ao mix global com sessão 0 como obsoleta. Portanto, isso é apenas uma tentativa de compatibilidade, não uma garantia de que Spotify, YouTube, jogos ou todos os outros apps serão processados.

Critérios:
- manter a implementação como experimento/compatibilidade;
- não declarar suporte universal baseado apenas na criação do objeto;
- validar áudio realmente alterado em apps independentes e em vários aparelhos;
- investigar APIs de fabricante, efeitos de sistema ou integração com players que voluntariamente anunciem suas sessões;
- se o aparelho não oferecer uma rota suportada, informar claramente que não é compatível.

### iOS
**Correção importante: iOS 27 introduziu uma rota pública para esse caso de uso.** O framework Media Device permite que o NEXUS se apresente como uma saída virtual selecionável no seletor de áudio do Control Center. Com uma Media Device Extension que implemente `RealtimeSampleHandling` e um Audio Server Plug-In publicado na ativação, o sistema pode encaminhar amostras de áudio em tempo real para processamento.

A arquitetura necessária é diferente de AUv3:
1. Media Device Extension anuncia a saída virtual NEXUS.
2. Usuário seleciona NEXUS no seletor de saída do iOS.
3. Audio Server Plug-In recebe o mix de áudio do sistema.
4. Um transporte local encaminha PCM para o processo principal.
5. O NEXUS aplica seu DSP e reproduz o resultado na saída física anterior.

AUv3 continua sendo uma opção separada para hosts compatíveis, mas não é a solução para áudio de outros aplicativos.

O caminho iOS 27 está documentado em `native/ios/IOS27-SYSTEM-AUDIO-ROUTING.md` e demonstrado por referências abertas:
- https://github.com/satomasahiro2005/ios27-media-device-passthrough
- https://github.com/satomasahiro2005/EffectDeck

A rota depende da seleção do usuário e pode ser interrompida ou recusada pelo sistema em determinados apps/modos de mídia. Spotify Canvas e alguns estados de vídeo do YouTube são limitações relatadas na referência. Não prometer compatibilidade absoluta até testar em iPhone real.

## Decisão de escopo e comunicação

- O produto principal continua sendo equalizador de áudio do dispositivo, sem importação de música. No iOS 27+, a rota prevista é selecionar NEXUS EQUALIZER no seletor de saída do Control Center; o usuário não precisa importar nem iniciar músicas no NEXUS.
- Android: buscar o máximo de compatibilidade possível, mas publicar somente a matriz de dispositivos realmente testados.
- iOS 27+: implementar Media Device Extension + Audio Server Plug-In; AUv3 é complementar, não substitui a rota de áudio do sistema.
- A tela deve distinguir: **Áudio do dispositivo processado**, **Plugin em host compatível**, **Processamento interno do NEXUS**, **Não suportado neste dispositivo/rota**.
- Não usar mensagens como “Equalizador global ativo” sem confirmação de áudio independente realmente processado.

## Testes de aceitação

1. Iniciar reprodução em Spotify, YouTube, navegador, redes sociais e jogos sem importar qualquer arquivo para o NEXUS.
2. Alterar uma banda de forma perceptível enquanto o áudio continua tocando no app de origem.
3. Confirmar bypass liga/desliga sem interromper a reprodução.
4. Repetir em alto-falante, fones com fio e Bluetooth.
5. Repetir após alternar apps, bloquear a tela e retomar reprodução.
6. Registrar fabricante, modelo, versão do sistema, app de origem e resultado.
7. Em iOS, testar AUv3 separadamente em hosts compatíveis e não confundir esse teste com áudio global.

