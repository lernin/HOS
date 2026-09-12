import { estateEditorMaterials, type EditorMaterial } from './editor'

const HOS_SUPABASE_URL='https://ezsldkzefkjjapugqjhs.supabase.co'
const HOS_SUPABASE_KEY='sb_publishable_t6poOv8-XBGWEkfW_TJbyw_ipeltR5e'

type MaterialRow={
  id:string
  slug:string
  name:string
  category:string
  preview_url:string|null
  diffuse_url:string
  normal_gl_url:string|null
  roughness_url:string|null
  real_world_scale:string|null
  use_note:string|null
}

function meters(value:string|null){
  const n=value?.match(/[\d.]+/)?.[0]
  return n&&Number.isFinite(Number(n))?Math.max(.25,Number(n)):1.5
}

export async function loadEstateMaterialCatalog(signal?:AbortSignal):Promise<EditorMaterial[]>{
  try{
    const fields='id,slug,name,category,preview_url,diffuse_url,normal_gl_url,roughness_url,real_world_scale,use_note'
    const response=await fetch(`${HOS_SUPABASE_URL}/rest/v1/material_assets?select=${fields}&status=eq.active&order=category.asc,name.asc`,{signal,headers:{apikey:HOS_SUPABASE_KEY}})
    if(!response.ok)throw new Error(`Material catalog ${response.status}`)
    const rows=await response.json() as MaterialRow[]
    if(!Array.isArray(rows)||!rows.length)throw new Error('Material catalog was empty')
    return rows.map(row=>({
      id:row.id,
      label:row.name,
      slug:row.slug,
      category:row.category,
      use:row.use_note||`${row.category} · database material`,
      meters:meters(row.real_world_scale),
      previewUrl:row.preview_url||row.diffuse_url,
      diffuseUrl:row.diffuse_url,
      normalUrl:row.normal_gl_url,
      roughnessUrl:row.roughness_url,
    }))
  }catch(error){
    if(signal?.aborted)throw error
    console.warn('Ocean Estate material catalog unavailable; using built-in finishes.',error)
    return estateEditorMaterials
  }
}
