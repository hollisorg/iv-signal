import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as sg from '../src/core/index.js'
import { IVWorkspace } from '../src/service/iv-workspace.js'
import { receiveSignal } from '../src/service/iv-workspace-import.js'
test('Signal handoff creates one unapproved native draft and preserves rules on retry',t=>{
 const root=mkdtempSync(join(tmpdir(),'signal-handoff-')),db=sg.openDb(join(root,'signal.db')),ws=new IVWorkspace({root:join(root,'shared'),appId:'studio'})
 t.after(()=>{db.close();ws.close();rmSync(root,{recursive:true,force:true})})
 const shared=ws.saveBrand({name:'Fixture'}),brand=sg.createBrand(db,{name:'Fixture',profile:{prohibited:['guaranteed income']}})
 const h=ws.createHandoff({target:'signal',brandId:shared.id,sourceKey:'example',brief:{title:'A useful idea',caption:'A draft to review',campaign:'Fixture campaign',channel:'LinkedIn'}})
 const r=receiveSignal(h,ws,db,brand.id,root),post=sg.getPost(db,r.id)
 assert.equal(post.status,'draft');assert.equal(post.variants[0].text,'A draft to review');assert.equal(post.variants[0].planned_for,null)
 assert.deepEqual(receiveSignal(h,ws,db,brand.id,root),r);assert.equal(db.prepare('select count(*) n from posts').get().n,1);assert.equal(db.prepare('select count(*) n from approvals').get().n,0)
 assert.deepEqual(sg.getBrand(db,brand.id).profile.prohibited,['guaranteed income'])
})
test('failed nested import leaves no post or receipt',t=>{
 const root=mkdtempSync(join(tmpdir(),'signal-rollback-')),db=sg.openDb(join(root,'signal.db')),ws=new IVWorkspace({root:join(root,'shared'),appId:'studio'})
 t.after(()=>{db.close();ws.close();rmSync(root,{recursive:true,force:true})})
 const brand=sg.createBrand(db,{name:'Fixture'}),shared=ws.saveBrand({name:'Fixture'}),h=ws.createHandoff({target:'signal',brandId:shared.id,sourceKey:'failed',brief:{title:'Example'}})
 assert.throws(()=>sg.tx(db,()=>{receiveSignal(h,ws,db,brand.id,root);throw Error('rollback')}),/rollback/)
 assert.equal(db.prepare('select count(*) n from posts').get().n,0);assert.equal(sg.getSetting(db,`iv-workspace-receipt:${h.id}`),null)
})
