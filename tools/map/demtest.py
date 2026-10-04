import numpy as np, glob, os, math
from PIL import Image
from fetch_osm import BBOX, RAW
Z=14
tiles=glob.glob(os.path.join(RAW,'dem','*.png'))
xs=sorted({int(os.path.basename(t).split('_')[1]) for t in tiles}); ys=sorted({int(os.path.basename(t).split('_')[2][:-4]) for t in tiles})
H=np.zeros((len(ys)*256,len(xs)*256),np.float32)
for t in tiles:
    _,x,y=os.path.basename(t)[:-4].split('_'); x=int(x); y=int(y)
    a=np.asarray(Image.open(t).convert('RGB')).astype(np.float32)
    H[(y-ys[0])*256:(y-ys[0]+1)*256,(x-xs[0])*256:(x-xs[0]+1)*256]=a[...,0]*256+a[...,1]+a[...,2]/256-32768
print(H.shape, H.min(), H.max())
def px(lat,lon):
    n=2**Z; X=(lon+180)/360*n; Y=(1-math.asinh(math.tan(math.radians(lat)))/math.pi)/2*n
    return (Y-ys[0])*256,(X-xs[0])*256
for name,(la,lo) in {'twinpeaks':(37.7544,-122.4477),'mtdavidson':(37.7383,-122.4546),'bay_mid':(37.80,-122.37),'ocean':(37.75,-122.52),'gg_strait':(37.815,-122.478),'hydeLombard':(37.8021,-122.4187),'marketPowell':(37.7849,-122.4079),'oceanbeach':(37.7594,-122.5107),'hawkhill':(37.8275,-122.4990),'ybi_top':(37.8105,-122.3637),'TI':(37.8235,-122.3706),'filbert_leav':(37.8003,-122.4180)}.items():
    r,c=px(la,lo); print(f'{name:12s} {H[int(r),int(c)]:8.1f}')
Image.fromarray(np.clip((H+50)/400*255,0,255).astype(np.uint8)).save('dem_preview.png')
