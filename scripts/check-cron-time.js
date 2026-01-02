console.log("🕐 Checking cron schedule times...\n");

const schedules = [
	{ name: "Current (6,12,18,21 UTC)", cron: "0 6,12,18,21 * * *" },
	{ name: "Nigeria 10pm (21 UTC)", cron: "0 5,11,17,21 * * *" },
	{ name: "UTC 10pm (22 UTC)", cron: "0 6,12,18,22 * * *" },
	{ name: "User-friendly (8,14,20 UTC)", cron: "0 8,14,20 * * *" },
];

const now = new Date();
const currentUTC = now.toISOString();
const currentHourUTC = now.getUTCHours();

console.log(`Current UTC time: ${currentUTC}`);
console.log(`Current UTC hour: ${currentHourUTC}\n`);

schedules.forEach((schedule) => {
	const hours = schedule.cron.split(" ")[1].split(",");
	console.log(`${schedule.name}:`);
	console.log(`  Schedule: ${schedule.cron}`);
	console.log(`  Runs at UTC: ${hours.map((h) => `${h}:00`).join(", ")}`);

	const nextRun = hours
		.map((h) => parseInt(h))
		.filter((h) => h > currentHourUTC)
		.sort((a, b) => a - b)[0];

	if (nextRun) {
		console.log(
			`  ⏰ Next run today: ${nextRun}:00 UTC (in ${
				nextRun - currentHourUTC
			} hour${nextRun - currentHourUTC > 1 ? "s" : ""})`
		);
	} else {
		const firstRunTomorrow = Math.min(...hours.map((h) => parseInt(h)));
		console.log(`  ⏰ Next run: Tomorrow at ${firstRunTomorrow}:00 UTC`);
	}
	console.log("");
});
