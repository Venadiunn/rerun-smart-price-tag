import ExcelJS from 'exceljs'
import { Readable } from 'node:stream'
import { validateMaster } from '../src/lib/domain.js'
import type { Master } from '../src/lib/types.js'

const productColumns = ['Item_ID','SKU','Barcode','Item_Name','Price','Cost','Category','Subcategory','Classification','Supplier_ID','Department_Code','Taxable','Size','Color','Intended_Location','Introduced_At']
const locationColumns = ['Location_ID','Department','Aisle','Rack','Shelf','Capacity']
function table(wb: ExcelJS.Workbook, name: string, columns: string[], rows: (string|number|boolean|null)[][]) {
  const sheet = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1, showGridLines: false }] })
  sheet.addTable({ name: `${name}Table`, ref: 'A1', headerRow: true, style: { theme: 'TableStyleMedium2', showRowStripes: true }, columns: columns.map(name => ({ name })), rows })
  sheet.columns.forEach((col,i) => { col.width = Math.min(44, Math.max(columns[i].length+3,...rows.map(r=>String(r[i]??'').length+2))) })
  sheet.eachRow(row => { row.font={name:'Arial',size:10}; row.alignment={vertical:'middle'}; row.height=22 })
  sheet.getRow(1).font={name:'Arial',size:10,bold:true,color:{argb:'FFFFFFFF'}}
  return sheet
}
export async function makeWorkbook(master: Master, revision: string, previous: string|null) {
  validateMaster(master)
  const wb = new ExcelJS.Workbook(); wb.creator='ReRun'; wb.created=new Date()
  const p=table(wb,'Products',productColumns,master.products.map(p=>[p.id,p.sku,p.barcode,p.name,p.price/100,p.cost===null?null:p.cost/100,p.categoryId,p.subcategory,p.classification,p.supplierId,p.departmentCode,p.taxable,p.size,p.color,p.locationId,p.introducedAt]))
  p.getColumn(5).numFmt='"$"#,##0.00'; p.getColumn(6).numFmt='"$"#,##0.00'
  table(wb,'Locations',locationColumns,master.locations.map(l=>[l.id,l.department,l.aisle,l.rack,l.shelf,l.capacity]))
  table(wb,'Categories',['Category_ID','Name'],master.categories.map(c=>[c.id,c.name]))
  table(wb,'Revision',['Key','Value'],[['Revision_ID',revision],['Previous_Revision',previous??''],['Published_UTC',new Date().toISOString()],['Data_Status','Fictional demonstration master; operational history is stored separately'],['Source','WWT Tech 26-27.pdf, sample products and classifications']])
  return Buffer.from(await wb.xlsx.writeBuffer())
}
function simple(cell: ExcelJS.Cell): string|number|boolean|null {
  const v=cell.value
  if (v===null || v===undefined) return null
  if (typeof v==='object') {
    if (v instanceof Date) return v.toISOString().slice(0,10)
    throw new Error(`Cell ${cell.address}: formulas, links and rich text are not accepted in the master.`)
  }
  return v
}
function records(sheet: ExcelJS.Worksheet, required: string[]) {
  const headers=sheet.getRow(1).values as ExcelJS.CellValue[]
  const names=headers.slice(1).map(v=>String(v??''))
  if(required.some(h=>!names.includes(h))) throw new Error(`${sheet.name}: required columns are ${required.join(', ')}`)
  if(new Set(names).size!==names.length) throw new Error(`${sheet.name}: duplicate headers`)
  const result: Record<string,string|number|boolean|null>[]=[]
  sheet.eachRow((row,i)=>{ if(i===1)return; const out:Record<string,string|number|boolean|null>={}; names.forEach((h,j)=>out[h]=simple(row.getCell(j+1))); if(Object.values(out).some(v=>v!==null && v!==''))result.push(out) })
  return result
}
const text=(v:unknown)=>v==null?'':String(v).trim()
function cents(v:unknown) { if(v===null || v==='' || typeof v==='boolean' || !Number.isFinite(Number(v)) || Number(v)<0 || Math.abs(Number(v)*100-Math.round(Number(v)*100))>0.00001)throw new Error(`Invalid currency value: ${v}`); return Math.round(Number(v)*100) }
export async function readWorkbook(bytes: Buffer, filename: string, current: Master): Promise<{master:Master; revision:string|null}> {
  const wb=new ExcelJS.Workbook(); let csv=false
  if(filename.toLowerCase().endsWith('.xlsx')) await wb.xlsx.load(bytes as never)
  else if(filename.toLowerCase().endsWith('.csv')) { csv=true; await wb.csv.read(Readable.from(bytes),{sheetName:'Products'}) }
  else throw new Error('Upload .xlsx or .csv files only.')
  const products=wb.getWorksheet('Products'); if(!products)throw new Error('Products sheet is missing.')
  const rows=records(products,productColumns)
  const master: Master={...current,products:rows.map(r=>({id:text(r.Item_ID),sku:text(r.SKU),barcode:text(r.Barcode),name:text(r.Item_Name),price:cents(r.Price),cost:r.Cost===null||r.Cost===''?null:cents(r.Cost),categoryId:text(r.Category),subcategory:text(r.Subcategory),classification:text(r.Classification),supplierId:text(r.Supplier_ID),departmentCode:text(r.Department_Code),taxable:typeof r.Taxable==='boolean'?r.Taxable:text(r.Taxable).toLowerCase()==='true',size:text(r.Size),color:text(r.Color),locationId:text(r.Intended_Location),introducedAt:text(r.Introduced_At)}))}
  let revision:string|null=null
  if(!csv) {
    const l=wb.getWorksheet('Locations'),c=wb.getWorksheet('Categories'),meta=wb.getWorksheet('Revision')
    if(!l||!c||!meta)throw new Error('Locations, Categories and Revision sheets are required.')
    master.locations=records(l,locationColumns).map(r=>({id:text(r.Location_ID),department:text(r.Department),aisle:text(r.Aisle),rack:text(r.Rack),shelf:text(r.Shelf),capacity:r.Capacity===null||r.Capacity===''?null:Number(r.Capacity)}))
    master.categories=records(c,['Category_ID','Name']).map(r=>({id:text(r.Category_ID),name:text(r.Name)}))
    revision=text(records(meta,['Key','Value']).find(r=>r.Key==='Revision_ID')?.Value)||null
  }
  return {master:validateMaster(master),revision}
}
