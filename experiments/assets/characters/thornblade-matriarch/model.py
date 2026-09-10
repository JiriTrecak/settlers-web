"""Thornblade Matriarch: leaf-armored mantis with two independently rigged scythes."""
import sys,math
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent.parent))
from endgame_rig import Creature,ease
spec={'root':((0,0,0),None),'body':((0,.2,1.1),'root'),'thorax':((0,-.25,1.35),'body'),'head':((0,-.7,2.85),'thorax')}
for sign,side in [(1,'L'),(-1,'R')]:
 spec['arm.'+side]=((sign*.34,-.52,2.35),'thorax');spec['scythe.'+side]=((sign*.92,-1.16,2.55),'arm.'+side)
 for j,y in enumerate([-.15,.95]):
  spec[f'leg{j}.{side}']=((sign*.47,y,1.2),'body');spec[f'knee{j}.{side}']=((sign*1.04,y+.12,.66),f'leg{j}.{side}')
b=Creature(__file__,spec)
shell=b.mat('Moss green plates','#637540');edge=b.mat('Golden leaf margins','#baa165');joint=b.mat('Umber joints','#645032');belly=b.mat('Olive underside','#47502e');blade=b.mat('Ivory cutting edges','#d6c392');dark=b.mat('Green obsidian eyes','#17271b',.2);shine=b.mat('Eye highlight','#d5e4ae',.16)
b.ell('Long abdomen',(0,.87,1.37),(.64,1.38,.57),belly,'body',18,8)
for j,y in enumerate([.3,.75,1.17,1.57,1.9]):
 width=[.6,.7,.65,.51,.3][j]
 b.ell('Abdomen plate '+str(j),(0,y,1.63),(width,.49,.36),shell,'body',14,6)
 b.tube('Segment rim '+str(j),[(-width*.8,y-.22,1.73),(0,y-.29,1.96),(width*.8,y-.22,1.73)],[.025,.035,.025],edge,'body',6)
b.tube('Rising thorax',[(0,-.14,1.3),(0,-.4,2.2),(0,-.66,2.88)],[.34,.26,.29],shell,'thorax',12)
for sign,side in [(1,'L'),(-1,'R')]:
 for j,z in enumerate([1.78,2.18,2.57]):
  b.blade('Leaf shoulder '+side+str(j),[(sign*.12,-.18,z-.22),(sign*.5,.06,z+.19),(sign*.32,-.01,z+.48),(sign*.06,-.25,z+.12)],.14,shell,'thorax')
# The head is a broad triangular volume rather than a sphere.
b.mesh('Triangular head',[(-.56,-.7,3.12),(.56,-.7,3.12),(0,-1.0,2.67),(-.4,-.37,3.07),(.4,-.37,3.07),(0,-.64,2.63)],[(0,1,2),(5,4,3),(0,3,4,1),(1,4,5,2),(2,5,3,0)],shell,'head',False)
for sign,side in [(1,'L'),(-1,'R')]:
 b.ell('Large eye '+side,(sign*.46,-.78,3.03),(.21,.18,.23),dark,'head',14,7)
 b.ell('Eye glint '+side,(sign*.48,-.93,3.12),(.055,.018,.055),shine,'head',8,4)
 b.tube('Antenna '+side,[(sign*.23,-.64,3.2),(sign*.37,-.65,3.55),(sign*.57,-.81,3.89)],[.055,.04,.008],edge,'head',7)
 b.tube('Small mandible '+side,[(sign*.12,-.88,2.74),(sign*.14,-1.04,2.64),(sign*.03,-1.08,2.6)],[.085,.06,.002],blade,'head',7)
 arm='arm.'+side;scythe='scythe.'+side
 b.ell('Shoulder joint '+side,(sign*.35,-.55,2.34),(.19,.2,.19),joint,arm,10,5)
 b.tube('Forearm '+side,[(sign*.36,-.56,2.3),(sign*.69,-.82,2.03),(sign*.92,-1.16,2.55)],[.17,.2,.15],shell,arm,10)
 b.ell('Scythe hinge '+side,(sign*.93,-1.17,2.55),(.18,.19,.18),edge,scythe,10,5)
 outline=[(sign*.92,-1.2,2.59),(sign*1.25,-1.24,2.35),(sign*1.48,-1.27,1.93),(sign*1.49,-1.28,1.4),(sign*1.25,-1.32,.98),(sign*1.34,-1.26,1.47),(sign*1.18,-1.22,1.83),(sign*.83,-1.2,2.25)]
 b.blade('Swept scythe '+side,outline,.24,shell,scythe)
 b.tube('Ivory edge '+side,[outline[k] for k in [4,5,6,7,0]],[.005,.045,.075,.09,.02],blade,scythe,7)
 for k in range(4):
  z=1.48+k*.21;x=sign*(1.32-(z-1.48)*.46)
  b.blade('Serrated inner blade '+side+str(k),[(x,-1.34,z),(x-sign*.21,-1.34,z+.1),(x-sign*.06,-1.34,z+.17)],.13,blade,scythe)
 for j,y in enumerate([-.15,.95]):
  leg=f'leg{j}.{side}';knee=f'knee{j}.{side}'
  b.ell('Hip '+leg,(sign*.5,y,1.24),(.18,.19,.17),joint,leg,10,5)
  b.tube('Upper leg '+leg,[(sign*.49,y,1.2),(sign*.81,y+.08,1.06),(sign*1.06,y+.12,.66)],[.13,.17,.13],shell,leg,8)
  b.tube('Lower leg '+knee,[(sign*1.04,y+.12,.66),(sign*1.29,y-.04,.29),(sign*1.52,y-.19,.09)],[.15,.12,.075],shell,knee,8)
  b.ell('Foot '+knee,(sign*1.53,y-.28,.07),(.18,.23,.07),joint,knee,10,5)
  for k in [-1,1]:b.tube('Toe '+knee+str(k),[(sign*1.53+k*.08,y-.37,.09),(sign*1.56+k*.14,y-.52,.02)],[.055,.004],blade,knee,6)
def idle(t):
 w=t*math.tau;b.loc('body',z=.02*math.sin(w));b.rot('thorax',z=.025*math.sin(w));b.rot('head',z=.055*math.sin(w+.6))
 for sign,side in [(1,'L'),(-1,'R')]:b.rot('arm.'+side,x=.025*math.sin(w+sign));b.rot('scythe.'+side,x=.03*math.sin(w+sign+.5))
def gait(t,run=False):
 w=t*math.tau;b.loc('body',z=(.1 if run else .025)*(1-math.cos(w*2)));b.rot('thorax',x=-.14 if run else -.03,z=.025*math.sin(w))
 for sign,side in [(1,'L'),(-1,'R')]:
  for j in range(2):
   p=w+(math.pi if (j+(sign==1))%2 else 0);lift=max(0,math.sin(p))
   b.rot(f'leg{j}.{side}',x=(.55 if run else .25)*math.cos(p));b.loc(f'leg{j}.{side}',z=(.16 if run else .05)*lift);b.rot(f'knee{j}.{side}',x=-(.5 if run else .23)*math.cos(p),y=sign*.12*lift)
  b.rot('arm.'+side,x=.18 if run else .06,z=sign*.05*math.cos(w));b.rot('scythe.'+side,x=0)
def attack(t):
 wind=ease(t/.38)*(1-ease((t-.43)/.12));strike=ease((t-.43)/.12)*(1-ease((t-.61)/.39))
 b.rot('thorax',x=.15*wind-.17*strike,z=.09*wind-.09*strike);b.loc('body',y=.08*wind-.19*strike)
 for sign,side in [(1,'L'),(-1,'R')]:
  b.rot('arm.'+side,x=.5*wind-.48*strike,z=sign*(.16*wind-.1*strike));b.rot('scythe.'+side,x=-.5*wind+.38*strike)
def hit(t):
 q=math.sin(math.pi*t);b.rot('thorax',x=.17*q);b.rot('head',x=-.2*q)
def death(t):
 q=ease(t/.9);b.rot('root',y=1.45*q);b.rot('thorax',x=-.75*q);b.rot('head',x=.3*q);b.rot('body',y=.18*q)
 for sign,side in [(1,'L'),(-1,'R')]:
  b.rot('arm.'+side,x=-.25*q,z=sign*.2*q)
  for j in range(2):b.rot(f'leg{j}.{side}',y=-sign*.5*q);b.rot(f'knee{j}.{side}',y=sign*.7*q)
a=b.action('idle',48,idle);b.action('walk',34,lambda t:gait(t));b.action('run',20,lambda t:gait(t,True));b.action('attack',24,attack);b.action('hit',12,hit);b.action('death',40,death);b.save(a)
