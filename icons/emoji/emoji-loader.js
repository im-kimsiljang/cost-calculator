/**
 * Fluent Emoji 런타임 자동 변환기
 * ------------------------------------------------------------
 * 페이지 내 텍스트에 섞인 주요 이모지(B안 33개)를 감지해서
 * 자동으로 Fluent Emoji Color SVG 이미지로 교체합니다.
 *
 * 장점:
 *  - HTML/JS 코드 수정 불필요
 *  - 동적으로 추가되는 요소도 MutationObserver로 자동 처리
 *  - 크로스 플랫폼 일관성 (Windows/Mac/모바일 동일한 모양)
 *
 * 제외 대상:
 *  - <input>, <textarea>, <script>, <style>, <code>, <pre> 내부 텍스트
 *  - 단순 심볼(✅ ✓ ⚠ ✕ ➕) 및 감정 이모지 (매핑에 없으면 그대로)
 */
(function () {
  'use strict';

  const BASE = '/icons/emoji/';
  const V = '?v=1';

  const EMOJI_MAP = {
    // ── food/ — 업종 카테고리 (13) ──
    '🥩': 'food/cut-of-meat.svg',
    '🍚': 'food/cooked-rice.svg',
    '🥟': 'food/dumpling.svg',
    '🍣': 'food/sushi.svg',
    '🍙': 'food/rice-ball.svg',
    '🥖': 'food/baguette-bread.svg',
    '🍗': 'food/poultry-leg.svg',
    '🍕': 'food/pizza.svg',
    '🍱': 'food/bento-box.svg',
    '🍔': 'food/hamburger.svg',
    '🍰': 'food/shortcake.svg',
    '☕': 'food/hot-beverage.svg',
    '🥗': 'food/green-salad.svg',
    // ── food/ — 식재료 카테고리 (8) ──
    '🥬': 'food/leafy-green.svg',
    '🐟': 'food/fish.svg',
    '🌾': 'food/sheaf-of-rice.svg',
    '🧈': 'food/butter.svg',
    '🫙': 'food/jar.svg',
    '🫘': 'food/beans.svg',
    '🧊': 'food/ice.svg',
    '🥫': 'food/canned-food.svg',
    // hometab/ 아이콘(house, gear, fork-and-knife-with-plate, green-salad-line)은
    // 하단 네비게이션에서 직접 <img> 태그로 사용됩니다. (이모지 매핑 X)
    // ── (root) — 서비스 카드 + UI/Nav 아이콘 (14) ──
    '🧮': 'abacus.svg',
    '📸': 'camera-with-flash.svg',
    '📷': 'camera.svg',
    '📄': 'page-facing-up.svg',
    '🗑': 'wastebasket.svg',
    '🚪': 'door.svg',
    '📎': 'paperclip.svg',
    '🧺': 'basket.svg',
    '📊': 'bar-chart.svg',
    '🧾': 'receipt.svg',
  };

  const EMOJI_REGEX = new RegExp(
    '(' + Object.keys(EMOJI_MAP).map(e => e.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')',
    'g'
  );

  const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'INPUT', 'TEXTAREA', 'CODE', 'PRE', 'IMG', 'SVG']);

  // 인라인 스타일 (이모지처럼 라인 높이에 맞춰 표시)
  const IMG_STYLE = 'display:inline-block;height:1em;width:1em;vertical-align:-0.15em;margin:0 0.05em;';

  function shouldSkip(node) {
    while (node && node !== document.body) {
      if (node.nodeType === 1) {
        if (SKIP_TAGS.has(node.tagName)) return true;
        if (node.dataset && node.dataset.emojiProcessed === '1') return true;
        if (node.contentEditable === 'true') return true;
      }
      node = node.parentNode;
    }
    return false;
  }

  function replaceInTextNode(textNode) {
    const parent = textNode.parentNode;
    if (!parent || shouldSkip(parent)) return;

    const text = textNode.nodeValue;
    if (!text || !EMOJI_REGEX.test(text)) return;
    EMOJI_REGEX.lastIndex = 0; // reset after test

    const frag = document.createDocumentFragment();
    let last = 0;
    let m;
    while ((m = EMOJI_REGEX.exec(text)) !== null) {
      if (m.index > last) {
        frag.appendChild(document.createTextNode(text.slice(last, m.index)));
      }
      const img = document.createElement('img');
      img.src = BASE + EMOJI_MAP[m[1]] + V;
      img.alt = m[1];
      img.setAttribute('aria-label', m[1]);
      img.className = 'fluent-emoji';
      img.style.cssText = IMG_STYLE;
      img.dataset.emojiProcessed = '1';
      frag.appendChild(img);
      last = m.index + m[1].length;
    }
    if (last < text.length) {
      frag.appendChild(document.createTextNode(text.slice(last)));
    }
    parent.replaceChild(frag, textNode);
  }

  function scan(root) {
    if (!root || shouldSkip(root)) return;
    // TreeWalker로 텍스트 노드만 순회
    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(n) {
          if (!n.nodeValue || n.nodeValue.length < 1) return NodeFilter.FILTER_REJECT;
          if (shouldSkip(n.parentNode)) return NodeFilter.FILTER_REJECT;
          return EMOJI_REGEX.test(n.nodeValue)
            ? NodeFilter.FILTER_ACCEPT
            : NodeFilter.FILTER_REJECT;
        },
      }
    );
    const nodes = [];
    let node;
    while ((node = walker.nextNode())) nodes.push(node);
    nodes.forEach(replaceInTextNode);
  }

  function start() {
    // 1) 초기 DOM 전체 스캔
    scan(document.body);

    // 2) 동적 추가 컨텐츠를 위한 MutationObserver
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === 'childList') {
          m.addedNodes.forEach((n) => {
            if (n.nodeType === 1) scan(n);
            else if (n.nodeType === 3) replaceInTextNode(n);
          });
        } else if (m.type === 'characterData') {
          replaceInTextNode(m.target);
        }
      }
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
