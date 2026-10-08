from pathlib import Path
from PIL import Image, ImageDraw

output = Path(__file__).parent / "icons"
output.mkdir(exist_ok=True)
for name, size in [("icon-192.png", 192), ("icon-512.png", 512), ("apple-touch-icon.png", 180)]:
    image = Image.new("RGB", (size, size), "#142c3d")
    draw = ImageDraw.Draw(image)
    def box(x1, y1, x2, y2, fill):
        draw.rounded_rectangle(tuple(int(v * size) for v in (x1, y1, x2, y2)), radius=int(size * .025), fill=fill)
    box(.23, .54, .36, .76, "#65d4be")
    box(.43, .40, .56, .76, "#65d4be")
    box(.63, .24, .76, .76, "#ffffff")
    image.save(output / name)
