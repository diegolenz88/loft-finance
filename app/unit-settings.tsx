'use client';
import {useState} from 'react';
import {Box,Plus} from 'lucide-react';
import {Checkbox} from '@/components/ui/checkbox';
import {type Config,activeStudioCount,inactiveUnits} from '@/lib/finance';

export function UnitSettings({config,disabled,onChange}:{config:Config;disabled:boolean;onChange:(config:Config)=>void}){
 const [name,setName]=useState('');
 const [error,setError]=useState('');
 const inactive=inactiveUnits(config);
 function add(){
  const unit=name.trim();
  if(!unit){setError('Informe o nome da unidade.');return;}
  if(config.units.some(u=>u.toLocaleLowerCase('pt-BR')===unit.toLocaleLowerCase('pt-BR'))){setError('Esta unidade já está cadastrada.');return;}
  onChange({...config,units:[...config.units,unit],inactiveUnits:[...inactive]});
  setName('');setError('');
 }
 return <section className="unit-settings" aria-labelledby="units-title">
  <div className="unit-settings-heading">
   <div><h3 id="units-title">Studios e áreas comuns</h3><p>Unidades inativas mantêm seus lançamentos, comprovantes e pendências.</p></div>
   <div className="unit-status-summary" aria-live="polite"><span className="tag success">{activeStudioCount(config)} studios ativos</span><span className="tag neutral">{inactive.length} inativos</span></div>
  </div>
  <div className="unit-status-grid">{config.units.map(unit=>{
   const active=!inactive.includes(unit),common=unit==='Áreas comuns';
   return <label key={unit} className={'unit-status-card '+(active?'':'is-inactive')}>
    <Box size={18} aria-hidden="true"/>
    <span><strong>{unit}</strong><small>{common?'Centro de custo compartilhado':active?'Disponível para novos lançamentos':'Histórico e baixas preservados'}</small></span>
    <Checkbox checked={active} disabled={disabled||common} aria-label={unit+' ativo'} onCheckedChange={checked=>onChange({...config,inactiveUnits:checked?inactive.filter(u=>u!==unit):[...inactive,unit]})}/>
    <em>{common?'Ativa':active?'Ativo':'Inativo'}</em>
   </label>;
  })}</div>
  {!disabled&&<div className="unit-add-row"><label className="field"><span>Nova unidade</span><input value={name} maxLength={100} placeholder="Ex.: Loft 13" onChange={e=>{setName(e.target.value);setError('');}} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();add();}}}/></label><button type="button" className="btn secondary" onClick={add}><Plus size={16}/>Adicionar unidade</button></div>}
  {error&&<p role="alert" className="form-error">{error}</p>}
  <p className="footnote">Marque para ativar ou desmarque para inativar. Clique em “Salvar configurações” para aplicar. Os totais financeiros incluem todo o histórico.</p>
 </section>;
}
