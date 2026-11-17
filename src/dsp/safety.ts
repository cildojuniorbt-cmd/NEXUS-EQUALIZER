// NEXUS DSP — Safety Control: turns engine state/meters into user-facing warnings.
//
// NEXUS works on digital signal levels (dBFS). It cannot know the sound pressure reaching the ears, because that
// depends on the system volume, the amplifier and the transducer. It therefore never reports dB SPL.
import { type EngineMeters, type EngineReport } from './chain.ts';
import { type NexusConfig } from './config.ts';

export type WarningLevel = 'info' | 'warn' | 'danger';
export interface SafetyWarning { code: string; level: WarningLevel; message: string }

export const SPL_NOTICE = 'O NEXUS mede níveis digitais (dBFS), não pressão sonora real (dB SPL). Sem microfone/ouvido artificial calibrado não é possível saber a exposição real: mantenha o volume do aparelho em nível confortável.';

export function evaluateSafety(cfg: NexusConfig, report: EngineReport, m: EngineMeters): SafetyWarning[] {
  const w: SafetyWarning[] = [];
  if (m.clipped > 0) w.push({ code: 'clip', level: 'danger', message: `Clipping digital detectado na saída (${m.clipped} amostras). Reduza o ganho ou ative a proteção.` });
  else if (m.outPeakDb > cfg.safety.warnPeakDb) w.push({ code: 'peak', level: 'warn', message: `Pico de saída alto (${m.outPeakDb.toFixed(1)} dBFS).` });
  if (m.limiterGrDb < -6) w.push({ code: 'limiter', level: 'warn', message: `O limitador está reduzindo ${Math.abs(m.limiterGrDb).toFixed(1)} dB: o ganho total está alto demais e pode distorcer.` });
  if (report.toneBoostDb > 9) w.push({ code: 'boost', level: 'warn', message: `A curva soma +${report.toneBoostDb.toFixed(1)} dB de reforço. Reforços grandes reduzem a margem e podem distorcer alto-falantes pequenos.` });
  if (!cfg.safety.clipProtection) w.push({ code: 'noprotect', level: 'warn', message: 'A proteção contra clipping está desligada.' });
  if (cfg.outputDb > 6) w.push({ code: 'gain', level: 'warn', message: 'Ganho de saída acima de +6 dB.' });
  if (m.phaseInverted) w.push({ code: 'phase', level: 'warn', message: 'Correlação de fase negativa: um canal pode estar com polaridade invertida (o som some em mono).' });
  if (m.monoLossDb < -6 && !m.phaseInverted) w.push({ code: 'mono', level: 'info', message: `Compatibilidade mono: perda de ${Math.abs(m.monoLossDb).toFixed(1)} dB ao somar L+R.` });
  return w;
}
