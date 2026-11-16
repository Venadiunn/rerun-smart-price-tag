import {describe,it,expect} from 'vitest'
import ExcelJS from 'exceljs'
import {makeWorkbook,readWorkbook} from './workbook'
import {seedMaster} from '../src/lib/seed'
describe('authoritative Excel master',()=>{
  it('round-trips products, locations, categories, cents and revision metadata',async()=>{const bytes=await makeWorkbook(seedMaster,'rev-id','previous');const loaded=await readWorkbook(bytes,'master.xlsx',seedMaster);expect(loaded.master).toEqual(seedMaster);expect(loaded.revision).toBe('rev-id')})
  it('rejects missing sheets and cells containing formulas',async()=>{const wb=new ExcelJS.Workbook();wb.addWorksheet('Other');await expect(readWorkbook(Buffer.from(await wb.xlsx.writeBuffer()),'broken.xlsx',seedMaster)).rejects.toThrow('Products sheet');const valid=await makeWorkbook(seedMaster,'r',null);const edit=new ExcelJS.Workbook();await edit.xlsx.load(valid as never);edit.getWorksheet('Products')!.getCell('E2').value={formula:'1+1',result:2};await expect(readWorkbook(Buffer.from(await edit.xlsx.writeBuffer()),'formula.xlsx',seedMaster)).rejects.toThrow('formulas')})
})
