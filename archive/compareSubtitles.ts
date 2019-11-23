import * as fs from "fs";
import { promisify } from "util";
import * as worker from "worker_threads";

const readFile = promisify(fs.readFile);
const readdir = promisify(fs.readdir);

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
		.replace(/(?:^.*-->.*$|^[0-9]+$|[^a-zA-Z0-9_' ?\.,!"\-\n]|^\s*-*\s*|\r)/gm, "")
		.split("\n")
		.filter((val) => val)
		.join(" ")
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
			const lev = require("js-levenshtein");
			worker.parentPort.postMessage(lev(...worker.workerData));
		`, {
			eval: true,
			workerData: [src, dest],
		});
		levWorker.on("message", resolve);
	});
}


(async () => {
	// Import all subtitles and minify
	const [
		src,
		extracted,
	] = await Promise.all([
		// Src
		Promise.all(
			(await readdir("./src")) // Reads all files in dir
				.filter((val) => val.match(/^S[0-9]+E[0-9]+.srt/)) // Filters out only properly-named subtitles
				.map(async (file) => ({
					episode: file.replace(/\.srt$/, ""), // Add episode name to entry
					text: minifySubs(await readFile("./src/" + file, "utf8")), // Read file, minify, and cache text for processing
				}))
		, ),
		// Extracted
		Promise.all(
			(await readdir("./")) // Reads all files in dir
				.filter((name) => name.match(/.*\.srt$/)) // Filters out only subtitles
				.map(async (file) => ({
					filename: file.replace(/\.srt$/, ""), // Add base name of extracted subtitles (for later rename)
					text: minifySubs(await readFile("./" + file, "utf8")), // Read file, minify, and cache text for processing
				}))
		, ),
	]);

	// Signal we are done reading files
	console.log("Results:");

	// Map src array into matched results
	src.map(async (target) => ({
		episode: target.episode, // Keep episode name in entry
		result: (await Promise.all(extracted.map(async (sample) => ({ // Use promise.all and extracted.map for multi-threading
			filename: sample.filename, // Keep filename
			likeness: await lev(target.text, sample.text), // Tag combination with similarity
		})))).sort((a, b) => a.likeness - b.likeness)[0].filename, // Get the lowest-ranked levenshtein distance as the result
	})).forEach(async (result) => { // For each promise running in parallel...
		const res = await result; // Wait for it to finish
		console.log(res.episode + ": ", res.result); // Log the match
	});
})();
