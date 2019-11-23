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

import axiosConstructor from "axios";
import * as inquirer from "inquirer";
import * as fs from "fs";
import { promisify } from "util";
import OpenSubtitles from "opensubtitles-api";
import * as worker from "worker_threads";

const readFile = promisify(fs.readFile);
const readdir = promisify(fs.readdir);
const rename = promisify(fs.rename);
const unlink = promisify(fs.unlink);

const os = new OpenSubtitles({
	useragent: "TemporaryUserAgent",
	ssl: false,
});

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

	const showMeta = (await axios.get("https://api.thetvdb.com/series/" + showID)).data.data;

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

	console.log("Fetching Subtitles from opensubtitles.org...");

	// Fetch top-ranked subtitles
	const episodeSubtitles = await Promise.all(episodes.map(async (episode) => {
		const result = (await os.search({
			sublanguageid: "eng",
			season: episode.airedSeason,
			episode: episode.airedEpisodeNumber,
			extensions: ["srt"],
			imdbid: showMeta.imdbId,
			// limit: 50,
		})).en
			// .sort((a, b) => b.downloads - a.downloads)
			// [0]
		;
		const subtitles = (await axios.get(result.url, {
			responseType: "text",
		})).data;

		return {
			episode: `S${episode.airedSeason}E${episode.airedEpisodeNumber}`,
			original: subtitles,
			text: minifySubs(subtitles),
		};
	}));

	const { subsToPrint }: { printSubs: boolean, subsToPrint: number[] } = await inquirer.prompt([
		{
			name: "printSubs",
			type: "confirm",
			default: false,
			message: "Print fetched subtitles?",
		},
		{
			name: "subsToPrint",
			type: "checkbox",
			when: (answers) => answers.printSubs,
			choices: episodeSubtitles.map((record, i) => ({
				name: record.episode,
				value: i,
			})),
		},
	]);

	if(subsToPrint && subsToPrint) {
		console.log();
		subsToPrint.forEach((subIndex) => {
			console.log(episodeSubtitles[subIndex].episode + ":");
			console.log(episodeSubtitles[subIndex].text);
			console.log();
		});
	}

	console.log("Reading subtitles extracted from mkvs...");

	const extractedSubtitles = await Promise.all(
		(await readdir("./")) // Reads all files in dir
			.filter((name) => name.match(/.*\.srt$/)) // Filters out only subtitles
			.map(async (file) => ({
				filename: file.replace(/\.srt$/, ""), // Add base name of extracted subtitles (for later rename)
				text: minifySubs(await readFile("./" + file, "utf8")), // Read file, minify, and cache text for processing
			}))
	, );

	console.log("Running levenshtein distance...");

	// Map src array into matched results
	const matches = await Promise.all(
		episodeSubtitles.map(async (target) => ({
			episode: target.episode, // Keep episode name in entry
			// Use promise.all and extracted.map for multi-threading
			results: (await Promise.all(extractedSubtitles.map(async (sample) => ({
				filename: sample.filename, // Keep filename
				likeness: await lev(target.text, sample.text), // Tag combination with similarity
			// Get the lowest-ranked levenshtein distance as the result
			})))).sort((a, b) => a.likeness - b.likeness),
		})),
	);

	console.log();
	matches.forEach((match) => {
		console.log(`${
			match.results[0].filename
		}.mkv => ${
			match.episode
		}.mkv (likeness: ${
			match.results[0].likeness
		}, closest negative: ${
			match.results[1].likeness
		})`);
	});
	console.log();

	const shouldRename = (await inquirer.prompt({
		name: "confirm",
		type: "confirm",
		default: true,
		message: "Rename?",
	})).confirm;

	if(shouldRename) {
		await Promise.all(
			matches.map(async (match) => Promise.all([
				rename(match.results[0].filename + ".mkv", match.episode + ".mkv"),
				unlink(match.results[0].filename + ".srt"),
			])),
		);
		console.log("Renamed.");
	}

})();

/**
 * Strips extra information from srt-formatted subtitles.
 *
 * We're more concerned with order of words than timing,
 * so this turns srt-formatted subtitles into one giant
 * block of text, ready for analysis.
 *
 * @param str subtitles in srt format or plain text
 */
function minifySubs(str: string) {
	return str
		.replace(/(?:<\s*[^>]*>|<\s*\/\s*a>)/g, " ") // Strip html tags (usually from CC)
		.replace(/(?:^.*-->.*$|^[0-9]+$|[^a-zA-Z0-9_' ?\.,!"\-\n]|^\s*-*\s*|\r)/gm, "") // Strip unnecessary symbols
		.replace("\n", " ")
		.replace(/ {2,}/g, " ")
	;
}

/**
 * Calculate levenshtein distance between 2 strings.
 *
 * Since this is a synchronous operation, we run it
 * in a worker to prevent blocking the event loop,
 * and allow for multi-threaded operation.
 *
 * @param src string 1
 * @param dest string 2
 */
function lev(src: string, dest: string) {
	return new Promise<number>((resolve, reject) => {
		const levWorker = new worker.Worker(`
			const worker = require("worker_threads");
			const lev = require(${JSON.stringify(require.resolve("js-levenshtein"))});
			worker.parentPort.postMessage(lev(...worker.workerData));
		`, {
			eval: true,
			workerData: [src, dest],
		});
		levWorker.on("message", resolve);
	});
}
