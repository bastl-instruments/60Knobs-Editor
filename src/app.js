const numbKnobs = 60;

let $ = require('jquery');
var ipcRenderer = require('electron').ipcRenderer;

/*
 * Main function
 */
$(function(){

	createUI();

	ipcRenderer.on('midi_port_options', function (event,message) {
			setMIDIPortOptions(message);
	});

	$("button#write").on("click", sendMIDI);

	$(document).on("change", "#knobs select.type", function(e) {
		adaptKnobSettings($(e.target).parent());
	});

	$.each($("#knobs>div"), function(key, value) {
		adaptKnobSettings($(value));
	});
});

/*
 * Adapt the form fields for a single knob depending on
 * the type that is set for this knob
 * Knob is passed as jquery reference to dom
*/
function adaptKnobSettings(knob) {
	//console.log("Knob %o updated", knob.find("header").text());
	var newType = knob.find("select.type")[0].value;
	var fieldOne = knob.find("tr:nth-of-type(1)");
	var fieldTwo = knob.find("tr:nth-of-type(2)");
	var checkbox = knob.find("tr:nth-of-type(3)");
	switch (newType) {
	case "1":
		fieldOne.show().find('label').text("Index");
		fieldOne.find('input').attr("min", 0);
		fieldOne.find('input').attr("max", 127);
		fieldOne.find('input').val(0);
		fieldTwo.hide();
		checkbox.show();
		break;
	case "2":
		fieldOne.show().find('label').text("Index");
		fieldOne.find('input').attr("min", 0);
		fieldOne.find('input').attr("max", 16383);
		fieldOne.find('input').val(0);
		fieldTwo.show().find('label').text("Range");
		fieldTwo.find('input').attr("min", 1);
		fieldTwo.find('input').attr("max", 63);
		fieldTwo.find('input').val(63);
		checkbox.show();
		break;
	case "3":
		fieldOne.show().find('label').text("Index");
		fieldOne.find('input').attr("min", 0);
		fieldOne.find('input').attr("max", 16383);
		fieldOne.find('input').val(0);
		fieldTwo.show().find('label').text("Range");
		fieldTwo.find('input').attr("min", 1);
		fieldTwo.find('input').attr("max", 127);
		fieldTwo.find('input').val(127);
		checkbox.show();
		break;
	case "4":
		fieldOne.show().find('label').text("Index");
		fieldOne.find('input').attr("min", 0);
		fieldOne.find('input').attr("max", 144);
		fieldOne.find('input').val(0);
		fieldTwo.show().find('label').text("Range");
		fieldTwo.find('input').attr("min", 1);
		fieldTwo.find('input').attr("max", 9);
		fieldTwo.find('input').val(9);
		checkbox.show();
		break;
	case "15":
		fieldOne.show().find('label').text("Index");
		fieldOne.find('input').attr("min", 0);
		fieldOne.find('input').attr("max", 127);
		fieldOne.find('input').val(0);
		fieldTwo.show().find('label').text("Channel");
		fieldTwo.find('input').attr("min", 1);
		fieldTwo.find('input').attr("max", 16);
		fieldTwo.find('input').val(1);
		checkbox.show();
		break;
	case "16":
		fieldOne.hide();
		fieldTwo.hide();
		checkbox.hide();
		break;
	case "18":
		fieldOne.show().find('label').text("Index");
		fieldOne.find('input').attr("min", 0);
		fieldOne.find('input').attr("max", 16383);
		fieldOne.find('input').val(0);
		fieldTwo.show().find('label').text("Range");
		fieldTwo.find('input').attr("min", 1);
		fieldTwo.find('input').attr("max", 4);
		fieldTwo.find('input').val(1);
		checkbox.show();
		break;
	}
}

/*
 * Read form for a single knob and generate Sysex messsages
 * that will set up the knob on the device like it is set in the editor
 * Knob passed as jquery reference to dom
 */

function generateSysexFromKnobValue(knob) {
	var id = parseInt(knob.find("header").text())-1;
	var type = knob.find("select.type")[0].value;
	var valOne = knob.find("tr:nth-of-type(1) input")[0].value;
	var valTwo = knob.find("tr:nth-of-type(2) input")[0].value;
	var valCheck = knob.find("tr:nth-of-type(3) input")[0].checked;

	//console.log("Extract knob %o", id);
	//console.log("ID %o, Type %o", id, type);
	//console.log("Vals: %o %o %o", valOne, valTwo, valCheck);

	var knobMessagePayload = [type, id];
	switch (type) {
	case "1":
		knobMessagePayload.push(valOne);
		knobMessagePayload.push(0);
		break;
	case "2":
	case "3":
		knobMessagePayload.push(LSHB(valOne));
		knobMessagePayload.push(MSHB(valOne));
		knobMessagePayload.push(valTwo);
		break;
	case "4":
		knobMessagePayload.push(MSHB(valOne));
		knobMessagePayload.push(LSHB(valOne));
		knobMessagePayload.push(valTwo);
		break;

	case "15":
		knobMessagePayload.push(valOne);
		knobMessagePayload.push(valTwo);

	case "16":
		break;
	case "18":
		knobMessagePayload.push(LSHB(valOne));
		knobMessagePayload.push(MSHB(valOne));
		knobMessagePayload.push(valTwo);
	}

	var invertMessagePayload = [17, id];
	if (valCheck) {
		invertMessagePayload.push(1);
	} else {
		invertMessagePayload.push(0);
	}

	return [knobMessagePayload, invertMessagePayload];
}


/*
 * Generate Sysex Messages for global settings
 */
function generateGlobalSysex() {
	var channel = $("#globalsettings span:first-of-type input")[0].value;
	var dropNRPNMSB = $("#globalsettings span:nth-of-type(2) input")[0].checked;
	var presetID = $("#send span:nth-of-type(2) select")[0].value;

	var messages = [];
	messages.push([9, channel]);
	messages.push([5, presetID]);

	var dropNRPNMSBValue;
	if (dropNRPNMSB) {
		dropNRPNMSBValue = 1;
	} else {
		dropNRPNMSBValue = 0;
	}
	messages.push([19, dropNRPNMSBValue]);

	return messages;
}


/*
 * Just copies the first knob 59 times in dom
 */
function createUI() {
	var knobContainer = $("#knobs");
	var singleKnob = knobContainer.find("div:first-of-type");
	for (var i=1; i<numbKnobs; i++) {
		var thisKnob = singleKnob.clone();
		thisKnob.find("header").text((i+1).toString());
		knobContainer.append(thisKnob);
	}
}


/*
 * Fill selection field for the midi port with the
 * options that are passed as an argument
*/
function setMIDIPortOptions(portOptions) {
	//console.log(portOptions);
	var portSelect = $("#portselect select");
	portSelect.html("");
	for (var i=0; i<portOptions.length; i++){
		var el = $("<option></<option>");
		el.text(portOptions[i]);
		el.val(i);
		portSelect.append(el);
	}
}


function sendMIDI() {
	console.log("Send MIDI from renderer");

	var messages = [];

	// Add messages from all knobs
	$.each($("#knobs>div"), function(key, value) {
		var knobMessages = generateSysexFromKnobValue($(value));
		$.each(knobMessages, function(mkey, mvalue) {
			messages.push(mvalue);
		});
	});

  // Add messages from global setttings
	messages = messages.concat(generateGlobalSysex());

	// Add all Sysex start and end data to all messages
	// and check for basic validity
	var sysExStream = [];
	$.each(messages, function(mkey, mvalue) {
		var thisMessage = [];
		thisMessage.push(240);
		thisMessage.push(48);
		$.each(mvalue, function(bkey, bvalue) {
			bvalue = parseInt(bvalue);
			if (bvalue < 127) {
				thisMessage.push(bvalue);
			} else {
				console.log("Value out of range");
			}
		});
		thisMessage.push(247);
		sysExStream.push(thisMessage);
	});

	// send port number and midi data to main process
	ipcRenderer.send('send_midi_data', {
			port: $("#portselect select")[0].value,
			data: sysExStream
	});
}

function MSHB(val) {
	return floor(val/128);
}
function LSHB(val) {
	return val % 128;
}
