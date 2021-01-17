// GPS Device File. RAW NMEA is streamed here.  
var file = '/dev/ttyAMA0';

// Import all the things
const SerialPort = require('serialport');
const parsers = SerialPort.parsers;
var GPS = require('gps');
const http = require('http');
const https = require('https');
const express = require('express');
var expressWs = require('express-ws');
var path = require('path');
const os = require('os');
const fs = require('fs');
const websocket = require('ws');

// Setup our webserver
const app = express();
//var listenport = 80;
//var server = http.createServer(app);
//var expressWs = expressWs(app, server);
var hostpath = os.hostname;
// Setup the path for our WS server. 
//var clientpath = 'wss://' + hostpath + '/client';
var clientpath = '';
//console.log('setting up insecure serving http://' + hostpath + '/, and ' + clientpath);

// Import JSON file containing active satellite information.
var SatData = require('../public/js/SatData.json');

// attempt to load certs
var credentials = null;
if (fs.existsSync('security/server.key') && fs.existsSync('security/server.crt')) {
    credentials = {
        //ca: ''
        key: fs.readFileSync('security/server.key', 'utf8'),
        cert: fs.readFileSync('security/server.crt', 'utf8')
    }
}
//console.log('creds' + credentials.key + ' ' + credentials.cert);
var http_protocol = ''
var webserver = null
var listenport = 0
if (credentials) {
    http_protocol = 'https'
    if (!listenport) listenport = 443
    console.log(`starting secure server on port ${listenport}`)
    try { 
	webserver = https.createServer(credentials, app);
    	var plainhttp = express();
    	plainhttp.get('*', function(req, res) {
		res.redirect('https://' + hostpath);
	})
	plainhttp.listen(80);
	clientpath = 'wss://' + hostpath + '/client';
    }
    catch (e) { console.log(e); }
}

if (!webserver) {
   http_protocol = 'http'
   if (!listenport || listenport == 443) listenport = 80
   console.log(`starting basic server on port ${listenport}`)
   try { 
	webserver = http.createServer(app);
	clientpath = 'ws://' + hostpath + '/client';
   }
   catch (e) { }
}

if (!webserver) {
    console.log('fatal: unable to start the web server')
    process.exit(1)
}

// attach the websocket server to the webserver
expressWs = expressWs(app, webserver)


// Setup pug views
app.set('view engine', 'pug');
app.use(express.json());
//app.use(express.static(path.join(__dirname, '/../public')));
app.use(express.static('public'));
app.set('views', __dirname + '/../views');

webserver.listen(listenport);

// Start the server
/*
try {
    server.listen(listenport, function () {
        console.log('server listening at ' + hostpath);
    });
} catch (e) {
    console.log('error attempting to start server: ' + e);
}
*/

/**
 *
 * Establish a websocket connection to any web client
 *
 */
app.ws('/client', function (ws, req) {
    ws.fromRoute = 'client';
    console.log('client route opened');


    // Handle a message sent from the client to the server.
    ws.on('message', function (message) {
        console.log('client route received message: ' + message + ' from web client');
    });

    // Send a message back to the client
    try { ws.send('Connection established!'); }
    catch (e) { }

    
    try { ws.send(JSON.stringify(data)); }
        catch (e) { }

    // Handle closed/error connections. 
    ws.on('close', () => console.log('client disconnected'));
    ws.on('error', () => console.log('something is amiss with the client'));
});

// Set root to render index.pug
app.get('/', function (req, res) {
    res.render('index.pug', { clientpath: clientpath, lib : JSON.stringify(SatData) });
});

/**
 *
 * Broadcast data to ALL currently connected clients. 
 *
 */
function clientBroadcast(data) {
    expressWs.getWss().clients.forEach(function (ws) {
        if (ws.readyState === 1 && ws.fromRoute == 'client') {
            ws.send(JSON.stringify(data));
        }
    });
}

// Handle any page that doesnt have a route. 
app.get('*', function (req, res) {
    res.status(404).send('Oops');
});


// Handle SIGINT interrupt produced by Ctrl+C
if (process.platform === "win32") {
    let rl = require("readline").createInterface({
        input: process.stdin,
        output: process.stdout
    })

    rl.on("SIGINT", function rl_sigint() {
        process.emit("SIGINT")
    })
}

//graceful shutdown
process.on("SIGINT", function process_sigint() {
    process.exit()
})

// Setup parser to parse NEMA data
const parser = new parsers.Readline({
	delimiter: '\r\n'
});

// Setup port to read from /dev/ttyAMA0
const port = new SerialPort(file, {
	baudRate: 9600
});

port.pipe(parser)

var gps = new GPS;

/**
 *
 * Establish a websocket connection to any web client
 *
 */
gps.on('data', function(data){
	//console.clear()
	if (data.time != undefined) {
		var testObject = gps.state;
		var tempdate = new Date(Date.parse(gps.state.time));
		testObject.time2 = tempdate.toLocaleString('en-US', { timeZone: 'America/New_York'});
		clientBroadcast(testObject);
	}
});

parser.on('data', function(data) {
	gps.update(data);
});


