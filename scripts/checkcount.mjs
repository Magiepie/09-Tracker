import fs from "node:fs/promises";
import path from "node:path";

const PLAYERS_DIR = "./data/players";

const MONTHS = [
    "2026-06",
    "2026-07",
    "2026-08",
];

const counts = Object.fromEntries(MONTHS.map(month => [month, 0]));

const files = await fs.readdir(PLAYERS_DIR);

for (const file of files) {
    if (!file.endsWith(".json")) continue;

    const filePath = path.join(PLAYERS_DIR, file);

    try {
        const data = JSON.parse(await fs.readFile(filePath, "utf8"));
        const snapshots = data.snapshots ?? [];

        if (snapshots.length < 2) continue;

        const activeMonths = new Set();

        for (let i = 1; i < snapshots.length; i++) {
            const previous = snapshots[i - 1];
            const current = snapshots[i];

            const month = current.capturedAt?.slice(0, 7);

            if (!MONTHS.includes(month)) continue;

            if (totalXp(current) > totalXp(previous)) {
                activeMonths.add(month);
            }
        }

        for (const month of activeMonths) {
            counts[month]++;
        }

    } catch (err) {
        console.error(`Failed reading ${file}:`, err.message);
    }
}

console.log("\nPlayer XP Activity\n");

for (const month of MONTHS) {
    console.log(`${month}: ${counts[month]} players gained XP`);
}

function totalXp(snapshot) {
    // Handles a few possible snapshot structures.
    if (typeof snapshot.totalXp === "number") {
        return snapshot.totalXp;
    }

    if (Array.isArray(snapshot.skills)) {
        return snapshot.skills.reduce(
            (sum, skill) => sum + Number(skill.experience ?? skill.xp ?? 0),
            0
        );
    }

    if (snapshot.skills && typeof snapshot.skills === "object") {
        return Object.values(snapshot.skills).reduce(
            (sum, skill) =>
                sum + Number(skill?.experience ?? skill?.xp ?? 0),
            0
        );
    }

    return 0;
}