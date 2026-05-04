#!/usr/bin/env python3
"""
[B안] cost-calculator의 주요 이모지를 Fluent Emoji Color SVG로 다운로드.

범위: 식당 업종(12) + 식재료(8) + UI 아이콘(14) = 34종
제외: ✕ ✅ ✓ ⚠ ➕ 같은 단순 심볼 및 장식용 이모지

Fluent Emoji 파일 경로 패턴:
  (A) {BASE}/{Name}/Color/{name_snake}_color.svg
  (B) {BASE}/{Name}/Default/Color/{name_snake}_color_default.svg   (피부톤)
"""
import urllib.request
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
BASE = "https://cdn.jsdelivr.net/gh/microsoft/fluentui-emoji@main/assets"

EMOJI_MAP = {
    # ── 식당 업종 카테고리 (12) ──
    '🥩': ('Cut of meat', 'cut-of-meat'),
    '🍚': ('Cooked rice', 'cooked-rice'),
    '🥟': ('Dumpling', 'dumpling'),
    '🍣': ('Sushi', 'sushi'),
    '🍙': ('Rice ball', 'rice-ball'),
    '🥖': ('Baguette bread', 'baguette-bread'),
    '🍗': ('Poultry leg', 'poultry-leg'),
    '🍕': ('Pizza', 'pizza'),
    '🍱': ('Bento box', 'bento-box'),
    '🍔': ('Hamburger', 'hamburger'),
    '🍰': ('Shortcake', 'shortcake'),
    '☕': ('Hot beverage', 'hot-beverage'),

    # ── 식재료 카테고리 (8) ──
    '🥬': ('Leafy green', 'leafy-green'),
    '🐟': ('Fish', 'fish'),
    '🌾': ('Sheaf of rice', 'sheaf-of-rice'),
    '🧈': ('Butter', 'butter'),
    '🫙': ('Jar', 'jar'),
    '🫘': ('Beans', 'beans'),
    '🧊': ('Ice', 'ice'),
    '🥫': ('Canned food', 'canned-food'),

    # ── UI / 내비게이션 아이콘 (14) ──
    '📸': ('Camera with flash', 'camera-with-flash'),
    '📷': ('Camera', 'camera'),
    '📄': ('Page facing up', 'page-facing-up'),
    '🗑': ('Wastebasket', 'wastebasket'),
    '⚙': ('Gear', 'gear'),
    '🏠': ('House', 'house'),
    '🚪': ('Door', 'door'),
    '📎': ('Paperclip', 'paperclip'),
    '🧺': ('Basket', 'basket'),
    '📊': ('Bar chart', 'bar-chart'),
    '🧾': ('Receipt', 'receipt'),
    '🧮': ('Abacus', 'abacus'),
    '🥗': ('Green salad', 'green-salad'),
    '🍽': ('Fork and knife with plate', 'fork-and-knife-with-plate'),
}

def snake(name):
    return name.lower().replace(' ', '_').replace('-', '_')

def url_encode(name):
    return name.replace(' ', '%20')

def try_download(emoji, folder, save_as):
    sn = snake(folder)
    paths = [
        f"{BASE}/{url_encode(folder)}/Color/{sn}_color.svg",
        f"{BASE}/{url_encode(folder)}/Default/Color/{sn}_color_default.svg",
    ]
    for url in paths:
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, timeout=15) as resp:
                if resp.status == 200:
                    data = resp.read()
                    with open(os.path.join(HERE, f"{save_as}.svg"), 'wb') as f:
                        f.write(data)
                    return True, url, len(data)
        except Exception:
            continue
    return False, None, 0

def main():
    ok, fail = [], []
    total = len(EMOJI_MAP)
    for i, (emoji, (folder, save_as)) in enumerate(EMOJI_MAP.items(), 1):
        target = os.path.join(HERE, f"{save_as}.svg")
        if os.path.exists(target):
            print(f"[{i:2d}/{total}] ⏭️  {emoji} {save_as}.svg (이미 있음)")
            ok.append((emoji, save_as))
            continue
        success, url, size = try_download(emoji, folder, save_as)
        if success:
            print(f"[{i:2d}/{total}] ✅ {emoji} → {save_as}.svg ({size} bytes)")
            ok.append((emoji, save_as))
        else:
            print(f"[{i:2d}/{total}] ❌ {emoji} {folder} — 실패")
            fail.append((emoji, folder, save_as))

    print(f"\n{'='*50}")
    print(f"성공: {len(ok)}개 / 실패: {len(fail)}개")
    if fail:
        print("\n실패 목록:")
        for emoji, folder, save_as in fail:
            print(f"  {emoji}  Folder='{folder}'  → {save_as}")
    return fail

if __name__ == '__main__':
    fails = main()
    sys.exit(1 if fails else 0)
