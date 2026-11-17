import { useRef, useState } from 'react';
import { Card, Header, Icon } from '../ui.tsx';
import { useNexus } from '../store.tsx';
import { createPreset, deletePreset, duplicatePreset, exportPresets, importPresets, renamePreset, updatePreset } from '../../dsp/presets.ts';
import { defaultConfig } from '../../dsp/config.ts';

export function PresetsScreen() {
  const { cfg, replace, presets, userPresets, setUserPresets } = useNexus();
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);

  const download = (list: typeof presets, fileName: string) => {
    const url = URL.createObjectURL(new Blob([exportPresets(list)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = fileName; a.click(); URL.revokeObjectURL(url);
  };
  const share = async (p: (typeof presets)[number]) => {
    const text = exportPresets([p]);
    try {
      if (navigator.share) { await navigator.share({ title: `NEXUS EQ — ${p.name}`, text }); return; }
      await navigator.clipboard.writeText(text); setMsg('Perfil copiado para a área de transferência.');
    } catch { setMsg('Não foi possível compartilhar. Use Exportar.'); }
  };
  const onImport = async (f: File | undefined) => {
    if (!f) return;
    try { const list = importPresets(await f.text()); setUserPresets([...userPresets, ...list]); setMsg(`${list.length} perfil(is) importado(s).`); }
    catch (e) { setMsg(e instanceof Error ? e.message : 'Arquivo de perfil inválido.'); }
    if (file.current) file.current.value = '';
  };

  return <div className="nx-screen">
    <Header title="Presets" />
    <Card title="Novo perfil a partir do ajuste atual">
      <div className="nx-save"><input value={name} onChange={e => setName(e.target.value)} placeholder="Nome do perfil" maxLength={40} aria-label="Nome do novo perfil" />
        <button className="nx-btn gold" disabled={!name.trim()} onClick={() => { setUserPresets([...userPresets, createPreset(name, cfg)]); setName(''); }}>Criar</button></div>
    </Card>
    <Card title="Perfis">
      <ul className="nx-list">{presets.map(p => <li key={p.id}>
        {editing === p.id ? <input autoFocus value={editName} aria-label="Novo nome" onChange={e => setEditName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { setUserPresets(renamePreset(userPresets, p.id, editName)); setEditing(null); } if (e.key === 'Escape') setEditing(null); }} />
          : <button className="nx-list-main" onClick={() => replace(p.config)}><strong>{p.name}</strong><small>{p.factory ? 'De fábrica' : 'Seu perfil'} · toque para aplicar</small></button>}
        <div className="nx-list-actions">
          {!p.factory && <button onClick={() => setUserPresets(updatePreset(userPresets, p.id, cfg))} title="Sobrescrever com o ajuste atual">Atualizar</button>}
          {!p.factory && <button onClick={() => { setEditing(p.id); setEditName(p.name); }}>Renomear</button>}
          <button onClick={() => setUserPresets([...userPresets, duplicatePreset(p)])}>Duplicar</button>
          <button onClick={() => share(p)}>Compartilhar</button>
          <button onClick={() => download([p], `${p.name.replace(/[^\w-]+/g, '_')}.nexus-preset.json`)}>Exportar</button>
          {!p.factory && <button className="danger" onClick={() => setUserPresets(deletePreset(userPresets, p.id))}>Excluir</button>}
        </div></li>)}</ul>
    </Card>
    <div className="nx-actions">
      <button className="nx-btn" onClick={() => file.current?.click()}>Importar</button>
      <button className="nx-btn" disabled={!userPresets.length} onClick={() => download(userPresets, 'nexus-eq-perfis.json')}>Exportar todos</button>
      <button className="nx-btn" onClick={() => replace(defaultConfig())}><Icon name="reset" size={16} /> Restaurar padrão</button>
      <input ref={file} type="file" accept="application/json,.json" hidden onChange={e => onImport(e.target.files?.[0])} />
    </div>
    {msg && <p className="nx-hint" role="status">{msg}</p>}
    <p className="nx-hint">Importação e exportação são de configurações, nunca de músicas. Perfis automáticos por dispositivo dependem do Device Studio (em desenvolvimento).</p>
  </div>;
}
