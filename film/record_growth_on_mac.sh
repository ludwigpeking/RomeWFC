#!/bin/bash
# Records a growth shot (film/capture_growth.js) on the Mac in a tmux session, headless Chrome
# driving a built copy of the app, and encodes the frames to an mp4. Run on the Mac from the
# project folder:
#   bash film/record_growth_on_mac.sh [shotName]      (default irregularGrowth18)
# ROME_RESUME=1 takes the shot up again from its checkpoint (written at every reload of the page)
# instead of starting over; the frames already taken stay.
# Progress: tmux attach -t romeGrowth_<shot>; ROME_DEBUGGING_PORT (9380) must differ between shots run at once; the log in film/log_<shot>.txt; the film in film/preview/<shot>.mp4;
# film/<shot>.done is written at the end.
export PATH=/opt/homebrew/bin:$PATH
cd "$(dirname "$0")/.."
SHOT=${1:-irregularGrowth18}
SESSION=${ROME_SESSION:-romeGrowth_$SHOT}
if [ -z "$ROME_SKIP_BUILD" ]; then npx vite build --base ./ --outDir dist > film/log_growth_build.txt 2>&1 || { echo "build failed, see film/log_growth_build.txt"; exit 1; }; fi
rm -f film/$SHOT.done
mkdir -p film/preview
COMMAND="export PATH=/opt/homebrew/bin:\$PATH; cd $(pwd); ROME_DEBUGGING_PORT=${ROME_DEBUGGING_PORT:-9380} ROME_RESUME=${ROME_RESUME:-0} ROME_FRAMES_BETWEEN_RELOADS=${ROME_FRAMES_BETWEEN_RELOADS:-100} node film/capture_growth.js $SHOT > film/log_$SHOT.txt 2>&1; ffmpeg -y -loglevel error -framerate 30 -i film/footage_raw/$SHOT/none/frame_%05d.jpg -c:v libx264 -preset slow -crf 19 -pix_fmt yuv420p film/preview/$SHOT.mp4 >> film/log_$SHOT.txt 2>&1; echo DONE >> film/log_$SHOT.txt; touch film/$SHOT.done"
tmux kill-session -t $SESSION 2>/dev/null
tmux new-session -d -s $SESSION -n capture "$COMMAND"
echo "started $SHOT in tmux session $SESSION"
