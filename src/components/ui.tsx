import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { X, LoaderCircle } from 'lucide-react'
export function Badge({children,tone='neutral'}:{children:ReactNode;tone?:string}) {return <span className={`badge ${tone}`}>{children}</span>}
export function Status({value}:{value:string}) {return <Badge tone={/Valid|VALID|Restocked|Verified|Available|Approved|Inspected/.test(value)?'success':/Failed|MISMATCH|UNKNOWN|Retired|Rejected|MISSING/.test(value)?'danger':/Pending|Returned|Inspection|Transit/.test(value)?'warning':'neutral'}>{value.replaceAll('_',' ')}</Badge>}
export function PageTitle({eyebrow,title,description,actions}:{eyebrow:string;title:string;description:string;actions?:ReactNode}) {return <div className="page-heading"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div><div className="actions">{actions}</div></div>}
export function Empty({title,children}:{title:string;children?:ReactNode}) {return <div className="empty"><div className="empty-orbit">◇</div><h3>{title}</h3><p>{children}</p></div>}
export function Modal({title,children,onClose,wide=false}:{title:string;children:ReactNode;onClose:()=>void;wide?:boolean}) {
  const ref=useRef<HTMLDialogElement>(null)
  useEffect(()=>{const dialog=ref.current;dialog?.showModal();return()=>dialog?.close()},[])
  return <dialog ref={ref} className={wide?'modal wide':'modal'} onCancel={onClose}><div className="modal-top"><h2>{title}</h2><button className="icon-button" aria-label="Close dialog" onClick={onClose}><X size={20}/></button></div>{children}</dialog>
}
export function Busy({label='Loading your workspace…'}:{label?:string}) {return <div className="loading"><LoaderCircle className="spin" size={30}/><p>{label}</p></div>}
export const field=(form:FormData,key:string)=>String(form.get(key)??'').trim()
