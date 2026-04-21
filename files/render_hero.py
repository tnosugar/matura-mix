#!/usr/bin/env python3
"""
Render hero.png — the Matura Mix poster image used as the Open Graph share
card and as the in-page feature image. Composition follows the
"Chromatic Pulse" philosophy in hero.philosophy.md:

  - Flat, solid, registered color (no gradients, no noise, no soft edges).
  - A single radial focal point at upper-center; rays emanating outward
    in measured intervals.
  - Near-abstract figure silhouettes along the lower band — heads, shoulders,
    raised arms in pure color, never line.
  - Restrained electric palette: deep indigo field, four school primaries,
    one magenta accent.
  - Typography is a small printed mark at the edge of the field, not in it.

Output: 1200x630 PNG (the Open Graph standard ratio) saved next to this
script as hero.png. Re-render at any time by re-running this file.
"""

import math
import random
from PIL import Image, ImageDraw, ImageFont

# --- Canvas ----------------------------------------------------------

W, H = 1200, 630
img = Image.new("RGB", (W, H), "#0f1138")  # deep velvet indigo (field)
draw = ImageDraw.Draw(img, "RGBA")

# --- Palette ---------------------------------------------------------

FIELD = "#0f1138"          # deep velvet indigo (pushed a shade darker
                           # so the primaries sit more crisply on it)
FIELD_SOFT = "#1b1f5a"     # slightly lighter indigo (secondary motifs)
YELLOW = "#f7b62f"         # school yellow
RED = "#e52c2d"            # school red
GREEN = "#39a749"          # school green
BLUE = "#3564ab"           # school blue  (used only in the dancer row —
                           # too close to the field to carry a ray)
CYAN = "#2bd4ff"           # electric cyan — the "clean blue" the philosophy
                           # calls for; cuts through indigo cleanly
MAGENTA = "#ec1e79"        # the unexpected accent
WHITE = "#ffffff"

# Ray colors: four saturated primaries + one magenta accent. The darker
# school-blue stays out of the radial burst and reappears only on one
# figure at the right, so the school palette is still fully present.
PRIMARIES = [YELLOW, RED, GREEN, CYAN, MAGENTA]

# --- Radial rays -----------------------------------------------------
# 18 rays around an off-center sun at upper-center. Alternating widths
# (wide / narrow / wide) build rhythm — every third ray is the "louder"
# one in the score.

cx, cy = 600, 215
N_RAYS = 18

ray_seq = []
for i in range(N_RAYS):
    angle_deg = (i * (360.0 / N_RAYS)) - 90.0  # start pointing up
    # alternate half-widths to create rhythm
    big = (i % 3) == 0
    half_w_deg = 9.5 if big else 5.0
    length = 1100 if big else 980
    color = PRIMARIES[i % len(PRIMARIES)]
    ray_seq.append((angle_deg, half_w_deg, length, color))

for angle_deg, half_w_deg, length, color in ray_seq:
    a1 = math.radians(angle_deg - half_w_deg)
    a2 = math.radians(angle_deg + half_w_deg)
    p1 = (cx + length * math.cos(a1), cy + length * math.sin(a1))
    p2 = (cx + length * math.cos(a2), cy + length * math.sin(a2))
    draw.polygon([(cx, cy), p1, p2], fill=color)

# --- Secondary motifs at lower contrast ------------------------------
# A second, smaller burst behind the main one, in soft indigo, to
# keep the field alive without crowding the foreground.

for i in range(N_RAYS):
    angle_deg = (i * (360.0 / N_RAYS)) - 90.0 + (360.0 / N_RAYS / 2.0)
    half_w_deg = 2.0
    length = 1200
    a1 = math.radians(angle_deg - half_w_deg)
    a2 = math.radians(angle_deg + half_w_deg)
    p1 = (cx + length * math.cos(a1), cy + length * math.sin(a1))
    p2 = (cx + length * math.cos(a2), cy + length * math.sin(a2))
    # subtle: only slightly lighter than field
    draw.polygon([(cx, cy), p1, p2], fill=FIELD_SOFT)


# --- Central focal point --------------------------------------------
# A solid yellow disc with a single magenta core. Two elements, no
# bullseye stack — the philosophy calls for confident geometric form,
# not a logo lockup.

R_OUTER = 118
R_INNER = 46

draw.ellipse((cx - R_OUTER, cy - R_OUTER, cx + R_OUTER, cy + R_OUTER), fill=YELLOW)
draw.ellipse((cx - R_INNER, cy - R_INNER, cx + R_INNER, cy + R_INNER), fill=MAGENTA)


# --- Star accents in the upper field --------------------------------
# Small white dots, evenly random across the upper band, never on the
# rays themselves (visual noise) — placed deterministically with a
# fixed seed for repeatability.

random.seed(11)
star_positions = []
attempts = 0
while len(star_positions) < 22 and attempts < 400:
    attempts += 1
    x = random.randint(40, W - 40)
    y = random.randint(20, 170)
    # avoid stars right on top of the central form
    if math.hypot(x - cx, y - cy) < 150:
        continue
    star_positions.append((x, y))

for x, y in star_positions:
    r = random.choice([2, 2, 3, 3, 4])
    draw.ellipse((x - r, y - r, x + r, y + r), fill=WHITE)


# --- Dancer silhouettes ---------------------------------------------
# Five figures along the bottom in pure color. Each figure is built
# from primitives — a head circle, a body trapezoid, two raised-arm
# quadrilaterals — so it reads as graphic punctuation rather than
# illustration. No outlines, no shading.

def draw_arm(sx, sy, angle_rad, length, half_w, color):
    """Draw a flat-color arm as a rotated rectangle."""
    dx, dy = math.cos(angle_rad), math.sin(angle_rad)
    # perpendicular for thickness
    px, py = -dy, dx
    pts = [
        (sx + half_w * px, sy + half_w * py),
        (sx + length * dx + half_w * px, sy + length * dy + half_w * py),
        (sx + length * dx - half_w * px, sy + length * dy - half_w * py),
        (sx - half_w * px, sy - half_w * py),
    ]
    draw.polygon(pts, fill=color)
    # round the cap of the arm with a small circle (the "fist")
    cap_x = sx + length * dx
    cap_y = sy + length * dy
    draw.ellipse(
        (cap_x - half_w, cap_y - half_w, cap_x + half_w, cap_y + half_w),
        fill=color,
    )


def dancer(cx_d, base_y, color, arm_angle_left=125, arm_angle_right=55,
           head_r=26, body_h=140):
    """
    Draw one dancer silhouette centered horizontally at cx_d, with feet
    at base_y. arm_angle_* in degrees, measured from the +x axis going
    counter-clockwise — so 90° is straight up, 0° is right, 180° is left.
    """
    head_cy = base_y - body_h - head_r - 6
    # Head
    draw.ellipse(
        (cx_d - head_r, head_cy - head_r, cx_d + head_r, head_cy + head_r),
        fill=color,
    )
    # Neck (small rectangle)
    neck_w = 10
    draw.rectangle(
        (cx_d - neck_w, head_cy + head_r - 2, cx_d + neck_w, head_cy + head_r + 8),
        fill=color,
    )
    # Body trapezoid (shoulders to hips)
    sy = head_cy + head_r + 6  # top of body / shoulder line
    shoulder_half = 38
    hip_half = 26
    by = base_y
    body_pts = [
        (cx_d - shoulder_half, sy),
        (cx_d + shoulder_half, sy),
        (cx_d + hip_half, by),
        (cx_d - hip_half, by),
    ]
    draw.polygon(body_pts, fill=color)
    # Arms — each from a shoulder point going outward+up
    arm_L = 110
    arm_w = 12
    # left arm origin: just inside the left shoulder
    lx = cx_d - shoulder_half + 6
    ly = sy + 6
    draw_arm(lx, ly, math.radians(-arm_angle_left + 180) * -1, arm_L, arm_w, color)
    # The angle math above is fiddly because PIL y is flipped. Simpler:
    # we want the arm to point up-left (left-side dancer), so dx<0, dy<0.
    # I'll re-call draw_arm with explicit conversion below to be safe.


def draw_dancer(cx_d, base_y, color, left_up_deg=60, right_up_deg=60,
                head_r=26, body_h=140):
    """
    Cleaner dancer: arms specified as "degrees above horizontal" on each
    side. left_up_deg = how far the LEFT arm rises above horizontal,
    measured up from the negative-x direction (i.e. higher = arm raised
    higher). Same convention on the right.
    """
    head_cy = base_y - body_h - head_r - 6
    # Head
    draw.ellipse(
        (cx_d - head_r, head_cy - head_r, cx_d + head_r, head_cy + head_r),
        fill=color,
    )
    # Neck
    neck_w = 9
    draw.rectangle(
        (cx_d - neck_w, head_cy + head_r - 2, cx_d + neck_w, head_cy + head_r + 8),
        fill=color,
    )
    # Body trapezoid
    sy = head_cy + head_r + 6
    shoulder_half = 38
    hip_half = 26
    by = base_y
    body_pts = [
        (cx_d - shoulder_half, sy),
        (cx_d + shoulder_half, sy),
        (cx_d + hip_half, by),
        (cx_d - hip_half, by),
    ]
    draw.polygon(body_pts, fill=color)
    # Arms
    arm_L = 105
    arm_w = 13
    # left arm: angle going up-left. In screen coords, dx = -cos(theta),
    # dy = -sin(theta), where theta is degrees above horizontal.
    lt = math.radians(left_up_deg)
    l_dx, l_dy = -math.cos(lt), -math.sin(lt)
    l_angle_screen = math.atan2(l_dy, l_dx)
    lx = cx_d - shoulder_half + 8
    ly = sy + 6
    draw_arm(lx, ly, l_angle_screen, arm_L, arm_w, color)
    # right arm: up-right
    rt = math.radians(right_up_deg)
    r_dx, r_dy = math.cos(rt), -math.sin(rt)
    r_angle_screen = math.atan2(r_dy, r_dx)
    rx = cx_d + shoulder_half - 8
    ry = sy + 6
    draw_arm(rx, ry, r_angle_screen, arm_L, arm_w, color)


# Five dancers along the bottom, alternating colors and arm postures
# so the line reads as a row of celebrating figures, not a chorus line.
DANCER_BASELINE = 590

dancer_specs = [
    # (cx, color, left_up_deg, right_up_deg)
    (170,  YELLOW,  75, 35),
    (390,  RED,     45, 80),
    (605,  GREEN,   85, 85),   # both arms straight up — center figure
    (820,  MAGENTA, 30, 70),
    (1035, BLUE,    65, 50),
]

for cx_d, color, l_deg, r_deg in dancer_specs:
    draw_dancer(cx_d, DANCER_BASELINE, color, l_deg, r_deg)


# --- Type mark at the edge of the field ------------------------------
# Small, thin sans-serif. Two corners — bottom-left for the title,
# bottom-right for the year — to feel like a poster's printer's mark.

try:
    font_label = ImageFont.truetype(
        "/usr/share/fonts/truetype/google-fonts/Poppins-Bold.ttf", 16
    )
    font_year = ImageFont.truetype(
        "/usr/share/fonts/truetype/google-fonts/Poppins-Bold.ttf", 16
    )
except Exception:
    font_label = ImageFont.load_default()
    font_year = ImageFont.load_default()

draw.text((34, H - 32), "MATURA  MIX", fill=WHITE, font=font_label)
# right-aligned year
year_text = "MMXXVI"
bbox = draw.textbbox((0, 0), year_text, font=font_year)
tw = bbox[2] - bbox[0]
draw.text((W - 34 - tw, H - 32), year_text, fill=WHITE, font=font_year)


# --- Save ------------------------------------------------------------

OUT = "/sessions/festive-admiring-fermat/mnt/matura-mix/files/hero.png"
img.save(OUT, "PNG", optimize=True)
print(f"wrote {OUT}  ({W}x{H})")
