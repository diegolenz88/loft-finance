'use client';

import {useEffect,useState} from 'react';
import {Download,Eye,ExternalLink,FileText,LoaderCircle,X} from 'lucide-react';
import {Dialog,DialogContent,DialogDescription,DialogTitle} from '@/components/ui/dialog';

function fileUrl(id:string,inline=false){return `/api/files?id=${encodeURIComponent(id)}${inline?'&disposition=inline':''}`}

export function AttachmentLink({file,onPreview}:{file:{id:string;name:string};onPreview:(file:{id:string;name:string})=>void}){
 return <span className="attachment-link">
  <button type="button" className="file-link" onClick={()=>onPreview(file)} title={'Visualizar '+file.name}><Eye size={15}/>{file.name}<span>Visualizar</span></button>
  <a className="attachment-download" href={fileUrl(file.id)} title={'Baixar '+file.name} aria-label={'Baixar '+file.name}><Download size={15}/></a>
 </span>;
}

export function AttachmentPreview({file,onClose}:{file:{id:string;name:string;mime:string}|null;onClose:()=>void}){
 const[url,setUrl]=useState('');
 const[mime,setMime]=useState('');
 const[busy,setBusy]=useState(false);
 const[error,setError]=useState('');

 useEffect(()=>{
  if(!file){setUrl('');setMime('');setError('');setBusy(false);return}
  let active=true;
  let objectUrl='';
   const controller=new AbortController();
  setBusy(true);setError('');setUrl('');setMime('');
   fetch(fileUrl(file.id,true),{credentials:'same-origin',cache:'no-store',headers:{'Cache-Control':'no-cache'},signal:controller.signal})
   .then(async response=>{
    if(!response.ok)throw new Error(response.status===401?'Sua sessão expirou. Entre novamente para visualizar o arquivo.':response.status===404?'Este arquivo não está mais disponível.':'Não foi possível abrir o arquivo.');
    const type=(response.headers.get('content-type')||'application/octet-stream').split(';')[0].toLowerCase();
    if(!['application/pdf','image/jpeg','image/png','image/webp'].includes(type))throw new Error('Este formato não pode ser visualizado no navegador. Baixe o arquivo para abri-lo.');
    const blob=await response.blob();
    if(!active)return;
    objectUrl=URL.createObjectURL(new Blob([blob],{type}));
    setMime(type);setUrl(objectUrl);setBusy(false);
   })
   .catch(reason=>{if(active){setError(reason instanceof Error?reason.message:'Falha ao abrir o arquivo.');setBusy(false)}});
      return()=>{active=false;controller.abort();if(objectUrl){URL.revokeObjectURL(objectUrl);objectUrl=''}};
 },[file?.id]);

 useEffect(()=>{
  if(!file)return;
  // Capture phase: the preview sits inside a Sheet, whose dismissable layer
  // would otherwise consume Escape before this dialog reacts.
  const onKey=(event:KeyboardEvent)=>{
   if(event.key!=='Escape')return;
   event.preventDefault();
   event.stopPropagation();
   onClose();
  };
  window.addEventListener('keydown',onKey,true);
  return()=>window.removeEventListener('keydown',onKey,true);
 },[!!file,onClose]);

 if(!file)return null;
 const image=mime.startsWith('image/');
 return <Dialog open onOpenChange={open=>{if(!open)onClose()}}><DialogContent className="attachment-preview-dialog" showCloseButton={false} onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();onClose()}}}><header className="attachment-preview-header"><div className="attachment-preview-heading"><FileText size={18}/><div><DialogTitle>{file.name}</DialogTitle><DialogDescription>{mime||'Comprovante protegido'}</DialogDescription></div></div><div className="attachment-preview-tools"><a className="attachment-preview-icon" href={fileUrl(file.id)} title="Baixar arquivo" aria-label="Baixar arquivo"><Download size={18}/></a>{url&&<a className="attachment-preview-icon" href={url} target="_blank" rel="noreferrer" title="Abrir em nova aba" aria-label="Abrir em nova aba"><ExternalLink size={18}/></a>}<button className="attachment-preview-icon" type="button" onClick={onClose} title="Fechar" aria-label="Fechar visualização"><X size={19}/></button></div></header><div className="attachment-preview-content">{busy&&<div className="attachment-preview-state"><LoaderCircle className="attachment-preview-spinner" size={24}/><span>Carregando arquivo…</span></div>}{error&&<div className="attachment-preview-state attachment-preview-error" role="alert">{error}</div>}{!busy&&!error&&url&&image&&<img className="attachment-preview-image" src={url} alt={file.name}/ >}{!busy&&!error&&url&&mime==='application/pdf'&&<iframe className="attachment-preview-frame" src={url} title={file.name}/>}</div><footer className="attachment-preview-footer"><span>Visualização privada · acesso autenticado</span><a className="btn secondary" href={fileUrl(file.id)}><Download size={16}/>Baixar</a></footer></DialogContent></Dialog>;
}
