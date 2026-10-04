# Re-download the Rocketbox sources used by the ped pipeline into tools/peds_src (gitignored, ~4.7 GB). MIT licence.
# usage: cd tools/peds_src && python ../blender/peds/fetch_rocketbox.py
import json, urllib.request, urllib.parse, concurrent.futures as cf, os, re
t=json.loads(urllib.request.urlopen('https://api.github.com/repos/microsoft/Microsoft-Rocketbox/git/trees/master?recursive=1').read())
B='https://raw.githubusercontent.com/microsoft/Microsoft-Rocketbox/master/'
AV=('Female_Adult_01 Female_Adult_02 Female_Adult_03 Female_Adult_04 Female_Adult_05 Female_Adult_07 Female_Adult_08 Female_Adult_09 Female_Adult_11 Female_Adult_12 Female_Adult_13 Female_Adult_14 Female_Adult_15 Female_Adult_17 Female_Party_01 Female_Party_02 '
 'Male_Adult_01 Male_Adult_02 Male_Adult_03 Male_Adult_04 Male_Adult_05 Male_Adult_06 Male_Adult_07 Male_Adult_08 Male_Adult_09 Male_Adult_10 Male_Adult_11 Male_Adult_12 Male_Adult_13 Male_Adult_14 Male_Adult_16 Male_Adult_17 Male_Adult_18 Male_Adult_20 '
 'Business_Female_01 Business_Female_02 Business_Female_03 Business_Female_04 Business_Male_01 Business_Male_02 Business_Male_03 Business_Male_04 Business_Male_05 Business_Male_06 Business_Male_07 '
 'Sports_Female_02 Sports_Male_04 Delivery_Male_01 Medical_Female_01 Medical_Male_04 Construction_Male_07 Police_Male_06 Police_Male_07').split()
AN=('walk_neutral walk_neutral_01 walk_neutral_02 walk_neutral_03 walk_slow_01 walk_slow_02 walk_fast_01 walk_fast_02 walk_stroll_01 walk_stroll_02 walk_cool_01 walk_self-assured '
 'run_slow_01 run_neutral run_neutral_01 run_fast_01 run_fast_02 '
 'idle_neutral_01 idle_neutral_02 idle_neutral_03 idle_neutral_04 idle_breathe_01 idle_look_around_01 idle_look_around_02 idle_waiting_01 idle_waiting_02 idle_touch_hair_01 idle_scratch_head_01 '
 'cell_phone_talk_01 cell_phone_talk_02 cell_phone_listen_01 cell_phone_textmessage take_picture wave_01 wave_02 '
 'gestic_talk_neutral_01 gestic_talk_neutral_02 gestic_talk_relaxed_01 gestic_listen_neutral_01 gestic_listen_neutral_02 gestic_listen_relaxed_01 gestic_laugh_low '
 'sit_chair_idle_neutral_01 sit_chair_idle_relaxed_01 sit_chair_idle_look_around umbrella_idle_01 umbrella_idle_02 headphones_idle hold_bag_idle_01 hold_bag_idle drink_idle').split()
fs=[e for e in t['tree'] if e['type']=='blob']
want=[]
for e in fs:
  p=e['path']
  for a in AV:
    if p.startswith('Assets/Avatars/') and p.split('/')[3]==a:
      fn=p.split('/')[-1]
      if p.endswith('/Export/'+a+'.fbx') or (('/Textures/' in p) and re.search(r'_(color|normal|specular)\.tga$',fn) and 'wrinkle' not in fn): want.append((p,'av/'+a+'/'+fn))
  if p.startswith('Assets/Animations/'):
    fn=p.split('/')[-1].replace('.max.fbx','')
    if fn[2:] in AN: want.append((p,'anim/'+fn+'.fbx'))
print(len(want), sum(e['size'] for e in fs if e['path'] in {w[0] for w in want})//1000000,'MB')
def get(w):
  p,o=w; os.makedirs(os.path.dirname(o),exist_ok=True)
  if os.path.exists(o): return
  for k in range(3):
    try: urllib.request.urlretrieve(B+urllib.parse.quote(p),o+'.part'); os.replace(o+'.part',o); return
    except Exception as ex: err=ex
  print('FAIL',p,err)
import urllib.parse
with cf.ThreadPoolExecutor(10) as ex: list(ex.map(get,want))
print('done')
