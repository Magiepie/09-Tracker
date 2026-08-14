import fs from "node:fs/promises";
import path from "node:path";

const PLAYERS_DIR = "./data/players";

const MONTHS = [
    "2026-06",
    "2026-07",
    "2026-08"
];

const counts = Object.fromEntries(
    MONTHS.map(month => [month, 0])
);

const files = await fs.readdir(PLAYERS_DIR);

let totalPlayers = 0;

for (const file of files) {
    if (!file.endsWith(".json")) continue;

    try {
        const data = JSON.parse(
            await fs.readFile(
                path.join(PLAYERS_DIR, file),
                "utf8"
            )
        );

        const snapshots = data.snapshots ?? [];

        if (!snapshots.length) continue;

        totalPlayers++;

        const activeMonths = new Set();

        for (let i = 1; i < snapshots.length; i++) {
            const month = snapshots[i].capturedAt?.slice(0, 7);

            if (MONTHS.includes(month)) {
                activeMonths.add(month);
            }
        }

        for (const month of activeMonths) {
            counts[month]++;
        }

    } catch (err) {
        console.error(
            `Failed reading ${file}: ${err.message}`
        );
    }
}

console.log("\nPlayer XP Activity");
console.log("------------------");
console.log(`Total player files: ${totalPlayers}\n`);

for (const month of MONTHS) {
    console.log(
        `${month}: ${counts[month]} players gained XP`
    );
}