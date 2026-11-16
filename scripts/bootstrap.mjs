import fs from 'node:fs/promises'
import {createClient} from '@supabase/supabase-js'
const url='https://ikuvbteklxjbsixwhril.supabase.co'
const key='sb_publishable_FnpGIa5bHpNIvCz_xlYodA_n8wRubNc'
await fs.writeFile('.env.local',`VITE_SUPABASE_URL=${url}\nVITE_SUPABASE_PUBLISHABLE_KEY=${key}\n`)
const setup=await fetch(`${url}/functions/v1/rerun-setup`,{method:'POST',headers:{'x-setup-token':(await fs.readFile('.private/setup-token.txt','utf8')).trim()}})
const data=await setup.json(); if(!setup.ok)throw new Error(JSON.stringify(data))
const sb=createClient(url,key,{auth:{persistSession:false}})
const {data:auth,error}=await sb.auth.verifyOtp({token_hash:data.tokenHash,type:'recovery'})
if(error)throw error
await fs.writeFile('.private/admin-session.json',JSON.stringify(auth.session))
console.log('Administrator provisioned. Setup endpoint is now closed. Private setup session saved.')
