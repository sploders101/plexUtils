# Plex Utilities

This is a repository of miscellaneous utilities I have written for managing a Plex server.

## Building
Make sure nodejs is installed, open a terminal in this directory, and run
```bash
yarn
yarn global add gulp
gulp
```
--or--
```bash
npm install
npm install -g gulp
gulp
```
The resulting scripts are saved in the plexUtils folder, and can be run with nodejs. If marked executable and linked to from your path, they can also be run on their own

## Configuration
Obtain API keys for all services used by the scripts you will be using, and input them into `src/.env`

## Shell scripts

These are miscellaneous shell scripts that might be useful for media prep & organization. These usually accomplish simpler tasks, or tasks for which there are already good CLI utilities, and don't use a lot of APIs

* extractSubtitles.sh
	* Description
		* Run this in a directory full of mkv files, and it will automatically find the first subtitle track of each file, and extract them, converting them to srt format. If the subtitles are VobSub, it will use vobsub2srt

## Auto-taggers

These are utilities for automatically re-sequencing TV show episodes. When buying TV shows on DVD, the DVD box or disc will typically show which episodes are on the disc, but upon ripping, you will often find that they are out of order. In order to re-sequence them, you would normally have to just watch them out of order, and rename them yourself by taking notes on the episode and matching it against the IMDB or TheTVDB descriptions. These utilities source known data about the desired episode range *for* you, and compares that data with your video files, using it to figure out which video files match the desired episodes.

### Naming
Ripping directories should be styled in this format.
Discs That contain multiple seasons may be combined as well. Metadata from thetvdb will be used to determine the break, and index accordingly.
Ex: Psych, season 1 episodes 1-5
```
Psych
| S1E1S1E5
| | title_t00.mkv
| | title_t00.srt
| | title_t01.mkv
| | title_t01.srt
| | title_t02.mkv
| | title_t02.srt
| | title_t03.mkv
| | title_t03.srt
| | title_t04.mkv
| | title_t04.srt
```

### Details
* autoTagger_sub
	* Description
		* Uses pre-matched online subtitles and levenshtein difference algorithm to match video files to episode numbers
	* Data Sources
		* http://thetvdb.com
			* Episode numbering & search
		* http://opensubtitles.org
			* Subtitles (obviously), using IMDB id from thetvdb as search query

* autoTagger_video
	* Description
		* Not Recommended. (Too unpredictable)
		* Uses episode thumbnails from TheTVDB to tag episodes using an ffmpeg difference blend filter.
	* Data Sources
		* http://thetvdb.com
			* Episode numbering, search, & thumbnails

## Archive
These files are purely for reference, and used as building blocks for other utilities.
