"""
OG 이미지 생성 (카톡/페북/트위터 공유 미리보기용)
- 가로형: 1200x630 (페북/트위터/링크드인 표준)
- 정사각형: 800x800 (카톡 정사각형 썸네일 대응)
"""
from PIL import Image, ImageDraw, ImageFont
import numpy as np
import os

HERE = os.path.dirname(os.path.abspath(__file__))
# 원본 이미지를 직접 사용 (Profile-00-transparent.png는 옷 하이라이트가 투명화되는 이슈)
CHAR_SRC = os.path.join(HERE, 'Profile-00-3D-Smile.png')


def remove_white_bg(img, threshold=245):
    """
    흰 배경만 픽셀 단위로 투명화.
    floodfill과 달리 '연결성'이 아닌 '색상'만 보기 때문에
    옷 내부의 밝은 하이라이트가 외곽 흰색과 연결되어 있어도 보존됨.
    - threshold=245: R,G,B 모두 245 이상인 픽셀만 투명화
    """
    rgba = img.convert('RGBA')
    arr = np.array(rgba)
    r, g, b = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]
    white_mask = (r >= threshold) & (g >= threshold) & (b >= threshold)
    arr[white_mask, 3] = 0
    return Image.fromarray(arr, 'RGBA')

FONT_DIR = '/Users/kyoungim.kim/Library/Fonts'
FONT_EXTRABOLD = f'{FONT_DIR}/Pretendard-ExtraBold.ttf'
FONT_BOLD = f'{FONT_DIR}/Pretendard-Bold.ttf'
FONT_MEDIUM = f'{FONT_DIR}/Pretendard-Medium.ttf'

# 색상 (사이트 브랜드 토큰 기준)
PRIMARY = (59, 95, 255)    # #3b5fff 브랜드 파랑
INK = (26, 26, 46)         # #1a1a2e 짙은 네이비 (본문용)
INK_SOFT = (74, 74, 106)   # #4a4a6a
INK_MUTE = (144, 150, 168) # #9096a8
BG_TOP = (255, 255, 255)   # 흰색
BG_BOTTOM = (245, 246, 250) # #f5f6fa 살짝 푸른 흰색


def vertical_gradient(w, h, top, bottom):
    """세로 그라데이션 배경 생성 (빠름)"""
    img = Image.new('RGB', (w, h), top)
    draw = ImageDraw.Draw(img)
    for y in range(h):
        t = y / h
        r = int(top[0] * (1-t) + bottom[0] * t)
        g = int(top[1] * (1-t) + bottom[1] * t)
        b = int(top[2] * (1-t) + bottom[2] * t)
        draw.line([(0, y), (w, y)], fill=(r, g, b))
    return img


def draw_text_with_spacing(draw, pos, text, font, fill, letter_spacing=0):
    """letter-spacing 수동 적용 (대문자 강조용)"""
    x, y = pos
    for ch in text:
        draw.text((x, y), ch, font=font, fill=fill)
        bbox = font.getbbox(ch)
        x += (bbox[2] - bbox[0]) + letter_spacing


# ── 1. 가로형 OG (1200x630) ──
W, H = 1200, 630
bg = vertical_gradient(W, H, BG_TOP, BG_BOTTOM)  # 흰색 → 살짝 푸른 흰색

# 캐릭터 배치 (왼쪽) — 원본에서 흰 배경만 픽셀 단위로 투명화
char = remove_white_bg(Image.open(CHAR_SRC))
# 1024x1536. 얼굴~상반신이 전체에 걸쳐 있음
# 세로 560px로 리사이즈 (위아래 35px 여백)
char_h = 560
char_w = int(char.width * char_h / char.height)
char = char.resize((char_w, char_h), Image.LANCZOS)

char_x = 70
char_y = (H - char_h) // 2
bg.paste(char, (char_x, char_y), char)

# 텍스트 영역
draw = ImageDraw.Draw(bg)
font_brand = ImageFont.truetype(FONT_BOLD, size=28)
font_title = ImageFont.truetype(FONT_EXTRABOLD, size=78)
font_sub = ImageFont.truetype(FONT_MEDIUM, size=28)

text_x = 540
# KIM. SILJANG (letter-spacing 강조)
draw_text_with_spacing(draw, (text_x, 160), 'KIM. SILJANG', font_brand, PRIMARY, letter_spacing=3)
# 메인 카피 2줄 — 브랜드 파랑
draw.text((text_x, 210), '당신의 사업을', font=font_title, fill=PRIMARY)
draw.text((text_x, 308), '도와주는 김실장', font=font_title, fill=PRIMARY)
# 서브 카피 — 짙은 네이비/소프트
draw.text((text_x, 430), '자영업자를 위한 비서 서비스', font=font_sub, fill=INK)
draw.text((text_x, 472), '원가 계산 · 정책 자금 · 알바 관리', font=font_sub, fill=INK_SOFT)

bg.save(os.path.join(HERE, 'og-image.png'), optimize=True)
print('✅ og-image.png (1200×630)')


# ── 2. 정사각형 OG (800x800, 카톡용) ──
W2, H2 = 800, 800
bg2 = vertical_gradient(W2, H2, BG_TOP, BG_BOTTOM)

# 캐릭터 (상단 중앙) — 원본에서 흰 배경만 픽셀 단위로 투명화
char2 = remove_white_bg(Image.open(CHAR_SRC))
char2_h = 460
char2_w = int(char2.width * char2_h / char2.height)
char2 = char2.resize((char2_w, char2_h), Image.LANCZOS)
char2_x = (W2 - char2_w) // 2
char2_y = 30
bg2.paste(char2, (char2_x, char2_y), char2)

# 텍스트 (하단 중앙)
draw2 = ImageDraw.Draw(bg2)
font_title_sq = ImageFont.truetype(FONT_EXTRABOLD, size=60)
font_sub_sq = ImageFont.truetype(FONT_MEDIUM, size=26)

def center_text(draw, y, text, font, fill, w):
    bbox = font.getbbox(text)
    tw = bbox[2] - bbox[0]
    draw.text(((w - tw) // 2, y), text, font=font, fill=fill)

center_text(draw2, 520, '당신의 사업을', font_title_sq, PRIMARY, W2)
center_text(draw2, 595, '도와주는 김실장', font_title_sq, PRIMARY, W2)
center_text(draw2, 700, '자영업자를 위한 비서 서비스', font_sub_sq, INK_SOFT, W2)

bg2.save(os.path.join(HERE, 'og-image-square.png'), optimize=True)
print('✅ og-image-square.png (800×800)')

print('\n완료!')
