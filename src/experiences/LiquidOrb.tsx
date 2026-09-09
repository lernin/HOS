import { useEffect, useRef, useState } from 'react'
import './liquid-orb.css'

type OrbSettings = {
  size: number
  deformation: number
  lobes: number
  morphSpeed: number
  rotationSpeed: number
  glow: number
  liquidSpeed: number
  swirlScale: number
  brightness: number
  filaments: number
  coreGlow: number
  background: string
  colorA: string
  colorB: string
  glowA: string
  glowB: string
  quality: number
  paused: boolean
}

type Preset = { name: string; settings: OrbSettings }

const STORAGE_KEY = 'lab-liquid-orb-settings-v1'

const presets: Preset[] = [
  { name: 'Aurora', settings: { size: .37, deformation: .34, lobes: 2, morphSpeed: 1.15, rotationSpeed: .13, glow: .72, liquidSpeed: .5, swirlScale: 2.2, brightness: 1, filaments: 1.45, coreGlow: .3, background: '#070a18', colorA: '#4099ff', colorB: '#e633bf', glowA: '#33b5ff', glowB: '#e24dd0', quality: 1, paused: false } },
  { name: 'Ember', settings: { size: .39, deformation: .29, lobes: 2.1, morphSpeed: 1.25, rotationSpeed: .11, glow: .88, liquidSpeed: .74, swirlScale: 2.4, brightness: 1.12, filaments: 1.9, coreGlow: .42, background: '#160806', colorA: '#ffc24d', colorB: '#ff3b2f', glowA: '#ff7a18', glowB: '#ff2d55', quality: 1, paused: false } },
  { name: 'Toxic', settings: { size: .35, deformation: .43, lobes: 2.3, morphSpeed: 1.4, rotationSpeed: .18, glow: .78, liquidSpeed: .84, swirlScale: 2.6, brightness: 1.03, filaments: 1.75, coreGlow: .25, background: '#04120c', colorA: '#9cff4d', colorB: '#00e5a0', glowA: '#57ff3c', glowB: '#00ffc8', quality: 1, paused: false } },
  { name: 'Ice', settings: { size: .4, deformation: .2, lobes: 1.8, morphSpeed: .9, rotationSpeed: .08, glow: .62, liquidSpeed: .32, swirlScale: 2, brightness: .92, filaments: 1, coreGlow: .36, background: '#0a1424', colorA: '#9ce3ff', colorB: '#e6f7ff', glowA: '#6fd2ff', glowB: '#bfefff', quality: 1, paused: false } },
  { name: 'Plasma', settings: { size: .35, deformation: .4, lobes: 2.4, morphSpeed: 1.5, rotationSpeed: .2, glow: .98, liquidSpeed: 1, swirlScale: 2.8, brightness: 1.2, filaments: 2.15, coreGlow: .3, background: '#10061c', colorA: '#b14dff', colorB: '#ff2da0', glowA: '#9b5cff', glowB: '#ff3dbe', quality: 1, paused: false } },
  { name: 'Ghost', settings: { size: .39, deformation: .28, lobes: 2, morphSpeed: .8, rotationSpeed: .1, glow: .55, liquidSpeed: .44, swirlScale: 2.2, brightness: .85, filaments: 1.2, coreGlow: .2, background: '#070709', colorA: '#c2cbe6', colorB: '#8893b5', glowA: '#aeb8d8', glowB: '#6e7799', quality: 1, paused: false } },
  { name: 'Daylight', settings: { size: .37, deformation: .32, lobes: 2, morphSpeed: 1.1, rotationSpeed: .12, glow: .82, liquidSpeed: .5, swirlScale: 2.2, brightness: 1.05, filaments: 1.5, coreGlow: .3, background: '#eef2f8', colorA: '#2d6cff', colorB: '#b43cf0', glowA: '#3a82ff', glowB: '#a84dff', quality: 1, paused: false } },
]

const ranges: { key: keyof OrbSettings; label: string; min: number; max: number; step: number }[] = [
  { key: 'size', label: 'Size', min: .24, max: .48, step: .01 },
  { key: 'deformation', label: 'Deformation', min: 0, max: .65, step: .01 },
  { key: 'lobes', label: 'Lobes', min: .5, max: 3.2, step: .05 },
  { key: 'morphSpeed', label: 'Morph speed', min: 0, max: 2, step: .01 },
  { key: 'rotationSpeed', label: 'Rotation', min: 0, max: .6, step: .01 },
  { key: 'glow', label: 'Outer glow', min: 0, max: 1.5, step: .05 },
  { key: 'liquidSpeed', label: 'Liquid flow', min: 0, max: 2, step: .01 },
  { key: 'swirlScale', label: 'Swirl scale', min: 1, max: 4, step: .05 },
  { key: 'brightness', label: 'Brightness', min: 0, max: 2.5, step: .05 },
  { key: 'filaments', label: 'Filaments', min: 0, max: 3, step: .05 },
  { key: 'coreGlow', label: 'Core glow', min: 0, max: 1, step: .02 },
]

const colorControls: { key: keyof OrbSettings; label: string }[] = [
  { key: 'background', label: 'Background' },
  { key: 'colorA', label: 'Liquid A' },
  { key: 'colorB', label: 'Liquid B' },
  { key: 'glowA', label: 'Glow A' },
  { key: 'glowB', label: 'Glow B' },
]

function readSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') as Partial<OrbSettings>
    return { ...presets[0].settings, ...saved }
  } catch {
    return { ...presets[0].settings }
  }
}

function hexToRgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.replace('#', ''), 16)
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255]
}

function GearIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8.6a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8Z"/><path d="m19.4 13.5 1.3 1-.2 1-1.7.5-.9 1.5.4 1.7-.8.7-1.6-.6-1.5.6-.7 1.6-1 .1-1-1.4-1.7-.3-1.3 1.1-.9-.5.1-1.8-1.1-1.3-1.7-.1-.4-1 1.3-1.2v-1.7L3.8 12l.3-1 1.8-.3 1-1.4-.3-1.7.8-.7 1.6.7 1.6-.6.7-1.6 1-.1 1 1.4 1.7.3 1.3-1.1.9.5-.1 1.8 1.1 1.3 1.7.1.4 1-1.3 1.2v1.7Z"/></svg>
}

export function LiquidOrb({ onExit }: { onExit: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const settingsRef = useRef<OrbSettings>(presets[0].settings)
  const [settings, setSettings] = useState<OrbSettings>(readSettings)
  const [panelOpen, setPanelOpen] = useState(false)
  const [activePreset, setActivePreset] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) ? 'Custom' : 'Aurora' } catch { return 'Aurora' }
  })
  const [error, setError] = useState('')

  useEffect(() => {
    settingsRef.current = settings
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)) } catch { /* Optional device preference. */ }
  }, [settings])

  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setPanelOpen(false) }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [])

  useEffect(() => {
    const originalTitle = document.title
    document.title = 'Liquid Orb · The Lab'
    return () => { document.title = originalTitle }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    const gl = canvas?.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'high-performance' })
    if (!canvas || !gl) { setError('This experiment needs a browser with WebGL2.'); return }

    const vertexSource = `#version 300 es
      layout(location=0) in vec2 position;
      out vec2 uv;
      void main(){ uv = position * .5 + .5; gl_Position = vec4(position, 0., 1.); }`
    const fragmentSource = `#version 300 es
      precision highp float;
      in vec2 uv;
      out vec4 outColor;
      uniform vec2 resolution;
      uniform float clock;
      uniform float morphSpeed;
      uniform float radius;
      uniform float deformation;
      uniform float lobes;
      uniform float rotation;
      uniform float glow;
      uniform float liquidSpeed;
      uniform float swirlScale;
      uniform float brightness;
      uniform float filaments;
      uniform float coreGlow;
      uniform vec3 colorA;
      uniform vec3 colorB;
      uniform vec3 glowA;
      uniform vec3 glowB;
      uniform vec3 background;

      mat2 spin(float angle){ float c=cos(angle), s=sin(angle); return mat2(c,-s,s,c); }
      float hash(vec3 p){ p=fract(p*.1031); p+=dot(p,p.yzx+33.33); return fract((p.x+p.y)*p.z); }
      float noise(vec3 p){
        vec3 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
        return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1)),f.x),f.y),f.z);
      }
      float fbm(vec3 p){ float sum=0., amp=.5; for(int i=0;i<4;i++){ sum+=noise(p)*amp; p=p*2.03+1.7; amp*=.5; } return sum; }
      float blob(vec3 p){
        p.xy*=spin(clock*rotation*.7); p.yz*=spin(clock*rotation*.43);
        float morphClock=clock*morphSpeed;
        float f=lobes;
        float wave=sin(p.x*2.7*f+morphClock)+sin(p.y*3.1*f-morphClock*.8+1.4)+sin(p.z*2.9*f+morphClock*1.1+2.7)+sin((p.x+p.z)*2.2*f-morphClock*.65);
        return length(p)-(radius+deformation*wave*.045);
      }
      vec3 normalAt(vec3 p){
        vec2 e=vec2(.0015,0.);
        return normalize(vec3(blob(p+e.xyy)-blob(p-e.xyy),blob(p+e.yxy)-blob(p-e.yxy),blob(p+e.yyx)-blob(p-e.yyx)));
      }
      void main(){
        vec2 p=uv*2.-1.; p.x*=resolution.x/resolution.y;
        vec3 rayOrigin=vec3(0.,0.,3.0);
        vec3 rayDirection=normalize(vec3(p,-1.8));
        float travel=0., nearest=9.; bool hit=false; vec3 point=rayOrigin;
        for(int i=0;i<120;i++){
          point=rayOrigin+rayDirection*travel;
          float distance=blob(point); nearest=min(nearest,abs(distance));
          if(distance<.001){ hit=true; break; }
          travel+=max(distance*.48,.001);
          if(travel>6.) break;
        }
        vec3 energy=vec3(0.);
        if(hit){
          vec3 n=normalAt(point), view=-rayDirection;
          float fresnel=pow(1.-max(dot(n,view),0.),3.);
          vec3 samplePoint=point+rayDirection*.035;
          float transmission=1.;
          for(int i=0;i<12;i++){
            vec3 q=samplePoint*swirlScale;
            q.xy*=spin(clock*liquidSpeed*.12);
            vec3 warp=vec3(fbm(q+clock*liquidSpeed*.12),fbm(q+vec3(4.1,1.3,-clock*liquidSpeed*.1)),fbm(q.zxy+vec3(7.2,2.4,clock*liquidSpeed*.08)));
            float field=fbm(q+warp*1.9);
            float body=smoothstep(.28,.72,field);
            float thread=pow(1.-abs(field*2.-1.),7.);
            vec3 liquid=mix(colorB,colorA,.5+.5*sin(field*6.2+clock*.25+samplePoint.y*2.));
            energy+=transmission*(liquid*body*.48+liquid*thread*filaments+vec3(1.)*pow(thread,3.)*filaments*.32)*.16;
            energy+=transmission*colorA*smoothstep(.7,0.,length(samplePoint))*coreGlow*.06;
            transmission*=.84; samplePoint+=rayDirection*.1;
          }
          vec3 rim=mix(colorB,colorA,.5+.5*(n.x*.7+n.y*.4));
          energy=(energy*(1.-fresnel*.55)*brightness)+(rim*fresnel*1.35);
          vec3 halfLight=normalize(normalize(vec3(.65,.85,.55))+view);
          energy+=vec3(1.)*pow(max(dot(n,halfLight),0.),150.)*1.25;
        } else {
          float halo=exp(-nearest*7.2)*glow;
          float angle=atan(rayDirection.y,rayDirection.x);
          vec3 haloColor=mix(glowA,glowB,.5+.5*sin(angle*3.+clock*.45));
          energy+=haloColor*halo*1.35+vec3(.65,.82,1.)*pow(halo,3.)*.35;
        }
        float luminance=dot(background,vec3(.299,.587,.114));
        vec3 additive=background+energy;
        float cover=clamp(max(energy.r,max(energy.g,energy.b)),0.,1.);
        vec3 ink=mix(background,energy/(1.+energy),cover);
        outColor=vec4(clamp(mix(additive,ink,smoothstep(.35,.65,luminance)),0.,1.),1.);
      }`

    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type)
      if (!shader) throw new Error('Could not create the orb shader.')
      gl.shaderSource(shader, source); gl.compileShader(shader)
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) || 'Orb shader failed.')
      return shader
    }

    let animation = 0
    try {
      const program = gl.createProgram()
      if (!program) throw new Error('Could not create the orb renderer.')
      gl.attachShader(program, compile(gl.VERTEX_SHADER, vertexSource))
      gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragmentSource))
      gl.linkProgram(program)
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || 'Orb renderer failed.')
      gl.useProgram(program)
      const buffer = gl.createBuffer(), vao = gl.createVertexArray()
      gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW)
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0)
      const uniform = (name: string) => gl.getUniformLocation(program, name)
      const uniforms = {
        resolution: uniform('resolution'), clock: uniform('clock'), morphSpeed: uniform('morphSpeed'), radius: uniform('radius'), deformation: uniform('deformation'), lobes: uniform('lobes'), rotation: uniform('rotation'), glow: uniform('glow'), liquidSpeed: uniform('liquidSpeed'), swirlScale: uniform('swirlScale'), brightness: uniform('brightness'), filaments: uniform('filaments'), coreGlow: uniform('coreGlow'), colorA: uniform('colorA'), colorB: uniform('colorB'), glowA: uniform('glowA'), glowB: uniform('glowB'), background: uniform('background'),
      }
      let elapsed = 0, previous = performance.now()
      const render = (now: number) => {
        const current = settingsRef.current
        const dpr = Math.min(devicePixelRatio || 1, 1.45) * current.quality
        const longestSide = Math.max(canvas.clientWidth, canvas.clientHeight, 1)
        const scale = Math.min(dpr, 1400 / longestSide)
        const width = Math.max(1, Math.floor(canvas.clientWidth*scale)), height = Math.max(1, Math.floor(canvas.clientHeight*scale))
        if(canvas.width!==width || canvas.height!==height){ canvas.width=width; canvas.height=height }
        const delta = Math.min((now-previous)/1000,.05); previous=now
        if(!current.paused) elapsed+=delta
        gl.viewport(0,0,width,height)
        gl.uniform2f(uniforms.resolution,width,height); gl.uniform1f(uniforms.clock,elapsed); gl.uniform1f(uniforms.morphSpeed,current.morphSpeed)
        gl.uniform1f(uniforms.radius,current.size); gl.uniform1f(uniforms.deformation,current.deformation); gl.uniform1f(uniforms.lobes,current.lobes); gl.uniform1f(uniforms.rotation,current.rotationSpeed); gl.uniform1f(uniforms.glow,current.glow); gl.uniform1f(uniforms.liquidSpeed,current.liquidSpeed); gl.uniform1f(uniforms.swirlScale,current.swirlScale); gl.uniform1f(uniforms.brightness,current.brightness); gl.uniform1f(uniforms.filaments,current.filaments); gl.uniform1f(uniforms.coreGlow,current.coreGlow)
        gl.uniform3fv(uniforms.colorA,hexToRgb(current.colorA)); gl.uniform3fv(uniforms.colorB,hexToRgb(current.colorB)); gl.uniform3fv(uniforms.glowA,hexToRgb(current.glowA)); gl.uniform3fv(uniforms.glowB,hexToRgb(current.glowB)); gl.uniform3fv(uniforms.background,hexToRgb(current.background))
        gl.drawArrays(gl.TRIANGLE_STRIP,0,4)
        animation=requestAnimationFrame(render)
      }
      animation=requestAnimationFrame(render)
      return () => { cancelAnimationFrame(animation); gl.deleteProgram(program); gl.deleteBuffer(buffer); gl.deleteVertexArray(vao) }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The orb could not start.')
      return () => cancelAnimationFrame(animation)
    }
  }, [])

  function update<K extends keyof OrbSettings>(key: K, value: OrbSettings[K]) {
    setActivePreset('Custom')
    setSettings(current => ({ ...current, [key]: value }))
  }

  function applyPreset(preset: Preset) {
    setActivePreset(preset.name)
    setSettings({ ...preset.settings, quality: settings.quality })
  }

  function surprise() {
    const colors = ['#4099ff','#e633bf','#ff6b35','#ffe66d','#57ff3c','#00ffc8','#9b5cff','#ff3dbe','#bfefff']
    const pick = () => colors[Math.floor(Math.random()*colors.length)]
    setActivePreset('Custom')
    setSettings(current => ({ ...current, deformation: .18+Math.random()*.35, lobes: 1+Math.random()*2, morphSpeed: .45+Math.random()*1.25, rotationSpeed: .05+Math.random()*.3, glow: .45+Math.random()*.75, liquidSpeed: .25+Math.random()*1.4, swirlScale: 1.4+Math.random()*2.2, filaments: .6+Math.random()*2.2, colorA: pick(), colorB: pick(), glowA: pick(), glowB: pick() }))
  }

  const backgroundRgb = hexToRgb(settings.background)
  const lightBackground = backgroundRgb[0] * .299 + backgroundRgb[1] * .587 + backgroundRgb[2] * .114 > .58

  return <main className={`lo ${lightBackground ? 'light' : ''}`} style={{ '--lo-bg': settings.background } as React.CSSProperties}>
    <canvas ref={canvasRef} className="lo-canvas" aria-label="Animated liquid orb" />
    <header className="lo-header">
      <button className="lo-round" onClick={onExit} aria-label="Return to The Lab">←</button>
      <div className="lo-title"><span>THE LAB · LIGHT STUDY</span><h1>Liquid Orb</h1></div>
      <button className={`lo-round ${panelOpen ? 'active' : ''}`} onClick={() => setPanelOpen(open => !open)} aria-label="Orb settings" aria-expanded={panelOpen}><GearIcon /></button>
    </header>

    {error && <section className="lo-error"><strong>The orb is resting.</strong><p>{error}</p><button onClick={onExit}>Return to The Lab</button></section>}

    <nav className="lo-presets" aria-label="Orb presets">
      {presets.map(preset => <button key={preset.name} className={activePreset === preset.name ? 'active' : ''} onClick={() => applyPreset(preset)}>
        <i style={{ background: `radial-gradient(circle at 35% 30%, ${preset.settings.colorA}, ${preset.settings.colorB} 55%, ${preset.settings.background} 76%)` }} />
        <span>{preset.name}</span>
      </button>)}
    </nav>

    {panelOpen && <div className="lo-scrim" onPointerDown={() => setPanelOpen(false)} />}
    <aside className={`lo-panel ${panelOpen ? 'open' : ''}`} aria-hidden={!panelOpen}>
      <div className="lo-panel-head"><div><span>LIVE CONTROLS</span><h2>Shape the light.</h2></div><button onClick={() => setPanelOpen(false)} aria-label="Close settings">×</button></div>
      <div className="lo-panel-actions"><button onClick={surprise}>Surprise me</button><button onClick={() => applyPreset(presets[0])}>Reset</button></div>
      <section className="lo-control-group"><h3>Shape & motion</h3>
        {ranges.slice(0,5).map(control => <label key={control.key}>{control.label}<output>{Number(settings[control.key]).toFixed(control.step < .05 ? 2 : 1)}</output><input type="range" min={control.min} max={control.max} step={control.step} value={settings[control.key] as number} onChange={event => update(control.key, Number(event.target.value))} /></label>)}
      </section>
      <section className="lo-control-group"><h3>Color</h3><div className="lo-colors">
        {colorControls.map(control => <label key={control.key}><input type="color" value={settings[control.key] as string} onChange={event => update(control.key, event.target.value)} /><span>{control.label}</span></label>)}
      </div></section>
      <section className="lo-control-group"><h3>Light & liquid</h3>
        {ranges.slice(5).map(control => <label key={control.key}>{control.label}<output>{Number(settings[control.key]).toFixed(1)}</output><input type="range" min={control.min} max={control.max} step={control.step} value={settings[control.key] as number} onChange={event => update(control.key, Number(event.target.value))} /></label>)}
      </section>
      <section className="lo-control-group lo-performance"><h3>Comfort & performance</h3>
        <label className="lo-toggle"><input type="checkbox" checked={settings.paused} onChange={event => update('paused', event.target.checked)} /><span>Pause motion</span></label>
        <label>Render quality<output>{Math.round(settings.quality*100)}%</output><input type="range" min="0.55" max="1" step="0.05" value={settings.quality} onChange={event => update('quality', Number(event.target.value))} /></label>
      </section>
      <p className="lo-credit">Inspired by <a href="https://codepen.io/TaminoMartinius/pen/MYJEyer" target="_blank" rel="noreferrer">Tamino Martinius’s Liquid Gooey Orb</a>. This Lab version uses an original shader and controls.</p>
    </aside>
  </main>
}
