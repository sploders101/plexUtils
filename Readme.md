# Plex Utilities

This is a repository of miscelanious utilities I have written for managing a Plex server.

## Configuration
Obtain API keys for all services used by the scripts you will be using, and input them into `src/.env`

## Auto-taggers

These are utilities for automatically re-sequencing TV show episodes. When buying TV shows on DVD, the DVD box or disc will typically show which episodes are on the disc, but upon ripping, you will often find that they are out of order. In order to re-sequence them, you would normally have to just watch them out of order, and rename them yourself by taking notes on the episode and matching it against the IMDB or TheTVDB descriptions. These utilities source known data about the desired episode range *for* you, and compares that data with your video files, using it to figure out which video files match the desired episodes.

* autoTagger_sub
	* Description
		* Uses pre-matched online subtitles and levenshtein difference algorithm to match video files to episode numbers
	* Data Sources
		* http://thetvdb.com
			* Episode numbering & search
		* http://opensubtitles.org
			* Subtitles (obviously), using IMDB id from thetvdb as search query
				* (They have a pretty crappy API)

* autoTagger_video
	* Description
		* Not Recommended. (Too unpredictable)
		* Uses episode thumbnails from TheTVDB to tag episodes using an ffmpeg difference blend filter.
	* Data Sources
		* http://thetvdb.com
			* Episode numbering, search, & thumbnails

## Archive
These files are purely for reference, and used as building blocks for other utilities.
