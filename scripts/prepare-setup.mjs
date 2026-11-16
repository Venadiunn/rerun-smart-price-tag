import fs from 'node:fs/promises'
import {randomBytes} from 'node:crypto'
await fs.mkdir('.private',{recursive:true})
const token=randomBytes(32).toString('hex')
const email=process.env.RERUN_ADMIN_EMAIL
if(!email)throw new Error('Set RERUN_ADMIN_EMAIL privately before preparing setup.')
await fs.writeFile('.private/setup-token.txt',token)
const source=`import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';
Deno.serve(async req=>{
 if(req.headers.get('x-setup-token')!==${JSON.stringify(token)})return new Response('Forbidden',{status:403});
 const sb=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
 const {count}=await sb.from('profiles').select('id',{count:'exact',head:true});
 if(count!==0)return new Response('Setup is closed',{status:410});
 const {data,error}=await sb.auth.admin.createUser({email:${JSON.stringify(email)},email_confirm:true,app_metadata:{rerun_invited:true}});
 if(error)return Response.json({error:error.message},{status:400});
 await sb.from('profiles').insert({id:data.user.id,email:${JSON.stringify(email)},role:'administrator',active:true});
 const link=await sb.auth.admin.generateLink({type:'recovery',email:${JSON.stringify(email)}});
 return Response.json({tokenHash:link.data.properties.hashed_token,type:'recovery',id:data.user.id});
});`
await fs.writeFile('.private/setup-edge.ts',source)
console.log('Prepared private, single-use account setup.')
