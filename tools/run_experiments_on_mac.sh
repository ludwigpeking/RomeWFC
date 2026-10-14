#!/bin/bash
# Runs the parameter experiments (tools/experiments.js) on the Mac in a tmux session, several
# workers at once, each with its own headless Chrome; pictures for the film (1920 by 1080, 30
# snapshots). Run on the Mac from the project folder:
#   bash tools/run_experiments_on_mac.sh [workerCount]      (2 workers at most beside other jobs: 4 thrashed the 24 GB Mac)
# Progress: tmux attach -t romeExp; logs in tools/log_exp_<worker>.txt
export PATH=/opt/homebrew/bin:$PATH
cd "$(dirname "$0")/.."
WORKER_COUNT=${1:-4}
if [ -z "$ROME_SKIP_BUILD" ]; then npx vite build --base ./ --outDir dist > tools/log_exp_build.txt 2>&1 || { echo "build failed, see tools/log_exp_build.txt"; exit 1; }; fi
# ROME_RUN_NAMES: only these runs (default: all the experiments); ROME_SESSION: the tmux session (romeExp);
# ROME_FIRST_PORT: the first debugging port (9500); ROME_LAYERS: the layers pictured (all four);
# ROME_CALL_MINUTES: minutes a call to the page may take before the run fails (10)
RUN_NAMES=${ROME_RUN_NAMES:-$(node -e 'console.log(Object.keys(require("./tools/experiments").experimentRuns()).join(" "))')}
SESSION=${ROME_SESSION:-romeExp}
FIRST_PORT=${ROME_FIRST_PORT:-9500}
tmux kill-session -t $SESSION 2>/dev/null
tmux new-session -d -s $SESSION -n worker0
for ((worker = 0; worker < WORKER_COUNT; worker++)); do
  NAMES=""
  index=0
  for name in $RUN_NAMES; do
    if (( index % WORKER_COUNT == worker )); then NAMES="$NAMES $name"; fi
    index=$((index + 1))
  done
  COMMAND="export PATH=/opt/homebrew/bin:\$PATH; cd $(pwd); ROME_DEBUGGING_PORT=$((FIRST_PORT + worker)) ROME_FRAME_COUNT=${ROME_FRAME_COUNT:-30} ROME_LAYERS=\"${ROME_LAYERS:-none location height money}\" ROME_CALL_MINUTES=${ROME_CALL_MINUTES:-10} ROME_PICTURE_WIDTH=${ROME_PICTURE_WIDTH:-1920} ROME_PICTURE_HEIGHT=${ROME_PICTURE_HEIGHT:-1080} node tools/test_runs.js $NAMES > tools/log_exp_$worker.txt 2>&1; echo WORKER_DONE >> tools/log_exp_$worker.txt"
  if (( worker == 0 )); then tmux send-keys -t $SESSION:worker0 "$COMMAND" C-m; else tmux new-window -t $SESSION -n worker$worker "$COMMAND"; fi
done
echo "started $WORKER_COUNT workers over: $RUN_NAMES"
