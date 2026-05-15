const defaults = {
  years: 10,
  homePrice: 900000,
  downPaymentPercent: 20,
  mortgageRate: 6.75,
  mortgageTerm: 30,
  homeGrowth: 3.5,
  propertyTax: 1.1,
  insurance: 1800,
  maintenance: 1,
  hoa: 0,
  buyingCosts: 2,
  sellingCosts: 6,
  rent: 4200,
  rentGrowth: 3,
  stockGrowth: 7,
  expenseRatio: 0.03
};

const form = document.querySelector("#assumptions");
const resetButton = document.querySelector("#resetButton");
const marketLocation = document.querySelector("#marketLocation");
const applyLocationButton = document.querySelector("#applyLocationButton");
const locationStatus = document.querySelector("#locationStatus");
const homeType = document.querySelector("#homeType");
const chart = document.querySelector("#wealthChart");
const ctx = chart.getContext("2d");

const outputs = {
  winner: document.querySelector("#winner"),
  winnerDelta: document.querySelector("#winnerDelta"),
  buyNet: document.querySelector("#buyNet"),
  rentNet: document.querySelector("#rentNet"),
  mortgagePayment: document.querySelector("#mortgagePayment"),
  totalOwnershipCost: document.querySelector("#totalOwnershipCost"),
  startingRent: document.querySelector("#startingRent"),
  yearlyRows: document.querySelector("#yearlyRows"),
  explanation: document.querySelector("#explanation")
};

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0
});

const stateNames = {
  ALABAMA: "AL", ALASKA: "AK", ARIZONA: "AZ", ARKANSAS: "AR", CALIFORNIA: "CA", COLORADO: "CO", CONNECTICUT: "CT", DELAWARE: "DE",
  FLORIDA: "FL", GEORGIA: "GA", HAWAII: "HI", IDAHO: "ID", ILLINOIS: "IL", INDIANA: "IN", IOWA: "IA", KANSAS: "KS", KENTUCKY: "KY",
  LOUISIANA: "LA", MAINE: "ME", MARYLAND: "MD", MASSACHUSETTS: "MA", MICHIGAN: "MI", MINNESOTA: "MN", MISSISSIPPI: "MS", MISSOURI: "MO",
  MONTANA: "MT", NEBRASKA: "NE", NEVADA: "NV", "NEW HAMPSHIRE": "NH", "NEW JERSEY": "NJ", "NEW MEXICO": "NM", "NEW YORK": "NY",
  "NORTH CAROLINA": "NC", "NORTH DAKOTA": "ND", OHIO: "OH", OKLAHOMA: "OK", OREGON: "OR", PENNSYLVANIA: "PA", "RHODE ISLAND": "RI",
  "SOUTH CAROLINA": "SC", "SOUTH DAKOTA": "SD", TENNESSEE: "TN", TEXAS: "TX", UTAH: "UT", VERMONT: "VT", VIRGINIA: "VA",
  WASHINGTON: "WA", "WEST VIRGINIA": "WV", WISCONSIN: "WI", WYOMING: "WY", "DISTRICT OF COLUMBIA": "DC"
};

const homeTypeProfiles = {
  average: {
    label: "all home types",
    priceFactor: 1,
    rentFactor: 1,
    maintenance: 1,
    insuranceFactor: 1,
    hoa: 0
  },
  singleFamily: {
    label: "single-family",
    priceFactor: 1.08,
    rentFactor: 1.08,
    maintenance: 1.1,
    insuranceFactor: 1.08,
    hoa: 0
  },
  townhome: {
    label: "townhome",
    priceFactor: 0.86,
    rentFactor: 0.92,
    maintenance: 0.75,
    insuranceFactor: 0.85,
    hoa: 250
  },
  condo: {
    label: "condo",
    priceFactor: 0.72,
    rentFactor: 0.82,
    maintenance: 0.55,
    insuranceFactor: 0.7,
    hoa: 450
  },
  multiFamily: {
    label: "multi-family",
    priceFactor: 1.18,
    rentFactor: 1.15,
    maintenance: 1.2,
    insuranceFactor: 1.18,
    hoa: 0
  }
};

let activeMarketRecord = null;

function getInputs() {
  const values = {};
  new FormData(form).forEach((value, key) => {
    values[key] = Number(value) || 0;
  });
  return values;
}

function setInputs(values) {
  Object.entries(values).forEach(([key, value]) => {
    const input = form.elements[key];
    if (input) input.value = value;
  });
}

function roundTo(value, step) {
  return Math.round(value / step) * step;
}

function normalizeState(value) {
  const trimmed = value.trim();
  if (trimmed.length === 2) return trimmed.toUpperCase();
  return stateNames[trimmed.toUpperCase()] || trimmed.toUpperCase();
}

function normalizeCity(value) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function findMarketRecord(query) {
  const data = window.MARKET_DATA?.records || [];
  const parts = query.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) return null;

  const city = normalizeCity(parts[0]);
  const state = parts[1] ? normalizeState(parts[1]) : "";

  const matches = data.filter((record) => {
    const cityMatches = normalizeCity(record.city) === city;
    const stateMatches = state ? record.state === state : true;
    return cityMatches && stateMatches;
  });

  return matches.sort((a, b) => a.sizeRank - b.sizeRank)[0] || null;
}

function setLocationStatus(message, type = "") {
  locationStatus.textContent = message;
  locationStatus.className = `location-status ${type}`.trim();
}

function applyMarketRecord(record) {
  activeMarketRecord = record;
  const profile = homeTypeProfiles[homeType.value] || homeTypeProfiles.average;
  const taxRate = window.MARKET_DATA?.stateTax?.[record.state] ?? defaults.propertyTax;
  const adjustedHomeValue = record.homeValue * profile.priceFactor;
  const adjustedRent = record.rent * profile.rentFactor;
  const estimatedInsurance = Math.max(900, adjustedHomeValue * 0.0025 * profile.insuranceFactor);
  const values = {
    homePrice: roundTo(adjustedHomeValue, 1000),
    rent: roundTo(adjustedRent, 25),
    propertyTax: Number(taxRate.toFixed(2)),
    insurance: roundTo(estimatedInsurance, 50),
    maintenance: profile.maintenance,
    hoa: profile.hoa
  };

  if (Number.isFinite(record.homeGrowth)) values.homeGrowth = Math.max(-20, Math.min(30, record.homeGrowth));
  if (Number.isFinite(record.rentGrowth)) values.rentGrowth = Math.max(-10, Math.min(20, record.rentGrowth));

  setInputs(values);
  setLocationStatus(
    `Using ${record.city}, ${record.state} ${profile.label} defaults from Zillow data dated ${record.homeDate}; tax uses a state estimate.`,
    "success"
  );
  update();
}

function applyLocationDefaults() {
  const query = marketLocation.value.trim();
  if (!query) {
    setLocationStatus("Enter a city and state, for example: San Francisco, CA.", "error");
    return;
  }

  const record = findMarketRecord(query);
  if (!record) {
    setLocationStatus("I could not find that city/state in the bundled market data. Try the nearest large city.", "error");
    return;
  }

  applyMarketRecord(record);
}

function monthlyPayment(principal, annualRate, years) {
  const months = years * 12;
  const rate = annualRate / 100 / 12;
  if (months <= 0) return 0;
  if (rate === 0) return principal / months;
  return principal * (rate * (1 + rate) ** months) / ((1 + rate) ** months - 1);
}

function calculate(values) {
  const months = Math.max(1, Math.round(values.years * 12));
  const downPayment = values.homePrice * values.downPaymentPercent / 100;
  const buyingCosts = values.homePrice * values.buyingCosts / 100;
  const loan = Math.max(0, values.homePrice - downPayment);
  const payment = monthlyPayment(loan, values.mortgageRate, values.mortgageTerm);
  const mortgageRateMonthly = values.mortgageRate / 100 / 12;
  const stockRateMonthly = ((values.stockGrowth - values.expenseRatio) / 100) / 12;
  const homeRateMonthly = values.homeGrowth / 100 / 12;
  const rentRateMonthly = values.rentGrowth / 100 / 12;
  const startingOwnershipCost =
    payment +
    (values.homePrice * values.propertyTax / 100 / 12) +
    (values.homePrice * values.maintenance / 100 / 12) +
    (values.insurance / 12) +
    values.hoa;

  let balance = loan;
  let homeValue = values.homePrice;
  let rent = values.rent;
  let renterInvestments = downPayment + buyingCosts;
  let buyerInvestments = 0;
  const points = [];

  for (let month = 1; month <= months; month += 1) {
    renterInvestments *= 1 + stockRateMonthly;
    buyerInvestments *= 1 + stockRateMonthly;

    const interest = balance * mortgageRateMonthly;
    const principal = Math.min(balance, Math.max(0, payment - interest));
    balance = Math.max(0, balance - principal);

    const ownerMonthlyCost =
      payment +
      (homeValue * values.propertyTax / 100 / 12) +
      (homeValue * values.maintenance / 100 / 12) +
      (values.insurance / 12) +
      values.hoa;

    const difference = ownerMonthlyCost - rent;
    if (difference > 0) {
      renterInvestments += difference;
    } else {
      buyerInvestments += Math.abs(difference);
    }

    homeValue *= 1 + homeRateMonthly;
    rent *= 1 + rentRateMonthly;

    if (month % 12 === 0 || month === months) {
      const saleCosts = homeValue * values.sellingCosts / 100;
      const buyNet = Math.max(0, homeValue - balance - saleCosts) + buyerInvestments;
      points.push({
        year: month / 12,
        buy: buyNet,
        rent: renterInvestments,
        difference: buyNet - renterInvestments
      });
    }
  }

  const saleCosts = homeValue * values.sellingCosts / 100;
  const buyNet = Math.max(0, homeValue - balance - saleCosts) + buyerInvestments;

  return {
    buyNet,
    rentNet: renterInvestments,
    payment,
    startingOwnershipCost,
    startingRent: values.rent,
    finalHomeValue: homeValue,
    remainingMortgage: balance,
    points
  };
}

function drawChart(points) {
  const dpr = window.devicePixelRatio || 1;
  const rect = chart.getBoundingClientRect();
  chart.width = rect.width * dpr;
  chart.height = rect.height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const width = rect.width;
  const height = rect.height;
  const pad = { top: 24, right: 20, bottom: 38, left: 60 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const maxValue = Math.max(...points.flatMap((point) => [point.buy, point.rent]), 1);
  const minYear = points[0]?.year || 0;
  const maxYear = points[points.length - 1]?.year || 1;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "#e6ded0";
  ctx.lineWidth = 1;
  ctx.fillStyle = "#69736f";
  ctx.font = "12px Inter, system-ui, sans-serif";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";

  for (let i = 0; i <= 4; i += 1) {
    const y = pad.top + plotH * i / 4;
    const value = maxValue * (1 - i / 4);
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(width - pad.right, y);
    ctx.stroke();
    ctx.fillText(compactMoney(value), pad.left - 10, y);
  }

  function xScale(year) {
    if (maxYear === minYear) return pad.left;
    return pad.left + ((year - minYear) / (maxYear - minYear)) * plotW;
  }

  function yScale(value) {
    return pad.top + plotH - (value / maxValue) * plotH;
  }

  function line(key, color) {
    ctx.beginPath();
    points.forEach((point, index) => {
      const x = xScale(point.year);
      const y = yScale(point[key]);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
  }

  line("buy", "#286a4b");
  line("rent", "#2f5f9f");

  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillStyle = "#66716d";
  ctx.font = "12px Inter, system-ui, sans-serif";
  ctx.fillText(`Year ${Math.round(minYear)}`, pad.left, height - 26);
  ctx.fillText(`Year ${Math.round(maxYear)}`, width - pad.right, height - 26);

  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.font = "700 13px Inter, system-ui, sans-serif";
  ctx.fillStyle = "#286a4b";
  ctx.fillText("Buy", pad.left, 8);
  ctx.fillStyle = "#2f5f9f";
  ctx.fillText("Rent + invest", pad.left + 44, 8);
}

function compactMoney(value) {
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `$${Math.round(value / 1000)}K`;
  return money.format(value);
}

function renderYearlyTable(points) {
  outputs.yearlyRows.innerHTML = points.map((point) => {
    const differenceClass = point.difference >= 0 ? "positive-difference" : "negative-difference";
    const differenceLabel = point.difference >= 0 ? "Buy ahead" : "Rent ahead";
    return `
      <tr>
        <td>Year ${Math.round(point.year)}</td>
        <td>${money.format(point.buy)}</td>
        <td>${money.format(point.rent)}</td>
        <td class="${differenceClass}">${differenceLabel}: ${money.format(Math.abs(point.difference))}</td>
      </tr>
    `;
  }).join("");
}

function update() {
  const values = getInputs();
  const result = calculate(values);
  const delta = Math.abs(result.buyNet - result.rentNet);
  const buyWins = result.buyNet > result.rentNet;
  const tie = delta < 1000;

  outputs.buyNet.textContent = money.format(result.buyNet);
  outputs.rentNet.textContent = money.format(result.rentNet);
  outputs.mortgagePayment.textContent = money.format(result.payment);
  outputs.totalOwnershipCost.textContent = money.format(result.startingOwnershipCost);
  outputs.startingRent.textContent = money.format(result.startingRent);

  outputs.winner.textContent = tie ? "About even" : buyWins ? "Buying" : "Renting + investing";
  outputs.winnerDelta.textContent = tie
    ? `The two paths finish within ${money.format(delta)} over ${values.years} years.`
    : `${buyWins ? "Buying" : "Renting + investing"} is ahead by ${money.format(delta)} after ${values.years} years.`;

  outputs.explanation.textContent =
    `Buying ends with home equity after selling costs, minus the remaining mortgage. Renting invests ${money.format((values.homePrice * values.downPaymentPercent / 100) + (values.homePrice * values.buyingCosts / 100))} up front, plus any monthly savings versus owning.`;

  drawChart(result.points);
  renderYearlyTable(result.points);
}

form.addEventListener("input", update);
form.addEventListener("submit", (event) => event.preventDefault());
applyLocationButton.addEventListener("click", applyLocationDefaults);
marketLocation.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    applyLocationDefaults();
  }
});
homeType.addEventListener("change", () => {
  if (activeMarketRecord) {
    applyMarketRecord(activeMarketRecord);
  } else {
    setLocationStatus("Choose a home type, then enter a city/state to apply area averages.");
  }
});
resetButton.addEventListener("click", () => {
  setInputs(defaults);
  activeMarketRecord = null;
  marketLocation.value = "";
  homeType.value = "average";
  setLocationStatus("Uses bundled Zillow Research city data when a match is found.");
  update();
});

window.addEventListener("resize", update);

setInputs(defaults);
update();
