# NEXUS EQ — Arquitetura oficial do produto

## Princípios

- O NEXUS EQ é um processador/equalizador de áudio, não um player.
- Não incluir reprodução, playlists, biblioteca musical, importação ou upload de músicas.
- Separar interface, estado/configurações e motor DSP.
- Um controle só pode ser apresentado como funcional quando estiver conectado ao processamento real e validado na plataforma.
- Recursos indisponíveis por limitações do sistema operacional ou do fabricante devem ser identificados com transparência.
- Preservar perfis e configurações do usuário entre atualizações.

## Navegação principal

### 1. EQ — Equalizer
- Equalizador gráfico com bandas ajustáveis.
- Equalizador paramétrico.
- Controles de frequência, ganho e Q quando suportados pelo motor.
- Filtros Low Pass, High Pass, Low Shelf e High Shelf quando suportados.
- Curva de resposta visual.
- Presets de fábrica e perfis personalizados.
- Comparação A/B entre sinal original e processado.

### 2. DSP — DSP Studio
- Bass Engine: grave, punch e impacto.
- Exciter: brilho e presença.
- Stereo Enhancer: largura estéreo.
- Crossfeed: ajuste de crossfeed para fones.
- Compressor e limiter.
- De-Esser.
- Loudness.
- Transient Shaper.
- Cadeia DSP com ordem de processamento configurável.

### 3. ROOM — Room Studio
- Perfis de ambiente.
- Configuração de caixas e posicionamento.
- Ajustes de frequência e correção acústica.
- Distância e parâmetros de ambiente quando houver dados de medição.
- Não simular medição acústica sem entrada de microfone e método de calibração compatíveis.

### 4. HEADPHONES — Headphone Studio
- Perfis por modelo de fone.
- Compensação de frequência.
- Ajustes personalizados por dispositivo.
- Controles de palco e espacialidade apenas quando suportados pelo processamento real.
- Perfis independentes para fones cabeados e Bluetooth, quando identificáveis pela plataforma.

### 5. ANALYZE — Audio Analyzer
- Analisador FFT/espectro em tempo real.
- Medidores Peak e RMS.
- Indicador de clipping.
- Monitoramento do sinal de entrada e saída quando disponibilizados pela API.
- Não exibir espectro ao vivo com dados fictícios ou gerados sem sinal real.

## Recursos transversais
- A/B Compare.
- Auto Gain com compensação real de nível.
- Preset Manager: criar, renomear, editar, excluir, importar/exportar configurações (não músicas).
- Output Manager para rotas de áudio que o sistema operacional permitir controlar.
- Bluetooth/device profiles quando a plataforma expuser identificação e eventos necessários.
- Sistema de atualização integrado, respeitando os mecanismos de distribuição de Android e iOS.

## Estratégia de implementação

### Android — prioridade atual
1. Preservar o equalizador nativo existente e validar o processamento em aparelho real.
2. Criar a navegação com as cinco áreas e estados de disponibilidade.
3. Evoluir o motor DSP em componentes independentes, começando por recursos que a API de áudio realmente permita aplicar.
4. Testar cada efeito com áudio do sistema, quando a rota Android permitir, e registrar limitações por fabricante.
5. Adicionar análise em tempo real somente quando houver acesso legítimo ao sinal processado/monitorado.

### iOS — etapa separada
- Continuar a investigação da arquitetura de áudio de sistema e das permissões/entitlements exigidas.
- Não declarar processamento global funcional até validação em dispositivo físico e aprovação dos requisitos da Apple.
- AUv3 deve permanecer identificado como processamento dentro de hosts compatíveis, distinto de áudio global.

## Critérios de qualidade
- Interface responsiva, acessível e consistente com a identidade NEXUS (grafite e ciano).
- Nenhum controle sem ação definida.
- Nenhum indicador de áudio em tempo real sem dados reais.
- Estado de compatibilidade explícito por plataforma/dispositivo.
- Testes de build não substituem testes de áudio em hardware real.
