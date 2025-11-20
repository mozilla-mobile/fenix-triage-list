const fs = require('fs');

const help_string =
  `Usage: npm run <command> -- [arguments]
commands
  * update: automatically extends the json calendar with triagers using the default list, adds only one cycle
  * exempt -- <date>: removes a triager on duty at the specified <date> from the calendar and shifts all triagers
  * prepush: updates the ICS generated file with data from the json calendar (called automatically as part of push)
  * push: pushes the changes to the repo and makes them public, refreshes the ics file as well`;

const TRIAGE_JSON_FILE = "general-triage.json";
const TRIAGE_ICAL_FILE = "general-triage.ics";

function readTriage() {
  let data = fs.readFileSync(TRIAGE_JSON_FILE);
  let triage = JSON.parse(data);
  return {
    triage,
    triagers: triage.triagers,
    duties: triage["duty-start-dates"]
  };
}

function writeTriage(json) {
  let data = JSON.stringify(json, undefined, "  ");
  fs.writeFileSync(TRIAGE_JSON_FILE, data);
}

function nextTriager(triagers, current_triager) {
  let names = Object.keys(triagers);
  let index = names.findIndex(t => t === current_triager);
  if (index < 0) {
    throw `\n**** FATAL: duty-start-dates refers an unexisting triager '${current_triager}'\n`;
  }
  
  ++index;
  if (index >= names.length) {
    index = 0;
  }

  return names[index];
}

function addOneUtcMonth(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  const d = new Date(Date.UTC(year, month - 1, day));
  
  d.setUTCMonth(d.getUTCMonth() + 1);
  
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");

  return `${y}-${m}-${dd}`;
}

function commandUpdate() {
  let { triage, triagers, duties } = readTriage();

  let last_date = Object.keys(duties).sort().slice(-1);
  if (!last_date) {
    throw "\n**** UNEXPECTED: The duty calendar is empty\n";
  }
  
  [last_date] = last_date;
  let last_triager = duties[last_date];
  
  let next_date = last_date;
  let next_triager = last_triager;

  do {
    next_date = addOneUtcMonth(next_date)
    next_triager = nextTriager(triagers, next_triager);
    duties[next_date] = next_triager;
    console.log(`Added: from ${next_date} duty ${next_triager}`);
  } while (next_triager !== last_triager);

  writeTriage(triage);
  console.log("\nDon't forget to run 'npm run push' to publish the changes\n");
}

function commandPrepush() {
  const { triage, triagers, duties } = readTriage();
  
  const ical = require('ical-toolkit');
  let builder = ical.createIcsFileBuilder();

  builder.calname = "General Triage";
  builder.timezone = "Europe/Dublin";
  builder.tzid = "Europe/Dublin";
  builder.additionalTags = {
    'REFRESH-INTERVAL': 'VALUE=DURATION:P1H',
    'X-WR-CALDESC': 'General Triage'
  };

  for (let duty_date in duties) {
    let duty_triager = duties[duty_date];
    builder.events.push({
      start: new Date(duty_date),
      end: new Date(addOneUtcMonth(duty_date)),
      summary: `General triager: ${duty_triager}`,
      allDay: true,
    });
  }

  let data = builder.toString();
  fs.writeFileSync(TRIAGE_ICAL_FILE, data);
  console.log(`Updated ${TRIAGE_ICAL_FILE}`);
}

function commandExempt(exempt_date) {
  let { triage, triagers, duties } = readTriage();
  if (!(exempt_date in duties)) {
    throw `\n**** ERROR: The start date '${exempt_date}' not found in the duty list\n`;
  }

  console.log(`Removing '${duties[exempt_date]}' on duty from ${exempt_date} from the duty list`);
  
  exempt_date = new Date(exempt_date);
  let dates_to_shift = Object.keys(duties).filter(date => {
    return new Date(date).getTime() >= exempt_date;
  }).sort();

  let date;
  while (date = dates_to_shift.shift()) {
    let next_date = dates_to_shift[0];
    if (!next_date) {
      delete duties[date];
    } else {
      duties[date] = duties[next_date];
    }
  }

  writeTriage(triage);
}

let args = process.argv.slice(2);
let command = args.shift();

switch (command) {
  case "update":
    commandUpdate();
    break;
  case "exempt":
    commandExempt(args[0]);
    break;
  case "prepush":
    commandPrepush();
    break;
  default:
    console.log(help_string);
}
