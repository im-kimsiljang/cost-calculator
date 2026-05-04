"""
아이콘 후보 프리뷰 생성 — 각 옵션을 실제 사이즈(작게/크게)로 나란히 보여줌
"""
from PIL import Image, ImageDraw, ImageFont
import os

HERE = os.path.dirname(os.path.abspath(__file__))
FONT_DIR = '/Users/kyoungim.kim/Library/Fonts'
F_EXTRA = f'{FONT_DIR}/Pretendard-ExtraBold.ttf'
F_BLACK = f'{FONT_DIR}/Pretendard-Black.ttf'

PRIMARY = (59, 95, 255)   # #3b5fff
BG_SOFT = (238, 242, 255) # #eef2ff
INK = (26, 26, 46)
WHITE = (255, 255, 255)

def rounded_square(size, radius, bg, fg_draw_fn):
    """둥근 사각형 + 내부 그리기 콜백"""
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.rounded_rectangle([(0, 0), (size-1, size-1)], radius=radius, fill=bg)
    fg_draw_fn(img, draw, size)
    return img

def center_text(img, draw, text, font_path, font_size, fill, y_shift=0):
    font = ImageFont.truetype(font_path, size=font_size)
    bbox = font.getbbox(text)
    tw = bbox[2] - bbox[0]
    # 상단 여백(bbox[1])을 고려해서 시각적 중심 맞추기
    th = bbox[3] - bbox[1]
    x = (img.width - tw) // 2 - bbox[0]
    y = (img.height - th) // 2 - bbox[1] + y_shift
    draw.text((x, y), text, font=font, fill=fill)

# ── 옵션별 렌더 함수 ──
def opt_kim(img, draw, size):
    center_text(img, draw, '김', F_BLACK, int(size * 0.62), WHITE)

def opt_siljang(img, draw, size):
    center_text(img, draw, '실', F_BLACK, int(size * 0.62), WHITE)

def opt_ks(img, draw, size):
    center_text(img, draw, 'KS', F_BLACK, int(size * 0.46), WHITE)

def opt_glasses(img, draw, size):
    """안경 쓴 얼굴 심플 실루엣"""
    cx, cy = size // 2, size // 2
    # 얼굴 (살짝 위로)
    face_r = int(size * 0.30)
    draw.ellipse([cx - face_r, cy - face_r - int(size * 0.05),
                  cx + face_r, cy + face_r - int(size * 0.05)], fill=WHITE)
    # 안경 (원 2개 + 브릿지)
    glass_r = int(size * 0.09)
    glass_y = cy - int(size * 0.08)
    gap = int(size * 0.13)
    # 안경테
    for offset in (-gap, gap):
        draw.ellipse([cx + offset - glass_r, glass_y - glass_r,
                      cx + offset + glass_r, glass_y + glass_r],
                     outline=PRIMARY, width=max(2, int(size * 0.025)))
    # 브릿지
    draw.line([(cx - gap + glass_r, glass_y), (cx + gap - glass_r, glass_y)],
              fill=PRIMARY, width=max(2, int(size * 0.025)))

def opt_calc(img, draw, size):
    """계산기 mini UI — 화면 + 버튼 격자"""
    # 화면 (상단 1/3)
    pad = int(size * 0.18)
    screen_h = int(size * 0.22)
    draw.rounded_rectangle(
        [pad, pad, size - pad, pad + screen_h],
        radius=int(size * 0.04), fill=WHITE
    )
    # 버튼 3x3 격자
    btn_top = pad + screen_h + int(size * 0.06)
    grid_w = size - 2 * pad
    btn_size = (grid_w - 2 * int(size * 0.03)) // 3
    gap = int(size * 0.03)
    for row in range(3):
        for col in range(3):
            x0 = pad + col * (btn_size + gap)
            y0 = btn_top + row * (btn_size + gap)
            draw.rounded_rectangle(
                [x0, y0, x0 + btn_size, y0 + btn_size],
                radius=int(size * 0.025), fill=WHITE
            )

def opt_won(img, draw, size):
    center_text(img, draw, '₩', F_BLACK, int(size * 0.72), WHITE, y_shift=-int(size*0.02))

def opt_abacus(img, draw, size):
    """주판 단순화 — 가로 막대 3개에 구슬"""
    cx = size // 2
    bead_r = int(size * 0.055)
    rod_y = [int(size * 0.32), int(size * 0.50), int(size * 0.68)]
    rod_x0 = int(size * 0.18)
    rod_x1 = size - rod_x0
    # 막대
    for y in rod_y:
        draw.line([(rod_x0, y), (rod_x1, y)], fill=WHITE, width=max(2, int(size * 0.018)))
    # 구슬 (각 막대에 3-4개)
    patterns = [
        [0.30, 0.45, 0.70],             # 첫째 막대 — 3개
        [0.25, 0.40, 0.55, 0.75],       # 둘째 막대 — 4개
        [0.35, 0.60, 0.78],             # 셋째 막대 — 3개
    ]
    for y, xs in zip(rod_y, patterns):
        for xr in xs:
            x = int(size * xr)
            draw.ellipse([x - bead_r, y - bead_r, x + bead_r, y + bead_r], fill=WHITE)

def opt_percent(img, draw, size):
    center_text(img, draw, '%', F_BLACK, int(size * 0.62), WHITE)

def opt_123(img, draw, size):
    center_text(img, draw, '123', F_BLACK, int(size * 0.38), WHITE)

# ── 옵션 목록 ──
MAIN_OPTIONS = [
    ('A. 김', opt_kim),
    ('B. 실', opt_siljang),
    ('C. KS', opt_ks),
    ('D. 안경', opt_glasses),
]
CALC_OPTIONS = [
    ('E. 계산기 UI', opt_calc),
    ('F. ₩', opt_won),
    ('G. 주판', opt_abacus),
    ('H. %', opt_percent),
    ('I. 123', opt_123),
]

def render_row(options, y_offset, canvas, label_text):
    """한 줄에 옵션들을 크게/작게 나란히 배치"""
    LARGE = 160
    SMALL = 32  # favicon 사이즈
    LABEL_H = 22
    GAP = 30
    draw = ImageDraw.Draw(canvas)

    # 섹션 라벨
    font_label = ImageFont.truetype(F_EXTRA, size=16)
    draw.text((24, y_offset - 26), label_text, font=font_label, fill=INK)

    x = 24
    for label, fn in options:
        # 큰 버전
        big = rounded_square(LARGE, int(LARGE * 0.22), PRIMARY, fn)
        canvas.paste(big, (x, y_offset), big)

        # 작은 버전 (실제 favicon 사이즈)
        small = rounded_square(SMALL, int(SMALL * 0.22), PRIMARY, fn)
        canvas.paste(small, (x + LARGE + 12, y_offset + LARGE - SMALL), small)

        # 라벨
        font = ImageFont.truetype(F_EXTRA, size=13)
        draw.text((x, y_offset + LARGE + 8), label, font=font, fill=INK)

        x += LARGE + SMALL + 12 + GAP

# ── 캔버스 ──
W = 24 + (160 + 32 + 12 + 30) * 5
H = 720
canvas = Image.new('RGB', (W, H), (248, 249, 252))

render_row(MAIN_OPTIONS, 60, canvas, '메인 「김실장」 아이콘 후보 (큰 것 = 앱아이콘 사이즈 / 작은 것 = favicon 사이즈)')
render_row(CALC_OPTIONS, 60 + 160 + 60 + 80, canvas, '원가 계산기 아이콘 후보')

out = os.path.join(HERE, 'icon-options-preview.png')
canvas.save(out, optimize=True)
print(f'✅ {out}')
