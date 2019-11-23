import OpenSubtitles from "opensubtitles-api";
import axios from "axios";

const os = new OpenSubtitles("TemporaryUserAgent");

(async () => {
	try {
		const result = (await os.search({
			sublanguageid: "eng",
			season: 1,
			episode: 3,
			extensions: ["srt"],
			imdbid: "tt0436992",
			limit: 50,
		})).en.sort((a, b) => b.downloads - a.downloads)[0];
		const subtitles = (await axios.get(result.url, {
			responseType: "text",
		})).data;

		console.log(subtitles);
	} catch(err) {
		console.error("Error fetching subtitles:", err);
	}

})();
