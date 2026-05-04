#!/bin/bash
# [B안] Fluent Emoji Color SVG 34개 다운로드

set -u
BASE="https://cdn.jsdelivr.net/gh/microsoft/fluentui-emoji@main/assets"
cd "$(dirname "$0")"

# 형식: "폴더명|저장파일명"
DATA=(
  # 식당 업종 (12)
  "Cut of meat|cut-of-meat"
  "Cooked rice|cooked-rice"
  "Dumpling|dumpling"
  "Sushi|sushi"
  "Rice ball|rice-ball"
  "Baguette bread|baguette-bread"
  "Poultry leg|poultry-leg"
  "Pizza|pizza"
  "Bento box|bento-box"
  "Hamburger|hamburger"
  "Shortcake|shortcake"
  "Hot beverage|hot-beverage"
  # 식재료 (8)
  "Leafy green|leafy-green"
  "Fish|fish"
  "Sheaf of rice|sheaf-of-rice"
  "Butter|butter"
  "Jar|jar"
  "Beans|beans"
  "Ice|ice"
  "Canned food|canned-food"
  # UI 아이콘 (14, 🧮은 이미 있음)
  "Camera with flash|camera-with-flash"
  "Camera|camera"
  "Page facing up|page-facing-up"
  "Wastebasket|wastebasket"
  "Gear|gear"
  "House|house"
  "Door|door"
  "Paperclip|paperclip"
  "Basket|basket"
  "Bar chart|bar-chart"
  "Receipt|receipt"
  "Green salad|green-salad"
  "Fork and knife with plate|fork-and-knife-with-plate"
)

ok=0; fail=0; skip=0
fails=()

for entry in "${DATA[@]}"; do
  folder="${entry%%|*}"
  save="${entry##*|}"
  target="${save}.svg"

  if [[ -f "$target" ]]; then
    printf "⏭️  %s (있음)\n" "$target"
    skip=$((skip+1))
    continue
  fi

  # snake_case 파일명 생성 ("Cut of meat" → "cut_of_meat")
  snake=$(echo "$folder" | tr '[:upper:]' '[:lower:]' | tr ' ' '_')
  encoded=$(echo "$folder" | sed 's/ /%20/g')

  # (A) 기본 경로
  url_a="${BASE}/${encoded}/Color/${snake}_color.svg"
  # (B) Default/ 경로 (피부톤)
  url_b="${BASE}/${encoded}/Default/Color/${snake}_color_default.svg"

  if curl -sfSLo "$target" "$url_a" 2>/dev/null; then
    size=$(wc -c < "$target")
    printf "✅ %s (%d bytes)\n" "$target" "$size"
    ok=$((ok+1))
  elif curl -sfSLo "$target" "$url_b" 2>/dev/null; then
    size=$(wc -c < "$target")
    printf "✅ %s (%d bytes, Default/)\n" "$target" "$size"
    ok=$((ok+1))
  else
    printf "❌ %s (%s)\n" "$save" "$folder"
    fails+=("$folder → $save")
    fail=$((fail+1))
  fi
done

echo "---"
echo "성공 $ok / 스킵 $skip / 실패 $fail (전체 ${#DATA[@]})"
if [[ $fail -gt 0 ]]; then
  echo "실패 목록:"
  printf '  %s\n' "${fails[@]}"
fi
