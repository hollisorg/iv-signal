import { readFileSync, writeFileSync, mkdirSync, statSync, existsSync } from 'node:fs'
import { join, extname } from 'node:path'
import { createHash } from 'node:crypto'
const VALID = /^[a-f0-9]{64}\.(png|jpg)$/
export function importBrandImage(dataDir, file, kind, nativeImage) {
  if (!['logo','cover'].includes(kind)) throw new Error('Choose a logo or cover image.')
  if (!['.png','.jpg','.jpeg','.webp'].includes(extname(file).toLowerCase())) throw new Error('Use a PNG, JPEG or WebP image.')
  if (statSync(file).size > 8 * 1024 * 1024) throw new Error('Choose an image smaller than 8 MB.')
  const original=nativeImage.createFromBuffer(readFileSync(file))
  if (original.isEmpty()) throw new Error('This image could not be read. Try a PNG or JPEG.')
  const size=original.getSize()
  if (size.width*size.height > 40000000) throw new Error('Choose an image under 40 megapixels.')
  const max=kind==='logo'?256:1200,scale=Math.min(1,max/Math.max(size.width,size.height))
  const resized=original.resize({width:Math.max(1,Math.round(size.width*scale)),height:Math.max(1,Math.round(size.height*scale)),quality:'best'})
  const bytes=kind==='logo'?resized.toPNG():resized.toJPEG(85),ext=kind==='logo'?'png':'jpg'
  const id=`${createHash('sha256').update(bytes).digest('hex')}.${ext}`
  mkdirSync(join(dataDir,'brand-assets'),{recursive:true})
  writeFileSync(join(dataDir,'brand-assets',id),bytes)
  return {id,dataUrl:`data:image/${ext==='png'?'png':'jpeg'};base64,${bytes.toString('base64')}`}
}
const cache=new Map()
export function brandImage(dataDir,id) {
  if (!id || !VALID.test(id)) return null
  const file=join(dataDir,'brand-assets',id)
  if (!existsSync(file)) return null
  if (!cache.has(file)) {
    if (statSync(file).size>4*1024*1024) return null
    if(cache.size>100)cache.clear()
    cache.set(file,`data:image/${id.endsWith('.png')?'png':'jpeg'};base64,${readFileSync(file).toString('base64')}`)
  }
  return cache.get(file)
}
