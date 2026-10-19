#!/bin/zsh
cd "${0:A:h}" || exit 1
if curl --silent --fail http://127.0.0.1:4173/api/session >/dev/null; then
  open http://127.0.0.1:4173
  exit 0
fi
if ! command -v node >/dev/null || ! command -v npm >/dev/null; then
  print "请先安装 Node.js，再打开打印站。"
  read -r "?按回车关闭"
  exit 1
fi
open http://127.0.0.1:4173
npm run dev
read -r "?按回车关闭"
