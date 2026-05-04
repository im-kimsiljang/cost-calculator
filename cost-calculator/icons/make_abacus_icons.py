"""
원가 계산기 파비콘/앱아이콘 생성 — Fluent Emoji 주판(3D) 기반

원본: abacus-base.png (256×256, RGBA, Microsoft Fluent Emoji 3D)
→ 업스케일 후 각 사이즈별 LANCZOS 리사이즈
→ favicon.ico (16/32/48 멀티 사이즈)
"""
from PIL import Image
import os

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'abacus-base.png')

# ── 1. 원본 로드 (256×256 RGBA) ──
base = Image.open(SRC).convert('RGBA')
print(f'원본: {base.size}, {base.mode}')

# 1024로 업스케일 (LANCZOS → 깨끗한 확대)
base1024 = base.resize((1024, 1024), Image.LANCZOS)
base1024.save(os.path.join(HERE, 'character-square.png'), optimize=True)
print('✅ character-square.png (1024×1024)')

# ── 2. 사이즈별 생성 ──
# 큰 사이즈는 업스케일된 1024에서, 작은 사이즈는 원본 256에서 다운스케일
def save_size(size, filename):
    if size <= 256:
        img = base.resize((size, size), Image.LANCZOS)
    else:
        img = base1024.resize((size, size), Image.LANCZOS)
    img.save(os.path.join(HERE, filename), optimize=True)
    print(f'✅ {filename} ({size}×{size})')

save_size(512, 'icon-512.png')
save_size(192, 'icon-192.png')
save_size(180, 'apple-touch-icon.png')
save_size(32, 'favicon-32.png')
save_size(16, 'favicon-16.png')

# ── 3. favicon.ico (16/32/48) ──
ico_path = os.path.join(HERE, 'favicon.ico')
ico16 = base.resize((16, 16), Image.LANCZOS)
ico32 = base.resize((32, 32), Image.LANCZOS)
ico48 = base.resize((48, 48), Image.LANCZOS)
ico48.save(ico_path, format='ICO',
           sizes=[(16, 16), (32, 32), (48, 48)],
           append_images=[ico16, ico32])
print('✅ favicon.ico (16/32/48)')

print('\n완료!')
