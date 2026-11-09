from PIL import Image, ImageOps

SOURCE = "static/new-icon.png"
OUTPUT = "static/"

img = Image.open(SOURCE).convert("RGBA")


# Crop and resize to a square while preserving proportions
def resize(size):
    return ImageOps.fit(
        img, (size, size), method=Image.Resampling.LANCZOS, centering=(0.5, 0.5)
    )


# PNG favicons
for size in [16, 32, 180, 192, 512]:
    filename = {
        16: "favicon-16x16.png",
        32: "favicon-32x32.png",
        180: "apple-touch-icon.png",
        192: "android-chrome-192x192.png",
        512: "android-chrome-512x512.png",
    }[size]

    resize(size).save(OUTPUT + filename)

# ICO favicon
resize(48).save(
    OUTPUT + "favicon.ico", format="ICO", sizes=[(16, 16), (32, 32), (48, 48)]
)

print("Favicons successfully generated!")
