import os, pickle, numpy as np
from PIL import Image, ImageDraw
from common import CACHE, CELL
dem=np.load(os.path.join(CACHE,'dem.npy'))
R=pickle.load(open(os.path.join(CACHE,'roads.pkl'),'rb'))
X0,Z0,X1,Z1,NX,NZ=R['extent']
S=4  # m per pixel in preview = CELL*? use 2x downsample -> 8 m/px
d=dem[::2,::2]
gy,gx=np.gradient(d)
shade=np.clip(0.5+(-gx*0.7+gy*0.7)*0.25,0,1)
col=np.zeros(d.shape+(3,),np.float32)
land=d>0.5
col[...,0]=np.where(land,0.55+0.25*shade,0.08); col[...,1]=np.where(land,0.55+0.25*shade,0.16); col[...,2]=np.where(land,0.5+0.25*shade,0.26)
im=Image.fromarray((col*255).astype(np.uint8)); dr=ImageDraw.Draw(im)
px=lambda x,z:((x-X0)/8,(z-Z0)/8)
for e in R['edges']:
    P=e['pts3']; c=(255,80,60) if e['bridge'] else (60,200,255) if e['tunnel'] else (255,255,255) if e['rank']<=3 else (40,40,40)
    w=3 if e['rank']<=2 else 1
    dr.line([px(p[0],p[1]) for p in P],fill=c,width=w)
im.save('preview_roads.png')
# crops
def crop(name,x0,z0,x1,z1,scale=1):
    c=im.crop((int((x0-X0)/8),int((z0-Z0)/8),int((x1-X0)/8),int((z1-Z0)/8)))
    c=c.resize((c.width*scale,c.height*scale)); c.save(name)
small=im.copy(); small.thumbnail((1000,1000)); small.save('preview_roads_small.png')
