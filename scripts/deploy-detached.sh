#!/bin/bash
# Start an existing-host deployment independently of the SSH session.
set -Eeuo pipefail
umask 077
LOG_FILE=/root/yujianxingji-deploy.log
LOCK_FILE=/run/lock/yujianxingji-deploy.lock
PID_FILE=/run/yujianxingji-deploy.pid
STATUS_FILE=/run/yujianxingji-deploy.status

main(){
  [[ $(id -u) == 0 ]] || { printf '请以 root 运行\n' >&2; exit 1; }
  for tool in setsid nohup flock bash; do
    command -v "$tool" >/dev/null || { printf '缺少启动工具：%s\n' "$tool" >&2; exit 1; }
  done
  # Acquire before touching logs or creating a process; do not trust a stale PID.
  exec 9>"$LOCK_FILE"
  if ! flock -n 9; then
    printf '部署已在运行，不重复启动。查看：tail -n 80 -f %s\n' "${LOG_FILE}"
    exit 0
  fi
  local script_dir run_dir child_pid
  script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
  run_dir=$(mktemp -d /root/yujianxingji-deploy-run.XXXXXX)
  # A snapshot survives git reset replacing scripts while deployment is running.
  cp "$script_dir/deploy-aliyun.sh" "$run_dir/deploy-aliyun.sh"
  bash -n "$run_dir/deploy-aliyun.sh"
  : > "$LOG_FILE"
  printf 'STARTING\n' > "${STATUS_FILE}"
  rm -f "$PID_FILE"
  setsid nohup bash "$run_dir/deploy-aliyun.sh" --detached-child < /dev/null > "$LOG_FILE" 2>&1 &
  child_pid=$!
  for ((attempt=0; attempt<50; attempt++)); do
    [[ -s "$PID_FILE" ]] && break
    if ! kill -0 "$child_pid" 2>/dev/null; then
      printf '后台进程未启动成功，请查看 %s\n' "${LOG_FILE}" >&2
      exit 1
    fi
    sleep 0.1
  done
  if [[ ! -s "$PID_FILE" ]]; then
    printf '后台启动尚未确认（启动 PID=%s）。请查看 %s；不要重复启动。\n' "$child_pid" "${LOG_FILE}" >&2
    exit 1
  fi
  printf '后台部署 PID=%s，SSH 断线后继续运行。\n' "$(cat "${PID_FILE}")"
  printf '查看日志：tail -n 80 -f %s\n' "${LOG_FILE}"
  printf '完成状态：cat %s（SUCCEEDED 才表示流程完成；FAILED 表示失败）\n' "${STATUS_FILE}"
  printf '运行检查：ps -p "$(cat %s)" -o pid,lstart,etime,args\n' "${PID_FILE}"
  printf '启动脚本快照：%s\n' "$run_dir/deploy-aliyun.sh"
}
main "$@"
