import * as gulp from "gulp";
import * as ts from "gulp-typescript";
import * as fs from "fs";
import * as cp from "child_process";
const tsProj = ts.createProject("tsconfig.json");

const distName = "plexUtils";

gulp.task("ts", () =>
	gulp.src("src/**/*.ts")
		.pipe(tsProj())
		.pipe(gulp.dest(distName)));

gulp.task("sh", () =>
	gulp.src("src/**/*.sh")
		.pipe(gulp.dest(distName)));

gulp.task("env", () =>
	gulp.src("src/.env")
		.pipe(gulp.dest(distName)));

gulp.task("package.json", (cb) => {
	fs.readFile(`${__dirname}/package.json`, "utf8", (err, data) => {
		if(err) throw err;
		const packageInfo = JSON.parse(data);
		packageInfo.main = packageInfo.main.split("/").slice(1).join("/").replace(/\.ts$/, ".js");
		delete packageInfo.devDependencies;
		fs.mkdir(`${__dirname}/${distName}`, () => {
			fs.writeFile(
				`${__dirname}/${distName}/package.json`,
				JSON.stringify(packageInfo),
				(writeErr) => {
					if(writeErr) throw writeErr;
					cb();
				},
			);
		});
	});
});

gulp.task("installDeps", (cb) => {
	const yarn = cp.spawn("yarn", {
		cwd: `${__dirname}/${distName}`,
	});
	yarn.on("exit", cb);
});

gulp.task("default", gulp.series(
	gulp.parallel(
		"ts",
		"sh",
		"env",
		"package.json",
	),
	"installDeps",
));
