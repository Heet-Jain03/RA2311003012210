import axios from "axios";
import {
  initLogger,
  Log,
  normalizeEvaluationAuthToken,
  normalizeEvaluationBaseUrl,
} from "logging_middleware";

// ── Configuration ─────────────────────────────────────────────────────────────

const BASE_URL = normalizeEvaluationBaseUrl(
  process.env.EVALUATION_BASE_URL,
  "http://20.207.122.201"
);
const AUTH_TOKEN = normalizeEvaluationAuthToken(process.env.AUTH_TOKEN || "");

if (!AUTH_TOKEN) {
  console.error(
    "Missing AUTH_TOKEN. In PowerShell: $env:AUTH_TOKEN=\"<paste JWT from auth response>\""
  );
  process.exit(1);
}

initLogger({ authToken: AUTH_TOKEN, baseUrl: BASE_URL });

// ── Types ─────────────────────────────────────────────────────────────────────

interface Depot {
  ID: number;
  MechanicHours: number;
}

interface Vehicle {
  TaskID: string;
  Duration: number;
  Impact: number;
}

interface ScheduleResult {
  depotID: number;
  mechanicHoursAvailable: number;
  selectedTasks: Vehicle[];
  totalImpact: number;
  totalHoursUsed: number;
}

// ── API Helpers ───────────────────────────────────────────────────────────────

const apiClient = axios.create({
  baseURL: BASE_URL,
  timeout: 30_000,
  headers: {
    Authorization: `Bearer ${AUTH_TOKEN}`,
    "Content-Type": "application/json",
  },
});

async function fetchDepots(): Promise<Depot[]> {
  await Log("backend", "info", "service", "Fetching depots from evaluation API");
  try {
    const res = await apiClient.get("/evaluation-service/depots");
    const depots: Depot[] = res.data.depots;
    await Log(
      "backend",
      "info",
      "service",
      `Successfully fetched ${depots.length} depots`
    );
    return depots;
  } catch (error) {
    await Log("backend", "fatal", "service", `Failed to fetch depots: ${error}`);
    throw error;
  }
}

async function fetchVehicles(): Promise<Vehicle[]> {
  await Log("backend", "info", "service", "Fetching vehicles from evaluation API");
  try {
    const res = await apiClient.get("/evaluation-service/vehicles");
    const vehicles: Vehicle[] = res.data.vehicles;
    await Log(
      "backend",
      "info",
      "service",
      `Successfully fetched ${vehicles.length} vehicles/tasks`
    );
    return vehicles;
  } catch (error) {
    await Log(
      "backend",
      "fatal",
      "service",
      `Failed to fetch vehicles: ${error}`
    );
    throw error;
  }
}

// ── Algorithm: 0/1 Knapsack (DP) ─────────────────────────────────────────────
// Each depot has a mechanic-hour budget (capacity).
// Each vehicle task has Duration (weight) and Impact (value).
// Goal: maximise total Impact without exceeding MechanicHours.

function knapsack(vehicles: Vehicle[], capacity: number): Vehicle[] {
  const n = vehicles.length;

  // dp[i][w] = max impact using first i items with capacity w
  // We use a 1D DP array for space efficiency (O(capacity))
  const dp: number[] = new Array(capacity + 1).fill(0);
  // Track which items were selected
  const chosen: boolean[][] = Array.from({ length: n }, () =>
    new Array(capacity + 1).fill(false)
  );

  for (let i = 0; i < n; i++) {
    const { Duration, Impact } = vehicles[i];
    // Traverse backwards to avoid using same item twice
    for (let w = capacity; w >= Duration; w--) {
      if (dp[w - Duration] + Impact > dp[w]) {
        dp[w] = dp[w - Duration] + Impact;
        chosen[i][w] = true;
      }
    }
  }

  // Backtrack to find selected items
  const selected: Vehicle[] = [];
  let w = capacity;
  for (let i = n - 1; i >= 0; i--) {
    if (chosen[i][w]) {
      selected.push(vehicles[i]);
      w -= vehicles[i].Duration;
    }
  }

  return selected;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  await Log(
    "backend",
    "info",
    "service",
    "Vehicle Maintenance Scheduler started"
  );

  try {
    const [depots, vehicles] = await Promise.all([
      fetchDepots(),
      fetchVehicles(),
    ]);

    await Log(
      "backend",
      "debug",
      "domain",
      `Running knapsack scheduler for ${depots.length} depots with ${vehicles.length} tasks`
    );

    const results: ScheduleResult[] = [];

    for (const depot of depots) {
      await Log(
        "backend",
        "debug",
        "domain",
        `Processing depot ${depot.ID} with ${depot.MechanicHours} mechanic hours`
      );

      // Guard: if capacity is 0 or no tasks, skip
      if (depot.MechanicHours <= 0 || vehicles.length === 0) {
        await Log(
          "backend",
          "warn",
          "domain",
          `Depot ${depot.ID} skipped: zero capacity or no tasks available`
        );
        results.push({
          depotID: depot.ID,
          mechanicHoursAvailable: depot.MechanicHours,
          selectedTasks: [],
          totalImpact: 0,
          totalHoursUsed: 0,
        });
        continue;
      }

      const selected = knapsack(vehicles, depot.MechanicHours);
      const totalImpact = selected.reduce((sum, v) => sum + v.Impact, 0);
      const totalHoursUsed = selected.reduce((sum, v) => sum + v.Duration, 0);

      await Log(
        "backend",
        "info",
        "domain",
        `Depot ${depot.ID}: selected ${selected.length} tasks | impact=${totalImpact} | hours used=${totalHoursUsed}/${depot.MechanicHours}`
      );

      results.push({
        depotID: depot.ID,
        mechanicHoursAvailable: depot.MechanicHours,
        selectedTasks: selected,
        totalImpact,
        totalHoursUsed,
      });
    }

    // ── Output ───────────────────────────────────────────────────────────────
    console.log("\n========================================");
    console.log("  VEHICLE MAINTENANCE SCHEDULE RESULTS  ");
    console.log("========================================\n");

    for (const result of results) {
      console.log(`Depot ${result.depotID}`);
      console.log(`  Mechanic Hours Available : ${result.mechanicHoursAvailable}`);
      console.log(`  Total Hours Used         : ${result.totalHoursUsed}`);
      console.log(`  Total Impact Score       : ${result.totalImpact}`);
      console.log(`  Tasks Selected (${result.selectedTasks.length}):`);
      for (const task of result.selectedTasks) {
        console.log(
          `    - TaskID: ${task.TaskID} | Duration: ${task.Duration}h | Impact: ${task.Impact}`
        );
      }
      console.log();
    }

    await Log(
      "backend",
      "info",
      "service",
      `Scheduling complete for all ${results.length} depots`
    );
  } catch (error) {
    await Log(
      "backend",
      "fatal",
      "service",
      `Vehicle Maintenance Scheduler crashed: ${error}`
    );
    process.exit(1);
  }
}

main();
