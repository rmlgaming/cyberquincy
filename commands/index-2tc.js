const GoogleSheetsHelper = require('../helpers/google-sheets.js');

const createCsvWriter = require('csv-writer').createObjectCsvWriter;

const gHelper = require('../helpers/general.js');

const OG_COLS = {
    NUMBER: 'B',
    TOWER_1: 'C',
    TOWER_2: 'E',
    UPGRADES: 'G',
    MAP: 'I',
    VERSION: 'K',
    DATE: 'L',
    PERSON: 'M',
    LINK: 'O',
    CURRENT: 'P',
};

const ALT_COLS = {
    NUMBER: 'R',
    MAP: 'S',
    PERSON: 'U',
    LINK: 'W',
};

module.exports = {
    name: 'ptc',
    cooldown: 10,
    execute,
    dependencies: ['btd6index'],
};

async function execute() {
    allCombos = await scrapeAllCombos();

    outputCSV(allCombos);
}

function outputCSV(combos) {
    const createCsvWriter = require('csv-writer').createObjectCsvWriter;
    console.log(combos[0])
    newCombos = combos.map(c => {
        let r = Object.keys(c.MAPS).map(m => {
            let h = c.MAPS[m]

            let l = {}
            l.NUMBER = c.NUMBER.replace("*", "")
            l.TOWER_1_NAME = c.TOWER_1.NAME
            if (h.OG) {
                l.TOWER_1_UPGRADE = c.TOWER_1.UPGRADE
            } else {
                l.TOWER_1_UPGRADE = ''
            }
            l.TOWER_2_NAME = c.TOWER_2.NAME
            if (h.OG) {
                l.TOWER_2_UPGRADE = c.TOWER_2.UPGRADE
            } else {
                l.TOWER_2_UPGRADE = ''
            }
            l.MAP = m
            if (h.OG) {
                l.DATE = c.DATE
            } else {
                l.DATE = ''
            }
            l.LINK = h.LINK
            return l;
        });
        console.log(r);
        return r;
    }).flat()
    console.log(newCombos)
    const csvWriter = createCsvWriter({
        path: 'out.csv',
        header: Object.keys(newCombos[0]).map(k => {
            return {id: k, title: gHelper.toTitleCase(k.replace(/_/g, ' '))}
        })
    });
    console.log(newCombos[0])
    csvWriter.writeRecords(newCombos).then(()=> console.log('The CSV file was written successfully'));
}

function sheet2TC() {
    return GoogleSheetsHelper.sheetByName(Btd6Index, '2tc');
}

async function scrapeAllCombos() {
    ogCombos = await scrapeAllOGCombos();
    altCombos = await scrapeAllAltCombos();
    return mergeCombos(ogCombos, altCombos);
}

function mergeCombos(ogCombos, altCombos) {
    mergedCombos = [];

    for (var i = 0; i < ogCombos.length; i++) {
        toBeMergedOgCombo = ogCombos[i];

        map = toBeMergedOgCombo.MAP;
        delete toBeMergedOgCombo.MAP; // Incorporated as key of outer Object within array index

        person = toBeMergedOgCombo.PERSON;
        delete toBeMergedOgCombo.PERSON; // Incorporated as key-value pair in comboObject

        link = toBeMergedOgCombo.LINK;
        delete toBeMergedOgCombo.LINK; // Incorporated as key-value pair in comboObject

        comboObject = {
            ...toBeMergedOgCombo,
            MAPS: {},
        };
        comboObject.MAPS[map] = {
            PERSON: person,
            LINK: link,
            OG: true,
        };

        mergedCombos.push(comboObject);
    }

    for (var i = 0; i < altCombos.length; i++) {
        toBeMergedAltCombo = altCombos[i];

        n = gHelper.fromOrdinalSuffix(toBeMergedAltCombo.NUMBER);
        delete toBeMergedAltCombo.NUMBER;

        map = toBeMergedAltCombo.MAP;
        delete toBeMergedAltCombo.MAP;

        mergedCombos[n - 1].MAPS[map] = {
            ...toBeMergedAltCombo,
            OG: false,
        };
    }

    return mergedCombos;
}

async function scrapeAllOGCombos() {
    sheet = sheet2TC();
    nCombos = await numCombos();
    rOffset = await findOGRowOffset();

    ogCombos = [];

    await sheet.loadCells(
        `${OG_COLS.NUMBER}${rOffset + 1}:${OG_COLS.CURRENT}${rOffset + nCombos}`
    );

    for (var n = 1; n <= nCombos; n++) {
        row = rOffset + n;

        ogCombos.push(await getOG2TCFromPreloadedRow(row));
    }

    return ogCombos;
}

async function scrapeAllAltCombos() {
    sheet = sheet2TC();
    rOffset = await findOGRowOffset();

    await sheet.loadCells(
        `${ALT_COLS.NUMBER}${rOffset + 1}:${ALT_COLS.LINK}${sheet.rowCount}`
    );

    altCombos = [];

    for (var row = rOffset + 1; row <= sheet.rowCount; row++) {
        if (await hasGonePastLastAlt2TCCombo(row)) break;

        altCombos.push(await getAlt2TCFromPreloadedRow(row));
    }

    return altCombos;
}

async function numCombos() {
    const sheet = sheet2TC();
    await sheet.loadCells(`J6`);
    return sheet.getCellByA1('J6').value;
}

////////////////////////////////////////////////////////////
// OG Combos
////////////////////////////////////////////////////////////

async function getOG2TCFromPreloadedRow(row) {
    const sheet = sheet2TC();

    // Assign each value to be discord-embedded in a simple default way
    let values = {};
    for (key in OG_COLS) {
        values[key] = sheet.getCellByA1(`${OG_COLS[key]}${row}`).value;
    }

    const upgrades = values.UPGRADES.split('|').map((u) =>
        u.replace(/^\s+|\s+$/g, '')
    );
    for (var i = 0; i < upgrades.length; i++) {
        // Display upgrade next to tower
        values[`TOWER_${i + 1}`] = {
            NAME: values[`TOWER_${i + 1}`],
            UPGRADE: upgrades[i],
        };
    }
    delete values.UPGRADES; // Don't display upgrades on their own, display with towers

    // Recapture date to format properly
    values.DATE = sheet.getCellByA1(`${OG_COLS.DATE}${row}`).formattedValue;

    // Recapture link to format properly
    const linkCell = sheet.getCellByA1(`${OG_COLS.LINK}${row}`);
    values.LINK = `[${linkCell.value}](${linkCell.hyperlink})`;
    values.VERSION = values.VERSION.toString();

    // Replace checkmark that doesn't display in embedded with one that does
    if (values.CURRENT === HEAVY_CHECK_MARK) {
        values.CURRENT = WHITE_HEAVY_CHECK_MARK;
    }

    return values;
}

async function findOGRowOffset() {
    const sheet = GoogleSheetsHelper.sheetByName(Btd6Index, '2tc');

    const MIN_OFFSET = 1;
    const MAX_OFFSET = 20;

    await sheet.loadCells(
        `${OG_COLS.NUMBER}${MIN_OFFSET}:${OG_COLS.NUMBER}${MAX_OFFSET}`
    );

    for (var row = MIN_OFFSET; row <= MAX_OFFSET; row++) {
        cellValue = sheet.getCellByA1(`B${row}`).value;
        if (cellValue) {
            if (cellValue.toLowerCase().includes('number')) {
                return row;
            }
        }
    }

    throw `Cannot find 2TC header "Number" to orient combo searching`;
}

////////////////////////////////////////////////////////////
// Alt Combos
////////////////////////////////////////////////////////////

async function getAlt2TCFromPreloadedRow(row) {
    const sheet = GoogleSheetsHelper.sheetByName(Btd6Index, '2tc');

    // Assign each value to be discord-embedded in a simple default way
    let values = {};
    for (key in ALT_COLS) {
        values[key] = sheet.getCellByA1(`${ALT_COLS[key]}${row}`).value;
    }

    // Format link properly
    const linkCell = sheet.getCellByA1(`${ALT_COLS.LINK}${row}`);
    values.LINK = `[${linkCell.value}](${linkCell.hyperlink})`;

    while (!values.NUMBER) {
        values.NUMBER = sheet.getCellByA1(`${ALT_COLS.NUMBER}${--row}`).value;
    }

    return values;
}

async function hasGonePastLastAlt2TCCombo(row) {
    const sheet = GoogleSheetsHelper.sheetByName(Btd6Index, '2tc');

    return !sheet.getCellByA1(`${ALT_COLS.PERSON}${row}`).value;
}
