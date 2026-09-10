"""Amberjaw Staglord: six-legged plated beetle with articulated amber-edged pincers."""
import sys,math
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent.parent))
from endgame_rig import Creature,ease
spec={'root':((0,0,0),None),'body':((0,.2,1),'root'),'head':((0,-1,1.1),'body')}
for sign,side in [(1,'L'),(-1,'R')]:
 spec['jaw.'+side]=((sign*.36,-1.5,1.04),'head')
 for j,y in enumerate([-.8,.15,1.05]):
  spec[f'leg{j}.{side}']=((sign*.7,y,1),'body');spec[f'knee{j}.{side}']=((sign*1.35,y-.1,.68),f'leg{j}.{side}')
b=Creature(__file__,spec)
shell=b.mat('Mahogany carapace','#643321');plate=b.mat('Copper shell plates','#915239');edge=b.mat('Amber horn edges','#db994b');joint=b.mat('Dark bronze joints','#443328');belly=b.mat('Ochre underside','#886449');eye=b.mat('Amber eyes','#efa039',.2);black=b.mat('Obsidian sockets','#15100d',.26)
b.ell('Heavy abdomen',(0,.55,1.22),(1.02,1.3,.75),shell,'body',20,10)
for side in [-1,1]:
 b.ell('Wing case '+str(side),(side*.44,.63,1.56),(.6,1.2,.51),plate,'body',18,9)
 b.tube('Wing seam '+str(side),[(side*.07,-.38,1.93),(side*.08,.55,2.05),(side*.12,1.5,1.78)],[.035,.045,.015],edge,'body',6)
for sign in [-1,1]:
 for j,y in enumerate([-.02,.48,.96,1.38]):
  z=1.92-abs(y-.55)*.2
  b.blade('Overlapping wing armor '+str(sign)+str(j),[(sign*.12,y-.19,z),(sign*.8,y-.14,z-.07),(sign*.95,y+.22,z-.23),(sign*.38,y+.33,z-.01)],.10,shell,'body')
b.ell('Thorax',(0,-.65,1.25),(.87,.6,.6),plate,'body',16,8)
for sign,side in [(1,'L'),(-1,'R')]:
 b.tube('Shoulder horn '+side,[(sign*.62,-.66,1.6),(sign*.85,-.64,2.08),(sign*.7,-.86,2.48)],[.28,.2,.01],edge,'body',9)
 b.tube('Horn core '+side,[(sign*.63,-.7,1.65),(sign*.85,-.66,2.08),(sign*.72,-.85,2.43)],[.22,.13,.01],shell,'body',8)
b.ell('Head shield',(0,-1.23,1.17),(.64,.61,.43),shell,'head',16,8)
b.ell('Forehead plate',(0,-1.36,1.49),(.42,.45,.16),plate,'head',12,6)
for sign,side in [(1,'L'),(-1,'R')]:
 b.ell('Eye socket '+side,(sign*.54,-1.46,1.3),(.17,.22,.19),black,'head',10,5)
 b.ell('Amber eye '+side,(sign*.65,-1.51,1.34),(.075,.1,.09),eye,'head',10,5)
 jaw='jaw.'+side
 pts=[(sign*.38,-1.6,1.05),(sign*.82,-1.88,.98),(sign*1.08,-2.32,.85),(sign*.84,-2.73,.74),(sign*.3,-2.93,.73)]
 b.tube('Great mandible '+side,pts,[.28,.32,.25,.14,.008],plate,jaw,10)
 b.tube('Mandible amber rim '+side,[(x+sign*.1,y-.045,z+.07) for x,y,z in pts],[.07,.08,.07,.055,.003],edge,jaw,7)
 for k in [1,2]:
  x,y,z=pts[k];b.tube('Inward tooth '+side+str(k),[(x,y,z),(x-sign*.37,y-.12,z+.02)],[.17,.003],edge,jaw,7)
 for j,y in enumerate([-.8,.15,1.05]):
  leg=f'leg{j}.{side}';knee=f'knee{j}.{side}'
  b.ell('Hip '+leg,(sign*.84,y,1.01),(.25,.28,.25),joint,leg,10,5)
  b.tube('Femur '+leg,[(sign*.8,y,1),(sign*1.28,y-.1,.83),(sign*1.4,y-.18,.6)],[.2,.26,.14],plate,leg,9)
  b.tube('Shin '+knee,[(sign*1.35,y-.1,.68),(sign*1.58,y-.27,.35),(sign*1.66,y-.42,.12)],[.2,.18,.095],plate,knee,8)
  b.ell('Foot '+knee,(sign*1.66,y-.49,.09),(.21,.25,.09),joint,knee,10,5)
  for toe in [-1,1]:b.tube('Claw '+knee+str(toe),[(sign*1.66+toe*.1,y-.61,.11),(sign*1.67+toe*.16,y-.8,.035)],[.065,.004],edge,knee,6)
def idle(t):
 b.loc('body',z=.022*math.sin(t*math.tau));b.rot('head',x=.025*math.sin(t*math.tau))
 for sign,side in [(1,'L'),(-1,'R')]:b.rot('jaw.'+side,z=sign*.025*math.sin(t*math.tau+.4))
def gait(t,run=False):
 w=t*math.tau;b.loc('body',z=(.075 if run else .018)*(1-math.cos(w*2)));b.rot('body',x=-.07 if run else 0,z=.025*math.sin(w))
 for sign,side in [(1,'L'),(-1,'R')]:
  for j in range(3):
   p=w+(math.pi if (j+(sign==1))%2 else 0);s=math.sin(p);lift=max(0,s)
   b.rot(f'leg{j}.{side}',x=(.52 if run else .25)*math.cos(p),z=sign*.055*s);b.loc(f'leg{j}.{side}',z=(.14 if run else .05)*lift)
   b.rot(f'knee{j}.{side}',x=-(.42 if run else .2)*math.cos(p),y=sign*.12*lift)
def attack(t):
 wind=ease(t/.4)*(1-ease((t-.43)/.12));strike=ease((t-.43)/.12)*(1-ease((t-.61)/.39))
 b.loc('body',y=.12*wind-.22*strike);b.rot('head',x=-.12*wind+.15*strike)
 for sign,side in [(1,'L'),(-1,'R')]:b.rot('jaw.'+side,z=sign*(.4*wind-.16*strike))
def hit(t):
 q=math.sin(math.pi*t);b.rot('body',y=.13*q);b.rot('head',x=-.16*q)
def death(t):
 q=ease(t/.8);b.rot('root',y=1.5*q);b.rot('body',y=.32*q);b.rot('head',x=.2*q)
 for sign,side in [(1,'L'),(-1,'R')]:
  for j in range(3):b.rot(f'leg{j}.{side}',y=-sign*.45*q);b.rot(f'knee{j}.{side}',y=sign*.8*q)
a=b.action('idle',48,idle);b.action('walk',36,lambda t:gait(t));b.action('run',22,lambda t:gait(t,True));b.action('attack',26,attack);b.action('hit',12,hit);b.action('death',36,death);b.save(a)
