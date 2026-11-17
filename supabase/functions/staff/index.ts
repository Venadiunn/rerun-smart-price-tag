import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.119.0'
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Cache-Control':'no-store'}
Deno.serve(async req=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers})
  if(req.method!=='POST')return Response.json({error:'POST required'},{status:405,headers})
  try {
    const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}})
    const token=req.headers.get('Authorization')?.replace(/^Bearer /,'')
    if(!token)throw new Error('Sign in first')
    const {data:{user},error}=await admin.auth.getUser(token); if(error||!user)throw new Error('Session expired')
    const {data:profile}=await admin.from('profiles').select('role,active').eq('id',user.id).single()
    if(!profile?.active||profile.role!=='administrator')return Response.json({error:'Administrator access required'},{status:403,headers})
    const body=await req.json()
    if(!['associate','manager','administrator'].includes(body.role)||typeof body.email!=='string'||!body.email.includes('@'))throw new Error('Valid email and role required')
    let id=body.userId
    if(body.action==='create') {
      const {error:inviteError}=await admin.from('staff_invites').upsert({email:body.email.toLowerCase()}); if(inviteError)throw inviteError
      const {data,error}=await admin.auth.admin.createUser({email:body.email,email_confirm:true,app_metadata:{rerun_invited:true}})
      if(error)throw error; id=data.user.id
      const {error:profileError}=await admin.from('profiles').insert({id,email:body.email,role:body.role,active:true}); if(profileError)throw profileError
    } else if(body.action==='activation') {
      const {data:p}=await admin.from('profiles').select('id,email,active').eq('id',id).single()
      if(!p||!p.active||p.email!==body.email)throw new Error('Employee is missing or disabled')
    } else throw new Error('Unknown staff action')
    const {data:link,error:linkError}=await admin.auth.admin.generateLink({type:'recovery',email:body.email})
    if(linkError)throw linkError
    await admin.from('audit_events').insert({action:'staff_activation_created',entity_id:id,details:{email:body.email,role:body.role},actor:user.id})
    return Response.json({tokenHash:link.properties.hashed_token,type:'recovery',id},{headers})
  } catch(e) {return Response.json({error:e instanceof Error?e.message:'Employee setup failed'},{status:400,headers})}
})
