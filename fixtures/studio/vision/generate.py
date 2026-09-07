from pathlib import Path
from PIL import Image, ImageDraw

WIDTH = 1280
HEIGHT = 800
OUTPUT = Path(__file__).parent


def draw_chair(draw: ImageDraw.ImageDraw, x: int, y: int) -> None:
    draw.rounded_rectangle(
        [x, y, x + 150, y + 190],
        radius=20,
        fill=(55, 84, 118),
        outline=(35, 55, 80),
        width=4,
    )
    draw.rectangle(
        [x + 20, y + 170, x + 130, y + 240],
        fill=(48, 73, 103),
        outline=(35, 55, 80),
        width=4,
    )
    draw.line([x + 35, y + 240, x + 15, y + 320], fill=(45, 45, 45), width=8)
    draw.line([x + 115, y + 240, x + 135, y + 320], fill=(45, 45, 45), width=8)


def draw_scene(state: str) -> Image.Image:
    image = Image.new("RGB", (WIDTH, HEIGHT), (236, 232, 222))
    draw = ImageDraw.Draw(image)

    draw.rectangle([0, 0, WIDTH, 520], fill=(240, 237, 228))
    draw.rectangle([0, 520, WIDTH, HEIGHT], fill=(198, 187, 168))
    draw.line([0, 520, WIDTH, 520], fill=(150, 140, 125), width=3)

    # cabinet.main
    draw.rounded_rectangle(
        [80, 250, 250, 520],
        radius=8,
        fill=(105, 88, 74),
        outline=(65, 52, 43),
        width=4,
    )
    draw.line([165, 250, 165, 520], fill=(70, 58, 48), width=3)

    # In demo-ready/partial/restored the canonical PSP says chair.main is BEHIND
    # desk.main. Draw the chair first so the desk visibly occludes it.
    chair_is_behind = state in {"demo-ready", "partial", "restored"}
    if chair_is_behind:
        draw_chair(draw, 620, 250)

    # desk.main
    draw.rounded_rectangle(
        [420, 380, 940, 530],
        radius=6,
        fill=(144, 90, 52),
        outline=(80, 50, 32),
        width=4,
    )
    draw.rectangle([455, 530, 485, 690], fill=(95, 58, 38))
    draw.rectangle([870, 530, 900, 690], fill=(95, 58, 38))

    # headphone-stand.main — this stable tracked object remains on the desk.
    draw.line([820, 415, 820, 490], fill=(45, 45, 45), width=8)
    draw.line([790, 490, 850, 490], fill=(45, 45, 45), width=8)

    # In messy the chair is LEFT_OF desk.main, so render it independently.
    if not chair_is_behind:
        draw_chair(draw, 300, 390)

    # backpack.black
    if state in {"demo-ready", "restored"}:
        backpack_x, backpack_y = 275, 430
    elif state == "partial":
        backpack_x, backpack_y = 300, 430
    else:
        backpack_x, backpack_y = 120, 560
    draw.rounded_rectangle(
        [backpack_x, backpack_y, backpack_x + 100, backpack_y + 120],
        radius=28,
        fill=(38, 41, 48),
        outline=(15, 15, 18),
        width=4,
    )
    draw.arc(
        [backpack_x + 20, backpack_y - 30, backpack_x + 80, backpack_y + 45],
        start=180,
        end=360,
        fill=(30, 30, 34),
        width=7,
    )

    # tripod.camera — absent in messy and partial, matching canonical PSP truth.
    if state in {"demo-ready", "restored"}:
        tripod_x, tripod_y = 315, 270
        draw.rectangle(
            [tripod_x, tripod_y, tripod_x + 70, tripod_y + 45],
            fill=(35, 35, 35),
            outline=(10, 10, 10),
            width=3,
        )
        draw.ellipse(
            [tripod_x + 22, tripod_y - 12, tripod_x + 45, tripod_y + 12],
            fill=(25, 25, 25),
        )
        draw.line(
            [tripod_x + 35, tripod_y + 45, tripod_x + 10, tripod_y + 200],
            fill=(25, 25, 25),
            width=7,
        )
        draw.line(
            [tripod_x + 35, tripod_y + 45, tripod_x + 60, tripod_y + 200],
            fill=(25, 25, 25),
            width=7,
        )
        draw.line(
            [tripod_x + 35, tripod_y + 45, tripod_x + 35, tripod_y + 200],
            fill=(25, 25, 25),
            width=7,
        )

    # headphones.main: on the stand when restored; directly on desk when messy.
    headphones_x, headphones_y = (
        (820, 420)
        if state in {"demo-ready", "partial", "restored"}
        else (690, 470)
    )
    draw.arc(
        [headphones_x - 45, headphones_y - 30, headphones_x + 45, headphones_y + 50],
        start=180,
        end=360,
        fill=(20, 20, 20),
        width=10,
    )
    draw.rounded_rectangle(
        [headphones_x - 50, headphones_y + 12, headphones_x - 28, headphones_y + 55],
        radius=8,
        fill=(25, 25, 25),
    )
    draw.rounded_rectangle(
        [headphones_x + 28, headphones_y + 12, headphones_x + 50, headphones_y + 55],
        radius=8,
        fill=(25, 25, 25),
    )

    # lamp.left
    lamp_x = 1020
    draw.line([lamp_x, 320, lamp_x, 565], fill=(45, 45, 45), width=8)
    draw.line([lamp_x - 50, 565, lamp_x + 50, 565], fill=(45, 45, 45), width=8)
    lamp_on = state in {"demo-ready", "restored"}
    shade = (248, 199, 72) if lamp_on else (125, 120, 110)
    draw.polygon(
        [
            (lamp_x - 75, 320),
            (lamp_x + 75, 320),
            (lamp_x + 50, 390),
            (lamp_x - 50, 390),
        ],
        fill=shade,
        outline=(95, 75, 30) if lamp_on else (70, 70, 70),
    )
    if lamp_on:
        draw.ellipse(
            [lamp_x - 25, 345, lamp_x + 25, 395],
            fill=(255, 235, 145),
        )

    # Deliberately do not draw untracked laptop/bottle objects here. The Phase 2
    # benchmark must match the canonical PSP fixtures exactly; extra visual
    # objects belong in a later explicit ADDED-object benchmark.

    return image


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for state in ("demo-ready", "messy", "partial", "restored"):
        path = OUTPUT / f"{state}.png"
        draw_scene(state).save(path, format="PNG", optimize=True)
        print(path)


if __name__ == "__main__":
    main()
