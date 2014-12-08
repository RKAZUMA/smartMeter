#!/usr/bin/env node
/*jslint node: true */
/*
	Johannes Mainusch
	Start: 2013-03-02
	refactored: 2014-02-**
	Idea:
	The server serves data in json format from files
	The Data is in the file 'global.datafilename'
*/
var	global = (typeof global != 'undefined' ) ? global : require ("../../main/global/global.js").init("from webServer");

// the webServer Object
var ws = {
		start: startWebServer
	};

// now start the webServer
ws.start();

// make it requirable...
module.exports = ws;



/**
	the http server is started on global.serverPort and a websocket is also started
*/
function startWebServer() {
	global.log ("in startWebServer...");
	var app = require('http').createServer(function (request, response) {
  		response.writeHead(200, {'Content-Type':'text/plain'});
  		parseRequestAndRespond (request, response);
		//  response.end( parseRequestAndRespond (request) );
	}).listen(global.serverPort,  '::');

	global.log('Server is running at http://127.0.0.1:'+global.serverPort);

	// start a Web-Socket
	var webSocket = new myWebSocket ();
	webSocket
		.startSocket (app)
		.startDataListener (global.datafilename);
}


/**
	parse the request and construct the server response
*/
function parseRequestAndRespond (request, response) {
	global.log ('in parseRequestAndRespond, request: ' + request.url);
	var requestPath = require('url').parse(request.url, true).pathname;

	// parse the request
	global.log ('in parseRequestAndRespond, requestPath: ' + requestPath );
	global.log ('in parseRequestAndRespond, global.datafilename: ' + global.datafilename );
	global.log ('in parseRequestAndRespond, global.url: ' + global.url );

	if (requestPath == global.url+'/getData')
		tailFile (request, response, global.datafilename);

	// get gets the last 100 or so entries in the datail
	else if (requestPath == global.url+'/getnolines')
		getnolines (request, response, global.datafilename);

	// getfirst gets the first entry in the dta file
	else if (requestPath == global.url+'/getfirst')
		execInShell (request, response, global.datafilename, 'head -1 ');

	// getlast gets the last entry
	else if (requestPath == global.url+'/getlast')
		execInShell (request, response, global.datafilename, 'tail -1 ');

	// getglobal returns the global object to the client to transport server info
	else if (requestPath == global.url+'/getglobals') {
		var params = require('url').parse(request.url, true),
			responseData = JSON.stringify(global);

			// if the request has a callback parameter, use it to wrap the json object with it for jsonp
			if (typeof params.query.callback != 'undefined')
				responseData = wrapWithCallback (responseData, params.query.callback);

//		response.write (responseData);
		response.end(responseData);
	}

	// server static files under url "+/client/"
	else if ( (requestPath.indexOf(global.url+'/client/') == 0 ) ){
		var myfilename = requestPath.substring (requestPath.lastIndexOf('/')+1),
			myMimeType = "text/plain",
			myFileending = requestPath.substring (requestPath.lastIndexOf('.')+1);

		switch (myFileending) {
			case "js":
				myMimeType = "text/javascript";
				break;
			case "css":
				myMimeType = "text/css";
				break;
			case "html":
				myMimeType = "text/html";
				break;
			}

		global.log ('serving static file: ' + myfilename + ", myFileending:" + myFileending + "  mimeType: " + myMimeType);

		var fs = require('fs');
		fs.readFile(global.srcPath+'main/client/' + myfilename, "binary", function (err, file) {
			global.log ('readFile: ' +global.srcPath+ './client/' + myfilename);

		            if (err) {
						global.log ('ERROR readFile: ' + './client/' + myfilename);
		                response.writeHead(500, {"Content-Type": "text/plain"});
		                response.write(err + "\n");
		                response.end();
		                return;
		            }

					global.log ('response.write: ' + './client/' + myfilename);
		            response.writeHead(200, {"Content-Type": myMimeType});
		            response.write(file, "binary");
		            response.end();
					global.log ('response.end: ' + './client/' + myfilename);
			});


	}
	else {// the last catch, if it comes here it aint good...
		global.log ('ERROR in parseRequestAndRespond, last else..., requestPath='+requestPath);
        response.writeHead(500, {"Content-Type": "text/plain"});
        response.end();
	}
}

/**
	execInShell will do a 'cat' on filename and pipe the results on 'cmd'
*/
function execInShell (request, response, filename, cmd) {
	var params = require('url').parse(request.url, true),
		exec = require('child_process').exec,
		data,
		nolines=100;

	if (params.query.hasOwnProperty('filter') === true && typeof params.query.filter === 'string' )
		cmd = 'cat ' + filename + ' | grep ' + params.query.filter + " | " + cmd;
	else
		cmd = cmd + filename;

	global.log ('in execInShell, cmd='+cmd);

	exec(cmd, function (error, data) {
		global.log('callback in execInShell, cmd: ' + cmd + "\n" +data);
		response.end( data );
	});
}

/**
	getnolines will return the number of lines in the file
*/
function getnolines (request, response, filename) {
	global.log ('in getnolines');
	var params = require('url').parse(request.url, true),
		cmd = "cat " + filename,
		exec = require('child_process').exec,
		responseData="[";


	if (params.query.hasOwnProperty('filter') === true && typeof params.query.filter === 'string' )
		cmd += ' | grep ' + params.query.filter;

	cmd += " | wc -l | tr -d ' '";

	exec(cmd, function (error, stdout) {
		// get rid of newlines in data
		var data = stdout.slice(0, stdout.length-1);
		responseData += data+"]";

		// wrap data with wrapWithCallback if there is a callback parameter...
		if (params.query.hasOwnProperty('callback') === true && typeof params.query.callback === 'string' ) {
			responseData = wrapWithCallback (responseData, params.query.callback);
		}
		response.end( responseData );
	});
}


/**
	This function takes parameters like filter to 'grep filter'
	and nolines to 'tail -nolines'...
*/
function tailFile (request, response, filename) {
	var params = require('url').parse(request.url, true),
		spawn = require('child_process').spawn,
		tail,
		nolines = "-23",
		responseData="[";

	global.log ('in tailFile, pathname=' + params.pathname);
    response.writeHead(200, {'Content-Type': 'application/json'});

	if (params.query.hasOwnProperty('nolines') === true && typeof params.query.nolines === 'string' ) {
		nolines="-"+params.query.nolines;
	}

	tail = spawn('tail', [nolines, filename]);

	tail.stdout.on ('data', function (data) {
	  	global.log('in tailFile, tail stdout: + data.len=' + data.length);
        responseData += String(data).replace(/\n/g, ',\n');		// replace newlines by ',\n'
	});

	tail.stderr.on('data', function (data) {
	  	global.log('in tailFile, tail stderr: ' + data);
	});

	// 2013: the raspberry likes 'close' here instead of 'exit'...
	//		tail.on('close', function (code) {
	//
	var exitEventString = (process.platform == 'darwin')  ? "exit" : "close";

	tail.on(exitEventString, function (code) {
		responseData = responseData.replace(/,\n$/, '');		// removed the last ,
		responseData += "]";

		// wrap data with wrapWithCallback if there is a callback parameter...
		if (params.query.hasOwnProperty('callback') === true
			&& typeof params.query.callback === 'string' ) {
			responseData = wrapWithCallback (responseData, params.query.callback);
		}

	  	global.log('in tailFile, ...exit with code ' + code + "\n    responseData:" + responseData);
      	response.end(responseData);
	});
}


/**
	wrap the data with a callback
 */
function wrapWithCallback (data, callback) {
	return callback + "("+data+")";
}


/**
   	start a Web-Socket that will deliver data on every new entry of the datafile
	last refactored: 20130411, JM
*/
function myWebSocket () {

	global.log('in myWebSocket');
	var objref = this;

	this.setSocket = function (socket) { this.socket = socket; return this; };

	this.startDataListener = function (filename) {
		global.log ('started dataListener on file: '+ filename);
		var tail  = require('child_process')
			.spawn('tail', ['-f', '-n1', filename])
			.stdout.on ('data',
				function (data) {
		  			global.log('in dataListener, data: '+  data );
					if ( (typeof objref.socket === 'object') ) {
						global.log('objref.socket.emit (news, data):' + data);
						// Trigger the web socket now
						objref.socket.emit ('got new data', JSON.parse (data) );
					}
				});
		return this;
	};

	this.startSocket = function (app) {
		var io = require('socket.io')
			.listen(app)
			.sockets.on('connection', function (socket) {
				objref.setSocket (socket);
			});
		return this;
	};

	return this;
}

