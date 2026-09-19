# Independent animation clips. All keyed bones use the same rest-axis convention (+Y).
rig.animation_data_create()
for p in rig.pose.bones:p.rotation_mode='XYZ'
def pose(name,frame,angles):
    p=rig.pose.bones[name];p.rotation_euler=angles;p.keyframe_insert('rotation_euler',frame=frame,group=name)
def reset_pose():
    for p in rig.pose.bones:p.rotation_euler=(0,0,0);p.location=(0,0,0);p.scale=(.001,.001,.001) if p.name.startswith('tool_') else (1,1,1)

def make_action(name,length,fn):
    reset_pose();action=bpy.data.actions.new(name);rig.animation_data.action=action
    for frame in range(1,length+2):
        t=(frame-1)/length;reset_pose();fn(t)
        for p in rig.pose.bones:
            p.keyframe_insert('rotation_euler',frame=frame,group=p.name)
            if p.name=='arrow' or p.name.startswith('tool_'):p.keyframe_insert('scale',frame=frame,group=p.name)
            if p.name in ('hips','root','bow_draw','mortar'):p.keyframe_insert('location',frame=frame,group=p.name)
    action.use_fake_user=True
    track=rig.animation_data.nla_tracks.new();track.name=name
    strip=track.strips.new(name,1,action);track.mute=True
    return action

def ease(t):
    t=max(0,min(1,t));return t*t*(3-2*t)
def curve(t,keys):
    for (a,x),(b,y) in zip(keys,keys[1:]):
        if t<=b:return x+(y-x)*ease((t-a)/(b-a))
    return keys[-1][1]
def rot(name,x=0,y=0,z=0):rig.pose.bones[name].rotation_euler=(x,y,z)
def secondary(t,amount=1):
    for side,sign in [('L',1),('R',-1)]:
        rot('antenna.'+side,.055*amount*math.sin(t*math.tau-.7+sign*.45),0,sign*.025*math.sin(t*math.tau-1))

def idle(t):
    breath=math.sin(t*math.tau)
    rot('spine',-.025+.018*breath,0,.014*breath)
    rot('head',.02-.009*breath,0,.022*math.sin(t*math.tau-.5))
    for side,sign in [('L',1),('R',-1)]:
        rot('upper_arm.'+side,-.07+.014*math.sin(t*math.tau+sign*.3),0,sign*.025)
        rot('forearm.'+side,-.16-.018*breath)
    secondary(t)

def leg_ik(side,target):
    hip=Vector(spec['thigh.'+side][0])+rig.pose.bones['hips'].location
    knee=Vector(spec['shin.'+side][0]);ankle=Vector(spec['foot.'+side][0])
    resthip=Vector(spec['thigh.'+side][0]);a=(knee-resthip).length;b=(ankle-knee).length
    v=Vector(target)-hip;d=min(v.length,a+b-.001);direction=v.normalized()
    pole=Vector((0,-1,0));bend=(pole-direction*pole.dot(direction)).normalized()
    along=(a*a-b*b+d*d)/(2*d)
    joint=hip+direction*along+bend*math.sqrt(max(0,a*a-along*along))
    upper=(knee-resthip).rotation_difference(joint-hip)
    lower=(ankle-knee).rotation_difference(hip+direction*d-joint)
    rig.pose.bones['thigh.'+side].rotation_euler=upper.to_euler()
    rig.pose.bones['shin.'+side].rotation_euler=(upper.inverted()@lower).to_euler()
    rig.pose.bones['foot.'+side].rotation_euler=lower.inverted().to_euler()

def walk(t):
    wave=math.sin(t*math.tau)
    rig.pose.bones['hips'].location=(.018*wave,0,-.025+.012*math.cos(t*math.tau*2))
    for side,sign in [('L',1),('R',-1)]:
        phase=(t+(0 if sign==1 else .5))%1
        # Grounded stance travels backward; swing clears the floor and eases into contact.
        if phase<.6:y=-.115+.23*phase/.6;lift=0
        else:
            u=(phase-.6)/.4;y=.115-.23*ease(u);lift=.070*math.sin(math.pi*u)**1.5
        leg_ik(side,(sign*.18,-.01+y,.10+lift))
        rot('upper_arm.'+side,-.07-sign*.27*wave,0,sign*.035)
        rot('forearm.'+side,-.22+.10*math.sin(t*math.tau+sign*.7))
    rot('spine',-.055,0,-.045*wave)
    rot('head',.04,0,.025*wave)
    secondary(t,1.6)

def run(t):
    wave=math.sin(t*math.tau)
    rig.pose.bones['hips'].location=(.022*wave,0,-.045+.035*(1-math.cos(t*math.tau*2)))
    for side,sign in [('L',1),('R',-1)]:
        phase=(t+(0 if sign==1 else .5))%1
        # Short ground contact and a longer high-knee swing give a flight phase.
        if phase<.40:y=-.17+.34*phase/.40;lift=0
        else:
            u=(phase-.40)/.60;y=.17-.34*ease(u);lift=.135*math.sin(math.pi*u)**1.3
        leg_ik(side,(sign*.18,-.01+y,.10+lift))
        rot('upper_arm.'+side,-.30-sign*.32*wave,0,sign*.06)
        rot('forearm.'+side,-.62+.16*math.sin(t*math.tau+sign*.65))
    rot('spine',-.17,0,-.075*wave)
    rot('head',.12,0,.04*wave)
    secondary(t,2.0)

def carry(t):
    idle(t)
    for side,sign in [('L',1),('R',-1)]:
        arm_ik(side,(sign*.18,-.31,.88+.004*math.sin(t*math.tau)),(sign,0,-.2))

def attack_sword(t):
    idle(t)
    def strike_curve(t,keys):
        for (a,x),(b,y) in zip(keys,keys[1:]):
            if t<=b:
                u=max(0,min(1,(t-a)/(b-a)))
                # Carry velocity through impact rather than easing to a stop.
                return x+(y-x)*(u if a>=.44 and b<=.66 else ease(u))
        return keys[-1][1]
    # Cock the hand above the shoulder with a folded elbow. The shoulder leads
    # the downstroke, then the elbow opens through the existing .55 hit event.
    shoulder=strike_curve(t,[(0,-.07),(.24,-1.45),(.36,-1.60),(.48,-1.58),(.55,-.95),(.62,-.20),(1,-.07)])
    elbow=strike_curve(t,[(0,-.16),(.24,-1.48),(.36,-1.62),(.48,-1.62),(.55,-.12),(.62,-.25),(1,-.16)])
    twist=strike_curve(t,[(0,0),(.30,-.22),(.46,-.24),(.55,.20),(.62,.24),(1,0)])
    lean=strike_curve(t,[(0,-.025),(.34,.035),(.57,-.12),(.64,-.06),(1,-.025)])
    spread=strike_curve(t,[(0,0),(.27,-.25),(.40,-.25),(.58,-.09),(1,0)])
    rot('upper_arm.R',shoulder,spread,-.035)
    rot('forearm.R',elbow)
    rot('hand.R',strike_curve(t,[(0,0),(.34,-.12),(.55,.08),(.62,.09),(1,0)]))
    rot('spine',lean,0,twist)
    rot('head',-lean*.45,0,-twist*.55)
    rot('upper_arm.L',-.07-.30*math.sin(math.pi*t),0,.06)
    rot('forearm.L',-.16-.18*math.sin(math.pi*t))
    secondary(t,1.8)

def attack_unarmed(t):
    idle(t)
    reach=curve(t,[(0,0),(.30,-.12),(.55,1),(.65,.8),(1,0)])
    rot('upper_arm.R',-.07-1.30*reach,0,-.12*reach)
    rot('forearm.R',-.16-.35*math.sin(math.pi*t))
    rot('spine',-.025-.08*reach,0,.14*reach)
    rot('upper_arm.L',-.35*math.sin(math.pi*t))

def arm_ik(side,target,pole):
    shoulder=Vector(spec['upper_arm.'+side][0]);elbow=Vector(spec['forearm.'+side][0]);hand=Vector(spec['hand.'+side][0])
    a=(elbow-shoulder).length;b=(hand-elbow).length;v=Vector(target)-shoulder
    distance=max(.025,min(v.length,a+b-.001));direction=v.normalized()
    bend=Vector(pole)-direction*Vector(pole).dot(direction);bend.normalize()
    along=(a*a-b*b+distance*distance)/(2*distance)
    joint=shoulder+direction*along+bend*math.sqrt(max(0,a*a-along*along))
    end=shoulder+direction*distance
    upper=(elbow-shoulder).rotation_difference(joint-shoulder)
    lower=(hand-elbow).rotation_difference(end-joint)
    rig.pose.bones['upper_arm.'+side].rotation_euler=upper.to_euler()
    rig.pose.bones['forearm.'+side].rotation_euler=(upper.inverted() @ lower).to_euler()
    rig.pose.bones['hand.'+side].rotation_euler=lower.inverted().to_euler()

def attack_bow(t):
    lift=ease(min(t/.23,1,(1-t)/.20))
    draw=ease((t-.18)/.36) if t<.65 else 1-ease((t-.65)/.075)
    left=Vector(spec['hand.L'][0]).lerp(Vector((.14,-.38,1.10)),lift)
    right=Vector(spec['hand.R'][0]).lerp(Vector((.14,-.22+.11*draw,1.10)),lift)
    arm_ik('L',left,(1,.3,0));arm_ik('R',right,(-1,.8,0))
    rig.pose.bones['bow_draw'].location.y=.12*draw
    if .65<t<.93:rig.pose.bones['arrow'].scale=(.001,.001,.001)
    rig.pose.bones['head'].rotation_euler.z=.10*lift
    secondary(t,.7)
    recoil=math.sin((t-.65)*45)*math.exp(-(t-.65)*20) if t>.65 else 0
    rig.pose.bones['upper_arm.L'].rotation_euler.x+=.06*recoil

def work(t,chopping=False):
    idle(t)
    rig.pose.bones['tool_axe' if chopping else 'tool_hammer'].scale=(1,1,1)
    # Solve hands in the stationary torso frame to keep the impact path level.
    rot('spine')
    if chopping:
        sweep=curve(t,[(0,-.18),(.32,-1.00),(.42,-1.00),(.57,.40),(.68,.48),(1,-.18)])
        torso=curve(t,[(0,-.06),(.34,-.55),(.43,-.53),(.58,.26),(.68,.30),(1,-.06)])
        # Both targets are derived from one rigid haft, so the hands stay on it.
        orientation=Euler((-math.pi/2,0,sweep),'XYZ').to_quaternion() @ Euler((0,0,math.pi/2),'XYZ').to_quaternion()
        right=Vector((.025+.045*math.sin(sweep),-.12,1.00))
        left=right+orientation@Vector((0,0,-.13))
        for side,target,pole in [('R',right,(-1,.3,-.4)),('L',left,(1,.3,-.4))]:
            arm_ik(side,target,pole)
            wrist=rig.pose.bones['hand.'+side]
            wrist.rotation_euler=(wrist.rotation_euler.to_quaternion() @ orientation).to_euler()
        rot('spine',-.045,0,torso)
        rot('head',.06,0,-torso*.65)
    else:
        reach=curve(t,[(0,0),(.30,-.04),(.42,-.04),(.56,.16),(.63,.11),(1,0)])
        arm_ik('R',(-.30,-.25-reach,1.01),(-1,.2,-.4))
        rot('head',.025,0,-.035)
        rot('upper_arm.L',-.22,0,.08)
        rot('forearm.L',-.48)
    secondary(t,1.2)

def hit(t):
    idle(t)
    recoil=curve(t,[(0,0),(.18,1),(.42,.65),(1,0)])
    rot('spine',.28*recoil,0,-.08*recoil)
    rot('head',-.16*recoil)
    rot('upper_arm.R',.18*recoil)
    rot('upper_arm.L',.18*recoil)
def death(t):
    rig.pose.bones['root'].rotation_euler.x=ease(t/.72)*1.45
    rig.pose.bones['hips'].location.z=-.02*min(t*2,1)

