import sys
from PIL import Image
from rembg import remove
remove(Image.open(sys.argv[1]).convert('RGBA'), alpha_matting=True).save(sys.argv[2])
