'use strict';

var electron = require('electron');

var app = electron.app;
var BrowserWindow = electron.BrowserWindow;
var midi = require('midi');
var ipcMain = electron.ipcMain;

var mainWindow = null;
var midiOut = new midi.output();


function sendMIDIPortOptions() {
  var midiPortList = [];
  for (var i= 0; i<midiOut.getPortCount(); i++){
    midiPortList.push(midiOut.getPortName(i));
  }
	mainWindow.webContents.send('midi_port_options', midiPortList);
}

function sendMIDIData(data) {
  midiOut.openPort(parseInt(data.port));
  data.data.forEach(function(item, index) {
    midiOut.sendMessage(item);
  });
  midiOut.closePort();
}

app.on('ready', function() {
    mainWindow = new BrowserWindow({
        height: 600,
        width: 1200
    });

    mainWindow.loadURL('file://' + __dirname + '/app.html');
    //mainWindow.openDevTools();

    ipcMain.on('send_midi_data', function (event,message) {
        sendMIDIData(message);
    });
    ipcMain.on('request_midi_port_options', function (event,message) {
        sendMIDIPortOptions();
    });

});
