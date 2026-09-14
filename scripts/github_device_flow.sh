#!/bin/bash
# GitHub Device Flow 轮询脚本：等待用户在浏览器完成授权，获取 token
# 用法: nohup bash scripts/github_device_flow.sh > /dev/null 2>&1 &

BASE="/home/z/my-project"
RESP="$BASE/.device_code_response.json"
TOKEN_FILE="$BASE/.github_token"
LOG="$BASE/.device_flow.log"

CLIENT_ID="178c6fc778ccc68e1d6a"

DEVICE_CODE=$(python3 -c "import json;print(json.load(open('$RESP'))['device_code'])")
INTERVAL=$(python3 -c "import json;print(json.load(open('$RESP')).get('interval',5))")
EXPIRES=$(python3 -c "import json;print(json.load(open('$RESP')).get('expires_in',900))")

echo "[$(date '+%F %T')] 轮询开始 (interval=${INTERVAL}s, expires=${EXPIRES}s)" >> "$LOG"

ELAPSED=0
while [ $ELAPSED -lt $EXPIRES ]; do
  sleep "$INTERVAL"
  ELAPSED=$((ELAPSED + INTERVAL))

  BODY=$(curl -s -X POST https://github.com/login/oauth/access_token \
    -H "Accept: application/json" \
    -d "client_id=${CLIENT_ID}&device_code=${DEVICE_CODE}&grant_type=urn:ietf:params:oauth:grant-type:device_code")

  ERR=$(echo "$BODY" | python3 -c "import json,sys;print(json.load(sys.stdin).get('error',''))" 2>/dev/null)
  TOKEN=$(echo "$BODY" | python3 -c "import json,sys;print(json.load(sys.stdin).get('access_token',''))" 2>/dev/null)

  if [ -n "$TOKEN" ]; then
    printf '%s' "$TOKEN" > "$TOKEN_FILE"
    chmod 600 "$TOKEN_FILE"
    echo "[$(date '+%F %T')] ✅ 授权成功，token 已保存到 $TOKEN_FILE" >> "$LOG"
    rm -f "$RESP"
    exit 0
  fi

  case "$ERR" in
    authorization_pending)
      echo "[$(date '+%F %T')] 等待用户授权... (${ELAPSED}s)" >> "$LOG"
      ;;
    slow_down)
      INTERVAL=$((INTERVAL + 5))
      echo "[$(date '+%F %T')] 收到 slow_down，间隔调整为 ${INTERVAL}s" >> "$LOG"
      ;;
    expired_token|access_denied)
      echo "[$(date '+%F %T')] ❌ 流程终止: $ERR" >> "$LOG"
      exit 1
      ;;
    *)
      echo "[$(date '+%F %T')] 未知响应: $BODY" >> "$LOG"
      ;;
  esac
done

echo "[$(date '+%F %T')] ❌ 授权码已过期（${EXPIRES}s）" >> "$LOG"
exit 1
