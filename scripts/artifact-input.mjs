import fs from 'node:fs/promises'
import {randomUUID} from 'node:crypto'
import {createClient} from '@supabase/supabase-js'
const sb=createClient('https://ikuvbteklxjbsixwhril.supabase.co','sb_publishable_FnpGIa5bHpNIvCz_xlYodA_n8wRubNc',{auth:{persistSession:false}})
await sb.auth.setSession(JSON.parse(await fs.readFile('.private/admin-session.json','utf8')))
const {data,error}=await sb.rpc('rerun_snapshot');if(error)throw error
await fs.writeFile('.private/artifact-input.json',JSON.stringify({master:data.master,expectedRevision:data.revision.id,revisionId:randomUUID(),userId:data.profile.id}))
console.log('Prepared workbook data without credentials.')
