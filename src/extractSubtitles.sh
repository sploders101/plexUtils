#!/bin/bash
removeMKV() {
	echo "$1" | sed 's/\.mkv$//';
}

getSubTrack() {
	echo "$(mkvmerge -i "$1" | grep ': subtitles' | head -n1)";
}
getSubTrackNum() {
	echo "$(echo "$1" | sed -r 's/Track ID ([0-9]+): subtitles .*/\1/')";
}
getSubTrackType() {
	echo "$(echo "$1" | sed -r 's/Track ID [0-9]+: subtitles \(([a-zA-Z0-9]+)\)/\1/')"
}

extractSubtitles() {
	TRACKINFO="$(getSubTrack "$1")";
	BASENAME="$(removeMKV "$1")";
	TRACKNUM="$(getSubTrackNum "$TRACKINFO")";

	if [ "$(getSubTrackType "$TRACKINFO")" == "VobSub" ]; then
		mkvextract tracks "$1" "${TRACKNUM}:${BASENAME}";
		vobsub2srt "$BASENAME";
		rm "$BASENAME.idx";
		rm "$BASENAME.sub";
	else
		mkvextract tracks "$1" "${TRACKNUM}:${BASENAME}.srt";
	fi
}

if [ -z "$1" ]; then
	ls *.mkv | while read LINE; do
		extractSubtitles "$LINE";
	done;
else
	extractSubtitles "$1";
fi
