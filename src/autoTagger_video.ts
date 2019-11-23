#!/usr/bin/node
/*
	Auto-tags episodes based on an episode range and thumbnails from thetvdb.com
	This program requires ffmpeg, and uses it for comparing a set of thumbnails
	to each video, ranking the likelihood that they are a match. If there is
	enough distinction between the probability of a match for each thumbnail, it
	will automatically rename the episode to match the season and episode.
*/

// Import config
import * as dotenv from "dotenv";
dotenv.config({
	path: __dirname + "/.env",
});

const videoExts = [
	"mkv",
	"mp4",
	// I only use mkv, but you can add more if you like
];

const percentMatch = 85;
const thresholdMatch = 50;
const scaleRes = "400:224";

import axiosConstructor from "axios";
import * as inquirer from "inquirer";
import * as fs from "fs";
import { Stream } from "stream";
import * as cp from "child_process";
import { promisify } from "util";

(async () => {
	console.log("Logging into thetvdb.com...");

	// Log in and get a JWT
	const token = (await axiosConstructor.post("https://api.thetvdb.com/login", {
		apikey: process.env.THETVDB_API_KEY,
	})).data.token;

	// Create axios instance that includes JWT for convenience
	const axios = axiosConstructor.create({
		headers: {
			Authorization: "Bearer " + token,
		},
	});

	console.log("Logged in.");

	// Extrapolate information from directory
	const showPath = process.cwd().split("/");
	const showName = showPath[showPath.length - 2];
	const episodeRange = showPath[showPath.length - 1].match(/[sS]([0-9]+)[eE]([0-9]+)[sS]([0-9]+)[eE]([0-9]+)/);
	const startSeason = Number(episodeRange[1]);
	const startEpisode = Number(episodeRange[2]);
	const endSeason = Number(episodeRange[3]);
	const endEpisode = Number(episodeRange[4]);

	console.log(`Searching for ${showName}...`);

	// List shows matching criteria
	const showResults = await axios.get("https://api.thetvdb.com/search/series?name=" + encodeURIComponent(showName));

	// Prompt user for show (gets specific ID)
	const showID = (await inquirer.prompt({
		type: "list",
		name: "show",
		message: "Please match show?",
		choices: showResults.data.data.map((show) => ({
			name: show.seriesName,
			value: show.id,
		})),
	})).show;

	console.log("Calculating episode range...");

	// Create array of episodes that should be in this directory
	const episodes = [];
	for(let i = startSeason; i <= endSeason; i++) {
		const episodeResults = await axios.get(`https://api.thetvdb.com/series/${showID}/episodes/query?airedSeason=${i}`);
		episodes.push(...episodeResults.data.data.filter((episode) => (true
			&& !(true // Filter if before starting episode
				&& episode.airedSeason === startSeason
				&& episode.airedEpisodeNumber < startEpisode
			)
			&& !(true // Filter if after ending episode
				&& episode.airedSeason === endSeason
				&& episode.airedEpisodeNumber > endEpisode
			)
		)));
	}

	console.log("Fetching Banners...");

	// Fetch banners
	const fetchers: Array<Promise<string>> = [];
	for(let i = 0; i < episodes.length; i++) {
		fetchers.push((async () => {
			// Query banner
			const resp = await axios.get<Stream>(`https://thetvdb.com/banners/${episodes[i].filename}`, {
				responseType: "stream",
			});

			// Calculate filename
			const filename = `./S${
				episodes[i].airedSeason
			}E${
				episodes[i].airedEpisodeNumber
			}.${
				episodes[i].filename.split(".")[1]
			}`;

			// Pipe banner to appropriately-named file
			const file = fs.createWriteStream(filename);
			resp.data.pipe(file);

			// Wait to finish piping
			await new Promise((resolve, reject) => {
				resp.data.once("end", resolve);
				resp.data.once("error", reject);
			});

			// Return saved filename
			return filename;
		})());
	}
	const bannerFiles = await Promise.all(fetchers);

	// Check videos against banners
	console.log("Banners retrieved.");
	console.log("Comparing episodes. This could take a while...");
	console.log("If your terminal supports the bell character, you will get a notification when finished");

	const episodeFiles = await findEpisodes();
	const episodeMatchers: Array<Promise<{
		season: number;
		episode: number;
		fileInQuestion: string;
		matches: Array<{
			confidence: number;
			start: number;
			end: number;
		}>
	}>> = [];

	for (let i = 0; i < episodeFiles.length; i++) {
		const episode = episodeFiles[i];
		episodeMatchers.push(...bannerFiles.map((bannerFile) => (async () => {
			const matches = await compare(episode, bannerFile, percentMatch, thresholdMatch);
			const episodeMatch = bannerFile.match(/S([0-9]+)E([0-9]+)/);
			return {
				season: Number(episodeMatch[1]),
				episode: Number(episodeMatch[2]),
				fileInQuestion: episode,
				matches,
			};
		})()));
	}

	const episodeMatches = new Map<string, any[]>();

	(await Promise.all(episodeMatchers)).forEach((episodeMatch) => {
		const epString = `S${episodeMatch.season}E${episodeMatch.episode}`;
		if(!episodeMatches.has(epString)) {
			episodeMatches.set(epString, []);
		}
		episodeMatches.get(epString).push(episodeMatch);
	});

	let conflicts = false;
	const usedFiles = [];

	// Check for conflicts
	for (const [key, val] of episodeMatches.entries()) {
		for (let j = 0; j < val.length; j++) {
			const file = val[j];
			if(file.matches.length) {
				if(usedFiles.indexOf(file.fileInQuestion) === -1) {
					usedFiles.push(file.fileInQuestion);
				} else {
					conflicts = true;
					break;
				}
			}
		}
		if(conflicts) break;
	}

	// If conflicts are found, log results for user intervention
	episodeMatches.forEach((val, key) => {
		fs.writeFile(`./${key}.json`, JSON.stringify(val, null, "\t"), (err) => {
			if(err) throw err;
		});
	});
	if(conflicts) {
		console.log("Conflicts found. User intervention required. Stored results as SxxExx.json files");
	} else {
		// Otherwise, rename the files!
		episodeMatches.forEach((val, key) => {
			for (let i = 0; i < val.length; i++) {
				const episode = val[i];
				if(episode.matches.length) {
					// Rename
					const renameTo = `${key}.${episode.fileInQuestion.split(".").pop()}`;
					fs.rename(episode.fileInQuestion, renameTo, (err) => {
						if(err) throw err;
						console.log(`${episode.fileInQuestion} renamed to ${renameTo}`);
					});
					break;
				}
			}
		});
		console.log("No conflicts found. Renaming media...");
	}

	// Ring bell to alert user, even from ssh shell
	process.stdout.write(String.fromCharCode(7));

})();

function parseMeta(template: string) {
	const info: Array<{
		frame: number;
		pts: number;
		ptsTime: number;
		meta: any;
	}> = [];
	template.split("\n").filter((val) => val).forEach((val) => {
		const matchFrameStart = val.match(/^frame:([0-9]+)\s*pts:([0-9]+)\s*pts_time:([0-9.]+)/);
		const matchMeta = val.match(/(.*)=(.*)/);

		if(matchFrameStart) {
			const frame = matchFrameStart[1];
			const pts = matchFrameStart[2];
			const ptsTime = matchFrameStart[3];
			info.push({
				frame: Number(frame),
				pts: Number(pts),
				ptsTime: Number(ptsTime),
				meta: {},
			});
			return;
		} else if(matchMeta) {
			info[info.length - 1].meta[matchMeta[1]] = matchMeta[2];
			return;
		}
	});
	return info;
}

async function compare(src: string, thumbnail: string, minPercentage: number, threshold: number) {

	const filterComplex = `[0]scale=${scaleRes}[s1];[1]scale=${scaleRes}[s2];[s1][s2]blend=difference,blackframe=${
		minPercentage
	}:${
		threshold
	},metadata=mode=print:key=lavfi.blackframe.pblack:file='pipe\\:1'`;

	// console.log(`Scanning ${src} for ${thumbnail} using ${filterComplex}`);

	// Spawn ffmpeg with comparison filter
	const ffmpeg = cp.spawn("ffmpeg", [
		// Don't log unnecessary output
		"-loglevel", "quiet",
		// Source
		"-i", src,
		// Thumbnail to search for
		"-i", thumbnail,
		// Loop thumbnail into a video feed for comparison
		"-loop", "1",
		// Drop timestamps. Thumbnail loops have duplicates, which causes issues
		"-vsync", "2",
		// Thumbnail loops forever, so stop at end of video
		"-shortest",
		// Our filter for detecting matches
		"-filter_complex", filterComplex,
		// Don't encode
		"-f", "null",
		// Pipe to stdout (not encoding, so this just satisfies output constraint)
		"-",
	], {
		stdio: ["ignore", "pipe", "inherit"],
	});

	// Read data
	const data = [];
	ffmpeg.stdout.on("data", (chunk) => data.push(chunk));
	await new Promise((resolve, reject) => {
		ffmpeg.stdout.once("end", resolve);
		ffmpeg.stdout.once("error", reject);
	});

	const parsedMeta = parseMeta(Buffer.concat(data).toString());
	const matches: Array<{
		confidence: number;
		start: number;
		end: number;
	}> = [];

	for (let i = 0; i < parsedMeta.length; i++) {
		// Get data for current frame
		const meta = parsedMeta[i];
		const confidence = Number(meta.meta["lavfi.blackframe.pblack"]);

		// Check last match & group
		if(matches.length && meta.ptsTime - matches[matches.length - 1].end < 2) {
			// Set max confidence
			if(matches[matches.length - 1].confidence < confidence) matches[matches.length - 1].confidence = confidence;
			// Set new end time
			matches[matches.length - 1].end = meta.ptsTime;
			// Since we modified the previous entry, no need to add a new one.
			continue;
		}

		// Add new entry
		matches.push({
			confidence,
			start: meta.ptsTime,
			end: meta.ptsTime,
		});
	}

	return matches;

}

async function findEpisodes() {
	return (await promisify(fs.readdir)("."))
		.filter((filename) => {
			const ext = filename.split(".").pop();
			return videoExts.indexOf(ext) !== -1;
		});
}
