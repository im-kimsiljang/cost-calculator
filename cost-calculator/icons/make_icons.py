"""
원가 계산기 전용 아이콘 생성 — Apple 🧮 이모지 기반

디자인:
- 배경: 둥근 정사각형 (흰색 ~ 김실장 브랜드 배경색 #f5f6fa 살짝)
- 전경: Apple Color Emoji 🧮 (U+1F9EE) 주판
- 작은 사이즈(16/32/48/96)는 Apple 네이티브 비트맵 사용
- 큰 사이즈(160+)는 160px 원본을 LANCZOS 업스케일

출력:
- character-square.png (1024×1024, 원본)
- icon-512.png / icon-192.png / apple-touch-icon.png (180)
- favicon-32.png / favicon-16.png
- favicon.ico (16/32/48 멀티)
"""
from PIL import Image, ImageDraw, ImageFont
import os

HERE = os.path.dirname(os.path.abspath(__file__))
EMOJI_FONT = '/System/Library/Fonts/Apple Color Emoji.ttc'

# Apple Color Emoji가 네이티브 렌더할 수 있는 사이즈들
APPLE_NATIVE_STRIKES = [20, 32, 40, 48, 64, 96, 160]

# 배경 색 — 아이콘 뒤에 살짝 깔릴 연한 색. 투명이면 transparent로.
# None = 완전 투명 (이모지만)
BG_COLOR = None   # 투명 배경 (이모지 본연의 나무 프레임을 살림)

def render_emoji_native(render_size):
    """Apple Color Emoji 🧮를 주어진 사이즈로 네이티브 렌더"""
    font = ImageFont.truetype(EMOJI_FONT, size=render_size)
    # 이모지는 보통 font-size보다 살짝 커지므로 여유 있게 캔버스 잡음
    canvas_size = int(render_size * 1.25)
    img = Image.new('RGBA', (canvas_size, canvas_size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.text((0, 0), '🧮', font=font, embedded_color=True)
    # 실제 이모지가 그려진 영역만 크롭
    bbox = img.getbbox()
    if bbox:
        img = img.crop(bbox)
    return img


def make_icon(target_size, padding_ratio=0.0):
    """
    target_size × target_size 아이콘 생성.
    - 작은 사이즈(≤160)는 Apple 네이티브 렌더 후 필요시 다운스케일
    - 큰 사이즈(>160)는 160 native 렌더 후 업스케일
    """
    # 어떤 네이티브 크기로 렌더할지
    if target_size <= 160:
        # 타겟보다 크거나 같은 가장 작은 native strike
        src_size = next((s for s in APPLE_NATIVE_STRIKES if s >= target_size), 160)
    else:
        src_size = 160  # 최대 네이티브

    emoji_img = render_emoji_native(src_size)

    # 이모지의 긴 변 기준으로 사이즈 맞추기
    ew, eh = emoji_img.size
    longest = max(ew, eh)
    # 여백 고려한 이모지 사이즈
    emoji_target = int(target_size * (1 - 2 * padding_ratio))
    scale = emoji_target / longest
    new_w = int(ew * scale)
    new_h = int(eh * scale)
    emoji_resized = emoji_img.resize((new_w, new_h), Image.LANCZOS)

    # 정사각 캔버스 + 중앙 배치
    if BG_COLOR is None:
        canvas = Image.new('RGBA', (target_size, target_size), (0, 0, 0, 0))
    else:
        canvas = Image.new('RGBA', (target_size, target_size), BG_COLOR)
    paste_x = (target_size - new_w) // 2
    paste_y = (target_size - new_h) // 2
    canvas.paste(emoji_resized, (paste_x, paste_y), emoji_resized)
    return canvas


# ── 생성 ──
# 1024 (원본 참조용) — 160 → 1024 업스케일 불가피
main = make_icon(1024, padding_ratio=0.08)
main.save(os.path.join(HERE, 'character-square.png'), optimize=True)
print(f'✅ character-square.png (1024×1024)')

# PWA / 애플 홈화면
for size, name in [(512, 'icon-512.png'),
                   (192, 'icon-192.png'),
                   (180, 'apple-touch-icon.png')]:
    img = make_icon(size, padding_ratio=0.08)
    img.save(os.path.join(HERE, name), optimize=True)
    print(f'✅ {name} ({size}×{size})')

# 파비콘 — 아주 작은 사이즈는 여백 거의 없이 (꽉 차게)
for size, name in [(32, 'favicon-32.png'),
                   (16, 'favicon-16.png')]:
    img = make_icon(size, padding_ratio=0.02)
    img.save(os.path.join(HERE, name), optimize=True)
    print(f'✅ {name} ({size}×{size})')

# favicon.ico (멀티 사이즈 내장)
ico48 = make_icon(48, padding_ratio=0.02)
ico48.save(
    os.path.join(HERE, 'favicon.ico'),
    format='ICO',
    sizes=[(16, 16), (32, 32), (48, 48)]
)
print('✅ favicon.ico (16/32/48 멀티)')

print('\n완료!')
