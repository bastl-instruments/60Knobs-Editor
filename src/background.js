'use strict';

var electron = require('electron');

var app = electron.app;
var BrowserWindow = electron.BrowserWindow;

var mainWindow = null;

app.on('ready', function() {
    mainWindow = new BrowserWindow({
        height: 600,
        width: 1200
    });
	
    mainWindow.loadURL('file://' + __dirname + '/app.html');

    mainWindow.openDevTools();

    mainWindow.webContents.once('dom-ready', () => {
	
	var midi = require('midi');
	var midiOut = new midi.output();

	var midiPortList = [];
	for (var i= 0; i<midiOut.getPortCount(); i++){
		midiPortList.push(midiOut.getPortName(i));
	}

	mainWindow.webContents.send('midi_port_options', midiPortList);
	});
});


	
