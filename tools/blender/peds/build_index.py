# public/assets/peds/index.json: avatar list + crowd tags (style pools) from the per-avatar json files.
import os, json
OUT = os.path.join(os.path.dirname(__file__), '..', '..', '..', 'public', 'assets', 'peds')
TOURIST = {'male_adult_01', 'male_adult_16', 'female_adult_12', 'female_adult_17', 'female_party_01', 'male_adult_02', 'female_adult_05', 'male_adult_08', 'female_adult_01'}
RARE = {'delivery_male_01': 0.4, 'medical_female_01': 0.3, 'medical_male_04': 0.2, 'construction_male_07': 0.35, 'female_party_01': 0.5, 'female_party_02': 0.6}
av = []
for f in sorted(os.listdir(OUT)):
    if not f.endswith('.json') or f in ('clips.json', 'index.json'): continue
    a = json.load(open(os.path.join(OUT, f)))
    i = a['id']; tags = []
    if i.startswith('business_'): tags = ['business', 'generic']
    elif i.startswith('sports_'): tags = ['jogger']
    elif i.startswith('police_'): tags = ['police']
    else: tags = ['generic'] + (['tourist'] if i in TOURIST else [])
    av.append({'id': i, 'g': a['g'], 'h': round(a['h'], 3), 'hip': round(a['hip'], 3), 'tris': a['tris'], 'tags': tags, 'w': RARE.get(i, 1)})
json.dump({'v': 1, 'player': 'male_adult_17', 'avatars': av}, open(os.path.join(OUT, 'index.json'), 'w'), indent=0)
print(len(av))
