#!/bin/bash
# 抓取「前沿资料」条目的原文存档。
#
# 策略（按可靠性排序）：
#   1. ACL Anthology 的 PDF —— 逐一比对 HTTP Content-Length，一致才算成功；
#   2. arXiv 的 HTML 版本 —— 判断文件含 </html> 且大于 20KB；
#   3. arXiv 的 PDF —— 本机网络对它限速严重（约 4KB/s），默认跳过，除非显式给 --pdf。
#
# 用法：
#   bash scripts/fetch-frontier-originals.sh                 # 只补缺（HTML + ACL PDF）
#   bash scripts/fetch-frontier-originals.sh --pdf           # 额外尝试 arXiv PDF
#   bash scripts/fetch-frontier-originals.sh --force         # 已有的也重下
#
# 输出：RAG 每日精进/05-前沿资料/原文/*.pdf 与 原文/html/*.html

set -u

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST="$HERE/../RAG 每日精进/05-前沿资料/原文"
HTML_DEST="$DEST/html"

FORCE=0
TRY_PDF=0
for arg in "$@"; do
  case "$arg" in
    --force) FORCE=1 ;;
    --pdf)   TRY_PDF=1 ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
  esac
done

mkdir -p "$DEST" "$HTML_DEST" || exit 1

UA='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'

# ---------- 工具函数 ----------

# content_length URL -> 打印 Content-Length（取重定向链上最后一个非空值），失败打印空
content_length() {
  curl -sIL -A "$UA" --max-time 45 "$1" 2>/dev/null \
    | tr -d '\r' \
    | awk 'tolower($1)=="content-length:"{v=$2} END{print v}'
}

# fetch_pdf URL OUTFILE -> 0 表示成功且大小与 Content-Length 一致
fetch_pdf() {
  local url="$1" out="$2" exp act
  exp="$(content_length "$url")"
  if [ -z "$exp" ]; then
    echo "  SKIP（拿不到 Content-Length）: $(basename "$out")"
    return 1
  fi
  if [ "$FORCE" -eq 0 ] && [ -f "$out" ] && [ "$(stat -f%z "$out" 2>/dev/null || echo 0)" = "$exp" ]; then
    echo "  OK  已存在且完整: $(basename "$out") ($exp)"
    return 0
  fi
  curl -sL -A "$UA" -o "$out" --max-time 300 "$url" 2>/dev/null
  act="$(stat -f%z "$out" 2>/dev/null || echo 0)"
  if [ "$act" = "$exp" ] && grep -aq '%%EOF' "$out"; then
    echo "  OK  $(basename "$out") ($act)"
    return 0
  fi
  echo "  FAIL $(basename "$out") exp=$exp act=$act（已删除残片）"
  rm -f "$out"
  return 1
}

# fetch_html ARXIV_ID -> 0 表示成功
fetch_html() {
  local id="$1" out="$HTML_DEST/$1.html" v
  if [ "$FORCE" -eq 0 ] && [ -f "$out" ] && grep -q '</html>' "$out" 2>/dev/null \
     && [ "$(stat -f%z "$out" 2>/dev/null || echo 0)" -gt 20000 ]; then
    echo "  OK  已存在: $id.html"
    return 0
  fi
  for v in v3 v2 v1 ""; do
    curl -sL -A "$UA" -o "$out" --max-time 180 "https://arxiv.org/html/${id}${v}" 2>/dev/null
    if grep -q '</html>' "$out" 2>/dev/null && [ "$(stat -f%z "$out" 2>/dev/null || echo 0)" -gt 20000 ]; then
      echo "  OK  $id.html (${v:-base}, $(stat -f%z "$out"))"
      return 0
    fi
  done
  echo "  FAIL $id.html（已删除）"
  rm -f "$out"
  return 1
}

# ---------- 清单 ----------
# 格式：ACL: <anthology-id> <目标文件名>
#       ARXIV: <arxiv-id>
# 只列「前沿资料」条目实际引用过的来源。

ACL_LIST=(
  "2026.emnlp-main.1533 2026.emnlp-main.1533-TrustRAG.pdf"
  "2026.latechclfl-1.23 2026.latechclfl-1.23-pre-targeting.pdf"
  "2026.findings-eacl.35 2026.findings-eacl.35-multilingual-rag.pdf"
  "2026.aacl-long.153 2026.aacl-long.153-abstention-misleading.pdf"
  "2026.acl-long.1705 2026.acl-long.1705-Bright-Pro.pdf"
  "2026.acl-industry.149 2026.acl-industry.149-prefix-injection.pdf"
)

ARXIV_LIST=(
  2610.29188 2511.16134 2506.13405 2507.19492
  2605.09611 2605.14478 2601.14123 2606.16661
  2602.16974 2607.23507 2606.01304 2605.16608
  2611.06859 2604.26483 2509.11552 2605.03824
)

# ---------- 执行 ----------

echo "== ACL Anthology PDF（比对 Content-Length + %%EOF）=="
acl_ok=0; acl_fail=0
for item in "${ACL_LIST[@]}"; do
  set -- $item
  if fetch_pdf "https://aclanthology.org/$1.pdf" "$DEST/$2"; then acl_ok=$((acl_ok+1)); else acl_fail=$((acl_fail+1)); fi
done
echo "  小计：成功 $acl_ok / 失败 $acl_fail"

echo
echo "== arXiv HTML（含 </html> 且 >20KB）=="
html_ok=0; html_fail=0
for id in "${ARXIV_LIST[@]}"; do
  if fetch_html "$id"; then html_ok=$((html_ok+1)); else html_fail=$((html_fail+1)); fi
done
echo "  小计：成功 $html_ok / 失败 $html_fail"

if [ "$TRY_PDF" -eq 1 ]; then
  echo
  echo "== arXiv PDF（本网络下易被限速截断，失败属预期）=="
  pdf_ok=0; pdf_fail=0
  for id in "${ARXIV_LIST[@]}"; do
    if fetch_pdf "https://arxiv.org/pdf/$id" "$DEST/$id.pdf"; then pdf_ok=$((pdf_ok+1)); else pdf_fail=$((pdf_fail+1)); fi
  done
  echo "  小计：成功 $pdf_ok / 失败 $pdf_fail"
else
  echo
  echo "（arXiv PDF 未尝试；加 --pdf 可试，但本环境下多会被截断）"
fi

echo
echo "== 结果 =="
echo "PDF： $(ls "$DEST"/*.pdf 2>/dev/null | wc -l | tr -d ' ') 个，$(du -sh "$DEST" 2>/dev/null | cut -f1)"
echo "HTML：$(ls "$HTML_DEST"/*.html 2>/dev/null | wc -l | tr -d ' ') 个"
echo
echo "提示：条目里请如实写「本地存档状态」，没有存档的只写原文链接。"