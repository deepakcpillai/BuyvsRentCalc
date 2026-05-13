const fs = require("fs");
const https = require("https");

const sources = {
  home: "https://files.zillowstatic.com/research/public_csvs/zhvi/City_zhvi_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv",
  rent: "https://files.zillowstatic.com/research/public_csvs/zori/City_zori_uc_sfrcondomfr_sm_month.csv"
};

const stateTax = {
  AL: 0.41, AK: 1.23, AZ: 0.62, AR: 0.62, CA: 0.75, CO: 0.49, CT: 1.79, DE: 0.61, FL: 0.82, GA: 0.83, HI: 0.29, ID: 0.63,
  IL: 2.08, IN: 0.84, IA: 1.52, KS: 1.33, KY: 0.80, LA: 0.56, ME: 1.24, MD: 1.05, MA: 1.14, MI: 1.38, MN: 1.11, MS: 0.67,
  MO: 0.91, MT: 0.74, NE: 1.63, NV: 0.48, NH: 1.93, NJ: 2.23, NM: 0.67, NY: 1.40, NC: 0.73, ND: 0.98, OH: 1.53, OK: 0.90,
  OR: 0.86, PA: 1.36, RI: 1.40, SC: 0.57, SD: 1.24, TN: 0.67, TX: 1.68, UT: 0.56, VT: 1.83, VA: 0.82, WA: 0.84, WV: 0.58,
  WI: 1.51, WY: 0.56, DC: 0.56
};

function download(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        resolve(download(res.headers.location));
        return;
      }

      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }

      let data = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => resolve(data));
    }).on("error", reject);
  });
}

function parseCsvLine(line) {
  const result = [];
  let value = "";
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === "\"") {
      if (quoted && line[i + 1] === "\"") {
        value += "\"";
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      result.push(value);
      value = "";
    } else {
      value += char;
    }
  }

  result.push(value);
  return result;
}

function normalizeKey(city, state) {
  return `${city.trim().toLowerCase()},${state.trim().toUpperCase()}`;
}

function latestValue(row, dateIndexes) {
  for (let i = dateIndexes.length - 1; i >= 0; i -= 1) {
    const value = Number(row[dateIndexes[i]]);
    if (Number.isFinite(value) && value > 0) return { value, index: dateIndexes[i] };
  }
  return null;
}

function valueAtLeastMonthsBefore(row, dateIndexes, latestIndex, months) {
  const latestDatePosition = dateIndexes.indexOf(latestIndex);
  const targetPosition = Math.max(0, latestDatePosition - months);

  for (let i = targetPosition; i >= 0; i -= 1) {
    const value = Number(row[dateIndexes[i]]);
    if (Number.isFinite(value) && value > 0) {
      return { value, monthsBack: latestDatePosition - i };
    }
  }

  return null;
}

function growthRate(row, dateIndexes, latest) {
  const prior = valueAtLeastMonthsBefore(row, dateIndexes, latest.index, 60);
  if (!prior || prior.value <= 0 || prior.monthsBack < 24) return null;
  return ((latest.value / prior.value) ** (12 / prior.monthsBack) - 1) * 100;
}

function loadRows(csv, mode) {
  const lines = csv.trim().split(/\r?\n/);
  const headers = parseCsvLine(lines[0]);
  const cityIndex = headers.indexOf("RegionName");
  const stateIndex = headers.indexOf("State");
  const rankIndex = headers.indexOf("SizeRank");
  const metroIndex = headers.indexOf("Metro");
  const countyIndex = headers.indexOf("CountyName");
  const dateIndexes = headers
    .map((header, index) => (/^\d{4}-\d{2}-\d{2}$/.test(header) ? index : -1))
    .filter((index) => index >= 0);
  const rows = new Map();

  for (let i = 1; i < lines.length; i += 1) {
    const row = parseCsvLine(lines[i]);
    const city = row[cityIndex];
    const state = row[stateIndex];
    if (!city || !state) continue;

    const latest = latestValue(row, dateIndexes);
    if (!latest) continue;

    rows.set(normalizeKey(city, state), {
      city,
      state,
      sizeRank: Number(row[rankIndex]) || 999999,
      metro: row[metroIndex] || "",
      county: row[countyIndex] || "",
      value: Math.round(latest.value),
      growth: growthRate(row, dateIndexes, latest),
      latestDate: headers[latest.index],
      mode
    });
  }

  return rows;
}

function buildMarketData(homeRows, rentRows) {
  const records = [];

  for (const [key, home] of homeRows.entries()) {
    const rent = rentRows.get(key);
    if (!rent) continue;

    records.push({
      key,
      city: home.city,
      state: home.state,
      metro: home.metro,
      county: home.county,
      sizeRank: home.sizeRank,
      homeValue: home.value,
      rent: rent.value,
      homeGrowth: home.growth == null ? null : Number(home.growth.toFixed(2)),
      rentGrowth: rent.growth == null ? null : Number(rent.growth.toFixed(2)),
      homeDate: home.latestDate,
      rentDate: rent.latestDate
    });
  }

  return records.sort((a, b) => a.sizeRank - b.sizeRank).slice(0, 5000);
}

function buildStandaloneHtml() {
  const html = fs.readFileSync("index.html", "utf8");
  const css = fs.readFileSync("styles.css", "utf8");
  const market = fs.readFileSync("market-data.js", "utf8");
  const js = fs.readFileSync("script.js", "utf8");

  return html
    .replace("    <link rel=\"stylesheet\" href=\"styles.css\">", `    <style>\n${css}\n    </style>`)
    .replace(
      "    <script src=\"market-data.js\"></script>\n    <script src=\"script.js\"></script>",
      `    <script>\n${market}\n    </script>\n    <script>\n${js}\n    </script>`
    );
}

async function main() {
  const [homeCsv, rentCsv] = await Promise.all([download(sources.home), download(sources.rent)]);
  const records = buildMarketData(loadRows(homeCsv, "home"), loadRows(rentCsv, "rent"));
  const generatedAt = new Date().toISOString();
  const output = [
    `// Generated from Zillow Research public city ZHVI and ZORI CSVs on ${generatedAt.slice(0, 10)}.`,
    "// Keep this file small enough to host as a static asset.",
    `window.MARKET_DATA = ${JSON.stringify({ generatedAt, source: "Zillow Research public data", records, stateTax })};`,
    ""
  ].join("\n");

  fs.writeFileSync("market-data.js", output);
  fs.writeFileSync("buy-or-rent-calculator.html", buildStandaloneHtml());

  console.log(`Wrote ${records.length} market records.`);
  console.log(`Latest home date: ${records[0]?.homeDate || "unknown"}`);
  console.log(`Latest rent date: ${records[0]?.rentDate || "unknown"}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
