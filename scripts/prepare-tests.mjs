import fs from 'node:fs/promises'
import {randomBytes} from 'node:crypto'
import {createClient} from '@supabase/supabase-js'
const url='https://ikuvbteklxjbsixwhril.supabase.co',key='sb_publishable_FnpGIa5bHpNIvCz_xlYodA_n8wRubNc'
const sb=createClient(url,key,{auth:{persistSession:false}})
const admin=JSON.parse(await fs.readFile('.private/admin-session.json','utf8'))
const {error}=await sb.auth.setSession(admin);if(error)throw error
let users={};try{users=JSON.parse(await fs.readFile('.private/test-users.json','utf8'))}catch{}
for(const role of ['associate','manager']){
 if(users[role])continue
 const email=`rerun-${role}-${randomBytes(6).toString('hex')}@example.com`
 const {data,error}=await sb.functions.invoke('staff',{body:{action:'create',email,role}})
 if(error)throw new Error((await error.context?.json?.())?.error??error.message)
 if(data.error)throw new Error(data.error)
 const test=createClient(url,key,{auth:{persistSession:false}})
 const verified=await test.auth.verifyOtp({token_hash:data.tokenHash,type:'recovery'});if(verified.error)throw verified.error
 const password=randomBytes(20).toString('base64url')
 const updated=await test.auth.updateUser({password});if(updated.error)throw updated.error
 users[role]={email,password,id:data.id,session:(await test.auth.getSession()).data.session}
}
await fs.writeFile('.private/test-users.json',JSON.stringify(users))
await fs.writeFile('.private/admin-session.json',JSON.stringify((await sb.auth.getSession()).data.session))
for(const [role,session] of [['administrator',(await sb.auth.getSession()).data.session],...Object.entries(users).map(([role,u])=>[role,u.session])]){
 await fs.writeFile(`.private/${role}.state.json`,JSON.stringify({cookies:[],origins:[{origin:process.env.BASE_URL??'http://localhost:5173',localStorage:[{name:'sb-ikuvbteklxjbsixwhril-auth-token',value:JSON.stringify(session)}]}]}))
}
console.log('Private browser test sessions prepared. Test users have no administrator rights.')
