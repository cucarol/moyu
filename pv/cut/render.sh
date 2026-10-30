#!/bin/sh
# Renders the PV's parts in one language into renders/pv-cut2/<part>-<zh|en>/:
#   sh pv/cut/render.sh zh-CN|en [part ...]   (default: every part)
# The parts and their lengths are story.js PARTS: the desk at noon, the machine room (half a
# second more than its PARTS dur: that half second shrinks into dusk's window, join.py), the desk
# at dusk, the raft at dusk, the raft into night (the end card goes over its end). The machine room
# goes before dusk: its last frame is the picture in dusk's window (pv/cubicle/gen/).
LANG_=${1:-zh-CN}; shift
S=$( [ "$LANG_" = en ] && echo en || echo zh )
PARTS=${*:-noon machine dusk raft yacht end}
cd "$(dirname "$0")/../.."
R="node scripts/director/render.mjs"
O=renders/pv-cut2
mkdir -p $O pv/cubicle/gen
for p in $PARTS; do
  case $p in
    noon|dusk) d=$( [ $p = noon ] && echo 11000 || echo 6250 )
      $R --page "pv/cubicle/cubicle.html?shot=$p" --lang $LANG_ --duration $d --out $O/$p-$S > $O/$p.log 2>&1 ;;
    machine) $R pv/b-machine.js --lang $LANG_ --duration 19100 --out $O/$p-$S > $O/$p.log 2>&1
      cp "$O/$p-$S/frames/$(ls $O/$p-$S/frames | tail -1)" pv/cubicle/gen/machine-$LANG_.png ;;
    raft) $R pv/c-raft.js --lang $LANG_ --duration 20600 --out $O/$p-$S > $O/$p.log 2>&1 ;;
    # at 60 fps: join.py blends each pair into one 30 fps frame, motion blur for the fast orbit
    yacht) $R pv/d-night.js --lang $LANG_ --duration 25200 --fps 60 --out $O/$p-$S > $O/$p.log 2>&1 ;;
    end) $R --page "pv/endcard.html?lang=$LANG_" --duration 5000 --no-sound --out $O/$p-$S > $O/$p.log 2>&1 ;;
  esac
  echo "$p: $(tail -1 $O/$p.log)"
done
