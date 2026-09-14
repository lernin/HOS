#!/usr/bin/env python3
import copy, gzip, io, json, os, struct, sys, urllib.request, zipfile
from pathlib import Path
from PIL import Image

SOURCE_URL='https://opengameart.org/sites/default/files/medieval_village_megakitstandard.zip'
SELECTED=[
'Wall_Plaster_Door_Round','Wall_Plaster_Window_Wide_Round','Wall_Plaster_Window_Thin_Round','Wall_Plaster_Straight','Wall_Plaster_WoodGrid',
'Wall_UnevenBrick_Door_Round','Wall_UnevenBrick_Window_Wide_Round','Wall_UnevenBrick_Window_Thin_Round','Wall_UnevenBrick_Straight',
'Floor_WoodDark','Floor_WoodLight','Floor_Brick','Floor_UnevenBrick',
'Roof_RoundTiles_4x4','Roof_RoundTiles_4x6','Roof_RoundTiles_6x4','Roof_RoundTiles_6x6','Roof_Tower_RoundTiles','Roof_Dormer_RoundTile',
'Balcony_Cross_Straight','Balcony_Cross_Corner','Balcony_Simple_Straight','Balcony_Simple_Corner',
'Stairs_Exterior_Straight','Stairs_Exterior_Platform','Stairs_Exterior_SidePlatform','Stair_Interior_Simple',
'Prop_Chimney','Prop_Chimney2','Prop_Crate','Prop_Wagon','Prop_Vine1','Prop_Vine2','Prop_Vine4','Prop_WoodenFence_Single','Prop_WoodenFence_Extension1','Prop_WoodenFence_Extension2','Prop_Support',
'Corner_Exterior_Wood','Corner_Exterior_Brick','Overhang_Plaster_Long','Overhang_UnevenBrick_Long','Door_2_Round','Door_1_Round'
]

def align4(data: bytearray):
    while len(data) % 4: data.append(0)

def png_bytes(path: Path) -> bytes:
    image=Image.open(path)
    limit=512
    if max(image.size)>limit:
        scale=limit/max(image.size)
        image=image.resize((max(1,round(image.width*scale)),max(1,round(image.height*scale))),Image.Resampling.LANCZOS)
    out=io.BytesIO(); image.save(out,format='PNG',compress_level=5); return out.getvalue()

def remap_material(material, texture_map):
    result=copy.deepcopy(material)
    def slot(obj,key):
        if isinstance(obj,dict) and isinstance(obj.get(key),dict) and 'index' in obj[key]: obj[key]['index']=texture_map[obj[key]['index']]
    pbr=result.get('pbrMetallicRoughness')
    if isinstance(pbr,dict): slot(pbr,'baseColorTexture'); slot(pbr,'metallicRoughnessTexture')
    for key in ('normalTexture','occlusionTexture','emissiveTexture'): slot(result,key)
    return result

def main():
    root=Path('.cache/creekside-kit'); root.mkdir(parents=True,exist_ok=True)
    archive=root/'standard.zip'
    if not archive.exists():
        print('Downloading CC0 Standard kit…')
        request=urllib.request.Request(SOURCE_URL,headers={'User-Agent':'Mozilla/5.0 CreeksideVillageBuilder/1.0'})
        with urllib.request.urlopen(request,timeout=120) as response, archive.open('wb') as output:
            output.write(response.read())
    extract=root/'source'
    if not extract.exists():
        extract.mkdir(parents=True)
        with zipfile.ZipFile(archive) as z: z.extractall(extract)
    candidates=[p for p in extract.rglob('glTF') if (p/'Wall_Plaster_Straight.gltf').exists()]
    if not candidates: raise RuntimeError('Could not find glTF source folder in Quaternius archive.')
    base=candidates[0]

    out={'asset':{'version':'2.0','generator':'Creekside packer; Quaternius Medieval Village MegaKit Standard CC0'},'scene':0,'scenes':[{'name':'CreeksideVillageKit','nodes':[]}],'nodes':[],'materials':[],'meshes':[],'textures':[],'images':[],'accessors':[],'bufferViews':[],'samplers':[],'buffers':[{'byteLength':0}]}
    binary=bytearray(); image_map={}; sampler_map={}; texture_map={}; material_map={}
    for asset in SELECTED:
        data=json.loads((base/f'{asset}.gltf').read_text())
        source=(base/data['buffers'][0]['uri']).read_bytes(); align4(binary); buffer_base=len(binary); binary.extend(source)
        bv_off=len(out['bufferViews'])
        for view in data.get('bufferViews',[]):
            item=copy.deepcopy(view); item['buffer']=0; item['byteOffset']=buffer_base+item.get('byteOffset',0); out['bufferViews'].append(item)
        acc_off=len(out['accessors'])
        for accessor in data.get('accessors',[]):
            item=copy.deepcopy(accessor)
            if 'bufferView' in item: item['bufferView']+=bv_off
            out['accessors'].append(item)
        samplers={}
        for index,sampler in enumerate(data.get('samplers',[])):
            key=json.dumps(sampler,sort_keys=True,separators=(',',':'))
            if key not in sampler_map: sampler_map[key]=len(out['samplers']); out['samplers'].append(copy.deepcopy(sampler))
            samplers[index]=sampler_map[key]
        images={}
        for index,image in enumerate(data.get('images',[])):
            uri=image['uri']
            if uri not in image_map:
                content=png_bytes(base/uri); align4(binary); offset=len(binary); binary.extend(content)
                view_index=len(out['bufferViews']); out['bufferViews'].append({'buffer':0,'byteOffset':offset,'byteLength':len(content)})
                image_map[uri]=len(out['images']); out['images'].append({'bufferView':view_index,'mimeType':'image/png','name':image.get('name',Path(uri).stem)})
            images[index]=image_map[uri]
        textures={}
        for index,texture in enumerate(data.get('textures',[])):
            sampler=samplers.get(texture.get('sampler',0),0) if out['samplers'] else None; image=images[texture['source']]; key=(sampler,image)
            if key not in texture_map:
                item={'source':image}
                if sampler is not None: item['sampler']=sampler
                texture_map[key]=len(out['textures']); out['textures'].append(item)
            textures[index]=texture_map[key]
        materials={}
        for index,material in enumerate(data.get('materials',[])):
            item=remap_material(material,textures); key=json.dumps(item,sort_keys=True,separators=(',',':'))
            if key not in material_map: material_map[key]=len(out['materials']); out['materials'].append(item)
            materials[index]=material_map[key]
        mesh_off=len(out['meshes'])
        for mesh_index,mesh in enumerate(data.get('meshes',[])):
            item=copy.deepcopy(mesh); item['name']=f'{asset}__mesh{mesh_index}'
            for primitive in item.get('primitives',[]):
                primitive['attributes']={key:value+acc_off for key,value in primitive.get('attributes',{}).items()}
                if 'indices' in primitive: primitive['indices']+=acc_off
                if 'material' in primitive: primitive['material']=materials[primitive['material']]
            out['meshes'].append(item)
        node_off=len(out['nodes'])
        for node_index,node in enumerate(data.get('nodes',[])):
            item=copy.deepcopy(node); item['name']=f'{asset}__node{node_index}'
            if 'mesh' in item: item['mesh']+=mesh_off
            if 'children' in item: item['children']=[value+node_off for value in item['children']]
            out['nodes'].append(item)
        scene=data['scenes'][data.get('scene',0)]; out['scenes'][0]['nodes'].extend([node+node_off for node in scene.get('nodes',[])])

    out['buffers'][0]['byteLength']=len(binary); align4(binary)
    encoded=json.dumps(out,separators=(',',':')).encode()
    while len(encoded)%4: encoded+=b' '
    total=12+8+len(encoded)+8+len(binary)
    glb=struct.pack('<III',0x46546C67,2,total)+struct.pack('<II',len(encoded),0x4E4F534A)+encoded+struct.pack('<II',len(binary),0x004E4942)+binary
    packed=gzip.compress(glb,compresslevel=9)
    target=Path('public/assets/village'); target.mkdir(parents=True,exist_ok=True)
    for old in target.glob('village-kit-v2-*.part'): old.unlink()
    part_size=(len(packed)+5)//6
    for index in range(6):
        start=index*part_size; end=min(len(packed),(index+1)*part_size); (target/f'village-kit-v2-{index}.part').write_bytes(packed[start:end])
    print(f'Built {len(SELECTED)} Quaternius modules: {len(glb)/1e6:.1f} MB GLB, {len(packed)/1e6:.1f} MB gzip.')

if __name__=='__main__': main()
