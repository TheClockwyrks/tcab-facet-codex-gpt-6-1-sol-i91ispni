"""One-time original Facet asset production. Not part of the build."""
import json, math, subprocess, pathlib
ROOT=pathlib.Path(__file__).resolve().parents[1]
TMP=pathlib.Path('/tmp/facet-assets'); TMP.mkdir(exist_ok=True)
OUT=ROOT/'public/assets'
def run(tool,*args):
 r=subprocess.run([tool,*map(str,args)],capture_output=True,text=True)
 if r.returncode: raise RuntimeError(r.stderr+r.stdout)
def cfg(name,**fields):
 p=TMP/(name+'.json'); p.write_text(json.dumps(fields)); return p
def rect(ops,x,y,w,h,c): ops.append(dict(op='fill_rect',x=int(x),y=int(y),width=int(w),height=int(h),color=c))
def poly(ops,pts,c):
 for y in range(max(0,math.floor(min(p[1] for p in pts))),min(64,math.ceil(max(p[1] for p in pts))+1)):
  xs=[]
  for a,b in zip(pts,pts[1:]+pts[:1]):
   if (a[1]<=y+.5<b[1]) or (b[1]<=y+.5<a[1]): xs.append(a[0]+(y+.5-a[1])*(b[0]-a[0])/(b[1]-a[1]))
  if len(xs)>1:
   l=math.ceil(min(xs)); r=math.floor(max(xs));
   if r>=l: rect(ops,l,y,r-l+1,1,c)
def line(ops,a,b,c):
 # Rasterized lines keep action logs compatible across tools.
 n=int(max(abs(a[0]-b[0]),abs(a[1]-b[1])))+1
 for i in range(n):
  t=i/max(1,n-1); rect(ops,round(a[0]+(b[0]-a[0])*t),round(a[1]+(b[1]-a[1])*t),1,1,c)
def render(ops,path,size=64,sheet=False):
 path.parent.mkdir(parents=True,exist_ok=True); log=TMP/'pixels.json'; log.write_text(json.dumps(ops))
 run('draw-sheet' if sheet else 'draw','render','--actions',log,'--out',path,'--width',size,'--height',size,'--no-layers')
colors=['#e6517c','#f7a34b','#e7d45d','#56cc95','#63dce5','#578de6','#b688e4']
names=['ruby','amber','citrine','jade','beryl','sapphire','amethyst']
shapes=[[(32,5),(52,22),(48,44),(32,58),(12,44),(12,22)],[(22,8),(43,8),(56,27),(45,52),(19,52),(8,27)],[(32,5),(56,31),(32,58),(8,31)],[(19,9),(45,9),(55,20),(55,44),(44,55),(20,55),(9,44),(9,20)],[(32,4),(51,18),(51,46),(32,59),(13,46),(13,18)],[(32,5),(57,44),(46,54),(18,54),(7,44)],[(22,6),(42,6),(54,20),(54,43),(42,57),(22,57),(10,43),(10,20)]]
def tint(c,f):
 rgb=[int(c[i:i+2],16) for i in (1,3,5)]; return '#'+''.join(f'{int(v*f if f<1 else v+(255-v)*(f-1)):02x}' for v in rgb)
def gem(k,strain,turn=0):
 ops=[]; pts=shapes[k] if k<7 else [(32+math.cos(i*math.pi/4+turn)*27,32+math.sin(i*math.pi/4+turn)*27) for i in range(8)]
 c=colors[k] if k<7 else '#bfe8ef'; poly(ops,pts,'#081820')
 inner=[(32+(x-32)*.92,32+(y-32)*.92) for x,y in pts]
 for i,(a,b) in enumerate(zip(inner,inner[1:]+inner[:1])):
  col=tint(c,[1.45,.9,.55,.7,1.1,1.65,1.2,.8][i%8]) if k<7 else colors[i%7]
  poly(ops,[a,b,(29,29)],col)
 core=[(29+(x-32)*.4,29+(y-32)*.4) for x,y in pts]; poly(ops,core,tint(c,1.15));
 for a in core: line(ops,(29,29),a,tint(c,.8))
 line(ops,inner[0],inner[1],tint(c,1.8)); rect(ops,22,19,4,2,'#ffffff'); rect(ops,21,21,2,2,'#ffffff')
 cracks=[[(35,8),(30,22),(36,30),(25,40),(27,53)],[(11,28),(24,30),(30,22),(43,24),(51,18)],[(48,45),(37,38),(36,30),(43,34),(51,32)]]
 for crack in cracks[:strain]:
  for a,b in zip(crack,crack[1:]):
   line(ops,(a[0]+1,a[1]),(b[0]+1,b[1]),'#ffe2c0' if strain==3 else '#c1f0ef'); line(ops,a,b,'#131b2a')
 if strain==3:
  for x,y in [(17,39),(42,13),(45,45)]: rect(ops,x,y,3,3,'#fff4de')
 return ops
for k,name in enumerate(names+['prism']):
 for strain in range(4): render(gem(k,strain),OUT/'gems'/f'{name}-{strain}.png')
for cut in ['brilliant','star']:
 ops=[]
 if cut=='brilliant':
  pts=[(32+math.cos(i*math.pi/4)*28,32+math.sin(i*math.pi/4)*28) for i in range(8)]
  for a,b in zip(pts,pts[1:]+pts[:1]): line(ops,a,b,'#fff0af');
  for x,y in [(32,5),(5,32),(59,32),(32,59)]: rect(ops,x-1,y-1,3,3,'#ffffff')
 else:
  pts=[(32+math.sin(i*math.pi/4)*(27 if i%2==0 else 11),32-math.cos(i*math.pi/4)*(27 if i%2==0 else 11)) for i in range(8)]
  for a,b in zip(pts,pts[1:]+pts[:1]): line(ops,a,b,'#fff7d2')
  poly(ops,[(32,24),(39,32),(32,40),(25,32)],'#ffedaf')
 render(ops,OUT/'gems'/f'{cut}.png')
for k,name in enumerate(names):
 for f in range(6):
  ops=[]
  if f==0: ops=gem(k,3)
  else:
   for i in range(7):
    a=i*math.tau/7; d=5+f*4; x=32+math.cos(a)*d; y=32+math.sin(a)*d
    poly(ops,[(x,y-7+f),(x+6-f,y+4),(x-5+f,y+5)],tint(colors[k],1.4 if i%2 else .8))
  render(ops,OUT/'gems/break'/name/f'{f}.png',sheet=True)
for f in range(8): render(gem(7,0,f*math.pi/32),OUT/'gems/prism-turn'/f'{f}.png',sheet=True)
# Engraved, layered bronze board surround; cells are recessed slate in this produced sprite.
ops=[]
for inset,col in [(0,'#111c25'),(2,'#455052'),(4,'#c2a36c'),(6,'#564c3e'),(9,'#1d2a33'),(12,'#8d7955'),(14,'#101f29')]: rect(ops,inset,inset,608-2*inset,608-2*inset,col)
for row in range(8):
 for col in range(8):
  x=16+col*72; y=16+row*72; rect(ops,x,y,72,72,'#1c303b'); rect(ops,x+1,y+1,70,70,'#142731'); rect(ops,x+4,y+4,64,64,'#172b35'); rect(ops,x+10,y+10,52,1,'#213944')
for x,y in [(7,7),(599,7),(7,599),(599,599)]:
 rect(ops,x-2,y-2,5,5,'#dbc28c'); rect(ops,x,y,1,1,'#f8efd3')
render(ops,OUT/'gems/board-frame.png',608)
# Real authored particle systems.
for name,count,speed,color in [('clear',12,65,'#a6f5ed'),('flawed',30,130,'#ffb477'),('cut',22,90,'#ffe9a1'),('aura',0,12,'#e9d7a1')]:
 p=cfg('fx-'+name,width=128,height=128,duration_ms=1200,fps=30,seed=41,actions=str(TMP/(name+'-ops.json')),preview=str(TMP/(name+'.gif')),system=str(OUT/'fx'/name/'system.json'))
 (OUT/'fx'/name).mkdir(exist_ok=True)
 run('particle-2d','--config',p,'init')
 args=['add-emitter','--name','sparks','--shape','disc','--x',0,'--y',0,'--radius',22 if name=='aura' else 3,'--lifetime',650,'--speed',speed,'--cone-angle',180,'--speed-spread',speed*.4]
 args += ['--rate',8] if name=='aura' else ['--burst',count]
 run('particle-2d','--config',p,*args)
 run('particle-2d','--config',p,'set-particle','--emitter','sparks','--size-from',.65 if name=='aura' else 1.2,'--size-to',0,'--opacity-from',.65,'--opacity-to',0,'--color-gradient',color+'@0,#ffffff@0.2,'+color+'@1')
 run('particle-2d','--config',p,'set-forces','--drag',2,'--gravity',30 if name!='aura' else 0)
 if name=='aura': run('particle-2d','--config',p,'set-timeline','--loop','true')
 run('particle-2d','--config',p,'render','--frame',8,'--out',TMP/(name+'.png'))
# Distinct designed synth cues, followed by glass body and scored music.
for name,freq,dur in [('select',780,65),('swap',420,130),('refuse',100,120),('land',75,200),('flaw',170,95),('cut',1100,450),('levelup',520,800),('gameover',350,1000)]+[(f'ladder-{i+1}',440*2**(i/12),380) for i in range(8)]:
 p=cfg('audio-'+name,sample_rate=22050,channels='stereo',max_duration_ms=dur+300,seed=23,actions=str(TMP/(name+'-audio.json')),preview=str(TMP/(name+'-audio.png')),wav=str(OUT/'audio'/f'{name}.wav'))
 run('sfx-synth','--config',p,'init')
 run('sfx-synth','--config',p,'add-voice','--name','bell','--wave',('square' if name=='refuse' else 'triangle') if name not in ['flaw'] else 'noise','--freq',freq,'--dur',dur,'--gain',-17)
 run('sfx-synth','--config',p,'set-envelope','--voice','bell','--env','gate' if name=='refuse' else 'pluck')
 if name in ['levelup','gameover','swap']: run('sfx-synth','--config',p,'set-pitch','--voice','bell','--slide-to',freq*(2 if name!='gameover' else .35),'--over',dur)
 if name=='cut' or name.startswith('ladder'): run('sfx-synth','--config',p,'add-fm','--voice','bell','--modulator',2,'--index',1.5)
 run('sfx-synth','--config',p,'render')
p=cfg('shatter',sample_rate=22050,channels='stereo',max_duration_ms=700,seed=23,sample_pack='combat-core',actions=str(TMP/'shatter-ops.json'),preview=str(TMP/'shatter.png'),wav=str(OUT/'audio/shatter.wav'))
run('sfx-sample','--config',p,'init'); run('sfx-sample','--config',p,'add-sample','--name','debris_glass','--t',0,'--gain',-8,'--fade-out',180); run('sfx-sample','--config',p,'render')
for name,bpm in [('title',104),('play',76)]:
 p=cfg('music-'+name,sample_rate=22050,channels='stereo',max_duration_ms=int(32*60000/bpm),seed=34,instrument_bank='gm-lite',actions=str(TMP/(name+'-music.json')),preview=str(TMP/(name+'-score.png')),wav=str(OUT/'audio'/f'{name}.wav'),mid=str(OUT/'audio'/f'{name}.mid'))
 run('music','--config',p,'init'); run('music','--config',p,'set-tempo','--bpm',bpm)
 for tr,inst,gain in [('melody','music_box',-9),('chords','vibraphone',-14),('bass','marimba',-11)]:
  run('music','--config',p,'define-track','--name',tr,'--instrument',inst); run('music','--config',p,'set-track-fx','--track',tr,'--gain',gain,'--reverb',.23)
 hook=[76,79,83,81,79,74,76,71,72,76,79,78,76,74,71,74]
 for beat in range(32):
  if name=='title' or beat%2==0: run('music','--config',p,'add-note','--track','melody','--pitch',hook[beat%16]-(12 if name=='play' else 0),'--t',beat,'--dur',.7 if name=='title' else 1.5,'--velocity',65)
  if beat%4==0:
   root=[52,48,55,50][(beat//4)%4]; run('music','--config',p,'add-note','--track','bass','--pitch',root-12,'--t',beat,'--dur',3,'--velocity',65)
   for note in [root,root+7,root+12]: run('music','--config',p,'add-note','--track','chords','--pitch',note,'--t',beat+.2,'--dur',3,'--velocity',48)
 run('music','--config',p,'render')
print('All Facet assets produced.')
