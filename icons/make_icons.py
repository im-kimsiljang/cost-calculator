"""
김실장 아이콘 생성 스크립트 (v5.0 — 2D 캐릭터 기준)

원본: character-hero-2d.png (2D 캐릭터, 흰 배경 RGB)
→ 흰 배경 픽셀단위 투명화 (옷/머리의 화이트 하이라이트 보존)
→ 얼굴 타이트 크롭 (넥타이 영역 제외)
→ 정사각 캔버스 중앙 배치
→ 사이즈별 생성 (16 ~ 1024)
"""
from PIL import Image, ImageDraw
import numpy as np
import os

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'character-hero-2d.png')

# ── 1. 원본 로드 ──
src = Image.open(SRC).convert('RGBA')
w, h = src.size
print(f'원본 크기: {src.size}')

# ── 2-A. 픽셀단위 1차 투명화 (RGB≥245, 명백한 흰색) ──
# 색상 기반이라 옷/피부/눈의 밝은 하이라이트(연결 안 된 내부 흰색)는 유지됨.
arr = np.array(src)
r, g, b = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]
white_mask_strict = (r >= 245) & (g >= 245) & (b >= 245)
arr[white_mask_strict, 3] = 0
src = Image.fromarray(arr, 'RGBA')
print(f'✅ 1차 투명화 (픽셀단위 RGB≥245): {white_mask_strict.sum()} 픽셀')

# ── 2-B. 코너에서 플러드필 (연결된 배경 잔재 제거) ──
# 테두리 안티에일리어싱(RGB 220~244)까지 잡되, 캐릭터 내부의 흰색은
# 배경과 연결되지 않으므로 보존됨. thresh=45로 공격적으로.
before = np.array(src)[:, :, 3]
for pt in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]:
    ImageDraw.floodfill(src, pt, (255, 255, 255, 0), thresh=45)
after = np.array(src)[:, :, 3]
flood_removed = ((before > 0) & (after == 0)).sum()
print(f'✅ 2차 투명화 (코너 플러드필 thresh=45): 추가 {flood_removed} 픽셀')

# ── 2-C. 엣지 할로 제거 (투명 픽셀과 인접한 near-white만 반투명화) ──
# 효과: 캐릭터 외곽선의 흰 할로를 줄이면서 내부 흰색(눈/이빨/셔츠)은 보존.
arr = np.array(src)
alpha = arr[:, :, 3].copy()
r, g, b = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]

# 3x3 근방에 투명(alpha==0)이 있는 불투명 픽셀 찾기
opaque = alpha > 0
transparent = alpha == 0
# 각 방향으로 shift해서 인접 픽셀 체크
near_transparent = np.zeros_like(transparent)
near_transparent[1:, :]   |= transparent[:-1, :]   # 위
near_transparent[:-1, :]  |= transparent[1:, :]    # 아래
near_transparent[:, 1:]   |= transparent[:, :-1]   # 왼쪽
near_transparent[:, :-1]  |= transparent[:, 1:]    # 오른쪽
near_transparent[1:, 1:]  |= transparent[:-1, :-1] # 대각선 4방향
near_transparent[1:, :-1] |= transparent[:-1, 1:]
near_transparent[:-1, 1:] |= transparent[1:, :-1]
near_transparent[:-1,:-1] |= transparent[1:, 1:]

# 조건: 불투명 && 인접 투명 있음 && 매우 밝음(RGB≥215)
halo_mask = opaque & near_transparent & (r >= 215) & (g >= 215) & (b >= 215)
# 이 픽셀들의 알파를 0으로 (완전 투명화)
arr[halo_mask, 3] = 0
halo_cleaned = halo_mask.sum()
src = Image.fromarray(arr, 'RGBA')
print(f'✅ 3차 투명화 (엣지 할로 정리): {halo_cleaned} 픽셀')

# 다시 numpy array로 (이후 bbox 계산에 필요)
arr = np.array(src)

# ── 3. 캐릭터 bbox (컬럼/로우 20+ 픽셀 기준, 노이즈 무시) ──
alpha = arr[:, :, 3]
opaque = alpha > 200
col_sums = opaque.sum(axis=0)
row_sums = opaque.sum(axis=1)
sig_cols = np.where(col_sums >= 20)[0]
sig_rows = np.where(row_sums >= 20)[0]
char_bbox = (int(sig_cols.min()), int(sig_rows.min()),
             int(sig_cols.max()) + 1, int(sig_rows.max()) + 1)
char_w = char_bbox[2] - char_bbox[0]
char_h = char_bbox[3] - char_bbox[1]
char_cx = (char_bbox[0] + char_bbox[2]) // 2
print(f'캐릭터 bbox: {char_bbox} (w={char_w}, h={char_h}, cx={char_cx})')

# ── 4. 얼굴 영역 계산 (세로 방향) ──
# 2D 캐릭터 일반 비율:
#  - 머리(hair) top: 0%
#  - 얼굴(face) 중심: 15~25%
#  - 턱(chin): 30~35%
#  - 목/칼라: 35~45%
#  - 어깨/수트 시작: 45% 아래 → 여기부터 넥타이 영역
# 목 바로 아래까지 끊어서 넥타이 노출 방지.
FACE_TOP_RATIO = 0.0      # 머리 최상단부터
FACE_BOTTOM_RATIO = 0.42  # 턱~목 위쪽까지 (수트/타이 제외)

face_top_y = char_bbox[1] + int(char_h * FACE_TOP_RATIO)
face_bottom_y = char_bbox[1] + int(char_h * FACE_BOTTOM_RATIO)
face_height = face_bottom_y - face_top_y

# ── 5. 가로 방향: 얼굴 폭 기준 ──
# 얼굴 영역(face_top ~ face_bottom) 내에서만 컬럼 카운팅
face_slice = opaque[face_top_y:face_bottom_y, :]
face_col_sums = face_slice.sum(axis=0)
face_sig_cols = np.where(face_col_sums >= 10)[0]
face_left = int(face_sig_cols.min())
face_right = int(face_sig_cols.max()) + 1
face_width = face_right - face_left
face_cx = (face_left + face_right) // 2
print(f'얼굴 영역: y=[{face_top_y}:{face_bottom_y}] x=[{face_left}:{face_right}] (cx={face_cx})')

# ── 6. 정사각 크롭 사이즈 결정 ──
# 얼굴 영역이 캔버스의 ~80%를 차지하도록, 나머지는 여백
PADDING_RATIO = 0.10
longest_face = max(face_width, face_height)
square_size = int(longest_face / (1 - 2 * PADDING_RATIO))

# 얼굴 중심 기준으로 정사각 크롭 좌표 계산
face_cy = (face_top_y + face_bottom_y) // 2
crop_left = face_cx - square_size // 2
crop_top = face_cy - square_size // 2
crop_right = crop_left + square_size
crop_bottom = crop_top + square_size

# 이미지 경계 넘어가면 → 투명 캔버스에 합성
print(f'크롭 박스: ({crop_left}, {crop_top}, {crop_right}, {crop_bottom}) 사이즈={square_size}')

# 안전한 크롭 (범위 밖은 투명)
crop_canvas = Image.new('RGBA', (square_size, square_size), (0, 0, 0, 0))
# src에서 유효한 영역만
src_left = max(0, crop_left)
src_top = max(0, crop_top)
src_right = min(w, crop_right)
src_bottom = min(h, crop_bottom)
src_region = src.crop((src_left, src_top, src_right, src_bottom))
paste_x = src_left - crop_left
paste_y = src_top - crop_top
crop_canvas.paste(src_region, (paste_x, paste_y), src_region)

# ── 7. 1024×1024로 리사이즈 (기준 해상도) ──
final = crop_canvas.resize((1024, 1024), Image.LANCZOS)
final.save(os.path.join(HERE, 'character-square.png'), optimize=True)
print('✅ character-square.png (1024×1024)')


# ── 8. 앱 아이콘 & 파비콘 생성 ──
def save_size(size, filename):
    img = final.resize((size, size), Image.LANCZOS)
    img.save(os.path.join(HERE, filename), optimize=True)
    print(f'✅ {filename} ({size}×{size})')

save_size(512, 'icon-512.png')
save_size(192, 'icon-192.png')
save_size(180, 'apple-touch-icon.png')
save_size(32, 'favicon-32.png')
save_size(16, 'favicon-16.png')

# ── 9. favicon.ico (16/32/48 멀티 사이즈 내장, 각 사이즈 native 렌더) ──
# PIL의 기본 ICO save는 하나의 이미지에서 다운스케일 → 작은 사이즈 품질 저하.
# 각 사이즈를 native LANCZOS로 뽑고 수동 조합.
ico_path = os.path.join(HERE, 'favicon.ico')
ico16 = final.resize((16, 16), Image.LANCZOS)
ico32 = final.resize((32, 32), Image.LANCZOS)
ico48 = final.resize((48, 48), Image.LANCZOS)
# PIL은 append_images로 멀티 레이어 ICO 지원
ico48.save(ico_path, format='ICO',
           sizes=[(16, 16), (32, 32), (48, 48)],
           append_images=[ico16, ico32])
print('✅ favicon.ico (16/32/48, 각 사이즈 native 렌더)')

# ── 10. 루트 favicon.ico 동기화 ──
# 브라우저가 자동으로 찾는 표준 위치(/favicon.ico)에도 복사.
# HTML이 /favicon.ico를 참조하므로 루트 파일이 최신이어야 함.
import shutil
root_ico = os.path.join(HERE, '..', 'favicon.ico')
shutil.copy2(ico_path, root_ico)
print(f'✅ 루트 favicon.ico 동기화: {os.path.abspath(root_ico)}')

# ── 주의 ──
# character-web.png는 메인 페이지 hero용 3D 전신 캐릭터이므로
# 이 스크립트에서 덮어쓰지 않음.

print('\n완료!')
