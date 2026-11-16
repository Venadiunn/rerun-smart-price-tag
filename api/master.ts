import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import { validateMaster } from '../src/lib/domain.js'
import { makeWorkbook, readWorkbook } from '../server-lib/workbook.js'
export default async function handler(req: VercelRequest,res: VercelResponse) {
  res.setHeader('Cache-Control','no-store')
  if(req.method!=='POST')return res.status(405).json({error:'POST required'})
  try {
    const token=req.headers.authorization
    if(!token?.startsWith('Bearer '))return res.status(401).json({error:'Sign in first'})
    const sb=createClient(process.env.VITE_SUPABASE_URL!,process.env.VITE_SUPABASE_PUBLISHABLE_KEY!,{global:{headers:{Authorization:token}},auth:{persistSession:false}})
    const {data:{user},error:authError}=await sb.auth.getUser(token.slice(7))
    if(authError||!user)return res.status(401).json({error:'Session expired'})
    const {data:profile}=await sb.from('profiles').select('role,active').eq('id',user.id).single()
    if(!profile?.active||!['manager','administrator'].includes(profile.role))return res.status(403).json({error:'Manager access required'})
    const {data:snapshot,error:snapshotError}=await sb.rpc('rerun_snapshot'); if(snapshotError)throw snapshotError
    const body=typeof req.body==='string'?JSON.parse(req.body):req.body
    if(body.action==='import') {
      if(typeof body.base64!=='string'||body.base64.length>2800000)throw new Error('Maximum upload size is 2 MB.')
      const parsed=await readWorkbook(Buffer.from(body.base64,'base64'),String(body.filename),snapshot.master)
      if(parsed.revision && parsed.revision!==snapshot.revision?.id)throw new Error('This workbook is an old revision. Download the latest master before editing.')
      return res.json({master:parsed.master,expectedRevision:snapshot.revision?.id??null})
    }
    if(body.action!=='publish')throw new Error('Unknown master action')
    const master=validateMaster(body.master)
    if((snapshot.revision?.id??null)!==body.expectedRevision)throw new Error('Master changed. Refresh and review again.')
    const revisionId=randomUUID(), path=`${user.id}/${revisionId}.xlsx`
    const bytes=await makeWorkbook(master,revisionId,body.expectedRevision)
    const {error:uploadError}=await sb.storage.from('master-workbooks').upload(path,bytes,{contentType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',upsert:false})
    if(uploadError)throw uploadError
    const {data,error}=await sb.rpc('rerun_publish_master',{candidate:master,expected_revision:body.expectedRevision,workbook_path:path,request_id:body.requestId,price_request_id:body.priceRequestId??null})
    if(error)throw error
    return res.json({revisionId:data})
  }catch(e){return res.status(400).json({error:e instanceof Error?e.message:typeof e==='object'&&e&&'message' in e?String(e.message):'Master request failed'})}
}
