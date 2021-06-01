var request = require('request');
var fs = require('file-system');
var express = require('express');
var bodyParser = require('body-parser');
var moment = require('moment');
moment.locale('de');
var https = require('https');
var emoji = require('node-emoji');
var app = express();
var PORT = process.env.PORT || 3000;
require('datejs');
//https://mc3.qu.tu-berlin.de:8484

var cert = fs.readFileSync('/etc/letsencrypt/live/mc3.qu.tu-berlin.de/cert.pem', 'utf8');
var key = fs.readFileSync('/etc/letsencrypt/live/mc3.qu.tu-berlin.de/privkey.pem', 'utf8');
var ca = fs.readFileSync('/etc/letsencrypt/live/mc3.qu.tu-berlin.de/chain.pem', 'utf8');
var options = { key: key, cert: cert, ca: ca };

console.log("--- started external webhook ---");
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.get('/', (request, response) => {
    console.log("body is : ", request.body)
    response.send("hello")
})
app.post('/webhook', function (req, res) {
    var jsonData = req.body;
    var { queryResult, originalDetectIntentRequest } = jsonData ? jsonData : undefined;
    var { data } = originalDetectIntentRequest.payload ? originalDetectIntentRequest.payload : undefined;
    console.log("data is : ", data)
    var { queryText, parameters, intent, languageCode } = queryResult ? queryResult : undefined;
    var { displayName } = intent ? intent : undefined;
    if (!req.body) return console.log("body not found : ", response.statusCode(400));
    res.setHeader('Content-Type', 'application/json');
    console.log({ queryText, displayName, parameters, languageCode });
    var intentResponse = distinguishIntents(displayName, parameters, languageCode);
    // var response = intentResponse.replace("*", "");
    var response = intentResponse
    var responseObj = {
        "fulfillmentText": "",
        "fulfillmentMessages": [{ "text": { "text": [emoji.emojify(response)] } }],
        "source": ""
    };
    if (originalDetectIntentRequest && originalDetectIntentRequest.source === "telegram") {
        var chatId = data.chat.id;
        responseObj = {
            "fulfillmentMessages": [
                {
                    "payload": {
                        "telegram": {
                            "text": emoji.emojify(intentResponse),
                            "parse_mode": "Markdown"
                        },
                    }
                }
            ]
        }
    }
    let dialog = `\n\n${new Date().toLocaleString()}\nUser: ${queryText}.\nBot: ${emoji.emojify(response)}\n\n`
    res.json(responseObj);

    fs.appendFile('Dialogues.txt', dialog, (err) => {
        if (err) throw err;
        console.log('Dialog file updated!');
    });
    console.log(JSON.stringify(responseObj));
});
https.createServer(options, app).listen(PORT, () => {
    console.log("Server is running on port : ", PORT)
});


/**
 * const bekannteMensen - Liste aller bekannten Mensen und dazugehörigen Öffnungszeiten (statisch)
 */
const bekannteMensen_eng = [{
    id: 36,
    times: {
        open: '8: 00-14: 30 (lunch: 11: 00-14: 30)'
    }
},
{
    id: 806,
    times: {
        open: '8: 00-18: 00',
        Friday: '8: 00-16: 00'
    }
},
{
    id: 816,
    times: {
        open: '8: 00-15: 00 (lunch: 11: 00-14: 00)'
    }
},
{
    id: 817,
    times: {
        open: '8: 00-16: 00 (lunch: 11: 00-14: 00)',
        Friday: '8: 00-15: 00 (lunch: 11: 00-14: 00)'
    }
},
{
    id: 818,
    times: {
        open: '7: 30-16: 00 (lunch: 11: 00-14: 30)'
    }
},
{
    id: 819,
    times: {
        open: '8: 30-16: 00',
        Friday: '8: 30-15: 00'
    }
},
{
    id: 875,
    times: {
        open: '11: 00-15: 30 '
    }
}];

/**
 * const bekannteAllergene - Liste aller bekannten Allergene
 */
const bekannteAllergene_eng = [
    'Cereals containing gluten',
    "Wheat",
    'Rye',
    'Barley',
    "Oats",
    'Spelt',
    'Kamut',
    'Crustaceans',
    'Eggs',
    'Fish',
    'Peanuts',
    'Nuts',
    'Almonds',
    'Hazelnut',
    'Walnut',
    'Cashew',
    'Pecan',
    'Brazil nut',
    "Pistachio",
    "Macadamia",
    "Celery",
    'Soy',
    'Mustard',
    'Milk and milk products (including lactose)',
    "Sesame",
    'Sulfur dioxide and sufide',
    'Lupine',
    "Molluscs"
];
const bekannteSonstige_eng = [
    'Pork or with pork gelatin',
    'with partly finely chopped meat',
    'Caffeine',
    'Quinine',
    'Nitrite curing salt',
    'Yeast'
];

const bekannteZusatzstoffe_eng = [
    'Alcohol',
    'Flavor enhancers',
    'Waxed',
    'preserved',
    'Antioxidants',
    'Dye',
    'Phosphate',
    'Blackened',
    'contains phenylalanine',
    'Sweeteners',
    'Sulphured',
    'can have a laxative effect'
];

/**
 * const icons - Definition der verwendeten Iconsymbole
 */
const icons = {
    gruen: ":green_heart: ",
    gelb: ":yellow_heart: ",
    rot: ":heart: ",
    vegan: ":seedling: ",
    vegetarisch: ":corn: ",
    fisch: ":fish: ",
    fleisch: ":cut_of_meat: ",
    klimabaum: ":deciduous_tree: "
};

/**
 *  Variablen zum Merken der Parameter für Follow-Up-Event
 *  dabei ist mDate undefined (weil initial String) und mMensaId und mFilterValue [] (weil initial Array)
 */
var mMensaId = [];
var mDate = undefined;
var mFilterValue = [];
var mFilterValue1 = [];
var mOhne = undefined;

/**
 * distinguishIntents zum Unterscheiden der Intents und damit der resultierenden IntentResponse
 * @param intentName - Name
 * @param params - alle Parameter
 */
function distinguishIntents(intentName, params, languageCode) {
    var intentResponse = '';
    var { date, mensaId, ohne, filterValue, filterValue1 } = params;
    if (intentName == "Welcome Telegram") {
        intentResponse = viewWillkommen_eng();
    } else if (intentName == "Help") {
        intentResponse = viewHilfe_eng();
    } else if (intentName == "traffic-light") {
        intentResponse = viewAmpel_eng();
    } else if (intentName == "Known canteens") {
        intentResponse = viewBekannteMensen_eng();
    } else if (intentName == "Known filters") {
        intentResponse = viewBekannteFilter_eng();
    } else if (intentName == "Times") {
        intentResponse = viewOeffnungszeiten_eng(mensaId, date);
    } else if (intentName == "Address") {
        intentResponse = viewAdresse_eng(mensaId);
    } else if (intentName == "Speisen" || intentName == "Speisen - custom") {
        intentResponse = viewSpeisen_eng(params, intentName);
    } else {
        intentResponse = "Unfortunately I cannot answer your question."
    }
    return intentResponse;
}

/**
 * FUNKTIONEN ZUR VISUALISIERUNG DER INTENTRESPONSE (viewXXX)
 */

/**
 * viewAdresse - Antwort für intent='Adresse'
 */


function viewAdresse_eng(mensaId) {
    var res = "";
    if (!mensaId) return res = "Please tell me the name of mensa"
    // mensaId.forEach(id => {
    var adresse = getAdresse(mensaId);
    // var mapsAdresse = 'https://www.google.com/maps/place/'
    var mapsAdresse = ''
        + (((((adresse.replace(' ', '+')).replace(' ', '+')).replace(' ', '+')).replace(' ', '+')).replace(' ', '+')).replace(' ', '+');
    res += 'The address of the *' + getMensaName(mensaId) + '* reads [' + adresse + '](' + mapsAdresse + ')';
    // });
    return res;
}


function viewAmpel_eng() {
    var { gruen, gelb, rot } = icons;
    var res = 'The Gastronomic Traffic light of the Student work Berlin is a categorization concept for wholesome nutrition from a medical-physiological point of view. '
        + 'The concept follows the recommendations of the German Society for Nutrition (DGE) . '
        + 'Green stands for a good choice.Food marked red should be eaten as rarely as possible or combined with green marked.\n'
        + 'Here the traffic light colors are shown as follows: \n' + gruen + 'green -' + gelb + 'yellow -' + rot + 'red \n'
        + `You can find more information on the gastronomic traffic light.`;
    return res;
}

/**
 * viewBekannteMensen - gibt eine unsortierte Liste aller bekannten Mensenbezeichnungen zurück
 */

function viewBekannteMensen_eng() {
    var res = 'I know the following canteens/cafes: \n';
    bekannteMensen_eng.forEach(child => res += '\n - _' + getMensaName(child.id) + '_');
    return res;
}

/**
 * viewBekannteFilter - gibt einen Auflistung aller bekannten Filtermöglichkeiten als String zurück
 */


function viewBekannteFilter_eng() {
    var res = 'You can filter the dishes'
        + '\n\n... according to the following properties: \n' + getBekannteEigenschaften_eng()
        + '\n\n... after these allergens: \n' + bekannteAllergene_eng
        + '\n\n... after these additives: \n' + bekannteZusatzstoffe_eng
        + '\n\n... and after other: \n' + bekannteSonstige_eng;
    return res;
}

/**
 * viewHilfe - gibt einen String mit Hilfestellungen zurück
 */

function viewHilfe_eng() {
    var result = "You can ask Lotti about meals, opening times and addresses of several dining halls on the Charlottenburg campus, e.g. \n\n"
        + "What is there in the Veggie 2.0 canteen?  \n"
        + "Morning in TEL \n"
        + "Did the cafeteria open on Marchstrasse today?  \n"
        + "What is the address of the main dining hall?  \n\n"
        + "I know these cafeterias ... \n"
        + viewBekannteMensen_eng() + "\n\n"
        + "... and the following properties \n"
        + getBekannteEigenschaften_eng()
        + "\n\nDo you have a food allergy? No problem! \n"
        + "You can also filter the food according to allergens and additives, e.g. Veganese food in Tel or Can I eat something without fish today in Mar?  \n"
        + "You want to see a list of all possible filters? Then you can also ask me about it, e.g. which filters do you know?  \n"
        + "You don't want to apply a filter to your request? Then you can show me everything."
        + "\n\n"
        + "Of course you don't have to write out the full name of every cafeteria."
        + "Try known abbreviations, such as Mar instead of Mensa TU Marchstraße \n\n"
        + "When a menu is queried, the meals are displayed as a list. The icons for the above-mentioned properties are in front of the meal name and behind the name is the price in € following the scheme  (student / employee / external) ."
        + "\n\nAll information without guarantee";
    return result;
}

/**
 * viewOeffnungszeiten - gibt einen String mit den Öffnungszeiten einer bestimmten Mensa (mensaId) aus der Konstante bekannteMensen zurück
 * @param mensaId - required
 * @param date - optional, da initial auf aktuellen Tag gesetzt
 */
function viewOeffnungszeiten_eng(mensaId, date) {
    var res = '';
    if (!mensaId[0]) return res = "From which cafeteria do you want to know the opening times?"
    else if (!date) {
        return res = "Please tell me the date"
        date = new Date().toISOString();
    }
    var mensaName = getMensaName(mensaId[0]);
    bekannteMensen_eng.forEach(child => {
        if (child.id == mensaId) {
            var { open, Friday } = child.times;
            if (date) {
                var datum = getDate(date.slice(0, 10));
                if (!istMensaOffen(mensaId, date.slice(0, 10))) {
                    res = `The ${mensaName}  is closed on  ${datum} `;
                } else {
                    res = 'The ' + mensaName + ' is ' + (Friday ? Friday : open) + ' open ' + " for " + datum;
                }
            } else {
                res = 'The ' + mensaName + ' is '
                    + (Friday ? 'Mondays to Thursdays' : 'Mondays to Fridays')
                    + ' of ' + open
                    + (Friday ? ' and Fridays of ' + Friday : '') + ' open';
            }
        }
    });
    if (res == '') res = "I don't know opening times for the " + mensaName + '';
    return res;
}

/**
 * viewSpeisen - Antwort für intent='Speisen' und intent='Speisen - custom'
 */


function viewSpeisen_eng({ mensaId, date, filterValue, filterValue1, ohne }, intentName) {
    var res = '';
    if (!mensaId[0]) return res = "Please tell me the name of mensa."
    if (!date) return res = "Please tell me the date on which you want to eat."
    var existFilter = (filterValue && filterValue.length > 0);
    var existFilter1 = (filterValue1 && filterValue1.length > 0);
    var existBeideFilter = (existFilter && existFilter1);
    // Initiales zurücksetzen für Intent Speisen
    if (intentName == "Speisen") {
        resetGemerkteParameter();
    }
    // Festlegen der gemerkten Parameter
    if (!mDate && !date) date = new Date().toISOString();
    if (mensaId && mensaId.length > 0) mMensaId = mensaId;
    if (date) mDate = date.slice(0, 10);
    if (existFilter) filterValue.forEach(e => mFilterValue.push(e));
    if (existFilter1) filterValue1.forEach(e => mFilterValue1.push(e));
    if (!filterValue1.includes('alles') && ohne) mOhne = ohne;
    // Erweiterung der Filtervalue(s) im Spezialfall
    mFilterValue1 = erweiternFilterValue(mFilterValue1, mOhne);
    mFilterValue = erweiternFilterValue(mFilterValue, mOhne);
    mMensaId.forEach(id => {
        var mensaName = getMensaName(id);
        var date = getDate(mDate);
        var existmFilter = (mFilterValue && mFilterValue.length > 0);//filter 1
        var existmFilter1 = (mFilterValue1 && mFilterValue1.length > 0);//filter 2
        var existBeidemFilter = existBeideFilter;
        console.log("inside mensa for each: ", mDate)
        if (!sindSpeisenVorhanden(id, mDate)) {
            return res += "For the " + date + "  I do not know any dishes in the  " + mensaName + " .\n\n";
        } else if (!istMensaOffen(id, mDate)) {
            return res += "The  " + mensaName + "  is closed on  " + date + ".\n\n";
        } else {
            return res += "I have the " + mensaName + " on " + date
                + "\n\n  following dishes found"
                + (existBeidemFilter || existmFilter || existmFilter1 ? ", for which the property " : "")
                + (existmFilter ? "" + mFilterValue.toString() + " applies" : "")
                + (existBeidemFilter ? "and the property " : "")
                + (existmFilter1 ? "" + mFilterValue1.toString() + "" : "")
                + (existBeidemFilter || existmFilter1 ? (mOhne ? " not " : "") + "applies:" : "")
                + ":\n"
                + getSpeisen_eng(id, mDate, mFilterValue, mOhne, mFilterValue1) + "\n\n";
        }
    });
    // Zurücksetzen der gemerkten Parameter FollowUp-Event
    if (intentName == "Speisen - custom") {
        resetGemerkteParameter();
    }
    console.log("Gemerkte Parameter", { mMensaId, mDate, mFilterValue, mFilterValue1, mOhne, res });
    return res;
}

/**
 * viewWillkommen - gibt einen String zur Begrüßung zurück
 */

function viewWillkommen_eng() {
    var result = "-----------EVALUATION-----------  \n"
        + "Thank you for participating in the evaluation! \n"
        + `First, I ask you to complete the steps under Instructions, and then to participate in a short [survey] . \n`
        + "\nInstructions \n\n"
        + "Please ask me your own questions with the following requirements by sending them to me in writing as a message: \n \n"
        + "- Opening times from the main canteen TU Hardenbergstraße \n"
        + "- Address of the canteen Veggie 2.0 - the deep green canteen \n"
        + "- all dishes today in the Café TU Skyline and in the cafeteria in Marchstrasse \n"
        + "- all vegan and green marked dishes on Wednesday in the cafeteria in Marchstrasse \n"
        + "- all dishes without cereals containing gluten in the main canteen TU Hardenbergstraße \n\n"
        + "You don't have to write out the names of the dining halls completely. Try the abbreviations you know. Of course, you can test other questions beyond the above. \n"
        + "It may well be that I don't understand you yet because I don't know your wording of the question. Please try to ask your question differently. I will add the unknown wording after the evaluation. \n"
        + "If you want to see this message again while chatting, enter Hello. \n"
        + `\n Have fun trying it out (and please also think of the following [survey] ) \n`
        + "------------------------------- \n\n"
        + "Hello, \n"
        + "I am Lotti, your canteen chatbot for the Charlottenburg campus in Berlin. \n"
        + `I was created as part of a bachelor's thesis at the [Quality & Usability Lab]. \n`
        + "You can ask me questions about the meals, addresses and opening times of many dining halls on the Charlottenburg campus."
        + "If you don't know how, enter Help for a more detailed explanation. \n"
        + "If you have further questions, comments and wishes, you can write me an email: chatbot.tuberlin@gmail.com \n"
        + "\n All information without guarantee";
    return result;
}


/**
 * FUNKTIONEN MIT DATENBANKABFRAGEN
 */

/**
 * getAdresse - gibt die vollständige Adresse der Mensa (Straße, Hausnummer, PLZ und Ort) zurück
 * @param mensaId - required, da benötigt für Datenbankabfrage
 */
function getAdresse(mensaId) {
    var res = '';
    var url = "https://openmensa.org/api/v2/canteens/" + mensaId;
    var req = request(url, function (error, response, body) {
        var db = JSON.parse(body);
        res = db.address;
    });
    while (res == '') {
        require('deasync').runLoopOnce();
    }
    return res;
}

/**
 * getMensaName - ermittelt den Namen einer Mensa ('name') aus der Datenbank
 * @param mensaId - required
 */
function getMensaName(mensaId) {
    var name = undefined;
    var url = "https://openmensa.org/api/v2/canteens/" + mensaId;
    request(url, function (error, response, body) {
        var db = JSON.parse(body);
        console.log("body is : ", body)
        name = db.name;
    });
    while (name == undefined) {
        require('deasync').runLoopOnce();
    }
    return name

}



/**
 * getSpeisen - Funktion fragt alle Speisen einer bestimmte Mensa an einem bestimmten Tag ab
 * @param mensaId - required List
 * @param date - required
 * @param ohne - optional, Verneinung der filterValue(s), falls gesetzt
 * @param filterValue - optional List, enthält alle abgefragten Filtereigenschaften
 */


function getSpeisen_eng(mensaId, date, filterValue, ohne, filterValue1) {
    date = setDate(date);
    console.log("inside get speizen");
    var result = '';
    var url = 'https://openmensa.org/api/v2/canteens/' + mensaId + '/days/' + date + '/meals';
    request(url, function (error, response, body) {
        var db = JSON.parse(body);
        //        console.log("body of get speizen is : ", db)
        //		var category = '';
        for (var i = 0; i < db.length; i++) {
            var notes = db[i].notes;
            var found = true;
            var found1 = true;
            //Abfrage für gesetzte filterValues, um zu prüfen ob die Filtereigenschaft in der Notizenliste (nicht) enthalten ist
            if (filterValue.length > 0) {
                console.log("inside filter0")

                found = checkFilterValueInNotes(filterValue, notes, ohne);
                if (filterValue1.length > 0) found = !found;
            }
            if (filterValue1.length > 0) found1 = checkFilterValueInNotes(filterValue1, notes, ohne);
            console.log("filterValue", db[i].name, { found, found1 });
            if (found && found1) {
                console.log("inside found")
                //Oberkategoriendarstellung
                //				if (category != db[i].category) {
                //					category = db[i].category;
                //					result += '_'+category.toString()+'_\n';
                //				}
                //Ermittlung der Preise für Student, Angestellter und Externe
                var price = db[i].prices;
                var priceStudents = price.students ? price.students.toFixed(2) : "0.00";
                var priceEmployees = price.employees ? price.employees.toFixed(2) : "0.00";
                var priceOthers = price.others ? price.others.toFixed(2) : "0.00";
                result += iconHinzufuegen(notes) + db[i].name;
                result += ' (' + priceStudents + '/' + priceEmployees + '/' + priceOthers + ')\n';
            }
            //Fall: keine Suchergebnisse mit filterValue (und Ohne) gefunden
            if (i == db.length - 1 && (filterValue || filterValue1 || (filterValue && filterValue1))) {
                if (result == '') {
                    result = 'Unfortunately I have not found any dishes. Maybe you try your luck in another cafeteria?';
                }
            }

        }
    });
    while (result == '') {
        require('deasync').runLoopOnce();
    }
    return result;

}

/**
 * istMensaOffen - ermittelt den Wert von 'closed' in der Datenbank für eine bestimmte Mensa an einem Datum und gibt einen Boolean zurück
 * @param mensaId - required
 * @param date - required
 */
function istMensaOffen(mensaId, date) {
    date = setDate(date)
    var istMensaOffen = undefined;
    var url = "https://openmensa.org/api/v2/canteens/" + mensaId + "/days/" + date;
    var req = request(url, function (error, response, body) {
        istMensaOffen = false;
        var db = JSON.parse(body);
        istMensaOffen = !db.closed;
    });
    while (istMensaOffen == undefined) {
        require('deasync').runLoopOnce();
    }
    return istMensaOffen;
}

/**
 * sindSpeisenVorhanden - zur Überprüfung ob Daten in Datenbank vorhanden (für weit zurück- oder weit im Voraus liegende Datumsangaben)
 * @param mensaId - required
 * @param date - required
 */
function sindSpeisenVorhanden(mensaId, date) {
    date = setDate(date)
    console.log("date in sindspeizen : ", date)
    var speisenVorhanden = undefined;
    var url = "https://openmensa.org/api/v2/canteens/" + mensaId + "/days/" + date + "/meals";
    var req = request(url, function (error, response, body) {
        speisenVorhanden = (body !== '');
    });
    while (speisenVorhanden == undefined) {
        require('deasync').runLoopOnce();
    }
    return speisenVorhanden;
}

/**
 * HILFSFUNKTIONEN
 */

/**
 * checkFilterValueInNotes - gibt einen Boolean zurück, ob FilterValue in notes (aus DB) vorhanden
 */
function checkFilterValueInNotes(filterValue, notes, ohne) {
    var found = false;
    var isFilterValueFound = [];
    var i;
    for (i = 0; i < filterValue.length; i++) {
        const value = filterValue[i];
        var foundFilterValue = false;
        notes.forEach(e => {
            if (e == value) foundFilterValue = true;
        });
        isFilterValueFound.push(foundFilterValue);
    };
    if (ohne) found = !isFilterValueFound.includes(true);
    else found = isFilterValueFound.includes(true);
    //	console.log("checkFIlterValueInNotes", {isFilterValueFound, found});
    return found;
}
/**
 * Erweiterung der Filtervalue(s) im Spezialfall um Unterkategorien
 */
function erweiternFilterValue(filterValue, ohne) {
    if (!filterValue || filterValue.lenght == 0) return;
    if (mFilterValue.includes("alles")) {
        filterValue = [];
    } else {
        //		if (filterValue.includes("vegetarisch")){
        //			filterValue.push("vegan");
        //		}
        if (filterValue.includes("Glutenhaltiges Getreide")) {
            var getreidesorten = ["Weizen", "Roggen", "Gerste", "Hafer", "Dinkel", "Kamut"];
            getreidesorten.forEach(e => filterValue.push(e));
        }
        if (filterValue.includes("Schalenfrüchte")) {
            var schalensorten = ["Mandeln", "Haselnuss", "Walnuss", "Kaschunuss", "Pecanuss", "Paranuss", "Pistazie", "Macadamia"];
            schalensorten.forEach(e => filterValue.push(e));
        }
        if (filterValue.includes("Fleisch")) {
            var fleischsorten = ["Schweinefleisch bzw. mit Gelatine vom Schwein", "mit zum Teil fein zerkleinertem Fleischanteil"];
            fleischsorten.forEach(e => filterValue.push(e));
        }
    }
    return filterValue;
}




/**
 * getBekannteEigenschaften - gibt eine Verknüpfung der Eigenschaften mit dazugehörigen Icons zur Visualisierung zurück
 */

function getBekannteEigenschaften_eng() {
    const { vegan, vegetarisch, klimabaum, fisch, fleisch, gruen, gelb, rot } = icons;
    var res = vegan + "vegan \n"
        + vegetarisch + "vegetarian \n"
        + klimabaum + "climate tree \n"
        + fisch + "fish \n"
        + fleisch + "meat \n"
        + gruen + "green (gastronomic traffic light)  \n"
        + gelb + "yellow (gastronomic traffic light)  \n"
        + rot + "red (gastronomic traffic light) ";
    return res;
}
/**
 * getDatum - Formattiert einen ISO-Datumstring mithilfe vom Package moment ins Format 'Montag, den 09.September 2019'
 * @param date - required
 */

function getDate(date) {
    date = new Date(date).toString('dddd, dd.MMMM yyyy');
    return date
}

/**
 * iconHinzufuegen - Funktion zur Visualisierung der bekanntenEigenschaften durch Icons
 * @param notes - Liste aller Speiseeigenschaften
 */
function iconHinzufuegen(notes) {
    const { vegan, vegetarisch, klimabaum, fisch, fleisch, gruen, gelb, rot } = icons;
    var istVegan = notes.find(function (e) { return (e === "vegan"); });
    var istVegetarisch = notes.find(function (e) { return (e === "vegetarisch"); });
    var istKlimaessen = notes.find(function (e) { return (e === "Klimaessen"); });
    var istGrün = notes.find(function (e) { return (e === "grün (Ampel)"); });
    var istGelb = notes.find(function (e) { return (e === "gelb (Ampel)"); });
    var istRot = notes.find(function (e) { return (e === "rot (Ampel)"); });
    var enthältFisch = notes.find(function (e) { return (e === "Fisch"); });
    var enthältFleisch = notes.find(function (e) { return (e === "mit zum Teil fein zerkleinertem Fleischanteil"); });
    var enthältSchweineFleisch = notes.find(function (e) { return (e === "Schweinefleisch bzw. mit Gelatine vom Schwein"); });
    var res = (istGrün ? gruen : "")
        + (istGelb ? gelb : "")
        + (istRot ? rot : "")
        + (istVegan ? vegan : "")
        + (istVegetarisch ? vegetarisch : "")
        + (istKlimaessen ? klimabaum : "")
        + (enthältFisch ? fisch : "")
        + (enthältFleisch ? fleisch : (enthältSchweineFleisch ? fleisch : ""));
    return res;
}


/**
 * listToString - individualisierte toString Methode mit Kursivkennzeichnung und Iteration
 * @ list - required - Arrayliste zum konvertieren
 */
function listToString(list) {
    var string = '';
    var size = list ? list.length - 1 : 0;
    if (size == 0) return;
    list.forEach(item => {
        if (item == list[size]) string += ' and _' + item + '_'
        else if (item == list[size - 1]) string += '_' + item + '_'
        else string += '_' + item + '_, '
    });
    return string;
}

/**
 * resetGemerkteParameter - setzt gemerkte Parameter bei Aufruf zurück
 */
function resetGemerkteParameter() {
    mMensaId = [];
    mDate = undefined;
    mFilterValue = [];
    mFilterValue1 = [];
    mOhne = undefined;
}


/**
 * manage date when mensa is closed due to covid
 */
function setDate(date) {
    date = new Date(date).toString('dddd');
    console.log("date is : ", date)
    if (date == 'Monday') {
        date = '2020-01-06'
    }
    else if (date == 'Tuesday') {
        date = '2020-01-07'
    }
    else if (date == 'Wednesday') {
        date = '2020-01-08'
    }
    else if (date == 'Thursday') {
        date = '2020-01-09'
    }
    else if (date == 'Friday') {
        date = '2020-01-10'
    }
    else if (date == 'Saturday') {
        date = '2020-01-11'
    }
    else if (date == 'Sunday') {
        date = '2020-01-12'
    }
    return date
}
