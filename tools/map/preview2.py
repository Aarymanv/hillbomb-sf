import os, numpy as np
from PIL import Image
from common import CACHE, CELL, grid_extent, proj
X0,Z0,X1,Z1,NX,NZ=grid_extent()
h=np.load(os.path.join(CACHE,'height.npy')); s=np.load(os.path.join(CACHE,'surf.npy'))
PAL=np.array([[22,52,78],[70,70,74],[170,168,160],[96,140,70],[222,205,160],[140,110,80],[130,125,118],[48,88,52],[120,130,80],[150,160,120]],np.float32)/255
gy,gx=np.gradient(h,CELL)
shade=np.clip(0.75+(-gx*0.5+gy*0.5)*0.6,0.35,1.25)[...,None]
img=np.clip(PAL[s]*shade,0,1)
full=Image.fromarray((img*255).astype(np.uint8))
def crop(name,lat0,lon0,lat1,lon1):
    x0,z0=proj(lat1,lon0); x1,z1=proj(lat0,lon1)
    c=full.crop((int((x0-X0)/CELL),int((z0-Z0)/CELL),int((x1-X0)/CELL),int((z1-Z0)/CELL))); c.save(name); print(name,c.size)
crop('pv_russianhill.png',37.795,-122.425,37.808,-122.405)
crop('pv_ggpark.png',37.765,-122.515,37.776,-122.45)
sm=full.copy(); sm.thumbnail((1000,1000)); sm.save('pv_full.png')
