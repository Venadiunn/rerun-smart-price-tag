import { useEffect,useState,lazy,Suspense } from 'react'
import type { Session } from '@supabase/supabase-js'
import { QueryClient,QueryClientProvider,useQuery,useQueryClient } from '@tanstack/react-query'
import { createRootRoute,createRoute,createRouter,RouterProvider,Outlet,Link } from '@tanstack/react-router'
import { LayoutDashboard,Boxes,ScanLine,MapPin,Tag,BadgeDollarSign,History,FileSpreadsheet,Settings,LogOut,Menu,X,ArrowUpRight,CheckCircle2,AlertCircle } from 'lucide-react'
import { supabase } from './lib/supabase'
import { snapshot } from './lib/api'
import { WorkspaceContext,useWorkspace } from './lib/context'
import { Auth } from './components/Auth'
import { Busy } from './components/ui'
import { Dashboard } from './pages/Dashboard'
import { Inventory } from './pages/Inventory'
import { Scan } from './pages/Scan'
import { Locations } from './pages/Locations'
import { Tags } from './pages/Tags'
import { Pricing } from './pages/Pricing'
import { History as HistoryPage } from './pages/History'
import { MasterData } from './pages/MasterData'
import { Settings as SettingsPage } from './pages/Settings'
const ProductDrawer=lazy(()=>import('./components/ProductDrawer').then(m=>({default:m.ProductDrawer})))
const client=new QueryClient({defaultOptions:{queries:{staleTime:15000,retry:1,refetchOnWindowFocus:true}}})
const nav=[{to:'/',label:'Overview',icon:LayoutDashboard},{to:'/inventory',label:'Inventory',icon:Boxes},{to:'/scan',label:'Scan & verify',icon:ScanLine},{to:'/locations',label:'Store locations',icon:MapPin},{to:'/tags',label:'Reusable tags',icon:Tag},{to:'/pricing',label:'Pricing',icon:BadgeDollarSign},{to:'/history',label:'Activity history',icon:History},{to:'/master',label:'Master data',icon:FileSpreadsheet},{to:'/settings',label:'Settings',icon:Settings}] as const
function Shell(){
  const {data}=useWorkspace(),[menu,setMenu]=useState(false)
  return <div className="app-layout"><aside className={`sidebar ${menu?'open':''}`}><Link to="/" className="brand"><img src="/rerun-logo.png" alt="ReRun"/><span>RE<span className="brand-run">RUN</span><small>SMART PRICE TAG</small></span></Link><span className="nav-label">YOUR WORKSPACE</span><nav aria-label="Main navigation">{nav.map(n=><Link key={n.to} to={n.to} activeOptions={{exact:true}} activeProps={{className:'nav-item selected'}} inactiveProps={{className:'nav-item'}} onClick={()=>setMenu(false)}><n.icon size={19}/>{n.label}{n.to==='/scan'&&<ArrowUpRight size={15} className="nav-arrow"/>}</Link>)}</nav><div className="sidebar-note"><div className="store-avatar"><MapPin size={18}/></div><div><strong>ReRun demo store</strong><small>Single-store workspace</small></div><span className="connection-dot"/></div><div className="sidebar-bottom"><span className="small-chip">WWT STEM · 2026–27</span><p>A place for everything.</p></div></aside>{menu&&<button className="sidebar-shade" aria-label="Close navigation" onClick={()=>setMenu(false)}/>}<div className="main-wrap"><header className="topbar"><div className="topbar-left"><button className="icon-button mobile-menu" aria-label="Toggle navigation" onClick={()=>setMenu(!menu)}>{menu?<X size={21}/>:<Menu size={21}/>}</button><span className="store-wordmark">RE<span>RUN</span></span><span className="topbar-divider"/><span>Store operations</span></div><div className="topbar-right"><span className="connection-status"><i/>Master v{data.revision.revision} connected</span><div className="avatar">{data.profile.email.slice(0,2).toUpperCase()}</div><div className="user-text"><strong>{data.profile.email.split('@')[0]}</strong><small>{data.profile.role}</small></div><button className="icon-button" aria-label="Sign out" onClick={()=>{void supabase.auth.signOut()}}><LogOut size={17}/></button></div></header><main id="main"><Outlet/></main><footer className="app-footer"><span>ReRun / Smart Price Tag</span><span>Fictional demonstration data · Physical tag simulator</span></footer></div></div>
}
const rootRoute=createRootRoute({component:Shell,notFoundComponent:()=> <div className="panel empty"><h1>Page not found</h1><Link to="/">Return to overview</Link></div>})
const pages=[['/',Dashboard],['/inventory',Inventory],['/scan',Scan],['/locations',Locations],['/tags',Tags],['/pricing',Pricing],['/history',HistoryPage],['/master',MasterData],['/settings',SettingsPage]] as const
const routes=pages.map(([path,component])=>createRoute({getParentRoute:()=>rootRoute,path,component}))
const router=createRouter({routeTree:rootRoute.addChildren(routes)})
declare module '@tanstack/react-router' {interface Register {router:typeof router}}
function Runtime(){
  const [session,setSession]=useState<Session|null|undefined>(undefined),[pending,setPending]=useState(0),[toast,setToast]=useState<{message:string;error:boolean}|null>(null),[selected,setSelected]=useState<{id:string;unitId?:string}|null>(null)
  const queryClient=useQueryClient()
  useEffect(()=>{let mounted=true;void supabase.auth.getSession().then(({data})=>{if(mounted)setSession(data.session)});const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,next)=>{setSession(next);if(!next){queryClient.clear();setSelected(null)}});return()=>{mounted=false;subscription.unsubscribe()}},[queryClient])
  useEffect(()=>{if(!toast)return;const timer=setTimeout(()=>setToast(null),6500);return()=>clearTimeout(timer)},[toast])
  const query=useQuery({queryKey:['workspace',session?.user.id],queryFn:snapshot,enabled:!!session,refetchInterval:20000})
  async function run<T,>(work:()=>Promise<T>,success?:string):Promise<T|undefined>{setPending(p=>p+1);try{const result=await work();await queryClient.invalidateQueries({queryKey:['workspace']});if(success)setToast({message:success,error:false});return result}catch(error){setToast({message:error instanceof Error?error.message:String(error),error:true});return undefined}finally{setPending(p=>p-1)}}
  if(location.pathname==='/activate')return <Auth activation/>
  if(session===undefined)return <Busy/>
  if(!session)return <Auth/>
  if(query.isPending)return <Busy/>
  if(query.error||!query.data?.revision)return <div className="access-error"><AlertCircle size={35}/><h1>Workspace unavailable</h1><p>{query.error?.message??'The master inventory is being initialized.'}</p><div className="actions"><button className="primary" onClick={()=>query.refetch()}>Try again</button><button className="secondary" onClick={()=>supabase.auth.signOut()}>Sign out</button></div></div>
  return <WorkspaceContext.Provider value={{data:query.data,busy:pending>0,run,refresh:async()=>{await query.refetch()},openProduct:(id,unitId)=>setSelected({id,unitId})}}><a className="skip-link" href="#main">Skip to content</a><RouterProvider router={router}/>{selected&&<Suspense fallback={<div className="drawer-loading"><Busy label="Opening item…"/></div>}><ProductDrawer key={selected.id+selected.unitId} productId={selected.id} initialUnitId={selected.unitId} onClose={()=>setSelected(null)}/></Suspense>}{toast&&<div className={`toast ${toast.error?'error':''}`} role={toast.error?'alert':'status'}>{toast.error?<AlertCircle size={20}/>:<CheckCircle2 size={20}/>}<span>{toast.message}</span><button aria-label="Dismiss notification" onClick={()=>setToast(null)}><X size={16}/></button></div>}{pending>0&&<div className="saving-bar" role="status">Saving changes…</div>}</WorkspaceContext.Provider>
}
export default function WorkspaceApp(){return <QueryClientProvider client={client}><Runtime/></QueryClientProvider>}
