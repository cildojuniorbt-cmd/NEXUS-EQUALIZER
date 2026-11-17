# NEXUS EQ — Motor DSP (`src/dsp`)

Motor de áudio em TypeScript puro, sem dependência de DOM ou Web Audio. O mesmo código roda em Node (testes), em AudioWorklet e pode ser portado 1:1 para Kotlin/Swift. Todos os módulos são processados em `NexusEngine` (`chain.ts`).

Executar os testes: `npm test` (Node 22+, sem dependências).

## Estado por módulo

| Módulo | Arquivo | Processamento real | Testado |
|---|---|---|---|
| Biquad (peak, shelf, LP, HP, notch, bandpass) | `biquad.ts` | Sim | Resposta medida = resposta teórica |
| EQ gráfico 10/15/31 bandas, paramétrico, pré-amp | `eq.ts` | Sim | Cada banda, ±12 dB, filtros |
| Compressor, multibanda, limiter, gate, expander, de-esser, saturação, exciter | `dynamics.ts` | Sim | Curva estática, attack/release, ceiling |
| Stereo (width, M/S, balance, L/R, mono, inversão, crossfeed, correlação) | `stereo.ts` | Sim | Sim |
| Voice (redução de ruído espectral, gate, de-esser, compressor, presença, clareza) | `voice.ts` | Sim | Cada controle altera o áudio (prova geral) |
| Bass (sub bass, boost, low shelf, subsônico, harmônicos) | `bass.ts` | Sim | Cada controle altera o áudio (prova geral) |
| Room (modelo de sala, alinhamento de caixas, medição por sweep, RT60, ajuste de EQ de correção) | `room.ts` | Sim; medições sempre marcadas `calibrated: false` | Só o controle de correção; **sem testes de sweep/RT60** |
| Headphone (perfis, crossfeed, espacial, correção manual) | `headphone.ts` | Sim | Cada controle altera o áudio (prova geral) |
| Safety (limite de ganho, auto pré-amp, ceiling) | `safety.ts` | Sim | Ceiling, auto pré-amp, limite de ganho |
| Analyzer (FFT, RMS, pico, clipping, LUFS BS.1770, correlação) | `analyzer.ts` | Sim | FFT, pico/RMS, clipping, LUFS |
| Presets | `presets.ts` | Sim | — |

A suíte (`test/dsp.test.ts`) inclui uma "prova geral" com 70 controles: cada um deve alterar o áudio de saída. Um controle sem efeito faz o teste falhar.

## Correções desta versão

- **Voice Studio / De-Esser:** a condição estava invertida e o De-Esser nunca processava. Agora liga abaixo de −10 dB.
- **Analisador FFT:** `levelAt` usa interpolação parabólica e remove a perda por scalloping (lia até ~1,4 dB abaixo).
- **LUFS:** filtro K-weighting agora usa o shelf exato da ITU-R BS.1770 (o shelf RBJ errava ~0,25 LU).

## Limitações que continuam valendo

- A interface web (`src/App.tsx`) ainda é o equalizador simples de 10 bandas e **não está ligada** a este motor.
- Medições com microfone do aparelho não são calibradas; não devem ser apresentadas como medição profissional nem como dB SPL.
- Curvas de modelos específicos de fones não são incluídas, porque não há medição verificável embutida. Use ajuste manual ou importe uma medição.
- Android e iOS: o motor ainda não foi portado para as APIs nativas. Ver `native/docs/PLATFORM-CAPABILITIES.md` para o que cada plataforma permite.
