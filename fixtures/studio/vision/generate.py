from pathlib import Path
from PIL import Image, ImageDraw

WIDTH = 1280
HEIGHT = 800
OUTPUT = Path(__file__).parent


def draw_scene(state: str) -> Image.Image:
    image = Image.new("RGB", (WIDTH, HEIGHT), (236, 232, 222))
    draw = ImageDraw.Draw(image)

    draw.rectangle([0, 0, WIDTH, 520], fill=(240, 237, 228))
    draw.rectangle([0, 520, WIDTH, HEIGHT], fill=(198, 187, 168))
    draw.line([0, 520, WIDTH, 520], fill=(150, 140, 125), width=3)

    # cabinet.main
    draw.rounded_rectangle([80, 250, 250, 520], radius=8, fill=(105, 88, 74), outline=(65, 52, 43), width=4)
    draw.line([165, 250, 165, 520], fill=(70, 58, 48), width=3)

    # desk.main
    draw.rounded_rectangle([420, 380, 940, 530], radius=6, fill=(144, 90, 52), outline=(80, 50, 32), width=4)
    draw.rectangle([455, 530, 485, 690], fill=(95, 58, 38))
    draw.rectangle([870, 530, 900, 690], fill=(95, 58, 38))

    # laptop
    draw.polygon([(610, 420), (770, 420), (790, 485), (590, 485)], fill=(60, 65, 70), outline=(30, 30, 35))
    draw.polygon([(625, 430), (755, 430), (770, 475), (605, 475)], fill=(75, 120, 145))

    # headphone-stand.main
    draw.line([820, 415, 820, 490], fill=(45, 45, 45), width=8)
    draw.line([790, 490, 850, 490], fill=(45, 45, 45), width=8)

    # chair.main
    chair_x, chair_y = (620, 250) if state in {"demo-ready", "partial", "restored"} else (300, 390)
    draw.rounded_rectangle([chair_x, chair_y, chair_x + 150, chair_y + 190], radius=20, fill=(55, 84, 118), outline=(35, 55, 80), width=4)
    draw.rectangle([chair_x + 20, chair_y + 170, chair_x + 130, chair_y + 240], fill=(48, 73, 103), outline=(35, 55, 80), width=4)
    draw.line([chair_x + 35, chair_y + 240, chair_x + 15, chair_y + 320], fill=(45, 45, 45), width=8)
    draw.line([chair_x + 115, chair_y + 240, chair_x + 135, chair_y + 320], fill=(45, 45, 45), width=8)

    # backpack.black
    if state in {"demo-ready", "restored"}:
        backpack_x, backpack_y = 275, 430
    elif state == "partial":
        backpack_x, backpack_y = 300, 430
    else:
        backpack_x, backpack_y = 120, 560
    draw.rounded_rectangle([backpack_x, backpack_y, backpack_x + 100, backpack_y + 120], radius=28, fill=(38, 41, 48), outline=(15, 15, 18), width=4)
    draw.arc([backpack_x + 20, backpack_y - 30, backpack_x + 80, backpack_y + 45], start=180, end=360, fill=(30, 30, 34), width=7)

    # tripod.camera — absent in messy and partial, matching PSP ground truth.
    if state in {"demo-ready", "restored"}:
        tripod_x, tripod_y = 315, 270
        draw.rectangle([tripod_x, tripod_y, tripod_x + 70, tripod_y + 45], fill=(35, 35, 35), outline=(10, 10, 10), width=3)
        draw.ellipse([tripod_x + 22, tripod_y - 12, tripod_x + 45, tripod_y + 12], fill=(25, 25, 25))
        draw.line([tripod_x + 35, tripod_y + 45, tripod_x + 10, tripod_y + 200], fill=(25, 25, 25), width=7)
        draw.line([tripod_x + 35, tripod_y + 45, tripod_x + 60, tripod_y + 200], fill=(25, 25, 25), width=7)
        draw.line([tripod_x + 35, tripod_y + 45, tripod_x + 35, tripod_y + 200], fill=(25, 25, 25), width=7)

    # headphones.main
    headphones_x, headphones_y = (820, 420) if state in {"demo-ready", "partial", "restored"} else (690, 470)
    draw.arc([headphones_x - 45, headphones_y - 30, headphones_x + 45, headphones_y + 50], start=180, end=360, fill=(20, 20, 20), width=10)
    draw.rounded_rectangle([headphones_x - 50, headphones_y + 12, headphones_x - 28, headphones_y + 55], radius=8, fill=(25, 25, 25))
    draw.rounded_rectangle([headphones_x + 28, headphones_y + 12, headphones_x + 50, headphones_y + 55], radius=8, fill=(25, 25, 25))

    # lamp.left
    lamp_x = 1020
    draw.line([lamp_x, 320, lamp_x, 565], fill=(45, 45, 45), width=8)
    draw.line([lamp_x - 50, 565, lamp_x + 50, 565], fill=(45, 45, 45), width=8)
    lamp_on = state in {"demo-ready", "restored"}
    shade = (248, 199, 72) if lamp_on else (125, 120, 110)
    draw.polygon([(lamp_x - 75, 320), (lamp_x + 75, 320), (lamp_x + 50, 390), (lamp_x - 50, 390)], fill=shade, outline=(95, 75, 30) if lamp_on else (70, 70, 70))
    if lamp_on:
        draw.ellipse([lamp_x - 25, 345, lamp_x + 25, 395], fill=(255, 235, 145))

    # Extra bottles make desk.main not-clear only in messy.
    if state == "messy":
        for bottle_x in (520, 555):
            draw.rounded_rectangle([bottle_x, 445, bottle_x + 22, 505], radius=6, fill=(70, 140, 180), outline=(30, 80, 110), width=2)
            draw.rectangle([bottle_x + 6, 435, bottle_x + 16, 445], fill=(45, 90, 120))

    return image


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for state in ("demo-ready", "messy", "partial", "restored"):
        path = OUTPUT / f"{state}.png"
        draw_scene(state).save(path, format="PNG", optimize=True)
        print(path)


if __name__ == "__main__":
    main()
