import sys
from PIL import Image, ImageOps, ImageStat
src, hexcol, dst = sys.argv[1:4]
im = Image.open(src).convert('RGB')
lum = ImageOps.grayscale(im)
mean = ImageStat.Stat(lum).median[0] or 1
tr, tg, tb = [int(hexcol[i:i + 2], 16) for i in (1, 3, 5)]
lut = lambda t: [min(255, int(t * (v / mean) ** 0.6)) for v in range(256)]
Image.merge('RGB', [lum.point(lut(tr)), lum.point(lut(tg)), lum.point(lut(tb))]).save(dst)
