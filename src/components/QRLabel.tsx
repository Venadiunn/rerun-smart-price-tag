import { useEffect,useRef } from 'react'
import QrCreator from 'qr-creator'
import { Download,Printer } from 'lucide-react'
import { download } from '../lib/api'
export function QRLabel({value,label}:{value:string;label:string}) {
  const ref=useRef<HTMLCanvasElement>(null)
  useEffect(()=>{if(ref.current)QrCreator.render({text:value,radius:0,ecLevel:'M',fill:'#141927',background:'#ffffff',size:280},ref.current)},[value])
  return <div className="qr-label"><div className="qr-paper"><canvas ref={ref} aria-label={`QR code for ${label}`}/><strong>{label}</strong><small>ReRun · Scan to look up</small></div><div className="actions"><button className="secondary" onClick={()=>ref.current?.toBlob(async b=>{if(b)download(await b.arrayBuffer(),`${label}.png`,'image/png')})}><Download size={15}/>PNG</button><button className="secondary" onClick={()=>{const win=window.open('','_blank');if(!win)return;win.document.title='ReRun label';const img=win.document.createElement('img');img.src=ref.current!.toDataURL();img.style.width='40mm';const text=win.document.createElement('p');text.textContent=label;win.document.body.append(img,text);img.onload=()=>win.print()}}><Printer size={15}/>Print</button></div></div>
}
